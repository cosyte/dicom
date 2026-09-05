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

  it("refuses a non-finite assumeOffsetMinutes rather than answering an Invalid Date", () => {
    // A zone the caller cannot name is not a zone. Arithmetic on NaN or an
    // infinity yields a Date whose getTime() is NaN, which wears the shape of a
    // real answer and carries no instant: the Contract's "never a partial
    // answer". The stated-offset arm is unreachable from the decoders, which
    // only ever produce a finite offsetMinutes, so this can only bite the
    // option.
    const value = parseDate("20240115").value;
    for (const assumeOffsetMinutes of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(toDate(value, { assumeOffsetMinutes }), String(assumeOffsetMinutes)).toBeUndefined();
      expect(() => toDate(value, { assumeOffsetMinutes })).not.toThrow();
    }
    // Non-vacuity: the same call with a finite offset still converts, and the
    // route the guard closes really did produce an Invalid Date.
    expect(toDate(value, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-01-15T00:00:00.000Z",
    );
    expect(new Date(0 - Number.NaN * 60_000).getTime()).toBeNaN();
  });

  it("refuses a finite assumeOffsetMinutes that leaves the representable range", () => {
    // The finiteness guard above cannot see this one: `1e15` IS finite, and it
    // is the offset arithmetic, not the value, that leaves the +/-8.64e15 ms a
    // `Date` represents. So the check has to run AFTER the offset is applied,
    // which is what x12 and ncpdp do and what astm and dicom did not.
    const value = parseDate("20240115").value;
    for (const assumeOffsetMinutes of [1e15, -1e15, Number.MAX_SAFE_INTEGER]) {
      expect(toDate(value, { assumeOffsetMinutes }), String(assumeOffsetMinutes)).toBeUndefined();
      expect(() => toDate(value, { assumeOffsetMinutes })).not.toThrow();
    }
    // Non-vacuity, both ways: the offset really does leave the range (so the
    // case is not passing because 1e15 was rejected as non-finite), and an
    // offset one step inside the range still converts.
    expect(Number.isFinite(1e15)).toBe(true);
    expect(new Date(0 - 1e15 * 60_000).getTime()).toBeNaN();
    expect(toDate(value, { assumeOffsetMinutes: -720 })?.toISOString()).toBe(
      "2024-01-15T12:00:00.000Z",
    );
  });

  it("never answers a Date whose getTime() is NaN, for any offset", () => {
    // The property behind both arms, stated once over the whole option domain
    // this surface can be handed: whatever comes back is either absent or a
    // Date a caller can compare without testing it for NaN first.
    const value = parseDate("20240115").value;
    for (const assumeOffsetMinutes of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1e15,
      -1e15,
      8.64e15,
    ]) {
      const out = toDate(value, { assumeOffsetMinutes });
      expect(out, String(assumeOffsetMinutes)).toBeUndefined();
    }
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

describe("component bounds: a point no calendar has converts to nothing", () => {
  // Component-bounds handling is a rule every `@cosyte/*` parser in this suite
  // follows the same way, and this is that rule for DICOM: an
  // out-of-range component, a month outside 1 to 12 or a day outside its own
  // month, is REFUSED, never rolled over into the following month.
  //
  // The decoders range-check each component alone, so `parseDate("18700230")`
  // is `valid: true` with `day: 30`, and projecting that gave `"1870-02-30"`
  // and, with a zone, the instant for 2 March. PatientBirthDate (0010,0030) is
  // a `DA`. The refusal is in the conversion surface and NOT in the decoders,
  // which keep the behaviour they were pinned at.
  //
  // 🩺 THE FIXTURE YEARS ARE PRE-1906 ON PURPOSE. `scripts/phi-scan.ts` flags
  // any 8-digit `YYYYMMDD` run whose year is inside the last 120 years, and the
  // only ways past it are a date older than that or a line in
  // `scripts/phi-allow-list.txt`, which that file's own header calls a real,
  // globally scoped widening. Nothing here turns on the year: 1870 and 1900 are
  // ordinary non-leap years and 1872 and 1600 are ordinary leap ones.

  /** Days no calendar has, one per way of not having one. */
  const IMPOSSIBLE = [
    "18700230", // February never has a 30th
    "18700229", // 1870 is not a leap year
    "19000229", // 1900 is divisible by 100 and not by 400
    "18700431", // April
    "18700631", // June
    "18700931", // September
  ] as const;

  /** Real days, so a fix cannot be "refuse February" or "refuse the 29th". */
  const REAL = [
    "18720229", // 1872 is a leap year
    "16000229", // 1600 is divisible by 400, so it is one too
    "18700228",
    "18700430",
    "18700531",
    "18700731",
  ] as const;

  it("still converts every real calendar day (non-vacuity)", () => {
    for (const raw of REAL) {
      const value = parseDate(raw).value;
      expect(toObject(value), raw).toBeDefined();
      expect(toISO(value), raw).toBe(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
      expect(toDate(value, { assumeOffsetMinutes: 0 })?.toISOString(), raw).toBe(
        `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000Z`,
      );
    }
  });

  it("leaves the decoders exactly as they were pinned", () => {
    // The other half of non-vacuity, and the ADDITIVE ONLY rule made visible:
    // the refusal is a property of the conversion surface alone. A caller that
    // wants the bytes the sender wrote still reads them off the value.
    const { value, legacy } = parseDate("18700230");
    expect(value).toStrictEqual({ raw: "18700230", valid: true, year: 1870, month: 2, day: 30 });
    expect(legacy).toBe(false);
    expect(parseDateTime("18700230").value.valid).toBe(true);
    expect(parseTime("133060").value).toStrictEqual({
      raw: "133060",
      valid: true,
      hours: 13,
      minutes: 30,
      seconds: 60,
    });
  });

  it("toObject refuses a DA day the month does not have", () => {
    for (const raw of IMPOSSIBLE) {
      expect(parseDate(raw).value.valid, `${raw} still decodes`).toBe(true);
      expect(toObject(parseDate(raw).value), raw).toBeUndefined();
    }
  });

  it("toISO never renders a day an ISO-8601 reader would move", () => {
    for (const raw of IMPOSSIBLE) {
      const iso = toISO(parseDate(raw).value);
      expect(iso, raw).toBeUndefined();
    }
    // What the refusal is worth, measured rather than asserted: the string the
    // surface used to return reads back as a different day.
    expect(new Date("1870-02-30T00:00:00Z").toISOString()).toBe("1870-03-02T00:00:00.000Z");
  });

  it("toDate never rolls an impossible DA day into the following month", () => {
    for (const raw of IMPOSSIBLE) {
      expect(toDate(parseDate(raw).value, { assumeOffsetMinutes: 0 }), raw).toBeUndefined();
      expect(toDate(parseDate(raw).value), raw).toBeUndefined();
    }
  });

  it("refuses the same day on a DT that carries its own offset", () => {
    // No caller assumption is involved here at all: the value states its own
    // zone, so a wrong instant would be entirely the surface's doing.
    const value = parseDateTime("18700230133000+0000").value;
    expect(value.valid).toBe(true);
    expect(toObject(value)).toBeUndefined();
    expect(toISO(value)).toBeUndefined();
    expect(toDate(value)).toBeUndefined();
  });

  it("applies all three arms of the leap rule", () => {
    for (const [raw, converts] of [
      ["18720229", true], // divisible by 4
      ["19000229", false], // and by 100
      ["16000229", true], // and by 400
      ["18700229", false], // and by none of them
    ] as const) {
      expect(toObject(parseDate(raw).value) !== undefined, raw).toBe(converts);
    }
  });

  it("refuses second 60, which the decoders keep and this surface cannot project", () => {
    // PS3.5 permits `60` in `TM` and `DT` for a leap second, so this is a
    // deliberate refusal of a conformant value rather than a range error: there
    // is no ISO string for it a reader does not move and no instant to build.
    // `parseTime` keeps it (asserted above), so nothing is lost from the value.
    const time = parseTime("133060").value;
    expect(time.valid).toBe(true);
    expect(time.seconds).toBe(60);
    expect(toObject(time)).toBeUndefined();
    expect(toISO(time)).toBeUndefined();
    expect(toDate(time, { assumeOffsetMinutes: 0 })).toBeUndefined();

    const datetime = parseDateTime("18700228133060+0000").value;
    expect(datetime.seconds).toBe(60);
    expect(toObject(datetime)).toBeUndefined();
    expect(toISO(datetime)).toBeUndefined();
    expect(toDate(datetime)).toBeUndefined();

    // Both halves of what the refusal avoids, measured: the rendering V8 reads
    // as a different century, and the instant that is a rollover into 13:31.
    expect(new Date("13:30:60").getUTCFullYear()).toBe(1960);
    expect(new Date(Number(new Date("1870-02-28T13:30:00Z")) + 60_000).toISOString()).toBe(
      "1870-02-28T13:31:00.000Z",
    );

    // Non-vacuity: second 59 is not touched.
    expect(toISO(parseTime("133059").value)).toBe("13:30:59");
  });

  it("bounds a hand-built value exactly as it bounds a decoded one", () => {
    // The route ncpdp's own finding was raised about: the value types are
    // exported, so a caller can build one the decoders would never emit. The
    // check reads the projected components, not the parse route, so it binds
    // both. Every shape below is unreachable through parseDate / parseDateTime.
    const refused: readonly DicomDateTime[] = [
      { raw: "x", valid: true, year: 1870, month: 13, day: 1 },
      { raw: "x", valid: true, year: 1870, month: 0, day: 1 },
      { raw: "x", valid: true, year: 1870, month: 1, day: 32 },
      { raw: "x", valid: true, year: 1870, month: 1, day: 0 },
      { raw: "x", valid: true, year: 1870.5 },
      { raw: "x", valid: true, year: Number.NaN },
      { raw: "x", valid: true, year: 10_000 },
      { raw: "x", valid: true, year: -1 },
      { raw: "x", valid: true, year: 999_999 },
      { raw: "x", valid: true, year: 1870, hours: 24 },
      { raw: "x", valid: true, year: 1870, hours: 1, minutes: 60 },
      { raw: "x", valid: true, year: 1870, offsetMinutes: Number.NaN },
      { raw: "x", valid: true, year: 1870, offsetMinutes: 900 },
      { raw: "x", valid: true, year: 1870, offsetMinutes: -100_000 },
    ];
    for (const value of refused) {
      const label = JSON.stringify(value);
      expect(toObject(value), label).toBeUndefined();
      expect(toISO(value), label).toBeUndefined();
      expect(toDate(value, { assumeOffsetMinutes: 0 }), label).toBeUndefined();
      expect(() => toISO(value)).not.toThrow();
    }
    // Non-vacuity: the same hand-built shape one step inside every bound still
    // converts, so the block is not passing because hand-built values are
    // refused wholesale.
    expect(toISO({ raw: "x", valid: true, year: 1870, month: 12, day: 31 })).toBe("1870-12-31");
    expect(toISO({ raw: "x", valid: true, year: 0, month: 1, day: 1 })).toBe("0000-01-01");
    expect(toISO({ raw: "x", valid: true, year: 9999, hours: 23, minutes: 59 })).toBe("9999T23:59");
    // 899 minutes is exactly what a `&ZZXX` suffix of `+1459` decodes to, so
    // the offset bound refuses nothing the wire can state.
    expect(toISO({ raw: "x", valid: true, year: 1870, offsetMinutes: 899 })).toBe("1870+14:59");
    expect(parseDateTime("1870+1459").value.offsetMinutes).toBe(899);
  });

  it("refuses February 30 without refusing February, at every precision", () => {
    // A guard that answered by dropping the day, or by refusing the month,
    // would satisfy the letter above and lose real values. The whole value is
    // refused, and only the value with the impossible day.
    expect(toISO(parseDateTime("1870").value)).toBe("1870");
    expect(toISO(parseDateTime("187002").value)).toBe("1870-02");
    expect(toISO(parseDateTime("18700228").value)).toBe("1870-02-28");
    expect(toISO(parseDateTime("1870022813").value)).toBe("1870-02-28T13");
    expect(toISO(parseDateTime("18700230").value)).toBeUndefined();
    expect(toISO(parseDateTime("1870023013").value)).toBeUndefined();
    expect(toISO(parseDateTime("18700230133015.5").value)).toBeUndefined();
  });

  it("refuses the legacy dotted DA form on the same rule", () => {
    // The dotted form is decoded rather than rejected, so it reaches the
    // surface by a second route and has to be bounded on the same rule.
    const dotted = parseDate("1870.02.30");
    expect(dotted.legacy).toBe(true);
    expect(dotted.value.valid).toBe(true);
    expect(toObject(dotted.value)).toBeUndefined();
    expect(toISO(dotted.value)).toBeUndefined();
    expect(toDate(dotted.value, { assumeOffsetMinutes: 0 })).toBeUndefined();
    // Non-vacuity: the dotted form of a real day still converts identically.
    expect(toISO(parseDate("1870.02.28").value)).toBe("1870-02-28");
  });

  it("agrees with the other five packages on what it refuses", () => {
    // The item exists so the six answer alike. This is the shape every one of
    // them answers `undefined` for, in its own wire syntax.
    for (const raw of IMPOSSIBLE) {
      const value = parseDate(raw).value;
      expect([toObject(value), toISO(value), toDate(value, { assumeOffsetMinutes: 0 })]).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
    }
  });
});

describe("the README's cross-package aliasing example is worked, not decorative", () => {
  // The three names are identical in every `@cosyte/*` parser, so the README
  // owes a file that imports two of them. That example is the only place in the
  // package where another parser's call shape is written down, and it is
  // therefore the only place where one can be written down WRONG: `@cosyte/hl7`
  // is not a dependency here and nothing compiles or runs the fence, so a
  // decoder-return-shape mistake in it is invisible to every other gate.
  //
  // The shipped mistake this pins was `parseDtm(...).value`: `.value` is THIS
  // package's decoder wrapper (`parseDateTime` answers `{ value,
  // nonstandardOffset }`) and hl7's `parseDtm` answers its parts directly, so
  // the line evaluated to hl7's `toISO(undefined)`, which is `undefined`, under
  // a comment claiming it was the same string the dicom line produced.
  //
  // The assertion is over the README text rather than over both packages,
  // because importing `@cosyte/hl7` to check it would add the dependency this
  // package refuses to take.
  const README = join(import.meta.dirname, "..", "README.md");

  /** Every fenced ```ts block in the README, in document order. */
  function fences(markdown: string): string[] {
    const out: string[] = [];
    let open = false;
    let buffer: string[] = [];
    for (const line of markdown.split("\n")) {
      if (!open && /^```ts\s*$/u.test(line)) {
        open = true;
        buffer = [];
        continue;
      }
      if (open && /^```\s*$/u.test(line)) {
        open = false;
        out.push(buffer.join("\n"));
        continue;
      }
      if (open) buffer.push(line);
    }
    return out;
  }

  const aliasing = fences(readFileSync(README, "utf8")).filter((fence) =>
    fence.includes("@cosyte/hl7"),
  );

  it("carries a fence importing the conversion surface from a second parser", () => {
    expect(aliasing.length).toBeGreaterThan(0);
    for (const fence of aliasing) {
      expect(fence).toContain("@cosyte/dicom");
      expect(fence).toMatch(/toISO as \w+/u);
    }
  });

  it("passes hl7's parseDtm result straight in, with no .value wrapper on it", () => {
    for (const fence of aliasing) {
      const offending = fence
        .split("\n")
        .filter((line) => /parseDtm\([^)]*\)\s*\.\s*value/u.test(line));
      expect(offending, "@cosyte/hl7's parseDtm returns its parts directly").toStrictEqual([]);
    }
  });

  it("keeps this package's own .value, which its decoders really do return", () => {
    // The asymmetry is the point of the example and is not a slip to be
    // normalised away: `parseDateTime` here answers a wrapper, `parseDtm` there
    // does not, and only the three conversion names are shared.
    expect(parseDateTime("20240115133015")).toHaveProperty("value");
    expect(aliasing.some((fence) => /parseDateTime\([^)]*\)\s*\.\s*value/u.test(fence))).toBe(true);
  });
});
