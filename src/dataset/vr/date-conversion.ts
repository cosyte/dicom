/**
 * Calendar-component conversion for the decoded `DA` / `TM` / `DT` values.
 *
 * `parseDate`, `parseTime` and `parseDateTime` decode three separate wire
 * syntaxes into three separate shapes. These three functions project all of
 * them onto one: `toObject` for the calendar components, `toISO` for a string,
 * `toDate` for an absolute instant. The same three names, with the same
 * meanings, are exported by every `@cosyte/*` parser that decodes a date, so a
 * caller that learns them once can read a timestamp out of any of them.
 *
 * Three properties are the whole point of the surface and are asserted rather
 * than assumed in `test/conversion-surface.test.ts`:
 *
 * - **A component the value did not state is ABSENT.** Nothing is zero-filled,
 *   so `Object.keys()` of the result is exactly the precision the sender wrote.
 * - **`millisecond` comes from the digits in `raw`, never from
 *   `fractionalSeconds`.** `DicomTime.fractionalSeconds` is a binary float, and
 *   the standard puts no bound on how many digits a `TM` may carry, so the
 *   digits are read as written and the float is not consulted at all. `toISO`
 *   renders the same digits verbatim, neither padded to three nor rounded.
 * - **`toDate` never guesses a zone.** A value with no `&ZZXX` offset and no
 *   `assumeOffsetMinutes` is not an instant, so it answers `undefined` rather
 *   than reading the host machine's zone.
 *
 * None of the three throws, for any input.
 *
 * @module
 */

import type { DicomDate, DicomDateTime, DicomTime } from "./types.js";

/**
 * The decoded temporal values this surface accepts: a `DA`, a `TM` or a `DT`.
 *
 * Deliberately not exported. The three members are exported types a caller can
 * already name, and the Contract these functions implement introduces no new
 * value type in any package that adopts it.
 */
type DicomTemporal = DicomDate | DicomTime | DicomDateTime;

/**
 * The calendar components a temporal value actually stated, and nothing else.
 *
 * Every value is a number, `month` is 1 to 12 (never the JS `Date` 0 to 11),
 * and a component the value did not state is ABSENT rather than present and
 * `undefined`: there is no `precision` key because the key set is the
 * precision. No `raw`, no `valid` and no parse bookkeeping reaches it.
 *
 * The shape is the one `Temporal.PlainDateTime.from` and luxon's
 * `DateTime.fromObject` accept, which is why the names are singular where
 * {@link DicomTime} and {@link DicomDateTime} spell them plurally. Delete
 * `offsetMinutes` and either constructor takes the rest with no key rename and
 * no value adjustment. That is a documented property rather than a tested one:
 * proving it would mean taking a dependency, and this package takes none for it.
 *
 * @example
 * ```ts
 * import { parseDateTime, toObject } from "@cosyte/dicom";
 * import type { DateParts } from "@cosyte/dicom";
 *
 * const parts: DateParts | undefined = toObject(parseDateTime("202401151330").value);
 * Object.keys(parts ?? {}); // ["year", "month", "day", "hour", "minute"]
 * ```
 */
export interface DateParts {
  /** Calendar year as written, so `0050` is the year 50 and never 1950. */
  readonly year?: number;
  /** Calendar month, 1 to 12. */
  readonly month?: number;
  /** Day of month, 1 to 31. */
  readonly day?: number;
  /** Hour of day, 0 to 23. */
  readonly hour?: number;
  /** Minute, 0 to 59. */
  readonly minute?: number;
  /** Second, 0 to 60 (a leap second is decoded rather than rejected). */
  readonly second?: number;
  /** The first three digits of the stated fraction, right-padded with zeroes. */
  readonly millisecond?: number;
  /** Signed minutes east of UTC, present only when the value carried an offset. */
  readonly offsetMinutes?: number;
}

/**
 * The one option {@link toDate} takes, and the only key it carries.
 *
 * `assumeOffsetMinutes` is the caller's declaration of the zone a value that
 * carries none was written in. An explicit `0` means "read this naive value as
 * UTC", which is a decision this library will not make on a caller's behalf.
 *
 * @example
 * ```ts
 * import { parseDate, toDate } from "@cosyte/dicom";
 * import type { ToDateOptions } from "@cosyte/dicom";
 *
 * const options: ToDateOptions = { assumeOffsetMinutes: -300 };
 * toDate(parseDate("20240115").value, options)?.toISOString(); // "2024-01-15T05:00:00.000Z"
 * ```
 */
