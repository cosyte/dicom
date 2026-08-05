# @cosyte/dicom: Project Guide for Claude

**▶ THE NARRATIVE BEHIND EVERY TRAP IN THIS FILE LIVES IN
[`documentation/agent-notes.md`](documentation/agent-notes.md).** This file is always-read for any
worker that `cd`s in, so it is budgeted at write time by the meta-repo's `doc-budget.mjs`. **The
budget is this repo's entry in `REPO_CLAUDE`, and no numeral for it is written here.**
Read `documentation/decisions/0023-doc-budgets.md` for what governs, and this file's own history in
[agent-notes.md](documentation/agent-notes.md) - it opens on why, and on what "relocate" means here.
**The line is enough to stop you doing the wrong thing. It is not enough to justify doing a new thing
in the same area - open the section first.**

## Project

**`@cosyte/dicom`**: a developer-focused DICOM parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT). Sibling to `@cosyte/hl7` at `../hl7`.

**North star:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line, without having read the DICOM standard.

**Scope boundary (v1):** Metadata-first. Pixel data is exposed as raw `Buffer` + encapsulated fragments but **not decoded**. DIMSE network services and DICOMweb are explicit non-goals, tracked as future companion packages (`@cosyte/dicom-pixel`, `@cosyte/dicom-net`, `@cosyte/dicomweb`).

## Status

