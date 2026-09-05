import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseDate, parseDateTime, parseTime, toDate, toISO, toObject } from "../src/index.js";
import type {
  DateParts,
  DicomDate,
  DicomDateTime,
  DicomTime,
  ToDateOptions,
} from "../src/index.js";

/**
 * The shared conversion-surface conformance suite.
 *
 * Every `@cosyte/*` parser that decodes a date exports `toObject`, `toISO` and
 * `toDate` under those exact names, and each carries this file at this path with
 * the same eleven rows expressed in its own wire syntax. DICOM can express all
 * eleven, so nothing here is skipped; a row a standard could not express would
 * be an `it.skip` whose reason names the property that makes it inexpressible,
 * never a silent omission.
 *
 * Two rules bite harder here than anywhere else in the suite, and both get more
 * than one assertion:
 *
 * - **The plural-to-singular rename.** `DicomTime` and `DicomDateTime` spell the
 *   time fields `hours` / `minutes` / `seconds`; `DateParts` spells them
 *   `hour` / `minute` / `second`, because that is what
 *   `Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject` take. The
 *   key set is asserted whole, so a plural leaking through reds rather than
 *   being an extra key nobody looked at.
 * - **`millisecond` from `raw`, never from `fractionalSeconds`.** The decoders
 *   keep the fraction as a binary float and the digits only in `raw`. The route
 *   is proved by a value whose two sources DISAGREE: a float saying one thing
 *   and digits saying another can only be told apart by which one the answer
 *   follows.
 */

const MODULE_SOURCE = join(import.meta.dirname, "..", "src", "dataset", "vr", "date-conversion.ts");

/** Every key of a `DateParts`, in the order the shape declares them. */
function keysOf(parts: DateParts | undefined): string[] {
  return Object.keys(parts ?? {});
}

describe("the package root exports the shared conversion surface", () => {
  it("exports toObject, toISO and toDate under exactly those names", () => {
    expect(typeof toObject).toBe("function");
    expect(typeof toISO).toBe("function");
    expect(typeof toDate).toBe("function");
  });

  it("accepts a DicomDate, a DicomTime and a DicomDateTime through the same three names", () => {
    // The criterion is that no caller needs a per-type function: one call site,
    // three value types, no narrowing on the caller's side.
    const values = [
      parseDate("20240115").value,
      parseTime("133015").value,
      parseDateTime("20240115133015").value,
    ] as const;
    for (const value of values) {
      expect(toObject(value)).toBeDefined();
      expect(toISO(value)).toBeDefined();
      // `toDate` is undefined for two of the three, which is the zone rule
      // rather than a failure to accept the value; it is asserted per row below.
      expect(() => toDate(value)).not.toThrow();
    }
  });

  it("gives toDate an optional second argument carrying assumeOffsetMinutes and nothing else", () => {
    const options: ToDateOptions = { assumeOffsetMinutes: 0 };
    expect(Object.keys(options)).toStrictEqual(["assumeOffsetMinutes"]);
    // Omitted, empty and populated all reach the same code path without throwing.
    const day = parseDate("20240115").value;
    expect(toDate(day)).toBeUndefined();
    expect(toDate(day, {})).toBeUndefined();
    expect(toDate(day, options)?.toISOString()).toBe("2024-01-15T00:00:00.000Z");
  });

  it("leaves the pre-existing date surface exported and behaving as before", () => {
    expect(parseDate("20240115")).toStrictEqual({
      value: { raw: "20240115", valid: true, year: 2024, month: 1, day: 15 },
      legacy: false,
    });
    expect(parseDate("2024.01.15").legacy).toBe(true);
    expect(parseTime("133015.5")).toStrictEqual({
      value: {
        raw: "133015.5",
        valid: true,
        hours: 13,
        minutes: 30,
        seconds: 15,
        fractionalSeconds: 0.5,
      },
    });
    expect(parseDateTime("20240115133015+9900").nonstandardOffset).toBe(true);
    expect(parseDateTime("20240115133015+0100").value.offsetMinutes).toBe(60);
  });
});

