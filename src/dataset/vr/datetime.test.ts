import { describe, expect, it } from "vitest";

import { parseDate, parseDateTime, parseTime } from "./datetime.js";

describe("parseDate (DA — tolerant, raw always preserved)", () => {
  it("parses a canonical YYYYMMDD date", () => {
    const { value, legacy } = parseDate("20240115");
    expect(legacy).toBe(false);
    expect(value).toEqual({ raw: "20240115", valid: true, year: 2024, month: 1, day: 15 });
  });

  it("accepts the retired dotted YYYY.MM.DD form, flagged legacy", () => {
    const { value, legacy } = parseDate("2024.01.15");
    expect(legacy).toBe(true);
    expect(value).toEqual({ raw: "2024.01.15", valid: true, year: 2024, month: 1, day: 15 });
  });

  it("canonical digits with out-of-range month → valid:false, raw preserved, not legacy", () => {
    const { value, legacy } = parseDate("20241315");
    expect(legacy).toBe(false);
    expect(value).toEqual({ raw: "20241315", valid: false });
  });

  it("dotted form with out-of-range day → valid:false but legacy", () => {
    const { value, legacy } = parseDate("2024.01.45");
    expect(legacy).toBe(true);
    expect(value.valid).toBe(false);
  });

  it("empty string is a normal no-value, not flagged legacy", () => {
    const { value, legacy } = parseDate("");
    expect(legacy).toBe(false);
    expect(value).toEqual({ raw: "", valid: false });
  });

  it("a non-date token (e.g. ANONYMIZED) is tolerated, flagged legacy, raw kept", () => {
    const { value, legacy } = parseDate("ANONYMIZED");
    expect(legacy).toBe(true);
    expect(value).toEqual({ raw: "ANONYMIZED", valid: false });
  });
});

describe("parseTime (TM — max 14 bytes, right-truncatable precision)", () => {
  it("parses full HHMMSS.FFFFFF", () => {
    const { value } = parseTime("133015.250000");
    expect(value).toEqual({
      raw: "133015.250000",
      valid: true,
      hours: 13,
      minutes: 30,
      seconds: 15,
      fractionalSeconds: 0.25,
    });
  });

  it("accepts hour-only precision", () => {
    const { value } = parseTime("13");
    expect(value).toEqual({ raw: "13", valid: true, hours: 13 });
    expect(value.minutes).toBeUndefined();
  });

  it("accepts a leap second (seconds=60)", () => {
    expect(parseTime("235960").value.valid).toBe(true);
  });

  it("a full 14-byte value (HHMMSS.FFFFFF) parses", () => {
    const raw = "235959.999999";
    expect(raw.length).toBeLessThanOrEqual(14);
    expect(parseTime(raw).value.valid).toBe(true);
  });

  it("out-of-range hour → valid:false, raw preserved", () => {
    expect(parseTime("250000").value).toEqual({ raw: "250000", valid: false });
  });

  it("non-time garbage → valid:false", () => {
    expect(parseTime("nope").value).toEqual({ raw: "nope", valid: false });
  });
});

describe("parseDateTime (DT — optional &ZZXX offset)", () => {
  it("parses datetime with positive offset", () => {
    const { value, nonstandardOffset } = parseDateTime("20240115133015+0100");
    expect(nonstandardOffset).toBe(false);
    expect(value.valid).toBe(true);
    expect(value.offsetMinutes).toBe(60);
    expect(value.year).toBe(2024);
    expect(value.seconds).toBe(15);
  });

  it("parses a negative offset", () => {
    expect(parseDateTime("20240115-0530").value.offsetMinutes).toBe(-330);
  });

  it("parses year-only precision", () => {
    const { value } = parseDateTime("2024");
    expect(value.valid).toBe(true);
    expect(value.year).toBe(2024);
    expect(value.month).toBeUndefined();
  });

  it("malformed offset → nonstandardOffset flag, value still best-effort", () => {
    const { value, nonstandardOffset } = parseDateTime("20240115+99");
    expect(nonstandardOffset).toBe(true);
    expect(value.offsetMinutes).toBeUndefined();
  });

  it("out-of-range offset hour → nonstandardOffset", () => {
    expect(parseDateTime("20240115+1500").nonstandardOffset).toBe(true);
  });

  it("out-of-range main component → valid:false, raw preserved", () => {
    const { value } = parseDateTime("20241315");
    expect(value).toEqual({ raw: "20241315", valid: false });
  });

  it("non-datetime garbage → valid:false", () => {
    expect(parseDateTime("xx").value.valid).toBe(false);
  });
});
