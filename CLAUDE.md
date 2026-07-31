# @cosyte/dicom: Project Guide for Claude

## Project

**`@cosyte/dicom`**: a developer-focused DICOM parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT). Sibling to `@cosyte/hl7` at `../hl7`.

**North star:** A developer can read a real-world, vendor-quirky DICOM Part 10 file and pull useful metadata fields out in one line, without having read the DICOM standard.

**Scope boundary (v1):** Metadata-first. Pixel data is exposed as raw `Buffer` + encapsulated fragments but **not decoded**. DIMSE network services and DICOMweb are explicit non-goals, tracked as future companion packages (`@cosyte/dicom-pixel`, `@cosyte/dicom-net`, `@cosyte/dicomweb`).

## Status

- **Phase 7 of 8 complete** (580 tests passing, 1 todo). Metadata-level de-identification live:
  `deidentify(ds, options?)` applies the PS3.15 Annex E Basic Application Level Confidentiality Profile
  plus the nine metadata-affecting Options, driven by the generated Table E.1-1 action map. Pure
  function: input `Dataset` never mutated; returns a fresh de-identified `Dataset` + a value-free
  `DeidentifyReport`. Conditional codes collapse to their most-protective leftmost branch (no IOD
  Type-1 analysis: fail-safe toward more removal); `U`-coded UIDs get deterministic, content-derived
  `2.25` replacements that stay referentially consistent across files; kept sequences are recursively
  de-identified **and re-encoded** so nested PHI is gone from the serialized bytes. Private attributes
  are removed by default (`RetainSafePrivate` + a `Profile` keeps only creator-recognized safe ones).
  Pixel-level cleaning is out of scope (deferred to `@cosyte/dicom-pixel`): burned-in annotation is
  warned (`DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`), never silently passed. New exports: `deidentify`,
  `makeUidRemapper`, `DEFAULT_UID_ROOT`, `DEIDENTIFY_OPTIONS`, `DEIDENTIFY_ERROR_CODES`,
  `DeidentifyError` + the `Deidentify*` types.
- **Phase 6 of 8 complete.** Source/vendor profile system live:
  `defineProfile()` + `parseDicom(buf, { profile })` opt into a composable, immutable `Profile`
  bundling warning `escalate` / `suppress` posture and a private-creator-keyed overlay that resolves
  the Implicit VR of vendor private data elements by the file's live creator string (canonical
  `"GGGGxxLL"` key, PS3.5 §7.8.1, never a hard-coded block). Five built-ins under the frozen
  `profiles` namespace (`ge` / `siemens` / `philips` vendor overlays + `strict` / `lenient` posture
  presets); an unrecognized creator degrades to `UN` plus `DICOM_PRIVATE_CREATOR_UNKNOWN`, never a
  wrong decode. A profile only tightens or annotates. Selecting one never changes a correct decode.
- **Phase 5 of 8 complete.** Spec-clean Part 10 serializer live:
  `serializeDicom(ds)` writes a `Dataset` back to a Part 10 `Buffer` (preamble + `DICM`, File Meta
  always Explicit VR LE with computed group length, dataset body in the source transfer syntax (no
  transcode) across all four v1 syntaxes), with even-length padding, short/long-form headers, retired
  group-length omission, and byte-for-byte SQ / encapsulated-pixel-data passthrough; plus the
  `DicomSerializeError` taxonomy. Known limitation: only the typed `FileMeta` fields round-trip.
- **Phase 4 complete.** Safety-critical domain helpers: `ds.patient` / `ds.study` / `ds.series` /
  `ds.image` typed fail-safe views over the §4 attributes, Enhanced multi-frame functional-group
  resolution (`image.frame(i)`, Per-Frame-else-Shared), coded triplets (`readCode`), and the
  value-layer `DicomValueError`. Builds on Phase 3 VR value decode (all 34 VRs via `Element.value`) +
  the `Dataset`/`Item` navigation API.
