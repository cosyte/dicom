---
"@cosyte/dicom": patch
---

A Sequence Item under an Explicit VR transfer syntax can read past the end its own sequence declared
and swallow the element that follows the sequence, silently, on every released version. It now
raises the new Tier-2 code `DICOM_ITEM_CROSSES_SEQUENCE_END`, promoted to a throw under the
`{ strict: true }` parse option. No reading changes, on any file.

Provenance: `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`. PS3.5 2026c sections 7.5.2 and 7.5.1 are traced
to the SHA-pinned `vendor/nema/part05/`, each sentence unique in the document; neither says what a
decoder does when the two length fields disagree, so no reading is derived from them.

**A file whose item over-declares and a file whose sequence under-declares are the same bytes.**
`test/integration/explicit-sq-item-bound.test.ts` assembles both from two contradictory intentions
and asserts `Buffer.equals` on the result. So "which of the two length fields is the lie?" has no
answer on the wire, and any bound preferring section 7.5.2's extent for the first file imposes it on
the second one too, because there is no second file. Five graded attempts at such a bound were
refused on `#51`. That one fact is the whole reason this adds no bound.

**The fail-safe-direction argument that five artifacts carried is deleted, not reworded.** It said
that following the Item's length is the safe half, because a Private Creator swallowed into an item
leaves the enclosing block unclaimed. It is false: which direction leaks depends on where the sender
put the Private Creator, not on which length field a reader follows. Both directions can leak
(`DICOM-PRIVATE-CREATOR-RESERVATION-LEAK`; the absorb direction was closed at the de-identify
boundary by `#66`, the eject direction is open). Neither reading is safe by construction, which is
why this code reports rather than decides.

Measured on `0.0.10`: `(0008,1115)` holding one item that over-declares its length by 18 bytes,
followed by a root `(0010,0020)` Patient ID that is 18 bytes on the wire. The Patient ID is absent
from the root and present instead as an attribute of the item, and the `DeidentifyReport` names it
with a `contextPath` pointing at a sequence item it was never in. The mis-structure itself is **not
repaired here** and is pinned as a residual.

**It is also the only signal on a file whose de-identification audit is false.** `#66` recorded the
eject direction of `DICOM-PRIVATE-CREATOR-RESERVATION-LEAK` as silent on every channel; on the
Explicit VR shapes that is no longer true. Re-measured on that residual's own fixture, this code
fires on both channels and throws under `{ strict: true }`, beside an unchanged leak
(`removedPrivateTags` `[]`, the private value in the output, the object stamped
`PatientIdentityRemoved=YES`). The warning is not an all-clear and the troubleshooting row says so,
because its earlier draft told an operator "nothing is retained that would not be" - false on
exactly that file. Implicit VR LE stays silent, because that path slices the item stream.

The disclosure fires on a defined-length item inside a defined-length `SQ` whose declared end is not
the end of the buffer it is read in - the condition that says the sequence sits inside a larger Data
Set whose bytes are there to be taken. A sequence handed a slice cut at its declared end (Implicit VR
LE's `tryParseDefinedLengthSQ`, CP-246's `tryParseUnAsSQ`), an undefined-length sequence, an
undefined-length item, and a sequence that ends its own buffer all stay silent, each pinned by a test.

`scripts/measure-sq-bound-grid.ts` against `2f0abd9`, **83,037 cells**, both sequence length fields
and an element's own swept independently across ten item shapes, both Explicit VR syntaxes, an
Implicit VR LE control, both `strict` postures and `#66`'s `priv|` family: **0** cells whose
**reading** differs, **616** newly emitting the code and **0** losing it, **576** newly failing under
`{ strict: true }` (all 576 carry the new code), **0** new lenient fatals, **0** values lost or
gained, **0** wrong root `(0010,0020)`, **0** PHI regressions, **0** reports losing an attribute,
**0** Implicit VR LE cells changed, every `priv|` column unchanged, and cells leaking a source value
unmoved at 11 (`PRE-EXISTING`, the `OB`/`OW`/`US`/`UN` leaf carrier, its own item). The other 16,396
differing cells are strict-fatal on both trees and differ only in the class of the throw. Quote the
reading count together with the strict count or not at all: 576 files that parsed under
`{ strict: true }` now do not, and that is what this costs.

**The Item's declared length is withheld from the message, and the bound is the factory signature.**
A diagnostic about a length field that lies is itself a PHI surface: the condition that raises this
code is exactly "these length fields are not what they claim to be", so the Item's 32-bit Value
Length can be four bytes of somebody's value. Measured, an item header fabricated over the payload
`"SMITHSON"` rendered it as `1414090067`, `"SMIT"` in wire order - and it is emitted above the
truncation guard, so the message reaches `onWarning` on a file the parse then refuses.
`itemCrossesSequenceEnd` takes no parameter for it, the remedy `#64` and `#55` both landed on, and
`position.byteOffset` locates the item. The bytes that remained inside the sequence are still
reported: the emit site's own `endLimit < buffer.length` conjunct bounds that count by the buffer, so
fabricating the sequence's length field over the same name makes the code not fire at all. Pinned
with a name-bearing payload and a mutation control.

Also disclosed, and each pinned by a test rather than asserted:

- **`ds.warnings` is uncapped and "at most one per sequence" is not an amplification bound.** The
  shape holds, but a file may carry as many sequences as it can encode.
- **`profiles.strict` does not escalate this code**; the `{ strict: true }` option does. Adding a
  code to a shipped preset moves every `profiles.strict` consumer's parse and is its own change.
- **`position.byteOffset` is frame-dependent**, file-absolute for a root-level sequence and
  slice-relative inside an enclosing item, exactly as `Element.byteOffset` is.
- **`Element.byteOffset` inside a sequence item disagrees with itself** between the two item forms,
  `PRE-EXISTING` and measured identically on both trees: on a 210-byte file with the `SQ` at 172 a
  defined-length item reads `0` and an undefined-length item reads `192`, file-absolute.
- **The count of warning codes is removed from the README** rather than restated. It read `25`
  against a `WARNING_CODES` of `28`; the locked snapshot (**29, was 28**) is the pin.
