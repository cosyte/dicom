# Changelog

All notable changes to `@cosyte/dicom` will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Em-dash brand gate in CI (`EMDASH-CONFORMANCE`).** The founder directive of 2026-07-24
  (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever.") bans `U+2014` outright across
  every cosyte surface and names commit messages explicitly, and the meta-repo's
  `documentation/conventions.md` has stated for weeks that the rule is CI-gated. It now actually is,
  here: `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) plus a dedicated
  `.github/workflows/no-emdash.yml` job that scans **both** halves the rule covers, the tracked files
  **and** the PR title, body, and commit messages. The workflow carries the non-default `edited`
  pull-request trigger, which is load-bearing: this repo squash-merges under
  `squash_merge_commit_title: COMMIT_OR_PR_TITLE` and `squash_merge_commit_message: COMMIT_MESSAGES`
  (read off the repo, not assumed), so the subject that lands on `main` is the PR title, or the lone
  commit's subject when the branch has exactly one, and the body is the branch commit messages.
  Without `edited` a title changed after the last push would never be re-checked. The PR body does
  **not** land; the gate scans it anyway, as deliberate over-strictness on a surface that costs
  nothing to cover. It is a separate workflow rather than a job in `ci.yml` because that trigger
  would otherwise re-run the whole Node 22 + 24 matrix on every typo fix, and because the shared
  `cosyte/.github` pipeline runs no arbitrary repo script.
  **This one did change content, unlike the earlier ports.** An ecosystem survey had measured
  markdown only (0 of 25 `.md` files) and read dicom as already clean. Measuring all 178 tracked
  files found six live em dashes in four non-markdown files, all removed here (see Changed, below).
  Measure every tracked file, because that is what the scan covers.
  The script is the **text-only** variant, taken from `ncpdp` (PR #34, `39212bb`) rather than from
  the older `knowledgebase` copy, so it carries `ncpdp`'s two fixes to the shared shape instead of
  inheriting the holes: a tracked file named `-` was read by `grep` as standard input (which `xargs`
  points at `/dev/null`) and so was never opened, and `-d skip` silently passed a tracked symlink to
  a directory. Both are re-proved here rather than taken on faith: with the `./` path prefix removed
  the gate prints OK and exits 0 over a live em dash in a file named `-`, and with `-d skip` restored
  it goes green over an unread symlink.
  It deliberately omits `grep -I`, and in this repo that is the most load-bearing flag choice in the
  file. `src/dataset/vr/charset.ts` holds a functional NUL byte inside `/[\x00 ]+$/u`, the regex that
  strips DICOM's own padding, so grep classifies it binary. It carries no em dash today and scans
  green, which is the whole answer to the belief that this port was blocked: the red would come from
  a match, never from the NUL. **If it ever gains one, the gate reds.** Measured with GNU grep 3.8:
  grep exits 0, writes nothing to stdout, and writes `binary file matches` to stderr, so the hit
  never reaches the hit list and the stderr capture fails the run instead. With `-I` added, the same
  edit goes green, which is why `-I` stays out. The failure message names that case explicitly rather
  than blaming an I/O error that did not happen.
  A gate that prints OK when it did not read its input is worse than no gate, so nine routes by which
  a dead or blind scan could still report green are each checked red, not assumed: a corrupt git
  index, an unreadable tracked file, a tracked file named `-q`, a C-quoted non-ASCII path, a
  mis-encoded text file, an empty tracked-file list, a tracked file named `-`, a tracked symlink to a
  directory, and the NUL-bearing source file gaining an em dash.
  Known limits are documented in the script header and inherited knowingly from the shared shape
  rather than patched in this copy alone: encoded-form matching is literal (so `&#x2014` without the
  semicolon, and lowercase `%e2%80%94`, pass), stderr capture binds to the scanning `grep` rather
  than to the filters ahead of it, an em dash encoded in a non-UTF-8 charset is not matched (a live
  possibility here, given `(0008,0005)` Specific Character Set fixtures), and the scan reads file
  **contents** only, so a tracked path that itself carries an em dash passes. Tooling only: no
  runtime, public-API, or parse-behavior change.