- **The element registry is sourced from the normative PS3.6 DocBook, not from a mirror alone.**
  `vendor/nema/part06/` pins `part06.xml` (**PS3.6 2026c**) by SHA-256, and
  `scripts/generate-dictionary.ts` overlays it **per field** on the Innolitics base: PS3.6 wins on
  name / keyword / VR / VM / retired for any tag it publishes, PS3.6-only tags are added, mirror-only
  tags are **kept** (PS3.6 retires, it does not delete, so an absence is more likely a parse gap here
  than a withdrawal there). Registry: 5,309 tags, 5,214 keywords. Scoped to Tables 6-1/7-1/8-1/9-1;
  **UIDs are deliberately not overlaid** (the short forms and the structured `retired` boolean are
  intentional deviations from Table A-1), and PS3.15 Annex E is a different part and generator.
  The pin is a **precondition**: the generator re-hashes the file and refuses to run on a mismatch,
  reads the edition from the document's own `<subtitle>`, and fails loudly on a row that is not six
  cells, a malformed tag, a non-identifier keyword, an unknown VR token, or under 5,000 rows.
  Two DocBook traps, both covered by tests: the keyword column carries 13,470 **ZERO WIDTH SPACE**
  hints (one left in yields a keyword that looks right and never matches), and the sixth column
  carries `DICOS`/`DICONDE` markers next to `RET (edition)` (reading it as a boolean would retire 391
  live tags). **There is no staleness clock and must not be one** - a date gate fires the day it is
  written, demands an action nobody can take on demand, and reds unrelated PRs. "Has NEMA moved" is
  one content-comparing command in `vendor/nema/README.md`; CI gates byte-identical regen, offline.
- **The Annex E action table is sourced from the normative PS3.15 DocBook, not from a mirror alone.**
  `vendor/nema/part15/` pins `part15.xml` (**PS3.15 2026c**) by SHA-256, and
  `scripts/generate-annex-e.ts` overlays Table E.1-1 **per field** on the Innolitics base, the same
  authority rule the dictionary uses: PS3.15 wins on attribute name / Basic Profile code / the nine
  option columns for any tag it publishes, PS3.15-only tags are added, mirror-only tags are **kept**.
  Table: 652 entries, up from 617. The 35 additions were **not cosmetic**: the mirror snapshot was
  2024b-era, and **32 of the 35 missing tags are marked `X` (remove)** by the current standard (the
  other three are `(0040,B020)` `X/D`, `(0070,0006)` `D`, `(300A,0054)` `U`), among them
  `(0010,0011)`-`(0010,0016)` (the preferred-name and pronoun block, including `(0010,0012)` a
  patient's **preferred name**), `(0010,0041)`-`(0010,0047)` (gender identity, sex parameters for
  clinical use), and `(0010,2161)`/`(0010,2162)`. Because `annexE()` returns `undefined` for a tag it
  does not carry and `deidentify()` reads `undefined` as "not listed, keep", **every one of them
  survived `deidentify()` verbatim and the report said nothing** - shipped that way at `0.0.3`.
  `deid`'s `/dicom` adapter delegates here, so it had the same hole. **The lesson: a de-identifier's
  action table lagging the dictionary is a silent PHI leak, not a currency nit. They advance together
  or the gap only widens.** The pin is a **precondition** (re-hashed, refuses on mismatch); the
  edition is read from the document's own `<subtitle>`; the parser fails loudly on a header row whose
  15 labels are not where the column indices expect them (a cell count catches an inserted or dropped
  column, **not a reorder**, which would read one option's code as another's), a body row that is not
  15 cells, an unrecognized tag cell, an unknown action code, an empty Basic Profile cell, an
  unaccounted `<tr>`, or under 600 rows. **No staleness clock, and there must not be one** - same
  reasoning as PS3.6. The mirror-only count prints every run too, so the "retires rather than
  deletes" assumption stays observable. One deliberate exclusion remains, **printed on every run**
  rather than assumed: the **169 rows** where PS3.15's two E.3.6 date columns diverge under the
  single collapsed `RetainLongitudinalTemporal` (which carries the full-dates column, the **less
  protective** branch - `K` on all 169 where modified-dates says `C`; the JSDoc and troubleshooting
  doc now say so, and splitting the option is a public-surface change deliberately not made).
