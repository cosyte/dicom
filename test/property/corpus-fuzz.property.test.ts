/**
 * Corpus fuzz: hostile Part 10 bytes through every public parsing entry point.
 *
 * `fuzz.property.test.ts` feeds `parseDicom` random noise, DICOM-shaped garbage and truncations.
 * This suite starts from the well-formed seeds in `_seed-corpus.ts` and mutates them, so the
 * bytes get past the framing check and break something deep in a real file, and then it drives
 * whatever parsed through the rest of the public surface a consumer calls on untrusted input:
 *
 *   1. `parseDicom`, lenient, strict, under each vendor profile, copying or viewing values, and
 *      requiring or tolerating the preamble;
 *   2. every element's `value` at every depth, the patient, study, series and image views, each
 *      frame's functional groups, the DICOMDIR tree, `readPixelDataFragments`, and `readCode`
 *      on every sequence item;
 *   3. `serializeDicom`, and `parseDicom` again on what it wrote;
 *   4. `deidentify` under a random set of Annex E options, then `serializeDicom` on its result.
 *
 * The contract, per case:
 *
 *   - **No unsanctioned throw.** `parseDicom` may throw only a `DicomParseError` carrying one of
 *     the four Tier-3 fatal codes, or, when strict mode or a profile escalates, a registered
 *     warning code. `serializeDicom` may throw only a `DicomSerializeError`, `deidentify` only a
 *     `DeidentifyError`, and `image.frame` only a `DicomValueError`, each with a registered code.
 *     `Element.value`, the views, `readPixelDataFragments` (on a parsed `Dataset`) and `readCode`
 *     are documented never to throw at all. A `RangeError` or `TypeError` anywhere is a bug.
 *   - **No hang**, judged by the per-case wall-clock budget in `_fuzz-config.ts`.
 *   - **No runaway allocation**, judged by the per-case growth limit in `_fuzz-config.ts`.
 *
 * Three structured families sit beside the mutations, because a byte edit cannot keep a length
 * field consistent: one value made of long runs, at the root or inside an Item and at the odd
 * length FFFFH (super-linear decoding, and a value too long for its length field), sequences
 * nested past the 64-deep cap (stack depth), and thousands of elements, items and private blocks
 * (per-element overhead). The last test is the non-vacuity check: every seed parses, so the
 * mutations start from files that reach the deep paths.
 *
 * `pnpm test` runs each target at its base count against a pinned seed; `pnpm fuzz` with the
 * `DICOM_FUZZ_*` variables is the nightly run (see `_fuzz-config.ts`).
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  DEIDENTIFY_ERROR_CODES,
  DEIDENTIFY_OPTIONS,
  DeidentifyError,
  DicomParseError,
  DicomSerializeError,
  DicomValueError,
  FATAL_CODES,
  SERIALIZE_ERROR_CODES,
  VALUE_ERROR_CODES,
  WARNING_CODES,
  deidentify,
  parseDicom,
  profiles,
  readCode,
  readPixelDataFragments,
  serializeDicom,
  type Dataset,
  type DeidentifyOption,
  type DeidentifyResult,
  type ParseOptions,
  type Profile,
} from "../../src/index.js";
import type { Tag, VR } from "../../src/dictionary/types.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";

import { fuzzParameters, fuzzTimeout, preview, withinBudget } from "./_fuzz-config.js";
import { mutatedSeed } from "./_mutate.js";
import { DICOM_TOKENS, SEED_CORPUS } from "./_seed-corpus.js";

const FATAL: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));
const WARNING: ReadonlySet<string> = new Set(Object.values(WARNING_CODES));
const SERIALIZE: ReadonlySet<string> = new Set(Object.values(SERIALIZE_ERROR_CODES));
const DEIDENTIFY: ReadonlySet<string> = new Set(Object.values(DEIDENTIFY_ERROR_CODES));
const VALUE: ReadonlySet<string> = new Set(Object.values(VALUE_ERROR_CODES));

/** What one case runs: how to parse, and which Annex E options to de-identify under. */
interface Pipeline {
  readonly parse: ParseOptions;
  readonly retain: readonly DeidentifyOption[];
}

