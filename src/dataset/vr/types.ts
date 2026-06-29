/**
 * Decoded-value model for Phase 3 — the typed result of `Element.value`.
 *
 * `DicomValue` is a discriminated union keyed on `kind`; each variant maps
 * to a family of VRs that share a decode shape (per PS3.5 §6.2 Table 6.2-1):
 *
 *   - `empty`         — zero-length value (any VR).
 *   - `text`          — single-value text VRs `LT ST UT UR` (no backslash
 *                       multiplicity; charset-decoded except `UR`).
 *   - `strings`       — backslash-multi-valued string VRs
 *                       `AE AS CS LO SH UC UI` (charset-decoded for
 *                       `LO SH UC`; ASCII for the rest).
 *   - `personName`    — `PN`, decoded to its 3-group / 5-component structure.
 *   - `numbers`       — binary numeric VRs `US UL SS SL FL FD` (signedness
 *                       from the VR, never guessed).
 *   - `bigints`       — 64-bit binary VRs `SV UV` (kept as `bigint` so no
 *                       precision is lost above 2^53).
 *   - `attributeTags` — `AT`, decoded to 8-hex tag strings.
 *   - `decimalString` — `DS`, parsed to `number | null` (non-numeric → null).
 *   - `integerString` — `IS`, parsed to `number | null` (non-integer → null).
 *   - `dates`         — `DA`, tolerant temporal decode.
 *   - `times`         — `TM`, tolerant temporal decode.
 *   - `dateTimes`     — `DT`, tolerant temporal decode.
 *   - `binary`        — bulk byte VRs `OB OD OF OL OV OW UN` (raw preserved;
 *                       not interpreted in v1 — avoids the giant-typed-array
 *                       footgun for pixel / LUT payloads).
 *   - `sequence`      — `SQ`, the parsed `Item[]`.
 *
 * Every variant whose decode may flag a tolerated deviation carries an
 * optional `warnings` array (decode is lazy and post-parse, so these cannot
 * be folded into the frozen `Dataset.warnings`; they ride on the value).
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Tag } from "../../dictionary/types.js";
import type { DicomParseWarning } from "../../parser/warnings.js";
import type { Item } from "../item.js";

/**
 * One of the three component groups of a `PN` value (PS3.5 §6.2.1.1):
 * alphabetic, ideographic, or phonetic. Each holds the five `^`-delimited
 * components; missing components are the empty string (never `undefined`).
 *
 * @example
 * ```ts
 * import type { PersonNameGroup } from "@cosyte/dicom";
 * const g: PersonNameGroup = {
 *   familyName: "Doe",
 *   givenName: "Jane",
 *   middleName: "",
 *   namePrefix: "",
 *   nameSuffix: "",
 * };
 * ```
 */
export interface PersonNameGroup {
  readonly familyName: string;
  readonly givenName: string;
  readonly middleName: string;
  readonly namePrefix: string;
  readonly nameSuffix: string;
}

/**
 * A decoded `PN` value — up to three component groups separated on-wire by
 * `=` (PS3.5 §6.2.1.1). `alphabetic` is always present; `ideographic` and
 * `phonetic` are present only when the value supplied them.
 *
 * @example
 * ```ts
 * import type { PersonName } from "@cosyte/dicom";
 * // "Yamada^Tarou=山田^太郎=やまだ^たろう"
 * declare const pn: PersonName;
 * pn.alphabetic.familyName; // "Yamada"
 * pn.ideographic?.familyName; // "山田"
 * ```
 */
export interface PersonName {
  readonly alphabetic: PersonNameGroup;
  readonly ideographic?: PersonNameGroup;
  readonly phonetic?: PersonNameGroup;
}

/**
 * A tolerantly-decoded `DA` (Date) value. `raw` always carries the on-wire
 * string (PHI-safe — a date is not an identifier on its own, but is
 * preserved verbatim regardless). `valid` is `true` only when the string
 * parsed cleanly to a `YYYYMMDD` calendar date; otherwise the numeric
 * fields are omitted and `raw` is the source of truth.
 *
 * @example
 * ```ts
 * import type { DicomDate } from "@cosyte/dicom";
 * const d: DicomDate = { raw: "20240115", valid: true, year: 2024, month: 1, day: 15 };
 * ```
 */
