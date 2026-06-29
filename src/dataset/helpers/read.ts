/**
 * Fail-safe element readers shared by the Phase 4 domain helpers.
 *
 * Each reader pulls a single attribute off a {@link Dataset} (or nested
 * {@link Item}) through the already-decoded `Element.value` and collapses it
 * to a convenient scalar/array, applying the §4 contract uniformly:
 *
 *   - absent tag, empty value, or wrong `kind` → `undefined` (typed-absent);
 *   - a malformed numeric component stays `null` in the returned array
 *     (never coerced to 0 or dropped);
 *   - nothing here ever throws — the throwing behaviour lives only in the
 *     functional-group resolver, which models a structural conformance
 *     failure, not a missing value.
 *
 * @module
 */

import type { Tag } from "../../dictionary/types.js";
import type { Dataset } from "../dataset.js";
import type { Item } from "../item.js";
import type { DicomDate, DicomTime, PersonName } from "../vr/types.js";

/**
 * First non-empty string of a `strings`/`text` VR, else `undefined`.
 *
 * @example
 * ```ts
 * import { parseDicom, readString } from "@cosyte/dicom";
 * const modality = readString(parseDicom(buf), "00080060"); // "CT"
 * ```
 */
export function readString(ds: Dataset, tag: Tag): string | undefined {
  const v = ds.get(tag)?.value;
  if (v === undefined) return undefined;
  if (v.kind === "strings") {
    const first = v.values[0];
    return first !== undefined && first.length > 0 ? first : undefined;
  }
  if (v.kind === "text") return v.value.length > 0 ? v.value : undefined;
  return undefined;
}

/**
 * First numeric scalar of a binary-numeric (`numbers`), `decimalString`
 * (`DS`), or `integerString` (`IS`) VR. A `null` (malformed) first element
 * or a non-numeric VR yields `undefined`.
 *
 * @example
 * ```ts
 * import { parseDicom, readNumber } from "@cosyte/dicom";
 * const rows = readNumber(parseDicom(buf), "00280010"); // 512
 * ```
 */
export function readNumber(ds: Dataset, tag: Tag): number | undefined {
  const v = ds.get(tag)?.value;
  if (v === undefined) return undefined;
  if (v.kind === "numbers") return v.values[0];
  if (v.kind === "decimalString" || v.kind === "integerString") {
    const first = v.values[0];
    return first ?? undefined;
  }
  return undefined;
}

/**
 * Every component of a multi-valued numeric VR, preserving `null` for any
 * malformed component (`DS`/`IS`) so the caller sees the deviation rather
 * than a coerced value. `undefined` when the tag is absent or not numeric.
 *
 * @example
 * ```ts
 * import { parseDicom, readNumberArray } from "@cosyte/dicom";
 * const spacing = readNumberArray(parseDicom(buf), "00280030"); // [0.7, 0.7]
 * ```
 */
export function readNumberArray(ds: Dataset, tag: Tag): readonly (number | null)[] | undefined {
  const v = ds.get(tag)?.value;
  if (v === undefined) return undefined;
  if (v.kind === "numbers") return v.values;
  if (v.kind === "decimalString" || v.kind === "integerString") return v.values;
  return undefined;
}

/**
 * A `PN` VR's first {@link PersonName}, keeping its component structure.
 *
 * @example
 * ```ts
 * import { parseDicom, readPersonName } from "@cosyte/dicom";
 * const name = readPersonName(parseDicom(buf), "00100010");
 * name?.alphabetic.familyName; // "Doe"
 * ```
 */
export function readPersonName(ds: Dataset, tag: Tag): PersonName | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "personName" ? v.values[0] : undefined;
}

/**
 * A `dates` VR's first {@link DicomDate}, else `undefined`.
 *
 * @example
 * ```ts
 * import { parseDicom, readDate } from "@cosyte/dicom";
 * const birth = readDate(parseDicom(buf), "00100030"); // { year, month, day }
 * ```
 */
export function readDate(ds: Dataset, tag: Tag): DicomDate | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "dates" ? v.values[0] : undefined;
}

/**
 * A `times` VR's first {@link DicomTime}, else `undefined`.
 *
 * @example
 * ```ts
 * import { parseDicom, readTime } from "@cosyte/dicom";
 * const t = readTime(parseDicom(buf), "00080030"); // { hour, minute, second }
 * ```
 */
export function readTime(ds: Dataset, tag: Tag): DicomTime | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "times" ? v.values[0] : undefined;
}

/**
 * The items of an `SQ` element, or `undefined` when absent / not a sequence.
 *
 * @example
 * ```ts
 * import { parseDicom, readItems } from "@cosyte/dicom";
 * const items = readItems(parseDicom(buf), "00101002"); // Other Patient IDs Seq
 * ```
 */
export function readItems(ds: Dataset, tag: Tag): readonly Item[] | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "sequence" ? v.items : undefined;
}