const LENIENT: Pipeline = { parse: {}, retain: [] };

/** Render a thrown value without assuming it is an Error. */
function describeThrown(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/** The error a case fails with when `where` threw something it may not. */
function unsanctioned(where: string, err: unknown, input: Buffer): Error {
  return new Error(`fuzz: ${where} threw ${describeThrown(err)} on ${preview(input)}`, {
    cause: err,
  });
}

/** Run `read`, turning any throw into an unsanctioned-throw failure naming `where`. */
function mustNotThrow<T>(where: string, input: Buffer, read: () => T): T {
  try {
    return read();
  } catch (err) {
    throw unsanctioned(where, err, input);
  }
}

/** Every warning carries a registered code and a finite byte offset. */
function checkWarnings(
  where: string,
  warnings: readonly { code: string; position: { byteOffset: number } }[] | undefined,
  input: Buffer,
): void {
  for (const w of warnings ?? []) {
    if (!WARNING.has(w.code) || !Number.isFinite(w.position.byteOffset)) {
      throw new Error(
        `fuzz: ${where} carries an unregistered or unplaced warning ${JSON.stringify(w.code)}: ${preview(input)}`,
      );
    }
  }
}

/** `parseDicom`, holding any throw to the sanctioned set. `undefined` when it refused. */
function parse(
  where: string,
  bytes: Buffer,
  options: ParseOptions,
  input: Buffer,
): Dataset | undefined {
  try {
    return parseDicom(bytes, options);
  } catch (err) {
    const escalates = options.strict === true || options.profile !== undefined;
    if (
      err instanceof DicomParseError &&
      (FATAL.has(err.code) || (escalates && WARNING.has(err.code))) &&
      Number.isFinite(err.byteOffset)
    ) {
      return undefined;
    }
    throw unsanctioned(where, err, input);
  }
}

/** Decode every element's value at every depth; `Element.value` never throws. */
function walk(ds: Dataset, input: Buffer): void {
  for (const element of ds.elements()) {
    const value = mustNotThrow(`Element.value (${element.vr})`, input, () => element.value);
    if ("warnings" in value) checkWarnings(`Element.value (${element.vr})`, value.warnings, input);
    for (const item of element.items ?? []) {
      mustNotThrow("readCode", input, () => readCode(item));
      walk(item, input);
    }
  }
}

/** The views, the frames, the DICOMDIR tree and the Pixel Data fragments. */
function readViews(ds: Dataset, input: Buffer): void {
  mustNotThrow("Dataset.patient", input, () => ds.patient);
  mustNotThrow("Dataset.study", input, () => ds.study);
  mustNotThrow("Dataset.series", input, () => ds.series);
  const image = mustNotThrow("Dataset.image", input, () => ds.image);
  const last = Math.max(0, Math.min(image.numberOfFrames ?? 1, 1 << 16) - 1);
  for (const index of new Set([0, 1, last])) {
    try {
      image.frame(index);
    } catch (err) {
      if (!(err instanceof DicomValueError && VALUE.has(err.code))) {
        throw unsanctioned(`image.frame(${String(index)})`, err, input);
      }
    }
  }
  mustNotThrow("Dataset.directory", input, () => ds.directory);
  mustNotThrow("readPixelDataFragments", input, () => readPixelDataFragments(ds));
  mustNotThrow("Dataset.getAll", input, () => ds.getAll("00100010"));
}

/** `serializeDicom`, holding any throw to the sanctioned set. `undefined` when it refused. */
function serialize(where: string, ds: Dataset, input: Buffer): Buffer | undefined {
  try {
    return serializeDicom(ds);
  } catch (err) {
    if (err instanceof DicomSerializeError && SERIALIZE.has(err.code)) return undefined;
    throw unsanctioned(where, err, input);
  }
}

/** `deidentify`, holding any throw to the sanctioned set. `undefined` when it refused. */
function deidentifyHeld(
  ds: Dataset,
  retain: readonly DeidentifyOption[],
  input: Buffer,
): DeidentifyResult<Dataset> | undefined {
  try {
    return deidentify(ds, { retain });
  } catch (err) {
    if (err instanceof DeidentifyError && DEIDENTIFY.has(err.code)) return undefined;
    throw unsanctioned("deidentify", err, input);
  }
}

/** One case: the whole public pipeline over `input`, inside the time and memory budget. */
function exercise(input: Buffer, pipeline: Pipeline): void {
  withinBudget(input, () => {
    const ds = parse("parseDicom", input, pipeline.parse, input);
    if (ds === undefined) return;
    checkWarnings("Dataset.warnings", ds.warnings, input);
    walk(ds, input);
    readViews(ds, input);
    const written = serialize("serializeDicom", ds, input);
    if (written !== undefined) parse("parseDicom of serializeDicom output", written, {}, input);
    const result = deidentifyHeld(ds, pipeline.retain, input);
    if (result !== undefined) {
      walk(result.dataset, input);
      serialize("serializeDicom of deidentify output", result.dataset, input);
    }
  });
}

const PROFILES: readonly Profile[] = [
  profiles.ge,
  profiles.siemens,
  profiles.philips,
  profiles.strict,
  profiles.lenient,
];

/** Parse options and Annex E options for the options target. */
const pipelines: fc.Arbitrary<Pipeline> = fc.record({
  parse: fc.record(
    {
      strict: fc.boolean(),
      profile: fc.constantFrom(...PROFILES),
      copyValues: fc.boolean(),
      stripPreamble: fc.constantFrom<("tolerate" | "require")[]>("tolerate", "require"),
    },
    { requiredKeys: [] },
  ),
  retain: fc.subarray([...DEIDENTIFY_OPTIONS], { maxLength: 4 }),
});

const mutated = mutatedSeed(SEED_CORPUS, DICOM_TOKENS);

// ---------------------------------------------------------------------------
// Structured families: shapes a byte mutation cannot build with consistent lengths.
// ---------------------------------------------------------------------------

const STRUCTURED_TS = [
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
  "1.2.840.10008.1.2.1.99",
] as const;

/** A standard tag for each string VR, so the value goes through that VR's decoder. */
const TAG_FOR_VR: Readonly<Record<string, Tag>> = {
  AE: "00080054",
  AS: "00101010",
  CS: "00080060",
  DA: "00080020",
  DS: "00281050",
  DT: "0008002A",
  IS: "00200013",
  LO: "00081030",
  LT: "00104000",
  PN: "00100010",
  SH: "00080050",
  ST: "00080081",
  TM: "00080030",
  UC: "00080119",
  UI: "00080018",
  UR: "00080120",
  UT: "0040A160",
};

/** VRs whose Explicit VR length field is 32 bits. The rest cap a value at 65,534 bytes. */
const LONG_FORM: ReadonlySet<string> = new Set(["UC", "UR", "UT"]);

/**
 * Where a long value goes. `attribute` is the standard tag {@link TAG_FOR_VR} names for its VR.
 * The other two are the elements PS3.5 2026c section 6.2.2 says the `UN` VR "shall not be used"
 * for, so a value too long for a 16-bit Value Length Field cannot be written as `UN` there: a
 * Private Creator Data Element (`LO`), and a File Meta Information element (`(0002,0100)` Private
 * Information Creator UID, a `UI` the File Meta group carries Explicit VR Little Endian under
 * every Transfer Syntax).
 */
const LONG_VALUE_TARGETS = ["attribute", "privateCreator", "fileMeta"] as const;

/**
 * One string value made of a short unit repeated up to tens of thousands of times, at the root or
 * inside an Item, at an even length or at the odd length FFFFH the reader tolerates, in a standard
 * attribute, a Private Creator or the File Meta group.
 */
function longValue(): fc.Arbitrary<Buffer> {
  const piece = fc.oneof(
    fc.constantFrom(
      " ",
      "\\",
      "^",
      "=",
      "0",
      "9",
      ".",
      "-",
      "+",
      "e",
      "A",
      "\u001b$B",
      "\u001b(B",
      "\0",
    ),
    fc.string({ maxLength: 3 }),
  );
  return fc
    .record({
      ts: fc.constantFrom(...STRUCTURED_TS),
      vr: fc.constantFrom(...Object.keys(TAG_FOR_VR)),
      head: fc.string({ maxLength: 4 }),
      unit: fc.array(piece, { minLength: 1, maxLength: 3 }).map((parts) => parts.join("")),
      times: fc.integer({ min: 1, max: 40_000 }),
      tail: fc.string({ maxLength: 4 }),
      charset: fc.option(
        fc.constantFrom("ISO_IR 192", "\\ISO 2022 IR 87", "ISO_IR 100", "GB18030"),
        {
          nil: undefined,
        },
      ),
      keepOdd: fc.boolean(),
      inSequence: fc.boolean(),
      target: fc.constantFrom(...LONG_VALUE_TARGETS),
    })
    .map(({ ts, vr, head, unit, times, tail, charset, keepOdd, inSequence, target }) => {
      const fileMeta = target === "fileMeta";
      const chosen: { tag: string; vr: VR } =
        target === "attribute"
          ? { tag: TAG_FOR_VR[vr] ?? "00081030", vr: vr as VR }
          : fileMeta
            ? { tag: "00020100", vr: "UI" }
            : { tag: "00090010", vr: "LO" };
      // An Explicit VR short form carries a length up to FFFFH, and the reader tolerates the odd
      // one, which the writer then pads past the field: keep it odd half the time. The File Meta
      // group is Explicit VR Little Endian whatever the Transfer Syntax.
      const cap =
        LONG_FORM.has(chosen.vr) || (ts === STRUCTURED_TS[0] && !fileMeta) ? 128 * 1024 : 0xffff;
      let value = Buffer.from(head + unit.repeat(times) + tail, "latin1").subarray(0, cap);
      if (value.length % 2 === 1 && !keepOdd) value = value.subarray(0, value.length - 1);
      const element: BuildDicomElement = { tag: chosen.tag, vr: chosen.vr, value };
      const elements: (BuildDicomElement | BuildDicomSqElement)[] = [
        ...(charset === undefined
          ? []
          : [
              {
                tag: "00080005",
                vr: "CS" as VR,
                value: Buffer.from(charset.length % 2 === 0 ? charset : `${charset} `, "latin1"),
              },
            ]),
        // Inside an Item, `deidentify` re-encodes the value itself when it acts on it.
        ...(fileMeta
          ? []
          : [inSequence ? { tag: "00081115", items: [{ elements: [element] }] } : element]),
      ];
      return buildDicom({
        transferSyntax: ts,
        elements,
        ...(fileMeta ? { fileMetaExtraElements: [element] } : {}),
      });
    });
}

/** Sequences nested up to 96 deep, past the 64-deep cap, each level's lengths chosen freely. */
function deepNesting(): fc.Arbitrary<Buffer> {
  return fc
    .record({
      ts: fc.constantFrom(...STRUCTURED_TS),
      levels: fc.array(
        fc.record({ sequenceUndefined: fc.boolean(), itemUndefined: fc.boolean() }),
        {
          minLength: 1,
          maxLength: 96,
        },
      ),
    })
    .map(({ ts, levels }) => {
      let inner: BuildDicomElement | BuildDicomSqElement = {
        tag: "00100010",
        vr: "PN",
        value: Buffer.from("DOE^JANE", "latin1"),
      };
      for (const level of levels) {
        inner = {
          tag: "0040A730",
          undefinedLength: level.sequenceUndefined,
          items: [{ undefinedLength: level.itemUndefined, elements: [inner] }],
        };
      }
      return buildDicom({ transferSyntax: ts, elements: [inner] });
    });
}

/** Thousands of elements: private blocks, sequence items, and odd-length values that warn. */
function manyElements(): fc.Arbitrary<Buffer> {
  return fc
    .record({
      ts: fc.constantFrom(...STRUCTURED_TS),
      creators: fc.integer({ min: 0, max: 240 }),
      items: fc.integer({ min: 0, max: 3000 }),
      oddValues: fc.integer({ min: 0, max: 2000 }),
    })
    .map(({ ts, creators, items, oddValues }) => {
      const elements: (BuildDicomElement | BuildDicomSqElement)[] = [];
      for (let i = 0; i < oddValues; i++) {
        const element = (0x1000 + i).toString(16).toUpperCase().padStart(4, "0");
        elements.push({ tag: `0009${element}`, vr: "LO", value: Buffer.from("ODD", "latin1") });
      }
      for (let i = 0; i < creators; i++) {
        const slot = (0x10 + i).toString(16).toUpperCase().padStart(4, "0");
        elements.push({
          tag: `0011${slot}`,
          vr: "LO",
          value: Buffer.from(`SYNTH CREATOR ${String(i).padStart(3, "0")} `, "latin1"),
        });
      }
      elements.push({
        tag: "0040A730",
        undefinedLength: true,
        items: Array.from({ length: items }, () => ({
          elements: [{ tag: "0040A010", vr: "CS", value: Buffer.from("CONTAINS", "latin1") }],
        })),
      });
      return buildDicom({ transferSyntax: ts, elements });
    });
}

describe("fuzz: mutated seeds through every public parsing entry point", () => {
  it(
    "lenient parse, value decode, views, serialize and de-identify hold the contract",
    () => {
      fc.assert(
        fc.property(mutated, (input) => {
          exercise(input.bytes, LENIENT);
        }),
        fuzzParameters(300, 0xd1c0_0001),
      );
    },
    fuzzTimeout(60_000),
  );

  it(
    "strict mode, vendor profiles, copied values, a required preamble and Annex E options hold it too",
    () => {
      fc.assert(
        fc.property(mutated, pipelines, (input, pipeline) => {
          exercise(input.bytes, pipeline);
        }),
        fuzzParameters(300, 0xd1c0_0002),
      );
    },
    fuzzTimeout(60_000),
  );
});

describe("fuzz: structured hostile shapes", () => {
  it(
    "one long value, at the root or in an Item, decodes, de-identifies and writes inside the budget",
    () => {
      fc.assert(
        fc.property(longValue(), (bytes) => {
          exercise(bytes, LENIENT);
        }),
        fuzzParameters(40, 0xd1c0_0003),
      );
    },
    fuzzTimeout(60_000),
  );

  it(
    "sequences nested past the depth cap are refused or read, never a stack overflow",
    () => {
      fc.assert(
        fc.property(deepNesting(), (bytes) => {
          exercise(bytes, LENIENT);
        }),
        fuzzParameters(60, 0xd1c0_0004),
      );
    },
    fuzzTimeout(60_000),
  );

  it(
    "thousands of elements, items and private blocks stay inside the budget",
    () => {
      fc.assert(
        fc.property(manyElements(), (bytes) => {
          exercise(bytes, LENIENT);
        }),
        fuzzParameters(20, 0xd1c0_0005),
      );
    },
    fuzzTimeout(60_000),
  );
});

describe("fuzz: the seed corpus", () => {
  it("every seed parses, so mutations start from files that reach the deep paths", () => {
    expect(SEED_CORPUS.length).toBeGreaterThan(20);
    for (const seed of SEED_CORPUS) {
      const ds = parseDicom(seed.bytes);
      expect(ds.elements().length, seed.name).toBeGreaterThan(0);
      exercise(seed.bytes, LENIENT);
    }
  });
});
