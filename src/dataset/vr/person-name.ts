/**
 * `PN` (Person Name) structured decode per PS3.5 §6.2.1.1.
 *
 * A PN value has up to three component groups separated by `=` (alphabetic,
 * ideographic, phonetic); each group has five `^`-delimited components
 * (family, given, middle, prefix, suffix). Trailing empty components and
 * groups are dropped on the wire, so decoding fills the missing slots with
 * the empty string and omits absent ideographic / phonetic groups.
 *
 * @module
 */

import type { PersonName, PersonNameGroup } from "./types.js";

function toGroup(raw: string): PersonNameGroup {
  const parts = raw.split("^");
  return {
    familyName: parts[0] ?? "",
    givenName: parts[1] ?? "",
    middleName: parts[2] ?? "",
    namePrefix: parts[3] ?? "",
    nameSuffix: parts[4] ?? "",
  };
}

/**
 * Parse a single (already charset-decoded, pad-trimmed) PN value string into
 * its structured {@link PersonName} form.
 *
 * @example
 * ```ts
 * import { parsePersonName } from "@cosyte/dicom";
 * const pn = parsePersonName("Doe^Jane^^Dr^");
 * pn.alphabetic.familyName; // "Doe"
 * pn.alphabetic.namePrefix; // "Dr"
 * ```
 */
export function parsePersonName(value: string): PersonName {
  const groups = value.split("=");
  const result: {
    alphabetic: PersonNameGroup;
    ideographic?: PersonNameGroup;
    phonetic?: PersonNameGroup;
  } = {
    alphabetic: toGroup(groups[0] ?? ""),
  };
  if (groups.length > 1 && groups[1] !== undefined) result.ideographic = toGroup(groups[1]);
  if (groups.length > 2 && groups[2] !== undefined) result.phonetic = toGroup(groups[2]);
  return result;
}
