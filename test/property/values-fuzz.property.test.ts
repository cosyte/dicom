/**
 * Value fuzz: the public value decoders a consumer can call on strings and bytes it took from a
 * file, outside `Element.value`.
 *
 * `parsePersonName`, `parseDate`, `parseTime`, `parseDateTime`, `toObject`, `toISO`, `toDate`,
 * `parseSpecificCharacterSet`, `isKnownCharsetTerm`, `resolveDecoderLabel`, `decodeText` and
 * `codingSchemeOid` are each documented never to throw: a malformed value comes back as
 * typed-absent or invalid, never as an exception. This suite holds them to that over arbitrary
 * strings and bytes, over near-miss temporal values, over text sprinkled with ISO 2022 escapes,
 * and over long runs of one unit, inside the same per-case time and memory budget as the parse
 * targets (`_fuzz-config.ts`), so a super-linear path fails here as a budget overrun.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  codingSchemeOid,
  decodeText,
  isKnownCharsetTerm,
  parseDate,
  parseDateTime,
  parsePersonName,
  parseSpecificCharacterSet,
  parseTime,
  resolveDecoderLabel,
  toDate,
  toISO,
  toObject,
} from "../../src/index.js";

import { fuzzParameters, fuzzTimeout, preview, withinBudget } from "./_fuzz-config.js";

/** Run `read`, failing the case with the function's name if it throws at all. */
function never(where: string, input: Buffer | string, read: () => unknown): void {
  try {
    read();
  } catch (err) {
    const thrown = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new Error(`fuzz: ${where} threw ${thrown} on ${preview(input)}`, { cause: err });
  }
}

/** Any string: arbitrary UTF-16 code units, lone surrogates included. */
const anyString = fc.string({ unit: "binary", maxLength: 256 });

/** One short unit repeated up to tens of thousands of times, between a head and a tail. */
function runs(alphabet: readonly string[]): fc.Arbitrary<string> {
  return fc
    .record({
      head: fc.string({ maxLength: 4 }),
      unit: fc
        .array(fc.constantFrom(...alphabet), { minLength: 1, maxLength: 3 })
        .map((u) => u.join("")),
      times: fc.integer({ min: 1, max: 40_000 }),
      tail: fc.string({ maxLength: 4 }),
    })
    .map(({ head, unit, times, tail }) => head + unit.repeat(times) + tail);
}

