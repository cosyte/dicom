/**
 * Private-dictionary resolution for the Phase 6 profile system.
 *
 * A private data element is addressed as `(gggg,BBLL)` where `BB` is the
 * **file-assigned** private block byte (`0x10..0xFF`) and `LL` is the
 * element-within-block byte. The block `BB` is not stable across files — the
 * same vendor schema can land in block `0x10` in one study and `0x11` in
 * another — so a profile's overlay is keyed on the *stable* coordinates only:
 * the group, the creator string, and `LL`. The canonical key collapses `BB`
 * to the `XX` placeholder (`"GGGGXXLL"`, e.g. `"0029XX10"`), mirroring the
 * published DICOM private-dictionary notation.
 *
 * @module
 */

import type { PrivateTagDefinition, Profile } from "../parser/types.js";
import type { Tag } from "../dictionary/types.js";

/**
 * Build the canonical private-tag key for a concrete tag — the group, the
 * `XX` block placeholder, and the element-within-block (low) byte, all
 * uppercase. `(0029,1010)` → `"0029XX10"`.
 *
 * @internal
 */
export function canonicalPrivateKey(tag: Tag): string {
  const group = tag.slice(0, 4).toUpperCase();
  const elementByte = tag.slice(6, 8).toUpperCase();
  return `${group}XX${elementByte}`;
}

/**
 * Resolve a private data element against a profile's private-dictionary
 * overlay using the file's live `creator` string. Returns the
 * {@link PrivateTagDefinition} when the profile knows this
 * `(group, creator, element-byte)` triple, else `undefined` (the caller then
 * degrades to generic UN handling).
 *
 * The `creator` lookup is exact: the profile's creator keys must match the
 * on-wire private-creator string byte-for-byte (DICOM creators are exact `LO`
 * values). A case or inner-whitespace variant silently misses and degrades to
 * UN rather than mis-resolving.
 *
 * @internal
 */
export function resolvePrivateTag(
  profile: Profile,
  tag: Tag,
  creator: string,
): PrivateTagDefinition | undefined {
  const byCreator = profile.privateDictionary.get(creator);
  if (byCreator === undefined) return undefined;
  return byCreator.get(canonicalPrivateKey(tag));
}
