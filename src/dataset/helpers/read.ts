/**
 * Fail-safe element readers shared by the domain helpers.
 *
 * Each reader pulls a single attribute off a {@link Dataset} (or nested
 * {@link Item}) through the already-decoded `Element.value` and collapses it
 * to a convenient scalar/array, applying the fail-safe contract uniformly:
 *
 *   - absent tag, empty value, or wrong `kind` → `undefined` (typed-absent);
 *   - a malformed numeric component stays `null` in the returned array
 *     (never coerced to 0 or dropped);
 *   - nothing here ever throws - the throwing behavior lives only in the
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
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
 */
export function readPersonName(ds: Dataset, tag: Tag): PersonName | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "personName" ? v.values[0] : undefined;
}

/**
 * A `dates` VR's first {@link DicomDate}, else `undefined`.
 *
 * @internal
 */
export function readDate(ds: Dataset, tag: Tag): DicomDate | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "dates" ? v.values[0] : undefined;
}

/**
 * A `times` VR's first {@link DicomTime}, else `undefined`.
 *
 * @internal
 */
export function readTime(ds: Dataset, tag: Tag): DicomTime | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "times" ? v.values[0] : undefined;
}

/**
 * The items of an `SQ` element, or `undefined` when absent / not a sequence.
 *
 * @internal
 */
export function readItems(ds: Dataset, tag: Tag): readonly Item[] | undefined {
  const v = ds.get(tag)?.value;
  return v?.kind === "sequence" ? v.items : undefined;
}
