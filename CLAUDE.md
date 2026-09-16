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

- **Phases 4-7 of 8 shipped**: VR value decode, `Dataset`/`Item` navigation, safety-critical domain helpers, the spec-clean Part 10 serializer, the source/vendor profile system, and metadata-level de-identification (PS3.15 Annex E Basic Profile + the nine metadata-affecting Options). Surfaces, scope limits and the known serializer limitation:
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

**Every trap still binds, and they live in [`documentation/claude-traps.md`](documentation/claude-traps.md)** in five groups: method, spec conformance, PHI and de-identification, parser and vendor-quirk behaviour, and generators and gates. **READ THE GROUP THAT OWNS YOUR CHANGE BEFORE YOU MAKE IT.** Relocating them did not soften them and deleted none of them; each is still one line plus the anchor that evidences it.

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