- **`docs-content/` now covers the full canonical Diátaxis spine** (`DOCS-CONTENT-P6`). Beyond the
  existing Overview (`intro`), the sidebar gains **Installation** and **Quickstart** (tutorials),
  five **Core Concepts** notes (the object model, the tolerance/warning model, the typed value
  layer, the safety-critical views, and the source-profile system), a **Guides** cookbook (four
  recipes: re-serialize, de-identify, read raw pixel data, triage warnings), and a
  **Troubleshooting & known limitations** reference. Every documented capability is grounded in the
  package's actually-shipped surface; the metadata-first boundary is stated explicitly, with the
  permanent non-goals named in Troubleshooting (**no pixel decode, no DIMSE networking, no
  DICOMweb**, no pixel-level de-identification).
- **Doc/code-agreement gate (`test/docs-content.test.ts`).** Every ` ```ts runnable ` snippet in
  `docs-content/` is extracted, compiled, and executed against the **built** package via
  `docSnippetSuite()` from `@cosyte/vitest-config/snippets`, with its inline `// =>` assertions
  checked, so a documented example can never silently drift from the code. All examples use
  synthetic, base64-encoded Part 10 objects (invented patient, fake UIDs); no real PHI, no `.dcm`
  file on disk.

### Fixed

- **174 SOP Class UID names in `UIDS` were wrong (`DICOM-DICT-CURRENCY`).** The dictionary generator
  appended `" Storage"` to every name it took from the vendor `sops.json`, but that field is already
  the full PS3.6 Table A-1 UID Name. The result was a doubled suffix on the 164 names that already
  ended in "Storage", so `UIDS["1.2.840.10008.5.1.4.1.1.2"].name` read **"CT Image Storage Storage"**,
  and an equally wrong tail on 10 of the other 11 ("Digital X-Ray Image Storage - For Presentation
  Storage"). Every one shipped in `0.0.1` through `0.0.3`. The suffix is gone and the names now come
  through verbatim.
  The rule was wrong for all 175 entries it touched but landed on the right string for exactly one,
  so removing it needed a compensating correction rather than a second blanket rule:
  `1.2.840.10008.5.1.4.1.1.79.1` is the single UID whose vendor name genuinely lacks the suffix, and
  it is now pinned in the generator's curated table to the "Macular Grid Thickness and Volume Report
  Storage" that PS3.6 2026c Table A-1 gives it.
  One further name is corrected: `1.2.840.10008.1.2.6.1`, the retired RFC 2557 transfer syntax, read
  "RFC 2557 MIME Encapsulation" where PS3.6 prints "RFC 2557 MIME encapsulation".
  Measured against PS3.6 2026c on the branch head: of the **261** UIDs shared with Table A-1,
  **240 match the `UID Name` column byte for byte**; a further **17** differ only in that Table A-1
  writes retirement into the name as a trailing " (Retired)" where this dictionary carries a
  structured `retired` boolean, which gives **257** when those are read as matches and **zero**
  retirement-flag disagreements; the remaining **4** are the deliberate transfer-syntax short forms
  tabulated in `vendor/innolitics/README.md`; **0** are unexplained. All **7** well-known frames of
  reference match Table A-2 byte for byte. `uids.ts` changes on 175 lines in total.
  Name only: no UID value, `type`, or `retired` flag changed. Transfer-syntax dispatch keys off the
  UID **value**, never the name, so no parse or de-identification behavior changes. The one place a
  name reaches a caller at runtime is the human-readable `snippet` on the fatal
  `UNSUPPORTED_TRANSFER_SYNTAX` error, which is improved by the correction rather than altered in
  meaning.
- **The byte-identical regen gate could go green while generating nothing (`DICOM-DICT-CURRENCY`).**
  Two ways, both fixed by making the gate delete `src/dictionary/generated/` (except the hand-written
  `README.md`) before running `pnpm gen:all`, so it measures what the generators produce instead of
  what happens to be on disk. A stale orphan, an artifact a generator used to emit and no longer
  does, was never rewritten and never diffed, so it passed indefinitely. And gutting `gen:all` to a
  no-op wrote nothing, left every committed artifact untouched, and produced an empty `git diff`:
  permanently green. `package.json` also joins the workflow's `paths` filters, without which that
  second case never triggered the gate at all. Both now red, proved by seeding each defect and
  watching the run fail. The delete is `-mindepth 1` rather than `-type f`, so a stale symlink or
  subdirectory cannot become an orphan the gate is blind to, and the step asserts that only
  `README.md` survives instead of printing an expectation nothing checks. `pnpm gen:clean` exposes
  the same delete for local use but is deliberately **not** chained into `gen:all`: the generators
  throw on malformed or missing vendor input, which is the normal state part-way through a re-pin,
  and a chained clean would leave the working tree empty and the build broken. The gate does its own
  delete rather than trusting the script under test.

### Changed

- **Recorded what the vendor pin is actually current against (`DICOM-DICT-CURRENCY`).**
  `vendor/innolitics/README.md` gains a measured Currency section and drops the "re-pin monthly"
  policy, which nothing ran and which measured the wrong thing. The pin is exactly current against
  upstream: `git ls-remote` resolves `master` to the pinned SHA and all four vendored files are
  byte-identical to upstream at it. Upstream itself is the stale link, having last changed
  `attributes.json` on 2024-04-18 ("Update standard to rev2024b"), so the tag tables are grounded in
  PS3.6 2024b while the current edition is PS3.6 2026c. The drift is now measured rather than
  assumed, against the NEMA DocBook source for 2026c, and every non-additive difference is named in
  that file. Figures on `86ab6c1` (`origin/main` at measurement time; this slice does not touch
  `tags.ts` or `keywords.ts`): all **5,129** committed tags are shared with PS3.6 2026c, and across
  them there are **zero VR differences**, zero name differences and zero VM differences, with 2
  keyword and 2 retirement-status differences. **Every tag this dictionary carries is still in
  PS3.6 2026c**; the drift is otherwise purely additive, 180 tags the standard has gained. VR is
  what turns bytes into a value, so zero VR drift is the result that matters for reading a real
  study. Nothing in the dictionary is hand-edited to close the gap: it is generated, and the
  remaining differences are recorded for the next re-pin. One method note lives with the
  measurement, because getting it wrong is easy and was got wrong on the first run: DICOM tag values
  are hexadecimal and their case is not semantic, so tag keys must be compared case-insensitively.
  PS3.6 prints them uniformly uppercase and `tags.ts` agrees on 1,540 of its 5,129 keys, but
  `tags.ts` lowercases the 8 repeating-group keys whose trailing digits are hex letters and no
  others, so a verbatim comparison mis-classifies exactly those 8.

- **Removed the six em dashes the new gate found (`EMDASH-CONFORMANCE`).** Four tracked files, none
  of them markdown: `.github/CODEOWNERS` (2), `.github/workflows/release.yml` (2),
  `vendor/nema/SHA.txt` (1), and the npm `description` in `package.json` (1). The last is the only
  one visible outside the repo: the package description on npm and on the GitHub sidebar now reads
  "Developer-focused DICOM Part 10 parser + utility library for Node.js and TypeScript:
  metadata-first, vendor-quirky-tolerant, dual ESM/CJS." Each rewrite replaces the character with a
  period, colon, or comma, per the rule's own instruction; none re-encodes it, and no wording beyond
  the punctuation changed.
- **Bumped the `@cosyte/vitest-config` devDependency to `^0.0.2`** to pick up the `./snippets`
  export that ships the doc/code-agreement runner.
- **Corrected the element-access examples in `intro.md`.** `Dataset.get` / `has` take the
  8-character `(group,element)` **tag** form only. The prior snippets showed `get("PatientName")`,
  `get("(0010,0010)")`, and `get("StudyDate")`, all of which return `undefined`. They now use the
  tag form (and show resolving a keyword to its tag via `Dictionary.byKeyword`), matching the code.

- **All tests now live in a top-level `test/` mirroring `src/`.** `@cosyte/dicom` was the lone parser
  that co-located `*.test.ts` files beside their source; the 32 co-located suites were moved to
  `test/<path>/` preserving the `src/` sub-structure, bringing the repo in line with the
  `hl7`/`mllp`/`x12`/`ccda`/`ncpdp` archetype (`DICOM-TEST-RELOCATE`). Relative imports in the moved
  files were retargeted (`./foo.js` → `../../src/<path>/foo.js`). `vitest.config.ts` drops the
  `src/**/*.test.ts` include glob, so the config now matches the archetype and a stray co-located
  test is no longer silently collected alongside the `test/` suite. Test-only, no public-surface
  change: same 585 passing tests (+1 todo), coverage gates (still pointed at the `src/` source
  directories) unchanged and green.

### Fixed

- **`Dictionary Regen` is green again (`DICOM-DICT-REGEN`).** The byte-identical regen gate had been
  red since 2026-06-24: seven consecutive failing runs, four of them pushes to `main`, every one of
  them failing in its first real step. The last green run was 2026-05-04.
  `.github/workflows/dictionary-regen.yml` passed `version: 10` to `pnpm/action-setup@v6` while
  `package.json` already declares `packageManager: pnpm@10.0.0`, and v6 treats two sources of truth as
  a hard error: "Multiple versions of pnpm specified". The job died in about 13 seconds having never
  installed anything, never run `pnpm gen:all`, and never compared a single generated byte. Dropping
  the redundant `version:` input lets `packageManager` win, matching the fix `astm` already applied to
  its fuzz workflow (`44c3d88`).
  Two smaller repairs to the same file, both aimed at the gate actually asserting something rather
  than merely starting. The workflow now lists **itself** in its `paths` filters, so a change to the
  gate re-runs the gate; without that, the PR fixing a broken gate could not demonstrate the gate
  fixed. And the verify step now also fails on **untracked** files under `src/dictionary/generated/`:
  `git diff` reports modified tracked files only, so a generator that began emitting a brand-new
  artifact would have left it untracked and invisible to the check.
  The committed dictionary itself is **not** drifted. Regenerating from the pinned inputs
  (`vendor/innolitics/90571bc`) reproduces all four artifacts byte for byte: 5,129 tags, 5,035
  keywords, 268 UIDs, 617 Annex E entries, zero diff. Verified as a positive control rather than
  assumed: perturbing a VR in the vendor input made the gate red, and restoring it made the gate
  green, so the check reads its input. Nothing in the tag tables needed correcting, and nothing
  regenerated was committed.

- **Corrected the `private: true` claim in `.github/workflows/release.yml`.** A comment at the top of
  the release caller asserted that `@cosyte/dicom` is `private: true` and that `changeset publish` is
  therefore "a no-op until that flag is removed". `package.json` carries no `private` field, the repo
  is public, and the package ships on npm at `0.0.1`, so the comment described the release pipeline as
  inert when it is live. Documentation only, no behavior change, but a misleading note on a workflow
  that really does publish is worth more than a stale one elsewhere.

- **Corrected stale publish-status language in `docs-content/` (`README-ORG-SWEEP`).**
  `installation.md` claimed the package was "not yet published to npm" and that the install command
  was only "the shape it will take at first publish"; `troubleshooting.md` listed a "Not yet
  published … not on npm; the first provenance publish is gated on the coordinated public launch"
  non-goal. `@cosyte/dicom` is published on npm at `0.0.1` and public. Both now state the truth
  (published, public, still pre-alpha on the `0.0.x`-until-first-alpha ladder), and the troubleshooting
  bullet becomes an honest pin-your-version pre-alpha caveat rather than a stale non-goal.

- **`private: true` removed: `@cosyte/dicom` can publish.** The flag dated to the very first
  scaffold commit and was never explained; `changeset publish` silently skips a private package, so
  this repo was the one parser that could not reach npm even once its pipeline worked. It also
  contradicted the `publishConfig: { access: "public" }` in the same file. Removed as part of the
  coordinated public launch (`PUB-FLIP`).

- **The release can actually bump the version.** `package.json` had no `version` script, so the
  shared pipeline's `pnpm run version` failed with `Command "version" not found` and the release
  aborted before opening a "Version Packages" PR. Adds `scripts/sync-version.mjs` (the `hl7`
  reference, retargeted at `src/version.ts`) and the `version` script that runs it after
  `changeset version`, so the bump and the `VERSION` constant land in the same commit.
- **`VERSION` is no longer typed as a string literal.** It was declared `export const VERSION =
"0.0.0"`, giving it the literal type `"0.0.0"`, so the exported type would change on every
  release, making each version bump a breaking type change. Now annotated `: string`, matching the
  `hl7` reference. Type-only; the runtime value is unchanged. Done now because the package is
  unpublished. After the first publish this would itself be a breaking change.

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own, so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only: no runtime or API change.

### Security

- **Dev-dependency advisory remediation (no runtime impact: the published
  artifact is unchanged).** Added scoped `pnpm.overrides` pinning two
  transitive **dev/build-time** packages to their patched releases: `esbuild`
  (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal, not
  reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Added

- **Trademark notice (`TRADEMARKS.md`).** This package names third-party systems to describe what it
  interoperates with; the notice records that cosyte is not affiliated with, endorsed by, or
  sponsored by any of them, that every reference is descriptive, and that the built-in profiles are
  authored from public sources only. Added to `files` so it ships inside the published tarball, not
  just on GitHub. Documentation only: no runtime or API change.

- **Lossless File Meta round-trip.** The parser now retains non-modeled
  `(0002,xxxx)` File Meta elements (e.g. `(0002,0017)`/`(0002,0018)`
  Sending/Receiving AE Title, `(0002,0100)` Private Information Creator UID,
  `(0002,0102)` Private Information) as raw on-wire bytes on the new
  `FileMeta.extraElements` view (each a `FileMetaRawElement` carrying the tag,
  its Explicit-VR-LE VR, and a defensively copied even-length value). The
  serializer merges these with the typed fields and emits the whole group in
  ascending tag order (PS3.5 §7.4) with a recomputed `(0002,0000)` group length
  (PS3.10 §7.1), so an exotic File Meta group now round-trips byte-for-byte,
  not just the typed fields. New exported type: `FileMetaRawElement`. This
  resolves the Phase 5 serializer known-limitation ("only the typed `FileMeta`
  fields round-trip").
- **Documentation completeness (Phase 8).** Rewrote `README.md` into a full developer guide: quickstart,
  feature tour, a "DICOM in 90 seconds" primer, the two access patterns, an 80/20 **cookbook** (index a
  folder, build routing keys, read pixel-interpretation metadata safely, de-identify, bridge to FHIR
  `ImagingStudy` / HL7 v2, round-trip serialize), the four-tier tolerance model, the warning/fatal code
  taxonomy, typed-error handling, and an explicit known-limitations / non-goals section. Every public
  export now carries a JSDoc `@example`. Extended the dual ESM/CJS smoke harnesses to exercise the full
  Phase 1–7 published surface so the documented entrypoints are guaranteed importable from both module
  systems. Also corrected an `intro.md` snippet that referenced a nonexistent `ds.pixelData` getter (the
  real accessor is `ds.get("PixelData")?.value`). Docs-only: no runtime API change.
- **Metadata-level de-identification (Phase 7).** New `deidentify(ds, options?)` applies the PS3.15
  Annex E **Basic Application Level Confidentiality Profile** plus the nine metadata-affecting Annex E
  Options (`RetainUIDs`, `RetainLongitudinalTemporal`, `RetainPatientCharacteristics`,
  `RetainDeviceIdentity`, `RetainInstitutionIdentity`, `RetainSafePrivate`, `CleanDescriptors`,
  `CleanStructuredContent`, `CleanGraphics`), driven by the generated Table E.1-1 action map. It is a
  **pure** function: the input `Dataset` is never mutated; it returns a fresh de-identified `Dataset`
  and a value-free `DeidentifyReport` (tags, keywords, resolved action codes, the UID map, warnings).
  Each attribute's action (`D` dummy, `Z` zero-length, `X` remove, `K` keep, `C` clean, `U` consistent
  UID) is resolved from the Basic Profile, overridden by any active Option; conditional codes (`Z/D`,
  `X/Z`, `X/D`, `X/Z/D`, `X/Z/U*`, `C/X`) collapse to their most-protective **leftmost** branch (the
  tool does no IOD Type-1 conformance analysis, so it fails safe toward _more_ removal). `U`-coded UIDs
  are remapped to deterministic, content-derived `2.25` replacements that stay referentially consistent
  across files (`makeUidRemapper`, default root `DEFAULT_UID_ROOT`). Kept sequences are recursively
  de-identified and **re-encoded** so nested PHI is removed from the serialized bytes, not just the
  object model. Private attributes are removed by default; `RetainSafePrivate` + a `Profile` keeps only
  the creator-recognized safe private elements. `(0012,0062)` Patient Identity Removed = `YES` and
  `(0012,0063)` De-identification Method are written automatically. Pixel-level cleaning is out of scope
  (deferred to `@cosyte/dicom-pixel`): when Pixel Data is present and not affirmatively marked free of
  burned-in text, a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning is raised rather than silently
  passing identifying pixels. New public exports: `deidentify`, `makeUidRemapper`, `DEFAULT_UID_ROOT`,
  `DEIDENTIFY_OPTIONS`, `DEIDENTIFY_ERROR_CODES`, `DeidentifyError`, and the types `UidRemapper`,
  `AppliedAction`, `DeidentifiedAttribute`, `DeidentifyErrorCode`, `DeidentifyOption`,
  `DeidentifyOptions`, `DeidentifyReport`, `DeidentifyResult`. The reserved
  `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning code is now actively emitted (no change to the
  `WARNING_CODES` registry surface).
- **Source/vendor profile system (Phase 6).** New `defineProfile()` factory builds an immutable,
  composable `Profile` that a parse opts into via `parseDicom(buf, { profile })`. A profile bundles
  three things that only ever _tighten or annotate_ a parse, never loosen it past the lenient default:
  `escalate` (Tier-2 warning codes promoted to a thrown `DicomParseError`), `suppress` (codes silenced
  as a documented benign quirk of the source), and `privateTags` (a private-creator-keyed overlay that
  resolves the Implicit VR of vendor private data elements). Private resolution is keyed on the file's
  **live** private-creator string and the canonical `"GGGGxxLL"` key (PS3.5 §7.8.1), never a
  hard-coded block number, so the same vendor schema resolves regardless of which block it landed in.
  Profiles compose via `extends` (de-duplicated lineage, union of escalations/suppressions, child-wins
  dictionary merge) and expose a deterministic `describe()` summary. Five built-ins ship under the
  frozen `profiles` namespace: three vendor overlays (`ge`, `siemens`, `philips`, grounded in the
  public GDCM / dcm4che / dcm2niix private dictionaries) and two posture presets (`strict` escalates
  integrity-relevant warnings; `lenient` suppresses cosmetic, high-volume ones). A creator the active
  profile does not recognize degrades to generic `UN` plus the new `DICOM_PRIVATE_CREATOR_UNKNOWN`
  warning, never a wrong decode. Selecting a profile never changes a correct decode. New public
  exports: `defineProfile`, `profiles`, `ProfileDefinitionError`, and the types `Profile`,
  `PrivateTagDefinition`, `DefineProfileOptions`, `ProfilePrivateTags`; `ParseOptions` gains an
  optional `profile` field. The reserved `DICOM_PRIVATE_CREATOR_UNKNOWN` code is now actively emitted
  (no change to the `WARNING_CODES` registry surface).
- **Spec-clean Part 10 serializer (Phase 5).** New `serializeDicom(ds)` writes a `Dataset` back to a
  DICOM Part 10 `Buffer`, the conservative half of Postel's Law. Emits the 128-byte zero preamble +
  `DICM`, a File Meta group (always Explicit VR LE) with a computed `(0002,0000)` group length and
  conservative Type-1 defaults (File Meta Version `0x0001`, cosyte Implementation Class UID under the
  `2.25` UUID arc), then the dataset body in the dataset's own transfer syntax (**no transcode**)
  across all four v1 syntaxes (Implicit VR LE, Explicit VR LE/BE, Deflated Explicit VR LE). Scalar
  values are padded to even length per PS3.5 §6.2 (`0x00` for `UI`/byte-stream VRs, `0x20` for text),
  short vs long-form headers are chosen by VR per §7.1.2 (`SV`/`UV` long-form), retired `(gggg,0000)`
  group-length elements are omitted per §7.2, and sequence + encapsulated-pixel-data spans pass
  through byte-for-byte per §7.5 / §A.4. Pure function: the input `Dataset` is never mutated.
- **Serializer error taxonomy.** New `DicomSerializeError` with codes `MISSING_TRANSFER_SYNTAX`
  (no File Meta Transfer Syntax UID) and `UNSUPPORTED_TRANSFER_SYNTAX` (a UID outside the v1 set),
  separate from the parser's fatal codes and the value layer's `DicomValueError`. The message is
  built only from the code + the offending Transfer Syntax UID (structural facts), never a decoded
  value, so it is always safe to log. New public exports: `serializeDicom`, `DicomSerializeError`,
  `SERIALIZE_ERROR_CODES`, `SerializeErrorCode`.

### Known limitations

- **File Meta round-trip is over the modeled surface, not byte-exact.** Only the typed `FileMeta`
  fields round-trip; any other `(0002,xxxx)` element a source file carried (e.g. `(0002,0100)` Private
  Information Creator UID) is dropped at _parse_ time (the Phase 2 `FileMeta` view does not model it)
  and so cannot be re-emitted. The preamble is normalized to zeros and odd-length values are padded
  even. The output stays spec-clean but is not a byte-identical copy of a non-conformant input.

### Tests

- **Enhanced multi-frame coverage (DICOM-COV).** Closed the Per-Frame-else-Shared branch gaps left by
  the Phase 4 functional-group resolver (`functional-groups.ts`: ~53% → 100% branch): both optional
  macros (Pixel Value Transformation `(0028,9145)`, Frame VOI LUT `(0028,9132)`), Pixel Measures
  `spacingBetweenSlices`, shared-only resolution (no Per-Frame Functional Groups Sequence), the
  lenient inner-attribute-absence paths (a macro item present but its attributes omitted ⇒ typed-absent,
  never coerced), and all three `MISSING_REQUIRED_FUNCTIONAL_GROUP` throws (Pixel Measures / Plane
  Position / Plane Orientation). Synthetic fixtures only; no public-surface change. Per-directory
  coverage now sits genuinely ≥ 90 on every gated directory (global branches 93.2%).

### Added

- **Safety-critical domain helpers (Phase 4).** New `Dataset` accessors `patient` / `study` /
  `series` / `image` return typed, fail-safe views over the DICOM §4 safety-critical attributes
  (memoized on first access). `patient` surfaces the `{id, issuerOfId, issuerQualifiers}` identity
  tuple plus Other Patient IDs (so a caller never matches on a bare, non-unique `(0010,0020)`) and
  keeps `PN` structured; `study`/`series` surface the cross-system UIDs, accession number, modality
  and Frame of Reference UID. `image` surfaces the pixel-interpretation + geometry metadata a
  renderer needs, with the safety-critical omissions intact: `rescaleSlope` is **absent** (not `1`)
  when the tag is absent, `signed` is absent (never guessed) unless `(0028,0103)` was present,
  `photometricInterpretation` is never defaulted to `MONOCHROME2`, and the three pixel-spacing tags
  (`(0028,0030)` / `(0018,1164)` / `(0018,2010)`) are distinct, never aliased.
- **Enhanced multi-frame functional groups.** `image.frame(i)` resolves the per-frame macros
  Per-Frame-else-Shared (PS3.3 §C.7.6.16): Pixel Measures, Plane Position, Plane Orientation, Pixel
  Value Transformation, Frame VOI LUT. `image.isEnhancedMultiFrame` flags such objects.
- **Value-layer error taxonomy.** New `DicomValueError` (codes `FRAME_INDEX_OUT_OF_RANGE`,
  `MISSING_REQUIRED_FUNCTIONAL_GROUP`), separate from the parser's four fatal codes. The helpers are
  otherwise fail-safe (typed-absent for missing data) and throw only for a structural contract
  violation; the error message carries only structural facts (indices, tag/macro names), never a
  decoded PHI value.
- **Coded terminology.** `readCode` reads the `Code Value`/`Coding Scheme Designator`/`Code Meaning`
  triplet and resolves the canonical scheme OID via `codingSchemeOid` / `CODING_SCHEME_OIDS` for the
  four standard designators (`DCM`/`SCT`/`UCUM`/`LN`); legacy SNOMED designators
  (`SRT`/`SNM3`/`99SDM`) deliberately do **not** resolve to `SCT` (CP-730). Real World Value Mappings
  bind slope/intercept atomically to their measurement-units code.
- Public types: `PatientView`, `OtherPatientId`, `StudyView`, `SeriesView`, `ImageView`,
  `CodedConcept`, `RealWorldValueMap`, `FrameFunctionalGroups`, `ValueErrorCode`, plus
  `VALUE_ERROR_CODES` and the `readCode` / `codingSchemeOid` / `CODING_SCHEME_OIDS` helpers.
- **VR value decode + dataset navigation (Phase 3).** `Element.value` now lazily decodes (and
  memoizes) an element's raw bytes into a typed, discriminated `DicomValue` covering all 34 VRs:
  numbers (`US/UL/SS/SL/FL/FD`), 64-bit `bigint`s (`SV/UV`), attribute tags (`AT`), person names
  (`PN` → 3-group / 5-component), strings, free text, numeric strings (`DS/IS` → `number | null`,
  never `NaN`→0), temporal values (`DA/TM/DT`), sequences (`SQ` → threaded items), and raw `binary`
  for the bulk VRs. Decode is fail-safe (never throws, never coerces a malformed value to a
  plausible-but-wrong one) and surfaces per-value `warnings` with stable codes + byte offsets.
- String decode honors `(0008,0005)` Specific Character Set, threaded through the parser per
  dataset/SQ-item scope: UTF-8 (`ISO_IR 192`), the ISO-8859 single-byte family, and ISO-2022
  multibyte, with three term-list corrections vs PS3.3 §C.12.1.1.2 (no `ISO_IR 14`; `IR 87/159` are
  code-extension-only; `ISO_IR 203` Latin-9 is included). An unknown term emits
  `DICOM_UNSUPPORTED_CHARSET` and falls back to a best-effort decode.
- `Dataset`/`Item` navigation API: `get` / `has` / `elements` / `getAll`, tag lookup
  case-insensitive.
- Public surface: `decodeElementValue`, `parseSpecificCharacterSet`, `isKnownCharsetTerm`,
  `resolveDecoderLabel`, `decodeText`, `parsePersonName`, `parseDate`, `parseTime`, `parseDateTime`,
  and the `DicomValue` / `PersonName` / `DicomDate` / `DicomTime` / `DicomDateTime` types.
- Initial repo scaffold (Phase 1).
- Unit coverage for the PS3.15 Annex E lookup helper (`annexE`), enabling the per-directory
  coverage gate on `src/dictionary/`.
- Adopted the shared `@cosyte/test-utils` conformance kit (first parser to do so) and added a
  `fast-check` property + fuzz test layer under `test/property/`: synthetic-only generators
  (`_arbitraries.ts`) plus invariant suites for round-trip fidelity, lenient-mode robustness,
  parsed-model immutability, warning/fatal-code stability (snapshot), and a byte-parser fuzz sweep
  that feeds arbitrary buffers + random truncations and asserts the parser only ever throws a
  sanctioned Tier-3 `DicomParseError`, never an unexpected error, hang, or OOM. No public API
  change. (devDeps: `@cosyte/test-utils@^0.0.1`, `fast-check@3.23.2`.)

### Changed

- Migrated onto the shared cosyte engineering standard (Phase E): tooling now flows from the
  published `@cosyte/*` config packages (`@cosyte/tsup-config`, `@cosyte/vitest-config`,
  ESLint 10 via `@cosyte/eslint-config`) instead of repo-local copies; devDependencies pinned to
  the canonical exact versions; `attw` build/publish gate added; the per-directory coverage gate is
  now enabled (transient sub-90 floors with TODOs while the test layer fills in).
- CI/release workflows reduced to thin callers of the reusable `cosyte/.github` pipelines
  (`ci.yml` runs the shared PHI scan; `release.yml` targets `@cosyte/dicom`). The repo-specific
  byte-identical dictionary-regen workflow is kept and bumped to Node 22.