- **Phases 4-7 of 8 shipped**: VR value decode + `Dataset`/`Item` navigation, safety-critical domain
  helpers, the spec-clean Part 10 serializer, the source/vendor profile system, and metadata-level
  de-identification (PS3.15 Annex E Basic Profile + the nine metadata-affecting Options). Surfaces,
  scope limits and the known serializer limitation:
  [agent-notes.md#shipped-phases-4-through-7-of-8](documentation/agent-notes.md#shipped-phases-4-through-7-of-8).
- Published on npm on the **`0.0.x`-until-first-alpha** ladder. **Never quote a version in this
  file** - `npm view @cosyte/dicom version` is the only source of truth, and the meta-repo's ADR 0023
  carries the measured history of why. Do not re-derive it here; do not add a numeral to this bullet.
- **🩺 Open PHI residuals - measured, disclosed, NOT closed. None of these is an all-clear:**
  - The **private-`SQ` carve-out** (`keepsPrivate` decides before `descendSequence`, so a vouched-for
    private `SQ` is kept verbatim and never walked). Produces a **false attestation**:
    `removedPrivateTags: []`, the value in the output, `(0012,0062) = YES`. Pinned as a residual test
    that asserts the leaking behaviour, so closing it turns that test red. Its sibling, the **EJECT**
    direction, is **closed** - and closing it needed a **second predicate** (Implicit VR LE records no
    over-run at all) plus a **positional cut with TWO bounds**, so do not read the absorb rule as
    covering it.
    [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route) ·
    [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak)
  - **11 grid cells** still leak through an over-declaring `OB`/`OW`/`US`/`UN` **leaf** carrier,
    silent. `PRE-EXISTING`.
    [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
  - The **mis-structure itself** under `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`: an over-declaring
    item still relocates the element that follows the sequence, and `contextPath` still names an item
    it was never in.
    [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
  - `report.removedPrivateTags` can echo four bytes of document content from a **fabricated
    odd-group header**, identically on both trees. Structural, not closed; the **claim** was
    corrected rather than the guard widened.
    [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
  - `report.embeddedAttributes[].hidden` is **unbounded** (131,072 tag strings from a 1 MiB
    carrier). Linear, so not the CPU-DoS class - but it missed the cap every other
    consumer-controlled diagnostic takes. Take it before the next `deident` slice.
    [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
  - `DeidentifyReport` is value-free **apart from `uidMap`** (the file's own source UIDs) **and**
    `removedPrivateTags`. **Two exceptions, not one** - never describe it as value-free.
    [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
  - A **failed CP-246 `UN` descent emits nothing**. The honest test for a consumer is
    `el.items === undefined`, **not** `ds.warnings`.
    [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
  - The **Tier-3 fatal messages still interpolate a tag and a VR composed from input**
    (`explicit-le.ts`, `implicit-le.ts`, `sequence.ts`), so `err.message` can carry four bytes of
    document content. `PRE-EXISTING`; a registry for fatal messages is its own slice.
    [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
  - The **undefined-length item with no `(FFFE,E00D)`**, which has no declared length to disagree
    with, so no over-run is recordable.
    [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
  - `(0012,0063)` carries the **source file's own method text** into de-identified output (PS3.15
    E.1.1 says "added to"; Table E.1-1 omits it); reported now, not silent. **An `LO` de-dup trims
    trailing pad on BOTH sides or the value regrows every pass, and a fixed-point pin reads RAW
    BYTES, never a trimming helper.** A residual test asserts the cost.
    [#dicom-deident-not-a-fixed-point](documentation/agent-notes.md#dicom-deident-not-a-fixed-point)
  - **This list is an index, not a census.** Each relocated section names its own residuals, and
    several are disclosed only there. Read the section before claiming a class is closed.
- **🛑 A "N OF M TESTS RUN RED ON BASE" FIGURE HAS A MOVING BASE AND IS NOT A FACT.** Quote one only
  with the sha you ran it on; re-run it after every test you add **or strengthen**; and **replace
  `src/` rather than overlaying it** when you swap a base in. Two such claims here were wrong against
  `main` in opposite directions at once. The measured figures live in the section, with their shas.
  [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route)

## Tech Stack (the shared `@cosyte/*` standard)

dicom inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files (Phase E migration). The source of truth is the meta-repo's
`documentation/conventions.md`; this is a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`.
- **Build:** dual ESM + CJS + `.d.ts`/`.d.cts` via `tsup` (`@cosyte/tsup-config`); `attw` is a
  publish gate (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` and
  `typecheck:exports` scripts run **`scripts/attw.mjs`, not the bare CLI** - see the guardrail below.
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory gates. The
  gate is **enabled**; floors currently sit just below 90 (transient, with TODOs) while the early
  phases fill in coverage (see `vitest.config.ts`).
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows; the repo-specific
  `dictionary-regen.yml` byte-identical regen gate is kept.
- **Runtime deps:** **≤ 3**, each MIT/Apache-licensed and ADR-justified. Deliberate divergence from
  `@cosyte/hl7`'s zero-dep rule; DICOM byte-level + charset work earns the exception. (Currently
  zero are taken.)
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
- Coverage: per-directory gate **enabled** on `src/parser/`, `src/dataset/`, `src/dictionary/` (and
  `src/helpers/` once it exists) via `pnpm test:coverage`. Canonical bar is ≥ 90%; early-phase floors
  currently sit just below that as documented transient relaxations with TODOs. Raise them toward 90
  as coverage fills in, never disable the gate. `vitest.config.ts` is the source of truth.

## Traps that cost a defect to learn

**Each line is a rule, and the anchor behind it is the evidence.** Every one of these was written
because something shipped wrong, or a `conformance-refuter` pass refused a claim. Relocating them did
not soften them. All anchors are in `documentation/agent-notes.md`.

### Method - how a claim gets made here at all

- **Correct the CLAIM, never widen the GUARD.** Three claims shipped false in one slice and the
  refuter caught all three. [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough)
- **Re-wording a disclosure twice is the signal to DELETE it, not to try a third wording.** Applied
  to `#55`'s "on a conformant file the cost is zero" and to the fail-safe-direction argument.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) ·
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **🛑 THE FAIL-SAFE-DIRECTION ARGUMENT IS RETRACTED AND DELETED, NOT REWORDED. DO NOT WRITE IT
  AGAIN.** Which direction leaks is a property of **where the sender put the Private Creator**, not
  of which length field a reader follows. `#51` was refused for it in five artifacts at once, and
  cumulative refuter passes on that lineage are **6** (ADR 0016 RESET-BUT-RECORD). Never restate the
  private-creator work as "both directions are closed".
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) ·
  [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak)
- **ADD A SHAPE TO THE HARNESS, NEVER A SENTENCE.** Do **not** summarize what a §6.2-conformant
  future-VR file does: **every attempt so far has been refuted**, including one written _into the
  warning against writing one_. **The counts are stated in the two sections and are not repeated
  here** - a numeral copied into an index is a claim you did not measure, and this repo's refusals
  have overwhelmingly been claim defects.
  `scripts/measure-unrecognized-vr.ts` prints the table.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) ·
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **A cost claim needs an ADVERSARIAL fixture, not a big one.** A slice asserted "linear" in three
  artifacts with a fixture that produced exactly one candidate offset; the real number was 22.5 s on
  256 KiB. [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **A PHI test whose payload carries no name is VACUOUS BY FIXTURE.** Use a name-bearing payload and
  a mutation control that turns it red.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) ·
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **A test named for the thing it did not check occupies the slot.** "explicit-length SQ also
  descends" asserted only values a parser that never opened the sequence also produced.
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **Classify a grid cell by WHAT THE PARSE PRODUCED, never by the fixture's placement label** - and
  a **fixture artifact reported as a finding** is this repo's recurring failure mode (28 rows
  miscounted as leaks once; 9 emptied rows where the honest number was 6, because `buildDicom`
  byte-swaps `OW`/`US` under Explicit BE).
  [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak) ·
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **Quote a grid number as a fact about the GRID'S FIXTURES, never as a fact about the change.**
  "0 cells that parse on both trees and read differently" is not "the change never silently
  re-reads anything" - a gate refuted exactly that.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
- **Quote the reading count and the strict count TOGETHER or neither**, and know that **pre-rebase
  figures die**: the 76,611-cell set is dead, 83,037 is current.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **`lostValue` and `changed`/`structural` are the WRONG numbers for a de-identify-boundary remedy.**
  Quote `cells differing in any PARSE respect`.
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough)
- **🛑 A grid family that runs `deidentify()` with NO OPTIONS cannot see a private-retention leak.**
  `RetainSafePrivate` + a `Profile` is the only route in the package that writes a private value into
  de-identified output; **three refuter passes read "0 PHI regressions" off that harness while a leak
  was live.** [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak)
- **Re-measure a "N of M tests run red on base" figure rather than carrying it forward** - one read
  `6 of 9` and went stale within a draft.
  [#dicom-parse-creators-scope](documentation/agent-notes.md#dicom-parse-creators-scope)
- **Do not write a warning-code COUNT into prose.** The locked `WARNING_CODES` snapshot measures it
  every run; the README's numeral was corrected twice and then deleted.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **`scripts/measure-sq-bound-grid.ts` is on `main` and is re-run BEFORE changing de-identify code**
  (with the `declaredLengthDelta` / `omitItemDelim` knobs in `test/helpers/build-dicom.ts`).
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)

### Spec conformance - citations and bounds

- **🛑 LOCATING A SPEC SECTION: NEVER FIRST-MATCH - it reads the table of contents.** Collect every
  candidate section, keep those containing the normative sentence, **require exactly one**. Zero and
  two are both refusals. It proves at most one _candidate_ carries the sentence, **not** document-wide
  uniqueness. Copy this rule; it generalises.
  [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **Cite PS3.5 §6.2's "shall" (a new VR is long-form), never §6.2's NOTE about ignoring unrecognized
  VRs** - the note is informative.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) ·
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **Cite PS3.5 §7.5.2 for the `SQ`'s OWN length and §7.5.1 for the Item's.** This file and the
  backlog item both once quoted 7.5.1 for a 7.5.2 defect.
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **Cite PS3.15 §E.1.1, not §E.1** (E.1 is the parent section). §E.1.1's SOP-Instance-UID escalation
  is precedent for answering **at the carrier**, and is about encrypt-and-replace - not a rule about
  Table E.1-1. [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough)
- **🛑 QUOTE PS3.15 §E.3.10 WHOLE - IT HAS TWO BRANCHES AND A GATE CAUGHT IT TRUNCATED AT
  "removed"**, which reads a permissive clause as an absolute. This library does not implement
  `(0008,0307)`, so removal is the branch available to it, and **"known"** is the load-bearing word.
  [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak)
- **The repertoire clause is PS3.5 §6.1.3 + Table 6.1-1, NOT §6.1.2.1; the per-VR rule is Table
  6.2-1, in three tiers.** Grouping `UC` with `LT`/`ST`/`UT` is **fail-open**; treating ESC as
  evidence in `LO`/`SH`/`PN` is **fail-closed on exactly the attributes that carry names**.
  **A per-VR table transcribed from memory is not a citation.**
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **Repeating groups are bounded to the EVEN groups `6000`-`601E` and `5000`-`501E` - sixteen per
  mask, not 256** (PS3.5 §7.6, and PS3.5-2004 §7.6 for curves, which the current edition's Note
  _delegates_ to; the generator proves the delegation link rather than assuming it).
  [#repeating-group-masks-on-the-de-identify-path](documentation/agent-notes.md#repeating-group-masks-on-the-de-identify-path) ·
  [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **Do NOT unify `src/dictionary/repeating-groups.ts` with `src/parser/element-header.ts`'s
  `matchRepeatingGroup`.** A too-wide **VR guess** only yields a lenient decode; a too-wide
  **removal** deletes data the standard never marked. Postel's Law on the read path, the standard's
  bound on the de-identify path - and **over-broad is a different unsafe direction from under-broad,
  so both are tested.**
  [#repeating-group-masks-on-the-de-identify-path](documentation/agent-notes.md#repeating-group-masks-on-the-de-identify-path)
- **`NESTING_DEPTH_LIMIT` (64) is THIS LIBRARY'S bound, not PS3.5's** - never say "the sender's
  encoding is why" about a conformant file that exceeds it, and **the limit must propagate untouched**
  through any descent path (no catch-all rollback that turns the cap into "descend one level less").
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough) ·
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **Say the EDITION when you cite.** §6.2 exists to describe a _future_ VR; the pins are **PS3.5 /
  PS3.6 / PS3.15 2026c** under `vendor/nema/`, re-hashed as a precondition.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) ·
  [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator)

### PHI and de-identification

- **🩺 A DIAGNOSTIC MUST NOT NAME AN ELEMENT WHOSE HEADER MIGHT BE FABRICATED. Where the trigger IS
  "these bytes are not what they claim to be", the fields naming the element ARE INPUT.** `renderTag`
  validates a tag's _shape_ and therefore cannot refuse one; `renderVr` checks a closed set and can.
  So the bound is the **factory signature** - no tag parameter, no raw length parameter - and
  `position.byteOffset` identifies the element. This bit three separate codes:
  `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`, `DICOM_NONZERO_RESERVED_BYTES`,
  `DICOM_ITEM_CROSSES_SEQUENCE_END`. **Do not put any of them back.**
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) ·
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) ·
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **There is NO string parameter for a value to travel through.** Every Tier-2 message is looked up
  in the frozen `WARNING_MESSAGES` registry by code; factories take a position and structural
  constants only. **That single property is what separates the `@cosyte/*` parsers that leak from the
  ones that do not.** [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
- **The bound has to reach the MODEL, not just the messages** - `hl7` fixed its messages, verified
  green, and `deid` still leaked through `Segment.type`. So `Element.specificCharacterSet` and
  `Element.privateCreator` bind on **membership in a closed table**, not on shape; with no profile
  `Element.privateCreator` reads `<withheld>`.
  [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
- **The PHI diagnostic gate does NOT make the surface PHI-free and must not be described that way** -
  `DicomParseError.snippet` is 16 raw source bytes as hex (D-10), and hex is a re-encoding the runner
  cannot match. **`@cosyte/test-utils` must stay pinned `^0.0.2` or higher**: a caret on a `0.0.x`
  resolves exactly, so `^0.0.1` silently tests against a kit with no such runner and passes.
  [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak)
- **🩺 A de-identifier's action table lagging the dictionary is a SILENT PHI LEAK, not a currency
  nit.** `annexE()` returns `undefined` for a tag it does not carry and `deidentify()` reads
  `undefined` as "keep" - so 32 tags the current standard marks `X` (preferred name, pronouns,
  gender identity) survived verbatim with a clean report, shipped that way at `0.0.3`, and `deid`'s
  `/dicom` adapter inherited it. **They advance together or the gap only widens.**
  [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **Private block reservations are scoped PER DATA SET, on BOTH paths** - PS3.5 §7.8.1. Derive the
  creator map at **every depth** in `processElements`; the parser swaps in a **fresh, empty** map per
  Sequence Item in `parseSequence`. **Items inherit charset; they do NOT inherit reservations.** Do
  not "simplify" `ParseContext.creators` back to a `readonly` field - the swap is what scopes it.
  [#phi-warning-message-leak](documentation/agent-notes.md#phi-warning-message-leak) ·
  [#dicom-parse-creators-scope](documentation/agent-notes.md#dicom-parse-creators-scope)
- **`keepsPrivate` decides BEFORE `descendSequence`, so a private `SQ` a profile vouches for is kept
  verbatim and no rule below is ever consulted inside it.** Never claim a de-identify rule is
  unconditional without checking this first - it is `#54`'s exact refusal and it has recurred twice.
  [#dicom-private-creator-reservation-leak](documentation/agent-notes.md#dicom-private-creator-reservation-leak) ·
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough)
- **Cap every consumer-controlled diagnostic PER RUN, on `DeidentifyContext` and not on
  `ProcessResult`** (which is per Data Set, so a per-result cap bounds each item and not the file) -
  and keep registry messages short, because a per-element string is multiplied by an attacker-chosen
  element count. A first draft measured **58,255 findings and 36 MB of warnings from a 1 MiB input.**
  `ds.warnings` itself stays uncapped (pre-existing, package-wide).
  [#dicom-deident-rawbytes-passthrough](documentation/agent-notes.md#dicom-deident-rawbytes-passthrough) ·
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **A one-pass descent is a SECURITY property, not an efficiency one** - a try-then-fallback shape
  cost **2^depth**: 75,475 ms for a 606-byte file 20 levels deep. The 20-deep cost pins stay.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **Scan cost is capped PER ELEMENT, not per file** (`MAX_SCAN_BYTES`); the forward loop `return`s
  rather than `continue`s, valid because the repertoire test is **monotone in the offset**.
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **A private-reservation rule is scoped to EVERY still-usable Data Set, never the root** - the eject
  route reproduced one level down and the first draft called it root-specific. **And the cut inside a
  Data Set is POSITIONAL: the grid cannot see that at all** (every `priv|` fixture writes its block
  after the sequence), so the whole-Data-Set variant measures byte-identical there and is refused by
  **tests alone - 5 of them, and you must count over the FULL SUITE**: a one-file count reads 4 and
  misses the second file's. [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route)
- **🛑 A DATA SET IS A `Map<Tag, Element>`, SO ITS ORDER IS NOT ITS FILE ORDER.** An element moved in
  by a length lie whose tag the Data Set already holds **overwrites in place and inherits the earlier
  position**, so any positional rule needs `Element.byteOffset` beside the index - and the overwrite
  **destroys the original value**, on the private path as well as `(0010,0020)`.
  **The loss is REPORTED now (`DICOM_DUPLICATE_TAG_IN_DATA_SET`, every Data Set, every depth) and is
  otherwise UNCHANGED - last read still wins and nothing is guessed.** Never answer it with a bound:
  the two files are byte-identical. Adding the code cost 9 grid cells a `{ strict: true }` parse.
  [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route) ·
  [#dicom-tag-collision-destroys-element](documentation/agent-notes.md#dicom-tag-collision-destroys-element)
- **🛑 THE FILE META GROUP LOSES A COPY THE OPPOSITE WAY ROUND, AND AN ARRAY IS NOT SAFETY.** A
  modeled `(0002,xxxx)` is projected by FIRST match and excluded from `extraElements`, so a second
  copy is in neither. FIRST wins there, LAST in a Data Set; `DICOM_DUPLICATE_FILE_META_ELEMENT`.
  [#dicom-file-meta-drops-duplicate](documentation/agent-notes.md#dicom-file-meta-drops-duplicate)
- **🛑 THE GRID'S SYNTAX SPLIT WAS BLIND TO THREE OF ITS FOUR FAMILIES** - it keyed on the cell key
  _starting with_ the transfer syntax, so no `carrier|`, `legit|` or `priv|` row could ever count as
  Implicit VR LE. Fixed; any such split quoted before it is not re-derivable.
  [#dicom-item-eject-route](documentation/agent-notes.md#dicom-item-eject-route)
- **Over-redaction is a PRODUCT call with its own item (`DICOM-DEIDENT-OVER-REDACTION`), not a bug
  fix.** Dropping the repertoire conjunct for binary VRs takes 11 leaks to 0 **and empties all 5
  conformant binary tiling controls**; widening `embedded.ts`'s tiling scanner to unrecognized VRs
  empties more values. Do not take either as a side effect.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks) ·
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
- **`RetainLongitudinalTemporal` collapses PS3.15's two E.3.6 date columns onto the LESS PROTECTIVE
  branch** (`K` on all 169 divergent rows where modified-dates says `C`). Printed every run, stated
  in the JSDoc; splitting the option is a public-surface change deliberately not made.
  [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **`UN` is untouched by the undefined-VR rule and that is the whole line.** Widening it to "unknown
  to the dictionary" would empty every `UN` in every file; under Implicit VR LE it cannot fire at all.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **An emptied audit is not a performed one.** A `DeidentifyReport` that reads as a complete scrub it
  did not perform is the worse half of every leak in this file - that is what a caller trusts before
  sharing. [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)

### Parser and vendor-quirk behaviour

- **🛑 AN OVER-DECLARING ELEMENT AND A WELL-FORMED ONE ARE BYTE-IDENTICAL; INTENT IS NOT ON THE WIRE.**
  The same permanent fact has now stopped three slices, and **the two files a bound would tell apart
  are the SAME FILE** - pinned by a `Buffer.equals` test, the load-bearing test in
  `test/integration/explicit-sq-item-bound.test.ts`. So the remedy is at the **de-identify boundary**
  or it is a **warning**, never a parser bound. Five refused attempts.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) ·
  [#dicom-overdeclare-swallows-into-value](documentation/agent-notes.md#dicom-overdeclare-swallows-into-value)
- **The enclosing Data Set is a `Map<Tag, Element>`, so any bound that MOVES an element can silently
  REPLACE one** - measured as a root Patient ID reading `MRN-99999` where the file says `MRN-11111`.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **HAND A DESCENT PRIMITIVE A SLICE, NOT THE WHOLE BUFFER.** `parseSequence` computes `endLimit`
  from the sequence length but bounds each item against `buffer.length`, so an over-declaring item
  reads past the sequence and the same bytes get **read twice** - silent, and silent under
  `{ strict: true }`. **A regression fixture must over-declare by EXACTLY the trailing element's
  size**; over-declaring past the end of the buffer only trips the truncation guard.
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **An UNDER-declare is not a swallow - it DESYNCHRONIZES the reader**, so tag, VR and length are all
  fragments of somebody's value, and it reaches **string** carriers too.
  [#dicom-carrier-leaf-leaks](documentation/agent-notes.md#dicom-carrier-leaf-leaks)
- **A FAIL-SAFE DEGRADE IS NOT AUTOMATICALLY A SMALL ONE - MEASURE WHAT ELSE READS THE FIELD YOU
  DEGRADED.** Degrading a profile-resolved `SQ` to `UN` turned a file that parsed into a whole-object
  `INVALID_FILE_META`, losing patient, study and modality, while two shipped artifacts asserted
  "Nothing is lost". [#dicom-parse-creators-scope](documentation/agent-notes.md#dicom-parse-creators-scope)
- **`rawBytes` stays VALUE-ONLY for a defined-length `SQ` under Implicit VR** - `isFullSpanElement`
  keys off the encoding, so a full-span slice would make the writer emit the header twice.
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **A reader-only VR fix is a silent truncation.** The short form's length field is 16 bits, so
  reading long-form without writing long-form re-emits a 70,000-byte value declaring **4,464**.
  Reader and writer ship together.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form)
- **Do not add a Tier-2 code for a CONFORMANT file** - it would throw under `{ strict: true }` on
  exactly that file. And **`profiles.strict` is not `{ strict: true }`**: adding a code to a shipped
  preset moves every consumer's parse and is its own measured change.
  [#dicom-unrecognized-vr-short-form](documentation/agent-notes.md#dicom-unrecognized-vr-short-form) ·
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- **A warning emitted for a reading that is then DISCARDED costs a `{ strict: true }` caller the
  object and makes `onWarning` disagree with `ds.warnings`.** Related pre-existing residual:
  `makeEmitter` hands warnings to `onWarning` **before** the pop that undoes them (D-03 ordering), so
  a streaming consumer sees warnings `ds.warnings` does not. Disclosed, not fixed.
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) ·
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)
- **`Element.byteOffset` inside a sequence item DISAGREES WITH ITSELF and always has** - `0` inside a
  defined-length item (its own frame), file-absolute inside an undefined-length one. Same for a
  warning's `position.byteOffset`. No frame-of-reference contract is documented either way.
  **Measure it rather than describing it.**
  [#dicom-explicit-vr-unbounded-item-read](documentation/agent-notes.md#dicom-explicit-vr-unbounded-item-read) ·
  [#dicom-implicit-sq-not-descended](documentation/agent-notes.md#dicom-implicit-sq-not-descended)

### Generators and gates

- **The vendored DocBook pins are PRECONDITIONS**: each generator re-hashes its document, refuses to
  run on a mismatch, reads the edition from the document's own `<subtitle>`, and fails loudly on a
  malformed row. PS3.6 wins per field over the Innolitics mirror; **mirror-only tags are KEPT**,
  because PS3.6 retires rather than deletes.
  [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator) ·
  [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **🛑 THERE IS NO STALENESS CLOCK AND THERE MUST NOT BE ONE.** A date gate fires the day it is
  written, demands an action nobody can take on demand, and reds unrelated PRs. "Has NEMA moved" is
  one content-comparing command in `vendor/nema/README.md`; CI gates byte-identical regen, offline.
  [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator)
- **Two DocBook traps in PS3.6, both covered by tests:** 13,470 **ZERO WIDTH SPACE** hints in the
  keyword column (one left in yields a keyword that looks right and never matches), and
  `DICOS`/`DICONDE` markers beside `RET (edition)` in the sixth column (reading it as a boolean
  retires **391 live tags**).
  [#the-ps36-element-registry-generator](documentation/agent-notes.md#the-ps36-element-registry-generator)
- **A cell count catches an inserted or dropped column, NOT a reorder** - which would read one
  option's code as another's.
  [#the-ps315-annex-e-action-table-generator](documentation/agent-notes.md#the-ps315-annex-e-action-table-generator)
- **A masked row on a prefix PS3.5 does not define FAILS the generator** instead of being printed and
  dropped - which is precisely how three `X`-marked overlay/curve rows went missing. Proven by
  mutation.
  [#repeating-group-masks-on-the-de-identify-path](documentation/agent-notes.md#repeating-group-masks-on-the-de-identify-path)
- **The generator ORDER is not the gate; the byte-identical REGEN gate is.** A _missing_ artifact
  fails at import, but a merely _stale_ bound leaves `annex-e.ts` byte-identical, because expansion
  happens at runtime.
  [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **The minimal PDF reader in `generate-repeating-groups.ts` recovers ONE sentence. Do not grow it
  into a general PDF parser** - if it needs more, re-derive the bound from a current normative source.
  [#the-vendored-ps35-repeating-group-bound](documentation/agent-notes.md#the-vendored-ps35-repeating-group-bound)
- **▶ `attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI.** `getExitCode.js` returns 0 before the problem list is consulted, so a broken publish is
  reported as a pass. `scripts/attw.mjs` carries **two nets that catch different things**, and
  **short options are refused by LETTER ANYWHERE IN THE CLUSTER, not by whole token** (`-fjson` gave
  exit 0 with the gate silent). **Do not "simplify" that back to a token set**, and note that
  **`lint` is deliberately NOT widened to `.mjs`** and **neither net covers the non-type entries of
  `files`**. [#the-attw-wrapper-gate](documentation/agent-notes.md#the-attw-wrapper-gate)
- **The em-dash gate scans EVERY TRACKED FILE, not just markdown** (a markdown-only survey called
  this repo clean while six em dashes lived in four other files, including the npm `description`),
  **and the PR title, body and commit messages.** It **deliberately omits `grep -I`** so that a
  binary-classified file cannot pass in silence: **do not add `-I`, and do not remove the functional
  NUL in `src/dataset/vr/charset.ts` to quiet it.** When it reds, rewrite with a period, colon, comma
  or parentheses - **never re-encode the character**. Fix shared limitations in the script header,
  which every copy shares.
  [#the-em-dash-brand-gate](documentation/agent-notes.md#the-em-dash-brand-gate)

## Style Reference

This project mirrors `@cosyte/hl7`'s tooling, artifact discipline, and engineering bar. Two deliberate divergences:

1. **Runtime deps allowed (≤ 3)**. See Tech Stack above.
2. **v1 scope narrower than the full standard**: metadata-first, no pixel decode, no network.

## Standing disciplines (every change)

These three bind every change in this repo (mirrored from the cosyte meta-repo's
`documentation/conventions.md`):

1. **Documentation follows code.** A public-surface / stack / status change isn't done until its
   docs are: this package's own docs (`docs-content/` + JSDoc), and (in the meta-repo) its
   `documentation/repos/<repo>.md` and the `ecosystem-map.md` status table.
2. **Version + changelog every meaningful change.** Add a Changeset (`pnpm changeset`, `patch`
   during pre-alpha) and keep `CHANGELOG.md`'s `[Unreleased]` current. Stay on `0.0.x` until first alpha.
3. **Crew + knowledgebase feedback loop.** When a standard, decision, or public surface changes,
   flag whether a `crew` skill or `knowledgebase` doc needs creating/updating, never silently skip.

**And a fourth that governs this file itself:** when a refuter refutes a claim, the paragraph it
produces goes into `documentation/agent-notes.md` under the section that owns it, and **this file
gets at most one line plus the anchor.** That is what keeps it inside its budget without anything
being lost. **Never delete a trap to hit the number** - relocate it, or stop and say the budget
cannot be met.

Build, lint, format, and TypeScript settings come from the shared `@cosyte/*` config packages
(`@cosyte/tsconfig` · `@cosyte/eslint-config` · `@cosyte/prettier-config`; see
`documentation/conventions.md` → "Canonical toolchain (enforced)"). Node ≥ 22.
