/**
 * Bounded rendering of tokens **derived from input**.
 *
 * Shared by the warning registry and by the parsed model, and that sharing is
 * the whole point. The sibling `@cosyte/hl7` bounded its warning messages,
 * verified green, and `@cosyte/deid` still leaked, because `Segment.type` stayed
 * unbounded on the *model* and a downstream package interpolated it to build its
 * own manifest. **A diagnostic-surface fix protects this package's diagnostics.
 * It does not protect a consumer that reads the model and builds diagnostics
 * from it.** So the bound lives here, at the boundary where a document byte
 * becomes something that presents itself as an identifier, rather than inside
 * the warning layer.
 *
 * ## Membership, not shape, and the reason matters
 *
 * `@cosyte/hl7` bounds a segment identifier by **shape**, because HL7 v2 Ch. 2
 * defines one as exactly three alphanumeric characters and nothing legitimate is
 * longer. DICOM offers no such handhold for either token here:
 *
 * - A **Specific Character Set defined term** (`(0008,0005)`, PS3.3
 *   section C.12.1.1.2) is drawn from a **closed table**, and the warning that
 *   names one fires precisely when the value is absent from that table. At the
 *   moment of the warning there is no spec-defined spelling left to test
 *   against: `ISO 2022 IR 87` and a patient name are shape-siblings under any
 *   regular expression you could write. The bound is therefore membership, and
 *   an unrecognized term is refused whole.
 * - A **Private Creator** (`(gggg,00EE)`, PS3.5 section 7.8.1) is an `LO`, and
 *   `LO` admits any character up to 64 of them. A shape test there would admit a
 *   patient name in full, which is not a bound at all. The closed set that does
 *   exist is the active {@link Profile}'s private-dictionary overlay: a creator
 *   the profile names is one this package put there itself, and every other
 *   creator is a string the parser cannot vouch for.
 *
 * ## What the membership bound costs, stated rather than glossed
 *
 * With no profile active, **no** creator is recognized, so `Element.privateCreator`
 * reads {@link WITHHELD} on every private element. That is a real reduction in
 * what the field tells a caller, and it is deliberate: an unvouched creator is
 * a document value the parser is echoing under an identifier's name, which is
 * exactly the shape that leaked. A caller who genuinely needs the raw creator
 * still has it, unchanged, as the `rawBytes` of the `(gggg,00EE)` element itself
 * - as a value, where value discipline applies. Pass a `Profile` and recognized
 * creators come back verbatim.
 *
 * The Specific Character Set half of this lives in
 * `src/dataset/vr/charset.ts`, next to the table it tests membership against:
 * that module owns the closed term list, and importing it here would make the
 * two modules a runtime cycle. Only {@link WITHHELD} is shared.
 *
 * @module
 */

import type { VR } from "../dictionary/types.js";
import { KNOWN_VRS } from "./endian.js";
import type { Profile } from "./types.js";

/**
 * What a message or a model field prints in place of a token it may not echo.
 *
 * Deliberately carries **no length**. Reporting the character count as "useful
 * structural metadata" would leak the length of a withheld value, which is
 * itself derivable content, and no other withheld token in the `@cosyte/*` set
 * reports one.
 */
export const WITHHELD = "<withheld>";

/**
 * Render a Private Creator for a model field: verbatim when the active profile's
 * private-dictionary overlay names it, {@link WITHHELD} otherwise (including
 * when no profile is active, which recognizes nothing).
 *
 * @internal
 */
export function safePrivateCreator(creator: string, profile: Profile | undefined): string {
  if (profile === undefined) return WITHHELD;
  return profile.privateDictionary.has(creator) ? creator : WITHHELD;
}

/**
 * Render a VR token for a diagnostic message: verbatim when it names one of the
 * 34 VRs PS3.5 2026c section 6.2 defines, {@link WITHHELD} otherwise.
 *
 * Under Explicit VR the on-wire VR is two bytes a sender chose, so it is checked
 * against the closed set rather than trusted: two bytes cannot carry much, but
 * "cannot carry much" is not a bound.
 *
 * **It lives here, beside {@link safePrivateCreator}, because both the Tier-2
 * registry in `./warnings.ts` and the Tier-3 registry in `./fatals.ts` need it
 * and a second copy is a second thing to drift.** It is also the reason the
 * companion `renderTag` is deliberately NOT here: a tag has only a shape to
 * test, so a renderer for one cannot refuse a fabricated tag, and the two
 * registries take deliberately different postures on that. `./warnings.ts` keeps
 * a shape-checking `renderTag` for the codes whose tags are genuinely composed;
 * `./fatals.ts` has no tag slot at all.
 *
 * @internal
 */
export function renderVr(vr: VR | undefined): string {
  return vr !== undefined && KNOWN_VRS.has(vr) ? vr : WITHHELD;
}