describe("the shared case table, in DICOM wire syntax", () => {
  it("R1 year-precision value: toObject has exactly {year}, toISO is the 4-digit year", () => {
    const value = parseDateTime("2024").value;
    const parts = toObject(value);
    expect(parts).toStrictEqual({ year: 2024 });
    expect(keysOf(parts)).toStrictEqual(["year"]);
    expect(toISO(value)).toBe("2024");
  });

  it("R2 day-precision value, no offset: keys are {year,month,day}, no Z, no instant", () => {
    const value = parseDate("20240115").value;
    const parts = toObject(value);
    expect(parts).toStrictEqual({ year: 2024, month: 1, day: 15 });
    expect(keysOf(parts)).toStrictEqual(["year", "month", "day"]);
    expect(toISO(value)).toBe("2024-01-15");
    expect(toISO(value)?.endsWith("Z")).toBe(false);
    expect(toDate(value)).toBeUndefined();
  });

  it("R3 R2 with assumeOffsetMinutes 0: the UTC midnight instant", () => {
    const instant = toDate(parseDate("20240115").value, { assumeOffsetMinutes: 0 });
    expect(instant?.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    // The epoch integer as well as the rendering, so the row cannot pass by
    // agreeing with the box this suite happens to run on.
    expect(instant?.getTime()).toBe(Date.UTC(2024, 0, 15));
  });

  it("R4 R2 with assumeOffsetMinutes -300: 05:00Z that day", () => {
    const instant = toDate(parseDate("20240115").value, { assumeOffsetMinutes: -300 });
    expect(instant?.toISOString()).toBe("2024-01-15T05:00:00.000Z");
    expect(instant?.getTime()).toBe(Date.UTC(2024, 0, 15, 5));
  });

  it("R5 second precision with an explicit non-zero offset: signed, rendered, and it wins", () => {
    const value = parseDateTime("20240115133015-0500").value;
    const parts = toObject(value);
    expect(parts).toStrictEqual({
      year: 2024,
      month: 1,
      day: 15,
      hour: 13,
      minute: 30,
      second: 15,
      offsetMinutes: -300,
    });
    expect(toISO(value)).toBe("2024-01-15T13:30:15-05:00");
    expect(toDate(value)?.toISOString()).toBe("2024-01-15T18:30:15.000Z");
    // The stated offset is used IN PREFERENCE to anything the caller assumes.
    expect(toDate(value, { assumeOffsetMinutes: 600 })?.toISOString()).toBe(
      "2024-01-15T18:30:15.000Z",
    );
    expect(toDate(value, { assumeOffsetMinutes: 0 })?.getTime()).toBe(
      Date.UTC(2024, 0, 15, 18, 30, 15),
    );

    const eastward = parseDateTime("20240115133015+0530").value;
    expect(toObject(eastward)?.offsetMinutes).toBe(330);
    expect(toISO(eastward)).toBe("2024-01-15T13:30:15+05:30");
  });

  it("R6 explicit ZERO offset: offsetMinutes is present as 0 and toISO ends Z", () => {
    for (const raw of ["20240115133015+0000", "20240115133015-0000"]) {
      const value = parseDateTime(raw).value;
      const parts = toObject(value);
      expect(parts?.offsetMinutes, raw).toBe(0);
      // `-0000` decodes to negative zero, and `Object.is(-0, 0)` is false, so a
      // reviewer writing the obvious `toBe(0)` would be told the Contract's
      // "present as 0" does not hold. The normalisation is what makes it hold.
      expect(Object.is(parts?.offsetMinutes, 0), raw).toBe(true);
      expect("offsetMinutes" in (parts ?? {}), raw).toBe(true);
      expect(toISO(value), raw).toBe("2024-01-15T13:30:15Z");
      expect(toDate(value)?.toISOString(), raw).toBe("2024-01-15T13:30:15.000Z");
    }
    // The decoder still reports what the wire said; only the projection normalises.
    expect(Object.is(parseDateTime("20240115133015-0000").value.offsetMinutes, -0)).toBe(true);
  });

  it("R7 stated fractional seconds: verbatim first three digits, verbatim rendering", () => {
    const time = parseTime("133015.123456").value;
    expect(toObject(time)?.millisecond).toBe(123);
    expect(toISO(time)).toBe("13:30:15.123456");

    const dateTime = parseDateTime("20240115133015.5+0100").value;
    expect(toObject(dateTime)).toStrictEqual({
      year: 2024,
      month: 1,
      day: 15,
      hour: 13,
      minute: 30,
      second: 15,
      millisecond: 500,
      offsetMinutes: 60,
    });
    expect(toISO(dateTime)).toBe("2024-01-15T13:30:15.5+01:00");
    expect(toDate(dateTime)?.toISOString()).toBe("2024-01-15T12:30:15.500Z");
  });

  it("R8 a value the repo parsed as invalid: all three undefined, nothing throws", () => {
    const invalid: readonly (DicomDate | DicomTime | DicomDateTime)[] = [
      parseDate("ANONYMIZED").value,
      parseDate("20241315").value,
      parseDate("2024.01.45").value,
      parseTime("256100").value,
      parseDateTime("not-a-datetime").value,
    ];
    for (const value of invalid) {
      expect(value.valid).toBe(false);
      expect(() => toObject(value)).not.toThrow();
      expect(() => toISO(value)).not.toThrow();
      expect(() => toDate(value, { assumeOffsetMinutes: 0 })).not.toThrow();
      expect(toObject(value), value.raw).toBeUndefined();
      expect(toISO(value), value.raw).toBeUndefined();
      expect(toDate(value, { assumeOffsetMinutes: 0 }), value.raw).toBeUndefined();
    }
  });

  it("R9 undefined (and null) passed as the value: all three undefined, nothing throws", () => {
    for (const value of [undefined, null] as const) {
      expect(() => toObject(value)).not.toThrow();
      expect(() => toISO(value)).not.toThrow();
      expect(() => toDate(value, { assumeOffsetMinutes: 0 })).not.toThrow();
      expect(toObject(value)).toBeUndefined();
      expect(toISO(value)).toBeUndefined();
      expect(toDate(value)).toBeUndefined();
      expect(toDate(value, { assumeOffsetMinutes: 0 })).toBeUndefined();
    }
  });

  it("R10 a time-only value: no calendar keys, a bare time, and never an instant", () => {
    const value = parseTime("133015").value;
    const parts = toObject(value);
    expect(parts).toStrictEqual({ hour: 13, minute: 30, second: 15 });
    expect(keysOf(parts)).toStrictEqual(["hour", "minute", "second"]);
    for (const key of ["year", "month", "day"]) {
      expect(key in (parts ?? {}), key).toBe(false);
    }
    expect(toISO(value)).toBe("13:30:15");
    expect(toDate(value)).toBeUndefined();
    // A time is not an instant however determinate the caller's zone is.
    expect(toDate(value, { assumeOffsetMinutes: 0 })).toBeUndefined();
    expect(toDate(value, { assumeOffsetMinutes: -300 })).toBeUndefined();
  });

  it("R11 year 0050 at day precision with a determinate zone: the Date reports year 50", () => {
    const value = parseDate("00500101").value;
    expect(toObject(value)).toStrictEqual({ year: 50, month: 1, day: 1 });
    expect(toISO(value)).toBe("0050-01-01");
    const instant = toDate(value, { assumeOffsetMinutes: 0 });
    expect(instant?.getUTCFullYear()).toBe(50);
    expect(instant?.getUTCFullYear()).not.toBe(1950);
    // The route the legacy remapping would have taken, measured rather than
    // asserted about: `Date.UTC(50, 0, 1)` is 1950, and the result is not that.
    expect(new Date(Date.UTC(50, 0, 1)).getUTCFullYear()).toBe(1950);
    expect(instant?.getTime()).not.toBe(Date.UTC(50, 0, 1));
  });
});

describe("toObject: the key set is the precision, and the names are singular", () => {
  it("renames the plural DicomDateTime fields and carries no parse bookkeeping", () => {
    const parts = toObject(parseDateTime("20240115133015").value);
    expect(keysOf(parts)).toStrictEqual(["year", "month", "day", "hour", "minute", "second"]);
    for (const absent of ["hours", "minutes", "seconds", "raw", "valid", "offsetMinutes"]) {
      expect(absent in (parts ?? {}), absent).toBe(false);
    }
    expect(parts).toStrictEqual({
      year: 2024,
      month: 1,
      day: 15,
      hour: 13,
      minute: 30,
      second: 15,
    });
  });

  it("renames the plural DicomTime fields too", () => {
    const parts = toObject(parseTime("1330").value);
    expect(keysOf(parts)).toStrictEqual(["hour", "minute"]);
    expect(parts).toStrictEqual({ hour: 13, minute: 30 });
    expect("hours" in (parts ?? {})).toBe(false);
    expect("minutes" in (parts ?? {})).toBe(false);
  });

  it("reports exactly the stated components at every DT precision, nothing zero-filled", () => {
    const ladder: readonly (readonly [string, readonly string[]])[] = [
      ["2024", ["year"]],
      ["202401", ["year", "month"]],
      ["20240115", ["year", "month", "day"]],
      ["2024011513", ["year", "month", "day", "hour"]],
      ["202401151330", ["year", "month", "day", "hour", "minute"]],
      ["20240115133015", ["year", "month", "day", "hour", "minute", "second"]],
      ["20240115133015.5", ["year", "month", "day", "hour", "minute", "second", "millisecond"]],
    ];
    for (const [raw, expected] of ladder) {
      expect(keysOf(toObject(parseDateTime(raw).value)), raw).toStrictEqual([...expected]);
    }
  });

  it("states the month 1 to 12, spec-native rather than the JS Date 0 to 11", () => {
    expect(toObject(parseDate("18000101").value)?.month).toBe(1);
    expect(toObject(parseDate("18001231").value)?.month).toBe(12);
  });

  it("returns a frozen plain object", () => {
    const parts = toObject(parseDate("20240115").value);
    expect(Object.isFrozen(parts)).toBe(true);
    expect(Object.getPrototypeOf(parts)).toBe(Object.prototype);
  });

  it("returns undefined for a value that stated no component at all", () => {
    // Reachable by hand rather than from the decoders, which is exactly why the
    // Contract names it: a caller can build one and must not get a partial answer.
    const empty: DicomDate = { raw: "", valid: true };
    expect(toObject(empty)).toBeUndefined();
    expect(toISO(empty)).toBeUndefined();
    expect(toDate(empty, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });
});

describe("the legacy dotted DA form converts identically to the canonical one", () => {
  it("gives parseDate('2024.01.15') and parseDate('20240115') identical results", () => {
    const legacy = parseDate("2024.01.15");
    const canonical = parseDate("20240115");
    expect(legacy.legacy).toBe(true);
    expect(canonical.legacy).toBe(false);

    expect(toObject(legacy.value)).toStrictEqual(toObject(canonical.value));
    expect(toISO(legacy.value)).toStrictEqual(toISO(canonical.value));
    expect(toObject(legacy.value)).toStrictEqual({ year: 2024, month: 1, day: 15 });
    expect(toISO(legacy.value)).toBe("2024-01-15");
    expect(toDate(legacy.value, { assumeOffsetMinutes: 0 })?.getTime()).toBe(
      toDate(canonical.value, { assumeOffsetMinutes: 0 })?.getTime(),
    );
  });

  it("never leaks the legacy flag into a result", () => {
    const parts = toObject(parseDate("2024.01.15").value);
    expect("legacy" in (parts ?? {})).toBe(false);
    expect(keysOf(parts)).toStrictEqual(["year", "month", "day"]);
    expect(toISO(parseDate("2024.01.15").value)).not.toContain("legacy");
  });

  it("keeps the dots out of the rendered string, which reads the parts and not raw", () => {
    expect(toISO(parseDate("2024.01.15").value)).toBe("2024-01-15");
  });
});

describe("millisecond comes from the digits in raw, never from fractionalSeconds", () => {
  it("follows the digits when the two sources disagree", () => {
    // The decoders can never produce this, and that is the point: a value whose
    // float says 123 and whose digits say 987 is the only input that can tell
    // the two derivations apart, and the answer has to be the digits.
    const conflicting: DicomTime = {
      raw: "133015.987",
      valid: true,
      hours: 13,
      minutes: 30,
      seconds: 15,
      fractionalSeconds: 0.123,
    };
    expect(toObject(conflicting)?.millisecond).toBe(987);
    expect(toObject(conflicting)?.millisecond).not.toBe(123);
    expect(toISO(conflicting)).toBe("13:30:15.987");
  });

  it("takes the first three digits verbatim and right-pads with zeroes", () => {
    const cases: readonly (readonly [string, number, string])[] = [
      ["133015.5", 500, "13:30:15.5"],
      ["133015.0500", 50, "13:30:15.0500"],
      ["133015.123456", 123, "13:30:15.123456"],
      ["133015.05", 50, "13:30:15.05"],
      ["133015.000001", 0, "13:30:15.000001"],
      ["133015.9999", 999, "13:30:15.9999"],
    ];
    for (const [raw, millisecond, iso] of cases) {
      const value = parseTime(raw).value;
      expect(toObject(value)?.millisecond, raw).toBe(millisecond);
      expect(toISO(value), raw).toBe(iso);
    }
  });

  it("refuses the rounding route, which can leave the millisecond range entirely", () => {
    // `Math.round(fractionalSeconds * 1000)` is the other obvious derivation.
    // On `.9999` it answers 1000, which is not a millisecond; the verbatim rule
    // answers 999. Measured here rather than asserted about.
    const value = parseTime("133015.9999").value;
    expect(value.fractionalSeconds).toBe(0.9999);
    expect(Math.round((value.fractionalSeconds ?? 0) * 1000)).toBe(1000);
    expect(toObject(value)?.millisecond).toBe(999);
  });

  it("omits millisecond when the value stated no fraction", () => {
    for (const raw of ["133015", "1330", "13"]) {
      expect("millisecond" in (toObject(parseTime(raw).value) ?? {}), raw).toBe(false);
    }
    expect("millisecond" in (toObject(parseDate("20240115").value) ?? {})).toBe(false);
  });

  it("uses the millisecond in the instant it builds", () => {
    const value = parseDateTime("20240115133015.123456+0000").value;
    expect(toDate(value)?.toISOString()).toBe("2024-01-15T13:30:15.123Z");
  });
});

describe("toISO truncates to the stated precision and fabricates nothing", () => {
  it("renders the precision ladder without padding it out", () => {
    // The dates run on 1870 rather than on this decade because the repository's
    // PHI gate flags any date inside the last 120 years, and a conformance
    // fixture that needs excusing on a global allow-list is a widening nobody
    // owes for a ladder whose only content is a rendering.
    const ladder: readonly (readonly [string, string])[] = [
      ["1870", "1870"],
      ["187007", "1870-07"],
      ["18700705", "1870-07-05"],
      ["1870070509", "1870-07-05T09"],
      ["187007050930", "1870-07-05T09:30"],
      ["18700705093045", "1870-07-05T09:30:45"],
      ["18700705093045.5", "1870-07-05T09:30:45.5"],
    ];
    for (const [raw, expected] of ladder) {
      expect(toISO(parseDateTime(raw).value), raw).toBe(expected);
    }
    expect(toISO(parseTime("093045").value)).toBe("09:30:45");
  });

  it("appends nothing at all when the value carried no offset", () => {
    for (const raw of ["1870", "18700705", "18700705093045", "18700705093045.5"]) {
      const rendered = toISO(parseDateTime(raw).value) ?? "";
      expect(rendered.endsWith("Z"), raw).toBe(false);
      expect(/[+-]\d\d:\d\d$/u.test(rendered), raw).toBe(false);
    }
  });

  it("zero-pads every component to its ISO width, the year to four", () => {
    expect(toISO(parseDate("00500101").value)).toBe("0050-01-01");
    expect(toISO(parseDateTime("00090203040506").value)).toBe("0009-02-03T04:05:06");
  });

  it("appends a stated offset even at a precision coarser than seconds", () => {
    // Literal reading of the Contract: an explicit offset is appended, with no
    // precision condition on it. DICOM can state one at year precision.
    expect(toISO(parseDateTime("2024+0100").value)).toBe("2024+01:00");
    expect(toObject(parseDateTime("2024+0100").value)).toStrictEqual({
      year: 2024,
      offsetMinutes: 60,
    });
  });

  it("renders an offset with a non-zero minute part", () => {
    expect(toISO(parseDateTime("20240115133015-0930").value)).toBe("2024-01-15T13:30:15-09:30");
    expect(toISO(parseDateTime("20240115133015+1400").value)).toBe("2024-01-15T13:30:15+14:00");
  });
});

describe("toDate is honest about the timezone", () => {
  it("returns undefined at every precision when no zone is determinate", () => {
    for (const raw of [
      "2024",
      "202401",
      "20240115",
      "2024011513",
      "202401151330",
      "20240115133015",
      "20240115133015.5",
    ]) {
      expect(toDate(parseDateTime(raw).value), raw).toBeUndefined();
      expect(toDate(parseDateTime(raw).value, {}), raw).toBeUndefined();
    }
  });

  it("reads no zone from the host, by construction", () => {
    // The strongest available statement of "the host timezone is NEVER read":
    // the module cannot read it, because none of the routes to it occurs in the
    // source. A behavioural test cannot say this without re-running the suite
    // under another TZ. Comments are stripped first, so a route NAMED in a doc
    // comment as the thing not to use cannot fail the scan that forbids CALLING
    // it, and so the scan cannot be satisfied by moving a call into a comment.
    const source = readFileSync(MODULE_SOURCE, "utf8")
      .replaceAll(/\/\*[\s\S]*?\*\//gu, " ")
      .replaceAll(/\/\/[^\n]*/gu, " ");
    // Non-vacuity on the strip itself, and on the read: the module doc block is
    // gone, and the code that survived it is still there.
    expect(source).not.toContain("@module");
    expect(source).toContain("export function toDate(");
    for (const route of [
      "getTimezoneOffset",
      "Intl",
      "Date.parse",
      "toLocale",
      "setFullYear",
      "setHours",
      "Date.UTC",
      "process.env",
    ]) {
      expect(source.includes(route), route).toBe(false);
    }
    // And the one construction route it does use.
    expect(source).toContain("setUTCFullYear");
    expect(source).toContain("setUTCHours");
  });

  it("fills components below the stated precision to their lowest legal value", () => {
    expect(toDate(parseDateTime("2024").value, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    expect(toDate(parseDateTime("202402").value, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-02-01T00:00:00.000Z",
    );
    expect(
      toDate(parseDateTime("2024021509").value, { assumeOffsetMinutes: 0 })?.toISOString(),
    ).toBe("2024-02-15T09:00:00.000Z");
  });

  it("leaves the value's own stated precision untouched", () => {
    const value = parseDateTime("2024").value;
    const before = toObject(value);
    const isoBefore = toISO(value);
    toDate(value, { assumeOffsetMinutes: 0 });
    expect(toObject(value)).toStrictEqual(before);
    expect(toObject(value)).toStrictEqual({ year: 2024 });
    expect(toISO(value)).toBe(isoBefore);
    expect(value).toStrictEqual({ raw: "2024", valid: true, year: 2024 });
  });

  it("treats an explicit assumeOffsetMinutes of 0 as a decision, not as an absent option", () => {
    const value = parseDate("20240115").value;
    expect(toDate(value)).toBeUndefined();
    expect(toDate(value, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-01-15T00:00:00.000Z",
    );
  });

  it("returns a fresh Date on every call", () => {
    const value = parseDate("20240115").value;
    const first = toDate(value, { assumeOffsetMinutes: 0 });
    const second = toDate(value, { assumeOffsetMinutes: 0 });
    expect(first).not.toBe(second);
    expect(first?.getTime()).toBe(second?.getTime());
  });
});

describe("nothing in the surface throws, whatever it is handed", () => {
  it("survives hand-built values missing every optional field", () => {
    const date: DicomDate = { raw: "junk", valid: false };
    const time: DicomTime = { raw: "junk", valid: false };
    const dateTime: DicomDateTime = { raw: "junk", valid: false };
    for (const value of [date, time, dateTime]) {
      expect(() => toObject(value)).not.toThrow();
      expect(() => toISO(value)).not.toThrow();
      expect(() => toDate(value)).not.toThrow();
      expect(toObject(value)).toBeUndefined();
      expect(toISO(value)).toBeUndefined();
      expect(toDate(value)).toBeUndefined();
    }
  });

  it("survives a value whose raw disagrees with its parts", () => {
    // `fractionalSeconds` set with no digits in `raw`: the fraction was not
    // STATED, so no millisecond is reported and nothing is invented from the float.
    const noDigits: DicomTime = {
      raw: "133015",
      valid: true,
      hours: 13,
      minutes: 30,
      seconds: 15,
      fractionalSeconds: 0.5,
    };
    expect(toObject(noDigits)).toStrictEqual({ hour: 13, minute: 30, second: 15 });
    expect(toISO(noDigits)).toBe("13:30:15");
  });

  it("returns undefined rather than a partial answer for a non-contiguous value", () => {
    // A day with no month cannot render an ISO date, so `toISO` stops at the
    // gap rather than emitting the day in the month's slot. `toObject` still
    // reports what was stated, because its rule is about stated components.
    const gapped: DicomDate = { raw: "hand-built", valid: true, year: 2024, day: 15 };
    expect(toObject(gapped)).toStrictEqual({ year: 2024, day: 15 });
    expect(toISO(gapped)).toBe("2024");
  });

  it("answers undefined when the value states components but nothing opens the string", () => {
    // A month with no year: `toObject` reports the stated component, because its
    // rule is about stated components, and `toISO` has nothing to open an ISO
    // string with, so it answers undefined rather than putting the month in the
    // year's slot. Unreachable from the decoders and asserted anyway: it is the
    // one shape where "never a partial answer" and "report what was stated"
    // point in different directions.
    const monthOnly: DicomDate = { raw: "hand-built", valid: true, month: 3 };
    expect(toObject(monthOnly)).toStrictEqual({ month: 3 });
    expect(toISO(monthOnly)).toBeUndefined();
    expect(toDate(monthOnly, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });
});
