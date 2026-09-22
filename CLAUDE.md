# @cosyte/dicom: Project Guide for Claude

**▶ THE NARRATIVE BEHIND EVERY TRAP IN THIS FILE LIVES IN
[`documentation/agent-notes.md`](documentation/agent-notes.md).** This file is always-read for any
worker that `cd`s in, so it is budgeted at write time by the meta-repo's `doc-budget.mjs`. **The
budget is this repo's entry in `REPO_CLAUDE`, and no numeral for it is written here.** Read
`documentation/decisions/0023-doc-budgets.md` for what governs, and this file's own history in
[agent-notes.md](documentation/agent-notes.md); it opens on why, and on what "relocate" means here.
**The line is enough to stop you doing the wrong thing. It is not enough to justify doing a new thing
in the same area: open the section first.**

## Project

**`@cosyte/dicom`**: a developer-focused DICOM parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT). Sibling to `@cosyte/hl7` at `../hl7`.

**North star:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line, without having read the DICOM standard.

**Scope boundary (v1):** Metadata-first. Pixel data is exposed as raw `Buffer` + encapsulated fragments but **not decoded**. DIMSE network services and DICOMweb are explicit non-goals, tracked as future companion packages (`@cosyte/dicom-pixel`, `@cosyte/dicom-net`, `@cosyte/dicomweb`).

## Status