/** Strings shaped like DA, TM and DT values, valid or a little off. */
const temporal = fc.oneof(
  fc.string({ unit: fc.constantFrom(..."0123456789.-+: Z"), maxLength: 40 }),
  fc
    .tuple(
      fc.integer({ min: 0, max: 99_999 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      fc.string({ unit: fc.constantFrom(..."0123456789.+-"), maxLength: 24 }),
    )
    .map(
      ([y, m, d, rest]) =>
        `${String(y).padStart(4, "0")}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}${rest}`,
    ),
  runs(["0", "9", ".", "-", "+", " "]),
);

/** Offsets a caller might pass to `toDate`, finite or not. */
const offsetMinutes = fc.oneof(
  fc.integer({ min: -100_000, max: 100_000 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e15, -1e15, -0),
  fc.double(),
);

/** The defined terms this build maps, plus near misses, for `decodeText`'s term lists. */
const TERMS = [
  "",
  "ISO_IR 6",
  "ISO_IR 100",
  "ISO_IR 101",
  "ISO_IR 144",
  "ISO_IR 13",
  "ISO_IR 166",
  "ISO_IR 192",
  "GB18030",
  "GBK",
  "ISO 2022 IR 6",
  "ISO 2022 IR 87",
  "ISO 2022 IR 159",
  "ISO 2022 IR 149",
  "ISO 2022 IR 58",
  "ISO 2022 IR 13",
  "ISO 2022 IR 100",
  "ISO_IR 14",
  "iso_ir 192",
  "ISO_IR 192 ",
];

/** ISO 2022 escape sequences and the bytes text decoders treat as structure. */
const ESCAPES = [
  [0x1b, 0x24, 0x42],
  [0x1b, 0x28, 0x42],
  [0x1b, 0x28, 0x4a],
  [0x1b, 0x29, 0x49],
  [0x1b, 0x24, 0x28, 0x44],
  [0x1b, 0x24, 0x29, 0x43],
  [0x1b, 0x24, 0x29, 0x41],
  [0x1b, 0x2d, 0x41],
  [0x1b],
  [0x0d],
  [0x0a],
  [0x0c],
  [0x5c],
  [0x5e],
  [0x3d],
];

/** Bytes that mix arbitrary bytes with escape sequences and delimiters. */
const escapedBytes = fc
  .array(fc.oneof(fc.constantFrom(...ESCAPES), fc.array(fc.nat({ max: 0xff }), { maxLength: 8 })), {
    maxLength: 64,
  })
  .map((parts) => Buffer.from(parts.flat()));

describe("fuzz: the public value decoders never throw", () => {
  it(
    "parsePersonName over arbitrary strings and long delimiter runs",
    () => {
      fc.assert(
        fc.property(fc.oneof(anyString, runs(["^", "=", " ", "A", "\\"])), (value) => {
          withinBudget(value, () => {
            never("parsePersonName", value, () => parsePersonName(value));
          });
        }),
        fuzzParameters(400, 0xd1c0_0101),
      );
    },
    fuzzTimeout(60_000),
  );

  it(
    "parseDate, parseTime and parseDateTime, then toObject, toISO and toDate",
    () => {
      fc.assert(
        fc.property(fc.oneof(temporal, anyString), offsetMinutes, (value, offset) => {
          withinBudget(value, () => {
            never("parseDate", value, () => {
              const { value: date } = parseDate(value);
              toObject(date);
              toISO(date);
              toDate(date, { assumeOffsetMinutes: offset });
            });
            never("parseTime", value, () => {
              const { value: time } = parseTime(value);
              toObject(time);
              toISO(time);
              toDate(time, { assumeOffsetMinutes: offset });
            });
            never("parseDateTime", value, () => {
              const { value: dateTime } = parseDateTime(value);
              toObject(dateTime);
              toISO(dateTime);
              toDate(dateTime, { assumeOffsetMinutes: offset });
            });
          });
        }),
        fuzzParameters(400, 0xd1c0_0102),
      );
    },
    fuzzTimeout(60_000),
  );

  it(
    "parseSpecificCharacterSet, isKnownCharsetTerm, resolveDecoderLabel and decodeText over arbitrary bytes",
    () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.uint8Array({ maxLength: 128 }).map((a) => Buffer.from(a)),
            fc
              .array(fc.constantFrom(...TERMS), { maxLength: 4 })
              .map((t) => Buffer.from(t.join("\\"), "latin1")),
            runs(["\\", " ", "\0", "I"]).map((s) => Buffer.from(s, "latin1")),
          ),
          escapedBytes,
          (charsetBytes, textBytes) => {
            withinBudget(Buffer.concat([charsetBytes, textBytes]), () => {
              never("parseSpecificCharacterSet", charsetBytes, () => {
                const terms = parseSpecificCharacterSet(charsetBytes);
                for (const term of terms) isKnownCharsetTerm(term);
                resolveDecoderLabel(terms);
                decodeText(textBytes, terms);
              });
            });
          },
        ),
        fuzzParameters(400, 0xd1c0_0103),
      );
    },
    fuzzTimeout(60_000),
  );

  it(
    "decodeText under every term list, over escape-laden bytes and long runs",
    () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...TERMS), { maxLength: 4 }),
          fc.oneof(
            escapedBytes,
            runs(["\u001b$B", "\u001b(B", "ÿ", "\r", "A"]).map((s) => Buffer.from(s, "latin1")),
          ),
          (terms, bytes) => {
            withinBudget(bytes, () => {
              never("decodeText", bytes, () => decodeText(bytes, terms));
            });
          },
        ),
        fuzzParameters(400, 0xd1c0_0104),
      );
    },
    fuzzTimeout(60_000),
  );

  it(
    "codingSchemeOid over arbitrary designators",
    () => {
      fc.assert(
        fc.property(fc.option(anyString, { nil: undefined }), (designator) => {
          withinBudget(designator ?? "", () => {
            never("codingSchemeOid", designator ?? "", () => codingSchemeOid(designator));
          });
        }),
        fuzzParameters(200, 0xd1c0_0105),
      );
    },
    fuzzTimeout(60_000),
  );
});