export interface DicomDate {
  readonly raw: string;
  readonly valid: boolean;
  readonly year?: number;
  readonly month?: number;
  readonly day?: number;
}

/**
 * A tolerantly-decoded `TM` (Time) value (PS3.5 §6.2; max length 14 bytes).
 * `fractionalSeconds` is the value after the decimal point as a number in
 * `[0,1)` when present.
 *
 * @example
 * ```ts
 * import type { DicomTime } from "@cosyte/dicom";
 * const t: DicomTime = { raw: "133015.250000", valid: true, hours: 13, minutes: 30, seconds: 15, fractionalSeconds: 0.25 };
 * ```
 */
export interface DicomTime {
  readonly raw: string;
  readonly valid: boolean;
  readonly hours?: number;
  readonly minutes?: number;
  readonly seconds?: number;
  readonly fractionalSeconds?: number;
}

/**
 * A tolerantly-decoded `DT` (DateTime) value (PS3.5 §6.2). `offsetMinutes`
 * is the signed UTC offset (`&ZZXX` suffix) in minutes when present.
 *
 * @example
 * ```ts
 * import type { DicomDateTime } from "@cosyte/dicom";
 * const dt: DicomDateTime = { raw: "20240115133015", valid: true, year: 2024, month: 1, day: 15, hours: 13, minutes: 30, seconds: 15 };
 * ```
 */
export interface DicomDateTime {
  readonly raw: string;
  readonly valid: boolean;
  readonly year?: number;
  readonly month?: number;
  readonly day?: number;
  readonly hours?: number;
  readonly minutes?: number;
  readonly seconds?: number;
  readonly fractionalSeconds?: number;
  readonly offsetMinutes?: number;
}

/**
 * The lazily-decoded value of an {@link Element}, as a discriminated union
 * on `kind`. See the module doc for the VR → kind mapping. Narrow on `kind`
 * (the `switch-exhaustiveness-check` lint rule keeps consumers honest).
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * const v = ds.get("00100010")?.value; // Patient's Name (PN)
 * if (v?.kind === "personName") {
 *   console.log(v.values[0]?.alphabetic.familyName);
 * }
 * ```
 */
export type DicomValue =
  | { readonly kind: "empty" }
  | {
      readonly kind: "text";
      readonly value: string;
      readonly warnings?: readonly DicomParseWarning[];
    }
  | {
      readonly kind: "strings";
      readonly values: readonly string[];
      readonly warnings?: readonly DicomParseWarning[];
    }
  | {
      readonly kind: "personName";
      readonly values: readonly PersonName[];
      readonly warnings?: readonly DicomParseWarning[];
    }
  | { readonly kind: "numbers"; readonly values: readonly number[] }
  | { readonly kind: "bigints"; readonly values: readonly bigint[] }
  | { readonly kind: "attributeTags"; readonly values: readonly Tag[] }
  | {
      readonly kind: "decimalString";
      readonly values: readonly (number | null)[];
      readonly warnings?: readonly DicomParseWarning[];
    }
  | {
      readonly kind: "integerString";
      readonly values: readonly (number | null)[];
      readonly warnings?: readonly DicomParseWarning[];
    }
  | {
      readonly kind: "dates";
      readonly values: readonly DicomDate[];
      readonly warnings?: readonly DicomParseWarning[];
    }
  | {
      readonly kind: "times";
      readonly values: readonly DicomTime[];
      readonly warnings?: readonly DicomParseWarning[];
    }
  | {
      readonly kind: "dateTimes";
      readonly values: readonly DicomDateTime[];
      readonly warnings?: readonly DicomParseWarning[];
    }
  | { readonly kind: "binary"; readonly bytes: Buffer }
  | { readonly kind: "sequence"; readonly items: readonly Item[] };
