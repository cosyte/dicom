/**
 * Tolerant temporal decoders for `DA` / `TM` / `DT` (PS3.5 §6.2).
 *
 * Every decoder is fail-safe: a malformed value yields `valid: false` with
 * the raw string preserved and the numeric fields omitted — it NEVER throws
 * and NEVER coerces to a plausible-but-wrong date. Tolerated legacy forms
 * (retired dotted `YYYY.MM.DD`, partial precision, non-standard offsets) are
 * decoded best-effort and flagged to the caller so it can emit the matching
 * warning. The raw string is the source of truth on any failure.
 *
 * @module
 */

import type { DicomDate, DicomDateTime, DicomTime } from "./types.js";

function inRange(n: number, lo: number, hi: number): boolean {
  return n >= lo && n <= hi;
}

/**
 * Decode a single `DA` value. `legacy` is `true` for any tolerated
 * non-canonical form (retired dotted `YYYY.MM.DD`, or an unparseable value
 * such as `"ANONYMIZED"`), signalling the caller to emit
 * `DICOM_DA_LEGACY_FORMAT`.
 *
 * @example
 * ```ts
 * import { parseDate } from "@cosyte/dicom";
 * parseDate("20240115").value.valid; // true
 * parseDate("2024.01.15").legacy; // true
 * ```
 */
export function parseDate(raw: string): { value: DicomDate; legacy: boolean } {
  const canonical = /^(\d{4})(\d{2})(\d{2})$/u.exec(raw);
  if (canonical) {
    const year = Number(canonical[1]);
    const month = Number(canonical[2]);
    const day = Number(canonical[3]);
    const valid = inRange(month, 1, 12) && inRange(day, 1, 31);
    return {
      value: valid ? { raw, valid: true, year, month, day } : { raw, valid: false },
      legacy: false,
    };
  }
  const dotted = /^(\d{4})\.(\d{2})\.(\d{2})$/u.exec(raw);
  if (dotted) {
    const year = Number(dotted[1]);
    const month = Number(dotted[2]);
    const day = Number(dotted[3]);
    const valid = inRange(month, 1, 12) && inRange(day, 1, 31);
    return {
      value: valid ? { raw, valid: true, year, month, day } : { raw, valid: false },
      legacy: true,
    };
  }
  // Empty component is a normal "no value" — not flagged. Anything else is a
  // tolerated non-conformance (e.g. "ANONYMIZED").
  return { value: { raw, valid: false }, legacy: raw.length > 0 };
}

/**
 * Decode a single `TM` value (max 14 bytes). Precision may be truncated from
 * the right (`HH`, `HHMM`, `HHMMSS`, `HHMMSS.FFFFFF`).
 *
 * @example
 * ```ts
 * import { parseTime } from "@cosyte/dicom";
 * parseTime("133015.5").value.fractionalSeconds; // 0.5
 * ```
 */
export function parseTime(raw: string): { value: DicomTime } {
  const m = /^(\d{2})(\d{2})?(\d{2})?(\.\d+)?$/u.exec(raw);
  if (!m) return { value: { raw, valid: false } };
  const hours = Number(m[1]);
  const minutes = m[2] !== undefined ? Number(m[2]) : undefined;
  const seconds = m[3] !== undefined ? Number(m[3]) : undefined;
  const fractionalSeconds = m[4] !== undefined ? Number(`0${m[4]}`) : undefined;
  const valid =
    inRange(hours, 0, 23) &&
    (minutes === undefined || inRange(minutes, 0, 59)) &&
    (seconds === undefined || inRange(seconds, 0, 60));
  if (!valid) return { value: { raw, valid: false } };
  const value: DicomTime = {
    raw,
    valid: true,
    hours,
    ...(minutes !== undefined ? { minutes } : {}),
    ...(seconds !== undefined ? { seconds } : {}),
    ...(fractionalSeconds !== undefined ? { fractionalSeconds } : {}),
  };
  return { value };
}

/**
 * Decode a single `DT` value. `nonstandardOffset` is `true` when a UTC
 * offset suffix is present but malformed / out of range, signalling the
 * caller to emit `DICOM_DT_NONSTANDARD_OFFSET`.
 *
 * @example
 * ```ts
 * import { parseDateTime } from "@cosyte/dicom";
 * parseDateTime("20240115133015+0100").value.offsetMinutes; // 60
 * ```
 */
export function parseDateTime(raw: string): { value: DicomDateTime; nonstandardOffset: boolean } {
  // Split off the optional &ZZXX offset (a + or - after position 0).
  let main = raw;
  let offsetStr: string | undefined;
  const signIdx = Math.max(raw.indexOf("+", 1), raw.indexOf("-", 1));
  if (signIdx > 0) {
    main = raw.slice(0, signIdx);
    offsetStr = raw.slice(signIdx);
  }

  const m = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\.\d+)?$/u.exec(main);
  if (!m) return { value: { raw, valid: false }, nonstandardOffset: false };

  const year = Number(m[1]);
  const month = m[2] !== undefined ? Number(m[2]) : undefined;
  const day = m[3] !== undefined ? Number(m[3]) : undefined;
  const hours = m[4] !== undefined ? Number(m[4]) : undefined;
  const minutes = m[5] !== undefined ? Number(m[5]) : undefined;
  const seconds = m[6] !== undefined ? Number(m[6]) : undefined;
  const fractionalSeconds = m[7] !== undefined ? Number(`0${m[7]}`) : undefined;

  const rangesOk =
    (month === undefined || inRange(month, 1, 12)) &&
    (day === undefined || inRange(day, 1, 31)) &&
    (hours === undefined || inRange(hours, 0, 23)) &&
    (minutes === undefined || inRange(minutes, 0, 59)) &&
    (seconds === undefined || inRange(seconds, 0, 60));

  let offsetMinutes: number | undefined;
  let nonstandardOffset = false;
  if (offsetStr !== undefined) {
    const om = /^([+-])(\d{2})(\d{2})$/u.exec(offsetStr);
    if (om) {
      const oh = Number(om[2]);
      const omin = Number(om[3]);
      if (inRange(oh, 0, 14) && inRange(omin, 0, 59)) {
        offsetMinutes = (om[1] === "-" ? -1 : 1) * (oh * 60 + omin);
      } else {
        nonstandardOffset = true;
      }
    } else {
      nonstandardOffset = true;
    }
  }

  if (!rangesOk) return { value: { raw, valid: false }, nonstandardOffset };

  const value: DicomDateTime = {
    raw,
    valid: true,
    year,
    ...(month !== undefined ? { month } : {}),
    ...(day !== undefined ? { day } : {}),
    ...(hours !== undefined ? { hours } : {}),
    ...(minutes !== undefined ? { minutes } : {}),
    ...(seconds !== undefined ? { seconds } : {}),
    ...(fractionalSeconds !== undefined ? { fractionalSeconds } : {}),
    ...(offsetMinutes !== undefined ? { offsetMinutes } : {}),
  };
  return { value, nonstandardOffset };
}