- **Table E.1-1's repeating-group rows are matched by mask, bounded by PS3.5 §7.6.** `(50xx,xxxx)`
  Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay Comments are all marked **X** and
  were all unreachable by an exact-tag matcher, so `(6000,4000)` free text came through
  `deidentify()` verbatim with a **clean report** - shipped that way at `0.0.3`, and `deid`'s
  `/dicom` adapter inherited it. `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` never covered this: it
  keys on `(7FE0,0010)` + `(0028,0301)`, the **image**, not the overlay planes. The generator now
  emits the three rows as `ANNEX_E_REPEATING` pattern rules; `annexE()` consults them **on an
  exact-tag miss only** (an exact row is the more specific statement and wins - the shadowing count
  prints every run and is 0 today), and a match is **removed AND reported** with
  `DeidentifiedAttribute.repeatingGroup` naming the mask. **The range is the load-bearing part and it
  is not the mask's shape:** PS3.5 §7.6 bounds repeating groups to the **even** groups `6000`-`601E`,
  and PS3.5-2004 §7.6 (which the current edition's note delegates to for curves) to the even
  `5000`-`501E`. Sixteen groups per mask, not 256. `src/dictionary/repeating-groups.ts` is the single
  home of that fact **on the de-identify path**, imported by both the generator and the runtime so
  those two cannot drift. It is **not** the only mask matcher in the package and must not be unified
  with the other one: `src/parser/element-header.ts`'s `matchRepeatingGroup` reads `x` as an
  unbounded hex wildcard over the PS3.6 registry's ~88 masked entries and _will_ answer for
  `(6020,4000)`. That is correct there and wrong here, because a too-wide **VR guess** only yields a
  lenient decode of what would otherwise be `UN`, while a too-wide **removal** deletes data the
  standard never marked. Postel's Law on the read path, the standard's bound on the de-identify path.
  Over-broad is a **different** unsafe direction from under-broad, so both are tested: `(6020,4000)`
  and `(6001,4000)` must NOT match on the de-identify path. **The guard is worth more than the fix:**
  a masked row on a prefix
  PS3.5 does not define (e.g. `(7Fxx,0010)`) now **fails the generator** instead of being printed and
  dropped, which is precisely how these three rows went missing. Proven by mutation in
  `test/scripts/generate-annex-e.test.ts`: the pre-remedy generator exits 0 on an injected `(7Fxx,0010)`
  row, the post-remedy one exits 1; a second mutation moves the Overlay Comments code `X` -> `K` and
  proves the emitted rule follows the document rather than a hard-coded `X`.
- **PS3.5 is vendored too, so the repeating-group bound is derived rather than transcribed.** This
  closed the last asymmetry in the authority story: PS3.6 and PS3.15 were SHA-pinned and re-hashed
  while the bound they are expanded by was a **quotation in a source file**, which meant the
  generator's guard caught a new mask _prefix_ but never a changed _bound_. `vendor/nema/part05/`
  pins `part05.xml` (**PS3.5 2026c**) and `vendor/nema/part05-2004/` pins `04_05pu.pdf`;
  `scripts/generate-repeating-groups.ts` emits `src/dictionary/generated/repeating-groups.ts`, and
  `src/dictionary/repeating-groups.ts` re-exports it, so the runtime, the Annex E generator and the
  documents cannot drift. **Two documents because the bound is split across two editions,** and this
  is the part to understand before touching it: the current edition states the **overlay** bound
  (`6000`-`601E` even) normatively and excludes the odd `6001`-`601F`, but says **nothing** about the
  **curve** bound - it retired curve encoding and _delegates_, in section 7.6's own Note, to
  PS3.5-2004 at an explicit URL, which is where `5000`-`501E` even comes from. So the 2004 PDF is not
  a convenience copy, it is the authority the edition in force names. **The overlay bound is stated
  by both editions and the generator requires them to agree** - that cross-check is the real gate,
  and the generator also **proves the delegation** (section 7.6 must link exactly the vendored 2004
  URL) rather than assuming it, so an edition that re-states the bound inline or points elsewhere
  fails loudly instead of being silently overridden by a 22-year-old PDF. `gen:repeating-groups` runs
  **first** in `gen:all` because `generate-annex-e.ts` imports this module, but be precise about what
  that buys: a **missing** artifact fails that generator at import, while a merely **stale** bound
  leaves `annex-e.ts` byte-identical (measured), since the expansion happens at **runtime** in
  `matchesRepeatingPattern` and the generator only uses the bound for a prefix guard and a printed
  statistic. The ordering is right; the **regen gate**, not the ordering, is what catches a wrong bound.
  Falsifiability is the point and is proven by mutation in
  `test/scripts/generate-repeating-groups.test.ts`: moving the overlay bound in **either** edition
  reds the cross-check, moving the **curve** bound in the 2004 edition moves the **emitted artifact**
  (nothing contradicts it, so the byte-identical regen gate is what catches it), and removing the
  delegation link stops the 2004 document being used at all. Each was confirmed non-vacuous by
  disabling the guard and watching the test go red.
  **▶ LOCATING A SPEC SECTION: NEVER FIRST-MATCH. Copy this rule, it generalises.** A heading appears
  at least **twice** in a standards document: in the **table of contents** (dotted leader, page
  number) and on the section itself. First-match reads the TOC. Measured here, not theorised: scoping
  the 2004 read by first-match produced a **130-character** slice instead of the 1,364-character body
  and the generator **exited 1**. It failed closed, which is the only reason this is a note rather
  than a wrong de-identification bound; a first-match that landed on a section with _some_ matching
  text would have failed **open** and silently. The rule instead is **collect every candidate
  section, keep those containing the normative sentence, require exactly one** - which rejects the
  TOC _by content_ rather than by a "skip the first hit" heuristic. Be exact about the second
  half: it proves at most **one heading-delimited candidate** carries the sentence, which is what a
  bare `.exec` silently assumes and does not check. It does **not** prove document-wide uniqueness -
  a second occurrence inside the same slice, or one outside any `7.6`-to-`7.7` window, is invisible
  to the count. (It happens to be unique here: one occurrence in 416,764 characters, measured.) Zero
  and two candidates are both refusals. **Reading the 2004 PDF needs a PDF reader**: a
  deliberately minimal one (Node `zlib` only, inflate the content streams, concatenate the text
  operators' literal strings) lives in that generator. It recovers **one sentence**, checked against a
  precise expected shape. **Do not grow it into a general PDF parser** - if it needs more, prefer
  re-deriving the bound from a current normative source. **No staleness clock here either**, same
  reasoning as PS3.6 and PS3.15.
- **Diagnostics are built from a frozen registry, not from the document** (`PHI-WARNING-MESSAGE-LEAK`).
  Every Tier-2 message is looked up in `WARNING_MESSAGES` keyed by the code; factories take a position
  and structural constants only (a tag this parser composed, a VR checked against the closed 34-VR
  set, input-derived numbers). **There is no string parameter for a value to travel through**, which
  is the single property separating the `@cosyte/*` parsers that leak from the ones that do not. Three
  sites did interpolate one: `DICOM_UNSUPPORTED_CHARSET` echoed the `(0008,0005)` term, which is
  multi-valued **on the backslash** and which `deidentify()` then carried onto the dataset it labels
  safe to share; `DICOM_PRIVATE_CREATOR_UNKNOWN` echoed the Private Creator; and the
  `UNSUPPORTED_TRANSFER_SYNTAX` fatal echoed the UID into `err.message`, with the writer doing the
  same. **The bound also has to reach the model, and this is the part to keep:** `hl7` fixed its
  messages, verified green, and `deid` still leaked, because `Segment.type` stayed unbounded on the
  model. So `Element.specificCharacterSet` and `Element.privateCreator` bound on **membership** (in
  PS3.3's closed term table, and in the active `Profile`'s overlay) rather than on shape, because
  DICOM offers no shape to test: `LO` admits 64 characters of anything, and a defined term is refused
  precisely when the closed table does not name it. **With no profile, `Element.privateCreator` reads
  `<withheld>`**; the raw creator remains available as the `(gggg,00EE)` element's own bytes.
  `deidentify()` re-derives block reservations from the dataset's creator elements so
  `RetainSafePrivate` is unaffected. The gate is `test/integration/phi-diagnostic-surface.test.ts`, a
  28-slot table bound to `assertNoDiagnosticPhiLeak`; **it was run red on the base commit and named
  seven leaking slots.** The suite it joined could not have: `test/property/_arbitraries.ts` excludes
  the backslash from `TEXT_ALPHABET` by design and never generates `(0008,0005)` or a Private Creator
  at all. **`@cosyte/test-utils` must stay pinned `^0.0.2` or higher** - a caret on a `0.0.x` resolves
  to that version exactly, so a `^0.0.1` pin silently tests against a kit with no such runner and
  passes. Four doc claims said the reverse of the source (warnings "PHI-free by construction",
  `DicomParseError` retaining "no raw input snippet" when `snippet` is 16 source bytes) and are
  corrected; the `DeidentifyReport` is value-free **apart from `uidMap`**, whose keys are the file's
  own source UIDs. **The gate does not make the diagnostic surface PHI-free and must not be described
  that way**: `snippet` is still 16 raw bytes as hex, deliberately (D-10), and hex is a re-encoding
  the runner cannot match, so no slot can ever go red on it.
  **Private block reservations are scoped per Data Set, and the refuter caught this the hard way.**
  PS3.5 §7.5 makes each Sequence Item its own Data Set and §7.8.1 scopes a Private Creator's
  reservation to the Data Set it appears in, so the same block number names different vendors at the
  root and inside an item. The first version of the `RetainSafePrivate` creator re-derivation built
  one map from `ds.elements()` and used it at every depth: it **retained an item's private element on
  the root's reservation and wrote the PHI into the serialized output**, and dropped one correctly
  reserved inside the item it was used in. `processElements` now derives the map at every depth it
  recurses to, and `test/deident/deidentify.test.ts` has both directions (each confirmed to red
  against the root-scoped version).
- **Em-dash brand gate armed.** `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) plus
  `.github/workflows/no-emdash.yml` enforce the founder directive banning `U+2014` outright
  (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever."). It scans **both** halves the
  rule covers: every tracked file, **and** the PR title, body, and commit messages, on the
  non-default `edited` trigger so retitling a PR re-checks it. What lands on `main` here is a repo
  setting, read rather than assumed: `squash_merge_commit_title: COMMIT_OR_PR_TITLE` and
  `squash_merge_commit_message: COMMIT_MESSAGES`, so the subject comes from the PR title (or from
  the lone commit's subject, when the branch has exactly one) and the body from the branch commit
  messages. The PR body does not land; the gate scans it anyway, as deliberate over-strictness on a
  surface that costs nothing to cover. The script is the **text-only** variant, taken from
  `ncpdp` rather than the older `knowledgebase` copy so that it carries `ncpdp`'s two shape fixes
  (a tracked file named `-` was read as stdin and never opened; `-d skip` silently passed a tracked
  symlink to a directory). dicom was **not** clean when this landed: an earlier markdown-only survey
  said it was, but six em dashes lived in four non-markdown files and this slice removed them,
  including the npm `description`. **Measure every tracked file, not just markdown.**
  It deliberately omits `grep -I`, and that is the choice to understand before touching this file.
  `src/dataset/vr/charset.ts` holds a **functional NUL** inside `/[\x00 ]+$/u` (DICOM's own padding,
  stripped by that regex), so grep classifies it binary. It carries no em dash, so it scans green.
  If it ever gains one, grep writes `binary file matches` to stderr with empty stdout and the
  stderr capture reds the run. Adding `-I` would make that same edit pass in silence, so do not add
  it, and do not remove the NUL to quiet the gate. When the gate goes red the fix is never to
  re-encode the character: rewrite with a period, colon, comma, or parentheses. Known limits are in
  the script header and are shared across every copy, so fix them there, not here.

## Tech Stack (the shared `@cosyte/*` standard)

dicom inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files (Phase E migration). The source of truth is the meta-repo's
`documentation/conventions.md`; this is a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`.
- **Build:** dual ESM + CJS + `.d.ts`/`.d.cts` via `tsup` (`@cosyte/tsup-config`); `attw` is a
  publish gate (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
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

Build, lint, format, and TypeScript settings come from the shared `@cosyte/*` config packages
(`@cosyte/tsconfig` · `@cosyte/eslint-config` · `@cosyte/prettier-config`; see
`documentation/conventions.md` → "Canonical toolchain (enforced)"). Node ≥ 22.
