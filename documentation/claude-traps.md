`CLAUDE.md` links here from its own `## Traps that cost a defect to learn` heading. Each line is a rule and the anchor under it is the evidence, exactly as it reads there.

## Traps that cost a defect to learn

**Each line is a rule, and the anchor under it is the evidence.** Every one was written because something shipped wrong, or a `conformance-refuter` pass refused a claim. Relocating them did not soften them. All anchors are in `documentation/agent-notes.md`.

### Method: how a claim gets made here at all

- **Correct the CLAIM, never widen the GUARD.**
  [#dicom-deident-rawbytes-passthrough](agent-notes.md#dicom-deident-rawbytes-passthrough)
- **Re-wording a disclosure twice is the signal to DELETE it, not to try a third wording.**
  [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **🛑 THE FAIL-SAFE-DIRECTION ARGUMENT IS RETRACTED AND DELETED, NOT REWORDED. DO NOT WRITE IT AGAIN.** Which direction leaks is a property of **where the sender put the Private Creator**, not of which length field a reader follows, and the private-creator work is never "both directions are closed".
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-private-creator-reservation-leak](agent-notes.md#dicom-private-creator-reservation-leak)
- **ADD A SHAPE TO THE HARNESS, NEVER A SENTENCE.** Do not summarize what a §6.2-conformant future-VR file does: every attempt has been refuted, the counts stay in the sections, and `scripts/measure-unrecognized-vr.ts` prints the table.
  [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks)
- **A cost claim needs an ADVERSARIAL fixture, not a big one.**
  [#dicom-overdeclare-swallows-into-value](agent-notes.md#dicom-overdeclare-swallows-into-value)
- **A PHI test whose payload carries no name is VACUOUS BY FIXTURE.** Use a name-bearing payload and a mutation control that turns it red.
  [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks) · [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **A test named for the thing it did not check occupies the slot.**
  [#dicom-implicit-sq-not-descended](agent-notes.md#dicom-implicit-sq-not-descended)
- **Classify a grid cell by WHAT THE PARSE PRODUCED, never by the fixture's placement label**; a fixture artifact reported as a finding is this repo's recurring failure mode.
  [#dicom-private-creator-reservation-leak](agent-notes.md#dicom-private-creator-reservation-leak) · [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks)
- **Quote a grid number as a fact about the GRID'S FIXTURES, never as a fact about the change.**
  [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form)
- **Quote the reading count and the strict count TOGETHER or neither**, and know that pre-rebase figures die.
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **`lostValue` and `changed`/`structural` are the WRONG numbers for a de-identify-boundary remedy.** Quote `cells differing in any PARSE respect`.
  [#dicom-deident-rawbytes-passthrough](agent-notes.md#dicom-deident-rawbytes-passthrough)
- **🛑 A grid family that runs `deidentify()` with NO OPTIONS cannot see a private-retention leak.** `RetainSafePrivate` + a `Profile` is the only route that writes a private value into de-identified output.
  [#dicom-private-creator-reservation-leak](agent-notes.md#dicom-private-creator-reservation-leak)
- **Do not write a warning-code COUNT into prose.** The locked `WARNING_CODES` snapshot measures it every run.
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **`scripts/measure-sq-bound-grid.ts` is on `main` and is re-run BEFORE changing de-identify code** (with the `declaredLengthDelta` / `omitItemDelim` knobs in `test/helpers/build-dicom.ts`).
  [#dicom-overdeclare-swallows-into-value](agent-notes.md#dicom-overdeclare-swallows-into-value)

### Spec conformance: citations and bounds

- **🛑 LOCATING A SPEC SECTION: NEVER FIRST-MATCH, it reads the table of contents.** Collect every candidate, keep those containing the normative sentence, **require exactly one**; zero and two are both refusals. Copy this rule, it generalises.
  [#the-vendored-ps35-repeating-group-bound](agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **Cite PS3.5 §6.2's "shall" (a new VR is long-form), never §6.2's NOTE about ignoring unrecognized VRs**, which is informative.
  [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks)
- **Cite PS3.5 §7.5.2 for the `SQ`'s OWN length and §7.5.1 for the Item's.**
  [#dicom-implicit-sq-not-descended](agent-notes.md#dicom-implicit-sq-not-descended)
- **Cite PS3.15 §E.1.1, not §E.1**; §E.1.1's SOP-Instance-UID escalation is precedent for answering **at the carrier** and is about encrypt-and-replace, not a rule about Table E.1-1.
  [#dicom-deident-rawbytes-passthrough](agent-notes.md#dicom-deident-rawbytes-passthrough)
- **🛑 QUOTE PS3.15 §E.3.10 WHOLE: IT HAS TWO BRANCHES AND A GATE CAUGHT IT TRUNCATED AT "removed"**, which reads a permissive clause as an absolute, and **"known"** is the load-bearing word.
  [#dicom-private-creator-reservation-leak](agent-notes.md#dicom-private-creator-reservation-leak)
- **The repertoire clause is PS3.5 §6.1.3 + Table 6.1-1, NOT §6.1.2.1; the per-VR rule is Table 6.2-1, in three tiers.** Grouping `UC` with `LT`/`ST`/`UT` is **fail-open**; treating ESC as evidence in `LO`/`SH`/`PN` is **fail-closed on exactly the attributes that carry names**. **A per-VR table transcribed from memory is not a citation.**
  [#dicom-overdeclare-swallows-into-value](agent-notes.md#dicom-overdeclare-swallows-into-value)
- **Repeating groups are bounded to the EVEN groups `6000`-`601E` and `5000`-`501E`, sixteen per mask, not 256** (PS3.5 §7.6, and PS3.5-2004 §7.6 for curves, which the current edition's Note delegates to; the generator proves the delegation link).
  [#repeating-group-masks-on-the-de-identify-path](agent-notes.md#repeating-group-masks-on-the-de-identify-path) · [#the-vendored-ps35-repeating-group-bound](agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **Do NOT unify `src/dictionary/repeating-groups.ts` with `src/parser/element-header.ts`'s `matchRepeatingGroup`.** A too-wide VR guess only decodes leniently; a too-wide removal deletes data the standard never marked. **Over-broad is a different unsafe direction from under-broad, so both are tested.**
  [#repeating-group-masks-on-the-de-identify-path](agent-notes.md#repeating-group-masks-on-the-de-identify-path)
- **`NESTING_DEPTH_LIMIT` (64) is THIS LIBRARY'S bound, not PS3.5's**, so never blame the sender's encoding for a conformant file that exceeds it, and **the limit must propagate untouched** through any descent path.
  [#dicom-deident-rawbytes-passthrough](agent-notes.md#dicom-deident-rawbytes-passthrough) · [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **Say the EDITION when you cite.** §6.2 describes a _future_ VR; the pins are **PS3.5 / PS3.6 / PS3.15 2026c** under `vendor/nema/`, re-hashed as a precondition.
  [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks) · [#the-ps36-element-registry-generator](agent-notes.md#the-ps36-element-registry-generator)

### PHI and de-identification

- **🩺 A DIAGNOSTIC MUST NOT NAME AN ELEMENT WHOSE HEADER MIGHT BE FABRICATED: where the trigger IS "these bytes are not what they claim to be", the fields naming the element ARE INPUT.** `renderTag` and `renderVr` check MEMBERSHIP in a closed table; a raw length or byte value has no table, so its only bound is the **signature**, and `position.byteOffset` names it. This bit `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`, `DICOM_NONZERO_RESERVED_BYTES`, `DICOM_ITEM_CROSSES_SEQUENCE_END`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_GROUP_LENGTH_IN_DATASET` and every Tier-3 message in `fatals.ts`. **Do not put any back.**
  [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks) · [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **There is NO string parameter for a value to travel through.** Every Tier-2 message is looked up in the frozen `WARNING_MESSAGES` registry by code, and factories take a position and structural constants only. **That single property separates the `@cosyte/*` parsers that leak from the ones that do not.**
  [#phi-warning-message-leak](agent-notes.md#phi-warning-message-leak)
- **The bound has to reach the MODEL, not just the messages**, so `Element.specificCharacterSet` and `Element.privateCreator` bind on **membership in a closed table**, not on shape; with no profile `Element.privateCreator` reads `<withheld>`.
  [#phi-warning-message-leak](agent-notes.md#phi-warning-message-leak)
- **The PHI diagnostic gate does NOT make the surface PHI-free and must not be described that way**: `DicomParseError.snippet` is 16 raw source bytes as hex (D-10). **`@cosyte/test-utils` must stay pinned `^0.0.2` or higher**, because a caret on a `0.0.x` resolves exactly and `^0.0.1` silently tests against a kit with no such runner.
  [#phi-warning-message-leak](agent-notes.md#phi-warning-message-leak)
- **🩺 A de-identifier's action table lagging the dictionary is a SILENT PHI LEAK, not a currency nit.** `annexE()` returns `undefined` for a tag it does not carry and `deidentify()` reads `undefined` as "keep", so tags the current standard marks `X` survive verbatim with a clean report. **They advance together or the gap only widens.**
  [#the-ps315-annex-e-action-table-generator](agent-notes.md#the-ps315-annex-e-action-table-generator)
- **Private block reservations are scoped PER DATA SET, on BOTH paths** (PS3.5 §7.8.1): derive the creator map at **every depth** in `processElements`, and the parser swaps in a **fresh, empty** map per Sequence Item. **Items inherit charset; they do NOT inherit reservations.** Never "simplify" `ParseContext.creators` back to a `readonly` field, because the swap is what scopes it.
  [#phi-warning-message-leak](agent-notes.md#phi-warning-message-leak) · [#dicom-parse-creators-scope](agent-notes.md#dicom-parse-creators-scope)
- **A RETENTION DECISION MUST NOT ALSO DECIDE THE FATE OF THE DATA SETS BELOW IT.** Never call a de-identify rule unconditional without checking what decides first.
  [#dicom-private-sq-carve-out](agent-notes.md#dicom-private-sq-carve-out)
- **Cap every consumer-controlled diagnostic PER RUN, on `DeidentifyContext` and not on `ProcessResult`** (per Data Set, so a per-result cap bounds each item and not the file), and keep registry messages short: a per-element string is multiplied by an attacker-chosen element count. `ds.warnings` itself stays uncapped (pre-existing, package-wide).
  [#dicom-deident-rawbytes-passthrough](agent-notes.md#dicom-deident-rawbytes-passthrough) · [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks)
- **A one-pass descent is a SECURITY property, not an efficiency one**: a try-then-fallback shape cost 2^depth, and the 20-deep cost pins stay.
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **Scan cost is capped PER ELEMENT, not per file** (`MAX_SCAN_BYTES`); the forward loop `return`s rather than `continue`s, valid because the repertoire test is **monotone in the offset**.
  [#dicom-overdeclare-swallows-into-value](agent-notes.md#dicom-overdeclare-swallows-into-value)
- **A private-reservation rule is scoped to EVERY still-usable Data Set, never the root**, and **the cut inside a Data Set is POSITIONAL, which the grid cannot see at all**, so the whole-Data-Set variant is refused by tests alone and **you must count them over the FULL SUITE**.
  [#dicom-item-eject-route](agent-notes.md#dicom-item-eject-route)
- **🛑 A DATA SET IS A `Map<Tag, Element>`, SO ITS ORDER IS NOT ITS FILE ORDER.** An element moved in by a length lie whose tag the Data Set already holds **overwrites in place, inherits the earlier position and destroys the original value**, so a positional rule needs `Element.byteOffset` beside the index. **The loss is REPORTED now (`DICOM_DUPLICATE_TAG_IN_DATA_SET`, every Data Set, every depth) and is otherwise UNCHANGED.** Never answer it with a bound: the two files are byte-identical.
  [#dicom-item-eject-route](agent-notes.md#dicom-item-eject-route) · [#dicom-tag-collision-destroys-element](agent-notes.md#dicom-tag-collision-destroys-element)
- **🛑 THE FILE META GROUP LOSES A COPY THE OPPOSITE WAY ROUND, AND AN ARRAY IS NOT SAFETY.** A modeled `(0002,xxxx)` is projected by FIRST match and excluded from `extraElements`, so a second copy is in neither. FIRST wins there, LAST in a Data Set; `DICOM_DUPLICATE_FILE_META_ELEMENT`.
  [#dicom-file-meta-drops-duplicate](agent-notes.md#dicom-file-meta-drops-duplicate)
- **🛑 THE GRID'S SYNTAX SPLIT WAS BLIND TO THREE OF ITS FOUR FAMILIES**, keying on the cell key _starting with_ the transfer syntax. Fixed; any such split quoted before it is not re-derivable.
  [#dicom-item-eject-route](agent-notes.md#dicom-item-eject-route)
- **Over-redaction is a PRODUCT call with its own item (`DICOM-DEIDENT-OVER-REDACTION`), not a bug fix.** Dropping the repertoire conjunct for binary VRs, or widening `embedded.ts`'s tiling scanner to unrecognized VRs, empties conformant values. Do not take either as a side effect.
  [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks) · [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form)
- **`RetainLongitudinalTemporal` collapses PS3.15's two E.3.6 date columns onto the LESS PROTECTIVE branch.** Printed every run and stated in the JSDoc; splitting the option is a public-surface change deliberately not made.
  [#the-ps315-annex-e-action-table-generator](agent-notes.md#the-ps315-annex-e-action-table-generator)
- **`UN` is untouched by the undefined-VR rule and that is the whole line.** Widening it to "unknown to the dictionary" would empty every `UN` in every file.
  [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks)
- **An emptied audit is not a performed one.** A `DeidentifyReport` that reads as a scrub it did not perform is the worse half of every leak in this file.
  [#dicom-implicit-sq-not-descended](agent-notes.md#dicom-implicit-sq-not-descended)

### Parser and vendor-quirk behaviour

- **🛑 AN OVER-DECLARING ELEMENT AND A WELL-FORMED ONE ARE BYTE-IDENTICAL; INTENT IS NOT ON THE WIRE**, pinned by a `Buffer.equals` test in `test/integration/explicit-sq-item-bound.test.ts`. So the remedy is at the **de-identify boundary** or it is a **warning**, never a parser bound.
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-overdeclare-swallows-into-value](agent-notes.md#dicom-overdeclare-swallows-into-value)
- **The enclosing Data Set is a `Map<Tag, Element>`, so any bound that MOVES an element can silently REPLACE one**, measured as a root Patient ID reading another patient's.
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **HAND A DESCENT PRIMITIVE A SLICE, NOT THE WHOLE BUFFER**, or an over-declaring item reads past its sequence and the same bytes get **read twice**, silently and under `{ strict: true }`. **A regression fixture must over-declare by EXACTLY the trailing element's size.**
  [#dicom-implicit-sq-not-descended](agent-notes.md#dicom-implicit-sq-not-descended)
- **An UNDER-declare is not a swallow, it DESYNCHRONIZES the reader**, so tag, VR and length are all fragments of somebody's value, and it reaches **string** carriers too.
  [#dicom-carrier-leaf-leaks](agent-notes.md#dicom-carrier-leaf-leaks)
- **A FAIL-SAFE DEGRADE IS NOT AUTOMATICALLY A SMALL ONE: MEASURE WHAT ELSE READS THE FIELD YOU DEGRADED.** Degrading a profile-resolved `SQ` to `UN` turned a file that parsed into a whole-object `INVALID_FILE_META`.
  [#dicom-parse-creators-scope](agent-notes.md#dicom-parse-creators-scope)
- **`rawBytes` stays VALUE-ONLY for a defined-length `SQ` under Implicit VR**: `isFullSpanElement` keys off the encoding, so a full-span slice would make the writer emit the header twice.
  [#dicom-implicit-sq-not-descended](agent-notes.md#dicom-implicit-sq-not-descended)
- **A reader-only VR fix is a silent truncation**, because the short form's length field is 16 bits. Reader and writer ship together.
  [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form)
- **Do not add a Tier-2 code for a CONFORMANT file**, which would throw under `{ strict: true }` on exactly that file. And **`profiles.strict` is not `{ strict: true }`**: adding a code to a shipped preset moves every consumer's parse.
  [#dicom-unrecognized-vr-short-form](agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **A warning emitted for a reading that is then DISCARDED costs a `{ strict: true }` caller the object and makes `onWarning` disagree with `ds.warnings`.** Related pre-existing residual: `makeEmitter` hands warnings to `onWarning` **before** the pop that undoes them (D-03 ordering). Disclosed, not fixed.
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-implicit-sq-not-descended](agent-notes.md#dicom-implicit-sq-not-descended)
- **`Element.byteOffset` inside a sequence item DISAGREES WITH ITSELF and always has**: `0` inside a defined-length item, file-absolute inside an undefined-length one, and the same for a warning's `position.byteOffset`. **Measure it rather than describing it.**
  [#dicom-explicit-vr-unbounded-item-read](agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-implicit-sq-not-descended](agent-notes.md#dicom-implicit-sq-not-descended)

### Generators and gates

- **The vendored DocBook pins are PRECONDITIONS**: each generator re-hashes its document, refuses to run on a mismatch, reads the edition from its own `<subtitle>`, and fails loudly on a malformed row. PS3.6 wins per field over the mirror; **mirror-only entries are KEPT**.
  [#the-ps36-element-registry-generator](agent-notes.md#the-ps36-element-registry-generator) · [#the-ps315-annex-e-action-table-generator](agent-notes.md#the-ps315-annex-e-action-table-generator)
- **🛑 UIDs ARE OVERLAID FROM ANNEX A NOW; "UIDs are deliberately not overlaid" is STALE. The short forms and the `retired` boolean are preserved BY CONSTRUCTION, derived not typed.** A-2 is a second table, shaped differently, and reading A-1 alone reports UIDs as withdrawn that are not.
  [#the-ps36-uid-registry-overlay](agent-notes.md#the-ps36-uid-registry-overlay)
- **🛑 THERE IS NO STALENESS CLOCK AND THERE MUST NOT BE ONE.** A date gate fires the day it is written and reds unrelated PRs. "Has NEMA moved" is one content-comparing command in `vendor/nema/README.md`; CI gates byte-identical regen, offline.
  [#the-ps36-element-registry-generator](agent-notes.md#the-ps36-element-registry-generator)
- **Two DocBook traps in PS3.6, both covered by tests:** **ZERO WIDTH SPACE** hints in the keyword column (one left in yields a keyword that looks right and never matches), and `DICOS`/`DICONDE` markers beside `RET (edition)` in the sixth column (reading it as a boolean retires live tags).
  [#the-ps36-element-registry-generator](agent-notes.md#the-ps36-element-registry-generator)
- **A cell count catches an inserted or dropped column, NOT a reorder**, which would read one option's code as another's.
  [#the-ps315-annex-e-action-table-generator](agent-notes.md#the-ps315-annex-e-action-table-generator)
- **A masked row on a prefix PS3.5 does not define FAILS the generator** instead of being printed and dropped, which is how three `X`-marked overlay/curve rows went missing. Proven by mutation.
  [#repeating-group-masks-on-the-de-identify-path](agent-notes.md#repeating-group-masks-on-the-de-identify-path)
- **The generator ORDER is not the gate; the byte-identical REGEN gate is.** A _missing_ artifact fails at import, but a merely _stale_ bound leaves `annex-e.ts` byte-identical.
  [#the-vendored-ps35-repeating-group-bound](agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **The minimal PDF reader in `generate-repeating-groups.ts` recovers ONE sentence. Do not grow it into a general PDF parser**; re-derive the bound from a current normative source instead.
  [#the-vendored-ps35-repeating-group-bound](agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **▶ `attw` SAYS "does not contain types" AND EXITS 0, SO USE `scripts/attw.mjs`, NOT THE BARE CLI.** Two nets, catching different things; **short options are refused by LETTER ANYWHERE IN THE CLUSTER** and must not be "simplified" to a token set.
  [#the-attw-wrapper-gate](agent-notes.md#the-attw-wrapper-gate)
- **The em-dash gate scans EVERY TRACKED FILE, plus the PR title, body and commit messages.** It **deliberately omits `grep -I`**: do not add it, and do not remove the functional NUL in `src/dataset/vr/charset.ts`. When it reds, rewrite with a period, colon, comma or parentheses, **never re-encode the character**.
  [#the-em-dash-brand-gate](agent-notes.md#the-em-dash-brand-gate)