export interface ToDateOptions {
  /** Minutes east of UTC to read a value that states no offset in. */
  readonly assumeOffsetMinutes?: number;
}

/** The stated fractional second, as digits. `DT` puts an offset after it. */
const FRACTION_DIGITS = /\.(\d+)/u;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * The digits of the stated fractional second, read off `raw`.
 *
 * `fractionalSeconds` is consulted only to decide whether a fraction was stated
 * at all; its VALUE is never used. It is `Number("0." + digits)`, a binary
 * float, and the digit string is the thing the sender actually wrote.
 */
function fractionDigits(value: DicomTemporal): string | undefined {
  if (!("fractionalSeconds" in value) || value.fractionalSeconds === undefined) return undefined;
  const digits = FRACTION_DIGITS.exec(value.raw)?.[1];
  return digits === undefined || digits === "" ? undefined : digits;
}

/** `"5"` is 500, `"0500"` is 50, `"123456"` is 123. Verbatim, never rounded. */
function millisecondOf(digits: string): number {
  return Number(`${digits}000`.slice(0, 3));
}

/** The time-of-day part, truncated to the stated precision. */
function renderTime(parts: DateParts, digits: string | undefined): string | undefined {
  if (parts.hour === undefined) return undefined;
  let out = pad(parts.hour, 2);
  if (parts.minute === undefined) return out;
  out += `:${pad(parts.minute, 2)}`;
  if (parts.second === undefined) return out;
  out += `:${pad(parts.second, 2)}`;
  return digits === undefined ? out : `${out}.${digits}`;
}

/** The calendar part, then the time part, each truncated to stated precision. */
function renderBody(parts: DateParts, digits: string | undefined): string | undefined {
  const time = renderTime(parts, digits);
  if (parts.year === undefined) return time;
  let out = pad(parts.year, 4);
  if (parts.month !== undefined) {
    out += `-${pad(parts.month, 2)}`;
    if (parts.day !== undefined) out += `-${pad(parts.day, 2)}`;
  }
  return time === undefined ? out : `${out}T${time}`;
}

/** `Z` for a stated zero offset, `+HH:MM` / `-HH:MM` otherwise, `""` for none. */
function renderOffset(offsetMinutes: number | undefined): string {
  if (offsetMinutes === undefined) return "";
  if (offsetMinutes === 0) return "Z";
  const total = Math.abs(offsetMinutes);
  const sign = offsetMinutes < 0 ? "-" : "+";
  return `${sign}${pad(Math.trunc(total / 60), 2)}:${pad(total % 60, 2)}`;
}

/**
 * The calendar components a `DA`, `TM` or `DT` value stated, as a frozen object.
 *
 * Returns `undefined` for a value the decoders marked `valid: false`, for
 * `null` / `undefined`, and for a value that stated no component at all. It
 * never throws. `hours` / `minutes` / `seconds` are renamed to the singular
 * `hour` / `minute` / `second`; `raw`, `valid` and the `legacy` and
 * `nonstandardOffset` flags the decoders report beside the value never appear.
 *
 * @example
 * ```ts
 * import { parseDateTime, parseTime, toObject } from "@cosyte/dicom";
 *
 * toObject(parseDateTime("20240115133015").value);
 * // { year: 2024, month: 1, day: 15, hour: 13, minute: 30, second: 15 }
 *
 * toObject(parseTime("133015.123456").value).millisecond; // 123, from the digits
 * ```
 */