- **Phases 4-7 of 8 shipped**: VR value decode, `Dataset`/`Item` navigation, safety-critical domain helpers, the spec-clean Part 10 serializer, the source/vendor profile system, and metadata-level de-identification (PS3.15 Annex E Basic Profile + the metadata-affecting Options). Surfaces, scope limits and the known serializer limitation:
  [#shipped-phases-4-through-7-of-8](documentation/agent-notes.md#shipped-phases-4-through-7-of-8)
- Published on npm on the **`0.0.x`-until-first-alpha** ladder. **Never quote a version in this file**: `npm view @cosyte/dicom version` is the only source of truth, ADR 0023 carries the measured history of why, and no numeral belongs in this bullet.
- **🛑 A "N OF M TESTS RUN RED ON BASE" FIGURE HAS A MOVING BASE AND IS NOT A FACT.** Quote one only with its sha, re-run it after every test you add **or strengthen**, and **replace `src/` rather than overlaying it**.
  [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route) · [#dicom-parse-creators-scope](documentation/agent-notes.md#dicom-parse-creators-scope)
- **🩺 Open PHI residuals, measured and disclosed, NOT closed. None is an all-clear, and this list is an INDEX, NOT A CENSUS: each section names its own, several disclosed only there.**
  - Private-`SQ` carve-out CLOSED, and so is the parsed-VR route (`DICOM-PRIVATE-SQ-PARSE-VR`): a profile's **declared** VR is a second authority. **LEAKS = not `SQ` AND the scanner cannot read it; "BINARY VR" was WRONG, not narrow.** A `Profile` vouches for a Private Attribute (§E.3.10), never for a Data Set nested in its value (§E.1.1). ABSORB and EJECT are closed too, EJECT on a second predicate plus a positional cut with TWO bounds, so absorb does not cover it.
    [#dicom-private-sq-carve-out](documentation/agent-notes.md#dicom-private-sq-carve-out)
  - **11 grid cells** still leak through an over-declaring `OB`/`OW`/`US`/`UN` **leaf** carrier, silent. `PRE-EXISTING`.
    [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
  - The relocation under `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` stands and is **UNDECIDABLE**; **"`contextPath` names an item it was never in" is DELETED, not reworded.**
    [#dicom-item-crosses-residuals](documentation/agent-notes.md#dicom-item-crosses-residuals)
  - `report.removedPrivateTags` can echo four bytes of a **fabricated odd-group header**, with `uidMap`, `unauditableSequences[].tag` and **`contextPath`, bound by nothing**. Structural, not closed; the claim was corrected rather than the guard widened. **NEVER QUOTE A COUNT**, read the list on the type.
    [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) · [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
  - A **failed CP-246 `UN` descent emits nothing**; the honest consumer test is `el.items === undefined`, **not** `ds.warnings`.
    [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
  - Tier-3 fatals are registry-bound and the `{strict:true}` snippet is cut in the frame its offset names, so it is **16 raw source bytes and still PHI**, more certainly so for being honest.
    [#dicom-fatal-message-registry](documentation/agent-notes.md#dicom-fatal-message-registry)
  - **`renderTag` IS MEMBERSHIP: a LITERAL PS3.6 row or `<withheld>`, and A MASK IS NOT ONE.** It costs PRIVATE, `(gggg,0000)` and `60xx` tags their name in every message. **A raw wire number, or one SHIFTED BY A COMPUTABLE AMOUNT, is bound out of the SIGNATURE** (exceptions in `warnings.ts`); **a FLOOR CLEARS NOTHING BELOW IT and NO OFFSET ARM CLEARS A SHIFT.** "safe to log" DELETED, `hidden` UNCAPPED.
    [#dicom-diagnostic-phi-residuals](documentation/agent-notes.md#dicom-diagnostic-phi-residuals) · [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
  - The **undefined-length item with no `(FFFE,E00D)`** has no declared length to disagree with, so no over-run is recordable.
    [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
  - `(0012,0063)` carries the file's own method into output, under two codes. **An `LO` de-dup trims trailing pad on BOTH sides or it regrows; a fixed-point pin reads RAW BYTES; Table 6.2-1's "64 chars max" is per VALUE (`LO` is `1-n`).**
    [#dicom-deident-not-a-fixed-point](documentation/agent-notes.md#dicom-deident-not-a-fixed-point) · [#dicom-lo-length-and-silent-replace](documentation/agent-notes.md#dicom-lo-length-and-silent-replace)

## Tech Stack (the shared `@cosyte/*` standard)

dicom inherits the canonical toolchain by depending on the published `@cosyte/*` config packages, not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`.
- **Build:** dual ESM + CJS + `.d.ts`/`.d.cts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). `attw` and `typecheck:exports` run **`scripts/attw.mjs`, not the bare CLI**; see the guardrail below.
- **Node:** **>= 22** (CI matrix 22 + 24). **Package manager:** `pnpm@10`, at or above the release that puts `pnpm-workspace.yaml`'s `minimumReleaseAge` and `trustPolicy` in force rather than ignoring them.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory gates, enabled.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows; the repo-specific `dictionary-regen.yml` byte-identical regen gate is kept.
- **Runtime deps:** **≤ 3**, each MIT/Apache-licensed and ADR-justified. Deliberate divergence from `@cosyte/hl7`'s zero-dep rule; currently zero are taken.
- **License:** MIT

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export (feeds IntelliSense).
- Immutable by default. Mutation only via explicit methods (`setElement`, `addElement`, `removeElement`, `addItem`, `removeItem`).
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings with stable codes and byte-offset positional context); serializer is conservative (always emits spec-clean DICOM Part 10 with correct File Meta group length, even-length values, proper padding).
- Fatal errors only for unrecoverable structural corruption (4 Tier-3 codes: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`). Everything else is a warning.
- Buffer-first API for binary values. String decoding respects `(0008,0005)` Specific Character Set.
- Data dictionary is generated at build time from the official DICOM Part 6 source and committed; runtime has no network/filesystem dependency on it.
- Coverage: per-directory gate, canonical bar ≥ 90%. Raise the transient floors toward it, never disable the gate. **`vitest.config.ts` is the source of truth** (this line does not restate it).

## Traps that cost a defect to learn

**Each line is a rule, and the anchor under it is the evidence.** Every one was written because something shipped wrong, or a `conformance-refuter` pass refused a claim. Relocating them did not soften them. All anchors are in `documentation/agent-notes.md`.

### Method: how a claim gets made here at all

- **Correct the CLAIM, never widen the GUARD.**
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough)
- **Re-wording a disclosure twice is the signal to DELETE it, not to try a third wording.**
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **🛑 THE FAIL-SAFE-DIRECTION ARGUMENT IS RETRACTED AND DELETED, NOT REWORDED. DO NOT WRITE IT AGAIN.** Which direction leaks is a property of **where the sender put the Private Creator**, not of which length field a reader follows, and the private-creator work is never "both directions are closed".
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak)
- **ADD A SHAPE TO THE HARNESS, NEVER A SENTENCE.** Do not summarize what a §6.2-conformant future-VR file does: every attempt has been refuted, the counts stay in the sections, and `scripts/measure-unrecognized-vr.ts` prints the table.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **A cost claim needs an ADVERSARIAL fixture, not a big one.**
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **A PHI test whose payload carries no name is VACUOUS BY FIXTURE.** Use a name-bearing payload and a mutation control that turns it red.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) · [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **A test named for the thing it did not check occupies the slot.**
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **Classify a grid cell by WHAT THE PARSE PRODUCED, never by the fixture's placement label**; a fixture artifact reported as a finding is this repo's recurring failure mode.
  [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak) · [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **Quote a grid number as a fact about the GRID'S FIXTURES, never as a fact about the change.**
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
- **Quote the reading count and the strict count TOGETHER or neither**, and know that pre-rebase figures die.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **`lostValue` and `changed`/`structural` are the WRONG numbers for a de-identify-boundary remedy.** Quote `cells differing in any PARSE respect`.
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough)
- **🛑 A grid family that runs `deidentify()` with NO OPTIONS cannot see a private-retention leak.** `RetainSafePrivate` writes a private value into de-identified output by TWO routes, and a fixture with no `(0008,0300)` sees only one: a caller `Profile`, and **the file's own declaration, which needs no profile and rests on the SENDER's word**.
  [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak)
- **Do not write a warning-code COUNT into prose.** The locked `WARNING_CODES` snapshot measures it every run.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **`scripts/measure-sq-bound-grid.ts` is on `main` and is re-run BEFORE changing de-identify code** (with the `declaredLengthDelta` / `omitItemDelim` knobs in `test/helpers/build-dicom.ts`).
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)

### Spec conformance: citations and bounds

- **🛑 LOCATING A SPEC SECTION: NEVER FIRST-MATCH, it reads the table of contents.** Collect every candidate, keep those containing the normative sentence, **require exactly one**; zero and two are both refusals. Copy this rule, it generalises.
  [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **Cite PS3.5 §6.2's "shall" (a new VR is long-form), never §6.2's NOTE about ignoring unrecognized VRs**, which is informative.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **Cite PS3.5 §7.5.2 for the `SQ`'s OWN length and §7.5.1 for the Item's.**
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **Cite PS3.15 §E.1.1, not §E.1**; §E.1.1's SOP-Instance-UID escalation is precedent for answering **at the carrier** and is about encrypt-and-replace, not a rule about Table E.1-1.
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough)
- **🛑 QUOTE PS3.15 §E.3.10 WHOLE: IT HAS TWO BRANCHES AND A GATE CAUGHT IT TRUNCATED AT "removed"**, which reads a permissive clause as an absolute, and **"known"** is the load-bearing word.
  [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak)
- **The repertoire clause is PS3.5 §6.1.3 + Table 6.1-1, NOT §6.1.2.1; the per-VR rule is Table 6.2-1, in three tiers.** Grouping `UC` with `LT`/`ST`/`UT` is **fail-open**; treating ESC as evidence in `LO`/`SH`/`PN` is **fail-closed on exactly the attributes that carry names**. **A per-VR table transcribed from memory is not a citation.**
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **Repeating groups are bounded to the EVEN groups `6000`-`601E` and `5000`-`501E`, sixteen per mask, not 256** (PS3.5 §7.6, and PS3.5-2004 §7.6 for curves, which the current edition's Note delegates to; the generator proves the delegation link).
  [#repeating-group-masks-on-the-de-identify-path](documentation/agent-notes.md#repeating-group-masks-on-the-de-identify-path) · [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **Do NOT unify `src/dictionary/repeating-groups.ts` with `src/parser/element-header.ts`'s `matchRepeatingGroup`.** A too-wide VR guess only decodes leniently; a too-wide removal deletes data the standard never marked. **Over-broad is a different unsafe direction from under-broad, so both are tested.**
  [#repeating-group-masks-on-the-de-identify-path](documentation/agent-notes.md#repeating-group-masks-on-the-de-identify-path)
- **`NESTING_DEPTH_LIMIT` (64) is THIS LIBRARY'S bound, not PS3.5's**, so never blame the sender's encoding for a conformant file that exceeds it, and **the limit must propagate untouched** through any descent path.
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough) · [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **Say the EDITION when you cite.** §6.2 describes a _future_ VR; the pins are **PS3.5 / PS3.6 / PS3.15 2026c** under `vendor/nema/`, re-hashed as a precondition.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) · [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator)

### PHI and de-identification

- **🩺 A DIAGNOSTIC MUST NOT NAME AN ELEMENT WHOSE HEADER MIGHT BE FABRICATED: where the trigger IS "these bytes are not what they claim to be", the fields naming the element ARE INPUT.** `renderTag` and `renderVr` check MEMBERSHIP in a closed table; a raw length or byte value has no table, so its only bound is the **signature**, and `position.byteOffset` names it. This bit `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`, `DICOM_NONZERO_RESERVED_BYTES`, `DICOM_ITEM_CROSSES_SEQUENCE_END`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_GROUP_LENGTH_IN_DATASET` and every Tier-3 message in `fatals.ts`. **Do not put any back.**
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) · [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **There is NO string parameter for a value to travel through.** Every Tier-2 message is looked up in the frozen `WARNING_MESSAGES` registry by code, and factories take a position and structural constants only. **That single property separates the `@cosyte/*` parsers that leak from the ones that do not.**
  [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
- **The bound has to reach the MODEL, not just the messages**, so `Element.specificCharacterSet` and `Element.privateCreator` bind on **membership in a closed table**, not on shape; with no profile `Element.privateCreator` reads `<withheld>`.
  [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
- **The PHI diagnostic gate does NOT make the surface PHI-free and must not be described that way**: `DicomParseError.snippet` is 16 raw source bytes as hex (D-10). **`@cosyte/test-utils` must stay pinned `^0.0.2` or higher**, because a caret on a `0.0.x` resolves exactly and `^0.0.1` silently tests against a kit with no such runner.
  [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
- **🩺 A de-identifier's action table lagging the dictionary is a SILENT PHI LEAK, not a currency nit.** `annexE()` returns `undefined` for a tag it does not carry and `deidentify()` reads `undefined` as "keep", so tags the current standard marks `X` survive verbatim with a clean report. **They advance together or the gap only widens.**
  [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **Private block reservations are scoped PER DATA SET, on BOTH paths** (PS3.5 §7.8.1): derive the creator map at **every depth** in `processElements`, and the parser swaps in a **fresh, empty** map per Sequence Item. **Items inherit charset; they do NOT inherit reservations.** Never "simplify" `ParseContext.creators` back to a `readonly` field, because the swap is what scopes it.
  [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak) · [#dicom-parse-creators-scope](documentation/agent-notes.md#dicom-parse-creators-scope)
- **A RETENTION DECISION MUST NOT ALSO DECIDE THE FATE OF THE DATA SETS BELOW IT.** Never call a de-identify rule unconditional without checking what decides first.
  [#dicom-private-sq-carve-out](documentation/agent-notes.md#dicom-private-sq-carve-out)
- **Cap every consumer-controlled diagnostic PER RUN, on `DeidentifyContext` and not on `ProcessResult`** (per Data Set, so a per-result cap bounds each item and not the file), and keep registry messages short: a per-element string is multiplied by an attacker-chosen element count. `ds.warnings` itself stays uncapped (pre-existing, package-wide).
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough) · [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **A one-pass descent is a SECURITY property, not an efficiency one**: a try-then-fallback shape cost 2^depth, and the 20-deep cost pins stay.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **Scan cost is capped PER ELEMENT, not per file** (`MAX_SCAN_BYTES`); the forward loop `return`s rather than `continue`s, valid because the repertoire test is **monotone in the offset**.
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **A private-reservation rule is scoped to EVERY still-usable Data Set, never the root**, and **the cut inside a Data Set is POSITIONAL, which the grid cannot see at all**, so the whole-Data-Set variant is refused by tests alone and **you must count them over the FULL SUITE**.
  [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route)
- **🛑 A DATA SET IS A `Map<Tag, Element>`, SO ITS ORDER IS NOT ITS FILE ORDER.** An element moved in by a length lie whose tag the Data Set already holds **overwrites in place, inherits the earlier position and destroys the original value**, so a positional rule needs `Element.byteOffset` beside the index. **The loss is REPORTED now (`DICOM_DUPLICATE_TAG_IN_DATA_SET`, every Data Set, every depth) and is otherwise UNCHANGED.** Never answer it with a bound: the two files are byte-identical.
  [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route) · [#dicom-tag-collision-destroys-element](documentation/agent-notes.md#dicom-tag-collision-destroys-element)
- **🛑 THE FILE META GROUP LOSES A COPY THE OPPOSITE WAY ROUND, AND AN ARRAY IS NOT SAFETY.** A modeled `(0002,xxxx)` is projected by FIRST match and excluded from `extraElements`, so a second copy is in neither. FIRST wins there, LAST in a Data Set; `DICOM_DUPLICATE_FILE_META_ELEMENT`.
  [#dicom-file-meta-drops-duplicate](documentation/agent-notes.md#dicom-file-meta-drops-duplicate)
- **🛑 THE GRID'S SYNTAX SPLIT WAS BLIND TO THREE OF ITS FOUR FAMILIES**, keying on the cell key _starting with_ the transfer syntax. Fixed; any such split quoted before it is not re-derivable.
  [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route)
- **Over-redaction is a PRODUCT call with its own item (`DICOM-DEIDENT-OVER-REDACTION`), not a bug fix.** Dropping the repertoire conjunct for binary VRs, or widening `embedded.ts`'s tiling scanner to unrecognized VRs, empties conformant values. Do not take either as a side effect.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) · [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
- **PS3.15's two E.3.6 date columns are two MUTUALLY EXCLUSIVE option names now, and `RetainLongitudinalTemporal` still means FULL dates, the LESS PROTECTIVE branch.** `MODIFIED` asserts a date transformation this library performs on nothing: the CALLER does it, disclosed per run by `DICOM_DEIDENT_DATES_NOT_TRANSFORMED`. **Never write the divergence COUNT into prose** - the generator prints it.
  [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **`UN` is untouched by the undefined-VR rule and that is the whole line.** Widening it to "unknown to the dictionary" would empty every `UN` in every file.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **An emptied audit is not a performed one.** A `DeidentifyReport` that reads as a scrub it did not perform is the worse half of every leak in this file.
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)

### Parser and vendor-quirk behaviour

- **🛑 AN OVER-DECLARING ELEMENT AND A WELL-FORMED ONE ARE BYTE-IDENTICAL; INTENT IS NOT ON THE WIRE**, pinned by a `Buffer.equals` test in `test/integration/explicit-sq-item-bound.test.ts`. So the remedy is at the **de-identify boundary** or it is a **warning**, never a parser bound.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **The enclosing Data Set is a `Map<Tag, Element>`, so any bound that MOVES an element can silently REPLACE one**, measured as a root Patient ID reading another patient's.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **HAND A DESCENT PRIMITIVE A SLICE, NOT THE WHOLE BUFFER**, or an over-declaring item reads past its sequence and the same bytes get **read twice**, silently and under `{ strict: true }`. **A regression fixture must over-declare by EXACTLY the trailing element's size.**
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **An UNDER-declare is not a swallow, it DESYNCHRONIZES the reader**, so tag, VR and length are all fragments of somebody's value, and it reaches **string** carriers too.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **A FAIL-SAFE DEGRADE IS NOT AUTOMATICALLY A SMALL ONE: MEASURE WHAT ELSE READS THE FIELD YOU DEGRADED.** Degrading a profile-resolved `SQ` to `UN` turned a file that parsed into a whole-object `INVALID_FILE_META`.
  [#dicom-parse-creators-scope](documentation/agent-notes.md#dicom-parse-creators-scope)
- **`rawBytes` stays VALUE-ONLY for a defined-length `SQ` under Implicit VR**: `isFullSpanElement` keys off the encoding, so a full-span slice would make the writer emit the header twice.
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **A reader-only VR fix is a silent truncation**, because the short form's length field is 16 bits. Reader and writer ship together.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
- **Do not add a Tier-2 code for a CONFORMANT file**, which would throw under `{ strict: true }` on exactly that file. And **`profiles.strict` is not `{ strict: true }`**: adding a code to a shipped preset moves every consumer's parse.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) · [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **A warning emitted for a reading that is then DISCARDED costs a `{ strict: true }` caller the object and makes `onWarning` disagree with `ds.warnings`.** Related pre-existing residual: `makeEmitter` hands warnings to `onWarning` **before** the pop that undoes them (D-03 ordering). Disclosed, not fixed.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **`Element.byteOffset` inside a sequence item DISAGREES WITH ITSELF and always has**: `0` inside a defined-length item, file-absolute inside an undefined-length one, and the same for a warning's `position.byteOffset`. **Measure it rather than describing it.**
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) · [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)

### Generators and gates

- **The vendored DocBook pins are PRECONDITIONS**: each generator re-hashes its document, refuses to run on a mismatch, reads the edition from its own `<subtitle>`, and fails loudly on a malformed row. PS3.6 wins per field over the mirror; **mirror-only entries are KEPT**.
  [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator) · [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **🛑 UIDs ARE OVERLAID FROM ANNEX A NOW; "UIDs are deliberately not overlaid" is STALE. The short forms and the `retired` boolean are preserved BY CONSTRUCTION, derived not typed.** A-2 is a second table, shaped differently, and reading A-1 alone reports UIDs as withdrawn that are not.
  [#the-ps36-uid-registry-overlay](documentation/agent-notes.md#the-ps36-uid-registry-overlay)
- **🛑 THERE IS NO STALENESS CLOCK AND THERE MUST NOT BE ONE.** A date gate fires the day it is written and reds unrelated PRs. "Has NEMA moved" is one content-comparing command in `vendor/nema/README.md`; CI gates byte-identical regen, offline.
  [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator)
- **Two DocBook traps in PS3.6, both covered by tests:** **ZERO WIDTH SPACE** hints in the keyword column (one left in yields a keyword that looks right and never matches), and `DICOS`/`DICONDE` markers beside `RET (edition)` in the sixth column (reading it as a boolean retires live tags).
  [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator)
- **A cell count catches an inserted or dropped column, NOT a reorder**, which would read one option's code as another's.
  [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **A masked row on a prefix PS3.5 does not define FAILS the generator** instead of being printed and dropped, which is how three `X`-marked overlay/curve rows went missing. Proven by mutation.
  [#repeating-group-masks-on-the-de-identify-path](documentation/agent-notes.md#repeating-group-masks-on-the-de-identify-path)
- **The generator ORDER is not the gate; the byte-identical REGEN gate is.** A _missing_ artifact fails at import, but a merely _stale_ bound leaves `annex-e.ts` byte-identical.
  [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **The minimal PDF reader in `generate-repeating-groups.ts` recovers ONE sentence. Do not grow it into a general PDF parser**; re-derive the bound from a current normative source instead.
  [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **▶ `attw` SAYS "does not contain types" AND EXITS 0, SO USE `scripts/attw.mjs`, NOT THE BARE CLI.** Two nets, catching different things; **short options are refused by LETTER ANYWHERE IN THE CLUSTER** and must not be "simplified" to a token set.
  [#the-attw-wrapper-gate](documentation/agent-notes.md#the-attw-wrapper-gate)
- **The em-dash gate scans EVERY TRACKED FILE, plus the PR title, body and commit messages.** It **deliberately omits `grep -I`**: do not add it, and do not remove the functional NUL in `src/dataset/vr/charset.ts`. When it reds, rewrite with a period, colon, comma or parentheses, **never re-encode the character**.
  [#the-em-dash-brand-gate](documentation/agent-notes.md#the-em-dash-brand-gate)

## Style Reference

Mirrors `@cosyte/hl7`'s tooling and engineering bar, with two deliberate divergences, both stated in Tech Stack and Scope above: runtime deps allowed (≤ 3), and a v1 scope narrower than the standard.

## Standing disciplines (every change)

These three bind every change in this repo (mirrored from the cosyte meta-repo's `documentation/conventions.md`):

1. **Documentation follows code.** A public-surface / stack / status change isn't done until its docs are: this package's own docs (`docs-content/` + JSDoc), and (in the meta-repo) its `documentation/repos/<repo>.md` and the `ecosystem-map.md` status table.
2. **Version + changelog every meaningful change.** Add a Changeset (`pnpm changeset`, `patch` during pre-alpha); stay on `0.0.x` until first alpha. **🛑 `CHANGELOG.md` IS GENERATED, the changeset summary IS the entry. Never hand-edit it, never reintroduce `[Unreleased]`, keep nothing but the H1 above the first heading, compare version headings WHOLE (`## 0.0.1` is a substring of `## 0.0.10`), never open a summary line at column 0 with an ATX heading, and the Prettier pass stays ON (no `"prettier"` key), DERIVED here and never resynced from a sibling.**
   [#the-changelog-generator-and-why-the-unreleased-heading-may-not-come-back](documentation/agent-notes.md#the-changelog-generator-and-why-the-unreleased-heading-may-not-come-back)
3. **Crew + knowledgebase feedback loop.** When a standard, decision, or public surface changes, flag whether a `crew` skill or `knowledgebase` doc needs creating/updating, never silently skip.

**And a fourth that governs this file itself:** when a refuter refutes a claim, the paragraph it produces goes into `documentation/agent-notes.md` under the section that owns it, and **this file gets at most one line plus the anchor.** That is what keeps it inside its budget without anything being lost. **Never delete a trap to hit the number**: relocate it, or stop and say the budget cannot be met.

Build, lint, format, and TypeScript settings come from the shared `@cosyte/*` config packages (`@cosyte/tsconfig` · `@cosyte/eslint-config` · `@cosyte/prettier-config`; see `documentation/conventions.md` → "Canonical toolchain (enforced)"). Node ≥ 22.