export function toObject(value: DicomTemporal | null | undefined): DateParts | undefined {
  if (value === undefined || value === null || !value.valid) return undefined;

  const year = "year" in value ? value.year : undefined;
  const month = "month" in value ? value.month : undefined;
  const day = "day" in value ? value.day : undefined;
  const hour = "hours" in value ? value.hours : undefined;
  const minute = "minutes" in value ? value.minutes : undefined;
  const second = "seconds" in value ? value.seconds : undefined;
  const digits = fractionDigits(value);
  const rawOffset = "offsetMinutes" in value ? value.offsetMinutes : undefined;
  // A `-0000` suffix decodes to negative zero, and `Object.is(-0, 0)` is false,
  // so a caller asserting `offsetMinutes === 0` the obvious way would be told it
  // is not. The Contract says a stated zero offset is present as `0`.
  const offsetMinutes = rawOffset === 0 ? 0 : rawOffset;

  const parts: DateParts = {
    ...(year !== undefined ? { year } : {}),
    ...(month !== undefined ? { month } : {}),
    ...(day !== undefined ? { day } : {}),
    ...(hour !== undefined ? { hour } : {}),
    ...(minute !== undefined ? { minute } : {}),
    ...(second !== undefined ? { second } : {}),
    ...(digits !== undefined ? { millisecond: millisecondOf(digits) } : {}),
    ...(offsetMinutes !== undefined ? { offsetMinutes } : {}),
  };
  return Object.keys(parts).length === 0 ? undefined : Object.freeze(parts);
}

/**
 * The value as an ISO-8601 string, TRUNCATED to the precision it stated.
 *
 * Nothing is padded out: a `DA` renders `2024-01-15`, a `DT` that stated only
 * an hour renders `2024-01-15T13`, and a `TM` renders the bare time. Fractional
 * digits are rendered exactly as written. A stated offset is appended, `Z` when
 * it is zero; a value that stated NO offset gets nothing appended, because a
 * fabricated `Z` would claim UTC the sender never wrote.
 *
 * Returns `undefined` for an invalid value, for `null` / `undefined`, and for a
 * value that stated no component at all. It never throws. This is not a
 * byte round-trip of the wire value and is not meant to be: `serializeDicom`
 * remains the route that reproduces the original bytes.
 *
 * @example
 * ```ts
 * import { parseDateTime, parseTime, toISO } from "@cosyte/dicom";
 *
 * toISO(parseDateTime("20240115133015-0500").value); // "2024-01-15T13:30:15-05:00"
 * toISO(parseTime("133015").value); // "13:30:15"
 * ```
 */
export function toISO(value: DicomTemporal | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const parts = toObject(value);
  if (parts === undefined) return undefined;
  const body = renderBody(parts, fractionDigits(value));
  return body === undefined ? undefined : `${body}${renderOffset(parts.offsetMinutes)}`;
}

/**
 * The value as an absolute instant, ONLY where the zone is determinate.
 *
 * A stated `&ZZXX` offset wins and `options.assumeOffsetMinutes` is ignored.
 * With no stated offset the caller's `assumeOffsetMinutes` is applied, an
 * explicit `0` meaning "treat this naive value as UTC". With neither, the
 * answer is `undefined`: the host machine's zone is never read and UTC is never
 * assumed. A value with no year is never an instant, so a `TM` always answers
 * `undefined` however the call is made.
 *
 * Components below the stated precision fill to their lowest legal value for
 * the instant alone; the value's own precision is untouched, and a later
 * {@link toObject} or {@link toISO} on it returns what it returned before. A
 * four-digit year below 100 stays that year, so `0050` is the year 50 and the
 * two-digit remapping of `Date.UTC` never reaches the result.
 *
 * @example
 * ```ts
 * import { parseDate, parseDateTime, toDate } from "@cosyte/dicom";
 *
 * toDate(parseDate("20240115").value); // undefined: no zone was stated
 * toDate(parseDate("20240115").value, { assumeOffsetMinutes: 0 })?.toISOString();
 * // "2024-01-15T00:00:00.000Z"
 * toDate(parseDateTime("20240115133015+0100").value)?.toISOString();
 * // "2024-01-15T12:30:15.000Z"
 * ```
 */
export function toDate(
  value: DicomTemporal | null | undefined,
  options?: ToDateOptions,
): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const parts = toObject(value);
  if (parts?.year === undefined) return undefined;
  const offsetMinutes = parts.offsetMinutes ?? options?.assumeOffsetMinutes;
  if (offsetMinutes === undefined) return undefined;

  // `new Date(0)` plus the UTC setters, never `Date.UTC` and never the
  // constructor: both remap a year below 100 into the 1900s, which would turn
  // `00500101` into 1950.
  const utc = new Date(0);
  utc.setUTCFullYear(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1);
  utc.setUTCHours(parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, parts.millisecond ?? 0);
  return new Date(utc.getTime() - offsetMinutes * 60_000);
}
