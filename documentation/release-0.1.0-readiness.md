# Release readiness: `@cosyte/dicom` 0.1.0

This document exists so that whoever cuts `0.1.0` reads one committed record instead of
reconstructing the release out of `git log`. It classifies every change that has landed on `main`
since the commit that released `0.0.19`, states what the pending changesets derive, certifies the
public export surface, prices the exports most likely to move after `0.1.0`, restates the package's
PHI posture as an index into `documentation/agent-notes.md`, and records what each release gate
answered.

It prepares the release. It does not perform it. Nothing here ran `changeset version`,
`changeset publish`, `npm publish`, `git tag` or a GitHub release, and no file under `src/` was
touched.

Audit base: `fd0b92a` (`Version Packages (#114)`), the commit that wrote the `0.0.19` section of
`CHANGELOG.md` and set `package.json` to that version.
Audit head: `0ba157b` (`S0236-dicom-ci-ci: realign the README description with package.json`),
the tip of `main` that this branch is based on.

## Verdict

**Release readiness for `0.1.0` is CERTIFIED for the artifacts in this repository, and the cut is
still gated.**

- Every unreleased change that alters shipped code is covered by a pending changeset at its audited
  classification.
- The pending set derives exactly one bump for `@cosyte/dicom`, that bump is `minor`, and the derived
  next version is `0.1.0`.
- All six release gates pass on the audit head plus this item's changes.
- The public export surface of the package root entry is pinned by a committed snapshot with a
  suite guard that reds on drift and names the export that differs.

What certification here does NOT mean, stated so it cannot be read as more than it is:

- It is not an authorisation to publish. See "Release timing and the S0161 gate" below.
- It is not a statement that this package removes all PHI. See "PHI posture".
- One precondition of the cut could not be measured in the environment this audit ran in. See
  "Unverified".

## Change classification since `0.0.19`

Fourteen commits have landed on `main` since `fd0b92a`, listed oldest first, which is what
`git rev-list --count fd0b92a..main` answers at the audit head above. `minor` is used for a
user-visible feature or a new public export; `patch` is used for a fix or an internal-only change.
"Shipped code" is read as this item's contract defines it: anything under `src/`, the `exports` or
`files` map in `package.json`, or committed generated dictionary output.

| # | Commit | Change | Class | Justification | Covering changeset |
|---|---|---|---|---|---|
| 1 | `734736f` | Claim the PHI gate's CRLF line split and delete the disclosure that said it could not be | `patch` | `scripts/phi-scan.ts` and its tests only. The gate is developer tooling and is not in the published `files` map, so no consumer-visible behaviour moves | `.changeset/olive-fences-return.md` |
| 2 | `8139687` | Parse the PHI gate's override log with CommonMark's line ending, and pin the spec | `patch` | Same route. `scripts/`, `vendor/commonmark/`, tests, and a `scripts` entry in `package.json`; nothing under `src/` and no change to `exports` or `files` | `.changeset/quiet-lines-agree.md` |
| 3 | `94069e8` | Model CommonMark's HTML blocks in the PHI gate's override log | `patch` | Same route, same reasoning | `.changeset/great-blocks-listen.md` |
| 4 | `09de547` | Refuse a `###` run an invisible character separates from the path, in the override log | `patch` | Same route, same reasoning | `.changeset/olive-headings-listen.md` |
| 5 | `b8fd5ae` | Disclose a retained private value kept without being enumerated, instead of stamping `YES` in silence | `minor` | Shipped code. Adds `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE` to the exported `WARNING_CODES` registry, which widens the exported `WarningCode` union, and adds the `applied` discriminator to the exported `UnauditableSequenceFinding`. New public surface, not a fix | `.changeset/shaggy-pumas-invent.md` |
| 6 | `372bacd` | Remove a retained private value the run did not enumerate, instead of shipping it | `minor` | Shipped code, and a new public export: `UnenumerablePrivateRemoval` is added to `src/index.ts`, with `DeidentifyReport.unenumerablePrivateRemovals` behind it. Read the incompatibility note below this table before cutting | `.changeset/brave-pandas-remove.md` |
| 7 | `15c4fea` | Replace the File Meta group and remove group 0004 on the de-identify path | `minor` | Shipped code, and two new public exports: `FileMetaDroppedElement` and `Group0004Removal` are added to `src/index.ts`, with `DeidentifyReport.fileMetaElementsDropped`, `fileMetaElementsDroppedCount`, `group0004Removals` and `group0004RemovalCount` behind them, plus `DICOM_DEIDENT_FILE_META_REPLACED`, `DICOM_DEIDENT_GROUP_0004_REMOVED` and `DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED` in the exported registry | `.changeset/olive-otters-describe.md` |
| 8 | `84f68a4` | Grant `actions: read` to the shared-workflow caller | `patch` | `.github/workflows/release.yml` only. CI configuration, not shipped code | none required |
| 9 | `b63a20a` | Guard the Release caller's permissions precondition | `patch` | `test/` only. No shipped file is reachable from a test | none required |
| 10 | `5448e93` | Raise security-flagged transitive deps via `pnpm` overrides | `patch` | `package.json` `pnpm.overrides` and `pnpm-lock.yaml`. `dependencies` is empty and stays empty, so the overrides resolve development transitives only; neither the `exports` map nor the `files` map moves | none required |
| 11 | `9defcde` | Declare the temporal state at `(0028,0303)` on every `deidentify()` run | `minor` | Shipped code, and a user-visible feature: de-identified output now carries an attribute it never carried, so a recipient reading `(0028,0303)` gets an answer where it previously got whatever the sender left there. No export is added | `.changeset/tidy-moons-declare.md` |
| 12 | `c041d23` | Propose the suite-formula repo description | `patch` | `package.json` `description` and a new `.github/repo-description.md`. Published metadata rather than shipped code by the definition above, and no behaviour, type or export moves | none required |
| 13 | `1a5d86f` | Restructure `README.md` to the house skeleton and gate it | `patch` | `README.md` and a new `test/docs/readme-structure.test.ts`. Prose and a documentation gate; `README.md` ships in the tarball but is not `src/`, the `exports` map, the `files` map or dictionary output, so no behaviour, type or export moves | none required |
| 14 | `0ba157b` | Realign the `README.md` description with `package.json` | `patch` | `README.md` alone, one line. It moves the README to match the `description` that row 12 set, so it does not change published metadata either; nothing under `src/` and no export moves | none required |

Rows 5, 6, 7 and 11 are the four that alter shipped code. Each one has a pending changeset, and the
changeset for each is at the classification this table assigns. The other ten rows are developer
tooling, CI configuration, published metadata or documentation, and none of them owes a changeset
under the definition above.

### Why four entries were re-classified, and why that is not a manufactured bump

No changeset was authored by this item. All eight pending entries already existed and already
covered their change; four of them had their bump level corrected from `patch` to `minor`, in place,
against the audit above. Nothing was invented to reach a version.

The original `patch` labels were not defects. `CLAUDE.md`'s second standing discipline says to add a
changeset at `patch` during pre-alpha and to stay on the `0.0.x` ladder until the first alpha, and
every entry followed it. Leaving that ladder is exactly what `0.1.0` is, so the entries are now
labelled by the semantic content of the change they describe rather than by the pre-alpha rule. The
rule itself is not this item's to rewrite: `S0161-release-frequency-policy` owns when a library
leaves `0.0.x`, and `CLAUDE.md` still carries the pre-alpha wording. Anyone re-reading that
discipline against this file should treat the discrepancy as an input to S0161 rather than as an
error in either place.

### AC-9 evaluated: the antecedent is false

The "no unreleased shipped change" case does not hold here. Four changes since `0.0.19` alter code
under `src/`, adding three exports to the package root entry and widening two exported registries,
so `0.1.0` is warranted on its own content. The check was run rather than assumed:
`git diff fd0b92a..main --stat -- src package.json` reports changes across `src/dataset/file-meta.ts`,
`src/deident/deidentify.ts`, `src/deident/index.ts`, `src/deident/types.ts`, `src/index.ts`,
`src/parser/warnings.ts` and `src/serialize/file-meta.ts`.

### An incompatibility already in the unreleased window

`372bacd` narrowed `UnauditableSequenceFinding.applied` from `"emptied" | "kept"` to `"emptied"`.
A consumer comparing that field against `"kept"` no longer compiles. This is recorded rather than
repaired: the change is deliberate, it is documented in `README.md` under "Known limitations and
non-goals" and in the type's own JSDoc, and its own entry states it as one of the audit-contract
changes to act on. It is named here because a reviewer reading `minor` on that entry should know
that the entry carries a source-breaking narrowing, and because this item's classification
vocabulary is `minor` or `patch` with no third slot. On a `0.0.x` release that narrowing shipped
under `patch`; on this one it ships under `minor`, and the release note carries it.

## Derived next version

Measured with the repository's own release tooling, on this branch:

```
$ pnpm exec changeset status --verbose
info Running release would release NO packages as a patch
---
info Packages to be bumped at minor
- @cosyte/dicom 0.1.0
  - .changeset/brave-pandas-remove.md
  - .changeset/great-blocks-listen.md
  - .changeset/olive-fences-return.md
  - .changeset/olive-headings-listen.md
  - .changeset/olive-otters-describe.md
  - .changeset/quiet-lines-agree.md
  - .changeset/shaggy-pumas-invent.md
  - .changeset/tidy-moons-declare.md
---
info Running release would release NO packages as a major
```

Exactly one bump, for exactly one package, at `minor`, deriving `0.1.0`. No entry derives a version
other than `0.1.0`, so there is nothing to record under the "derived something else" case and
nothing that withholds certification on that ground.

For contrast, the same command against the pending set before this item corrected the four bump
levels reported `@cosyte/dicom 0.0.20` at `patch`.

## Public API certification

The package root entry is `.`, resolving to `dist/index.mjs` / `dist/index.cjs` with per-condition
types, built from `src/index.ts`. `./package.json` is the only other export condition and carries no
names.

The complete set of names that entry exports, values and types alike, is now committed at
`test/property/public-exports.snapshot.txt`, and `test/property/public-exports.snapshot.test.ts`
compares the barrel against it on every suite run. The comparison is a set comparison in both
directions, so an export added, removed or renamed without the snapshot moving in the same change
reds the suite, and the failure names each differing export on its own line. A rename reports as one
addition and one removal, which is the honest reading: nothing on either side records that the two
are the same export under a new name.

Four properties of that guard, stated so nobody has to re-derive them:

- **It walks the barrel through the TypeScript compiler, not the built module.** A runtime
  `import * as` walk sees value exports only, and most of this package's surface is types. A type
  removed is exactly as breaking as a function removed, and `getExportsOfModule` answers both in one
  set. `export * as Dictionary` counts as the one name it binds.
- **It records names only.** No value and no rendered type text reaches the snapshot. The members of
  `WARNING_CODES` and `FATAL_CODES` are locked separately by
  `test/property/warning-codes.snapshot.test.ts`, and a file that recorded values would make every
  unrelated registry edit look like a public surface change.
- **Its size check is the committed file, not a literal.** The walk's length is asserted equal to the
  committed snapshot's length rather than against a hard-coded floor. A literal floor cannot be
  maintained against a surface that moves every phase, so it drifts downward in meaning until it
  would clear a walk that resolved a fraction of the barrel; and the equality carries one property
  the set comparison cannot see, because that comparison is over sets: a name committed twice makes
  the file disagree with the surface it claims to pin while every set difference stays empty.
- **Its boundary is stated rather than hidden.** Because the snapshot is names only, a name that
  changes from a type export to a value export, or the reverse, keeps the same name and this guard
  stays green. `typecheck`, `attw` and `typecheck:exports` are the gates that speak to that, not this
  one. Nor can any assertion inside the file separate a walk that shrinks from a snapshot regenerated
  out of that same shrunken walk, since both sides move together; the committed diff is the control
  there, which is why the surface is a file under review rather than a number in a test.

The guard carries a mutation control, in the same file, that compiles a fixture in memory, compares
it against a deliberately stale list, and requires the comparator to separate the added names from
the removed one and to name all three. A gate with no demonstrated red path is not a gate.

## Source and vendor profile surface

Every export the package root entry ships for the profile system, and every built-in profile
identifier it ships. `defer` and `document` dispositions for anything marked a break candidate are
in the next section.

| Export | Kind | Disposition | Justification |
|---|---|---|---|
| `defineProfile` | value | `stable for 0.1.0` | Signature unchanged since Phase 6 shipped; validates its input, composes through `extends`, returns a frozen profile. Nothing since `0.0.19` touched it |
| `profiles` | value | `stable for 0.1.0` | A frozen namespace object. Adding a built-in widens it without moving any existing member, so the shape a consumer already reads does not change |
| `ProfileDefinitionError` | value | `stable for 0.1.0` | Thrown by `defineProfile` on invalid input; class name and construction unchanged |
| `Profile` | type | `break candidate` | `escalations` and `suppressions` are `ReadonlySet<WarningCode>`, so every `WarningCode` added to the registry changes this type. The unreleased window added members to that registry, and the deident work is not finished |
| `PrivateTagDefinition` | type | `stable for 0.1.0` | Three required fields, `vr` / `keyword` / `name`, unchanged since Phase 6 |
| `DefineProfileOptions` | type | `stable for 0.1.0` | Optional-field shape unchanged. `escalate` and `suppress` carry `WarningCode`, which moves with the registry, but they are optional arrays rather than a closed set a consumer must satisfy |
| `ProfilePrivateTags` | type | `stable for 0.1.0` | A `Readonly<Record<string, PrivateTagDefinition>>` alias; changes only if `PrivateTagDefinition` does |
| `profiles.ge` | built-in | `stable for 0.1.0` | Vendor private-dictionary overlay. Keyed canonically as `GGGGxxLL` by live Private Creator, never by a hard-coded block number, so a vendor block re-assignment does not move it |
| `profiles.siemens` | built-in | `stable for 0.1.0` | Same construction |
| `profiles.philips` | built-in | `stable for 0.1.0` | Same construction |
| `profiles.strict` | built-in | `break candidate` | A posture preset is a set of escalations, so adding a Tier-2 code to it moves every consumer's parse. `CLAUDE.md` records that `profiles.strict` is not `{ strict: true }` and that changing a shipped preset is its own measured change |
| `profiles.lenient` | built-in | `break candidate` | Same reasoning in the other direction: a suppression added or dropped changes which warnings a consumer of the preset sees |

The five identifiers above are the whole of the built-in set: three vendor overlays and two posture
presets, as `src/profiles/index.ts` freezes them. `ge`, `siemens`, `philips`, `strict` and `lenient`
are also exported individually from `src/profiles/index.ts`, but that module is not a package export
condition, so the `profiles` namespace is the only route a consumer has to them.

## Break candidates and dispositions

A break candidate is a public export this audit judges likely to change incompatibly after `0.1.0`.
`defer` means it ships unchanged in `0.1.0` and the question is deferred. `document` means it ships
with the explicit stability caveat recorded here. Every export named below is present and unrenamed
on this branch; none of them was touched.

| Export | Disposition | Reason |
|---|---|---|
| `WARNING_CODES`, `WarningCode` | `document` | The registry gained members inside the unreleased window and the de-identification work is not finished, so it will gain more. Adding a member widens the exported union, which is additive for a consumer narrowing on a name and breaking for one with an exhaustive switch over the union. Treat the union as open |
| `UnauditableSequenceFinding` | `document` | `applied` is a single-member union today, having been narrowed from two members inside this window. Widening it again is a compile break for any exhaustive switch, and the field's whole purpose is to discriminate outcomes, so it is the field most likely to move |
| `DeidentifyReport` | `document` | It gained four fields inside this window. It is a return type rather than a parameter type, so additions do not break construction, but a consumer that spreads or exhaustively destructures it sees each addition. Read it by field name |
| `DEIDENTIFY_OPTIONS`, `DeidentifyOption` | `document` | `RetainLongitudinalTemporal` carries the full-dates column of PS3.15 Annex E's two Retain Longitudinal Temporal Information Options. `CLAUDE.md` records that splitting that one name into the two the standard defines is a public-surface change deliberately not made. If it is made, this option name changes meaning or disappears |
| `Profile` | `document` | Carries `ReadonlySet<WarningCode>` in two fields, so it inherits the registry's openness above |
| `profiles.strict`, `profiles.lenient` | `defer` | The presets ship unchanged in `0.1.0`. Whether a newly added Tier-2 code belongs in `strict` is a per-code product question, and answering it in a release-prep item would move every consumer's parse as a side effect |
| `DicomParseError` | `document` | `snippet` carries raw source bytes and is therefore PHI, which is a posture rather than a defect. Any future bound on it changes what the field contains for an existing consumer. See "PHI posture" |
| `Element.byteOffset`, and a warning's `position.byteOffset` | `document` | `CLAUDE.md` records that the value disagrees with itself inside a sequence item, file-absolute in one encoding and item-relative in the other, and that no frame-of-reference contract is documented either way. Pinning a contract later necessarily changes one of the two readings. Measure it rather than relying on a description |

Two things this section deliberately does not do. It does not rename, remove or re-shape any of the
exports above, because that is a change to shipped code and this item forbids one. And it does not
promise that `0.1.0` freezes the surface: `CLAUDE.md` puts the package at phases 4 through 7 of 8,
so phase 8 is still ahead of it.

## PHI posture

The blast radius of this package is that imaging headers carry PHI and a header-handling change can
leak patient identity out of a study nobody re-inspects. This item touched nothing on that path: no
file under `src/` was edited, no fixture was added, and no log line was added.

The posture below is an INDEX into the disclosures, not a census of them, and it is written that way
on purpose. `CLAUDE.md` states that its own residual list is an index, that each relocated section
names its own residuals, and that several are disclosed only there. Read the section before drawing
any conclusion about a class, and do not read the absence of an entry here as an all-clear. Nothing
in this document asserts that any residual class is closed, and no residual is restated here as a
number.

Open residuals, each with the `documentation/agent-notes.md` anchor that discloses it:

- Over-declaring `OB` / `OW` / `US` / `UN` leaf carriers leak through the de-identify path, silently.
  Marked `PRE-EXISTING`.
  [`#dicom-carrier-leaf-leaks`](agent-notes.md#dicom-carrier-leaf-leaks)
- The relocation under `DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ` stands and is undecidable: the two
  files a bound would tell apart are byte-identical.
  [`#dicom-item-crosses-residuals`](agent-notes.md#dicom-item-crosses-residuals) ·
  [`#dicom-explicit-vr-unbounded-item-read`](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- `report.removedPrivateTags` can echo document content out of a fabricated odd-group header, and
  `uidMap`, `unauditableSequences[].tag` and `contextPath` are named beside it. `contextPath` is
  bound by nothing and uncorroborated by anything else in the output.
  [`#dicom-unrecognized-vr-short-form`](agent-notes.md#dicom-unrecognized-vr-short-form) ·
  [`#phi-warning-message-leak`](agent-notes.md#phi-warning-message-leak)
- A failed CP-246 `UN` descent emits nothing. The honest test for a consumer is
  `el.items === undefined`, not `ds.warnings`.
  [`#dicom-implicit-sq-not-descended`](agent-notes.md#dicom-implicit-sq-not-descended)
- The Tier-3 fatal snippet cut under `{ strict: true }` is raw source bytes and is PHI. An honest
  frame made it more certainly the named element's content, not less.
  [`#dicom-fatal-message-registry`](agent-notes.md#dicom-fatal-message-registry)
- Diagnostic residuals around `renderTag` membership and raw wire numbers, including the exceptions
  that live in `warnings.ts`.
  [`#dicom-diagnostic-phi-residuals`](agent-notes.md#dicom-diagnostic-phi-residuals) ·
  [`#dicom-overdeclare-swallows-into-value`](agent-notes.md#dicom-overdeclare-swallows-into-value)
- The undefined-length item with no `(FFFE,E00D)`, which has no declared length to disagree with, so
  no over-run is recordable.
  [`#dicom-explicit-vr-unbounded-item-read`](agent-notes.md#dicom-explicit-vr-unbounded-item-read)
- `(0012,0063)` carries the file's own de-identification method text into output, disclosed under two
  codes, with the `LO` length behaviour beside it.
  [`#dicom-deident-not-a-fixed-point`](agent-notes.md#dicom-deident-not-a-fixed-point) ·
  [`#dicom-lo-length-and-silent-replace`](agent-notes.md#dicom-lo-length-and-silent-replace)
- `ds.warnings` itself is uncapped, package-wide and pre-existing, so an attacker-chosen element
  count multiplies it.
  [`#dicom-deident-rawbytes-passthrough`](agent-notes.md#dicom-deident-rawbytes-passthrough) ·
  [`#dicom-carrier-leaf-leaks`](agent-notes.md#dicom-carrier-leaf-leaks)
- `makeEmitter` hands warnings to `onWarning` before the pop that undoes them, so a streaming
  consumer sees warnings `ds.warnings` does not. Disclosed, not fixed.
  [`#dicom-explicit-vr-unbounded-item-read`](agent-notes.md#dicom-explicit-vr-unbounded-item-read) ·
  [`#dicom-implicit-sq-not-descended`](agent-notes.md#dicom-implicit-sq-not-descended)
- A tag collision destroys the original element's value in place, on the private path as well as on
  `(0010,0020)`. The loss is reported and is otherwise unchanged.
  [`#dicom-tag-collision-destroys-element`](agent-notes.md#dicom-tag-collision-destroys-element)
- The File Meta group loses a duplicate the opposite way round, and an array is not safety there.
  [`#dicom-file-meta-drops-duplicate`](agent-notes.md#dicom-file-meta-drops-duplicate)
- The private-attribute retention and ejection routes, and what a `Profile` does and does not vouch
  for.
  [`#dicom-private-creator-reservation-leak`](agent-notes.md#dicom-private-creator-reservation-leak) ·
  [`#dicom-private-sq-carve-out`](agent-notes.md#dicom-private-sq-carve-out) ·
  [`#dicom-private-sq-parse-vr`](agent-notes.md#dicom-private-sq-parse-vr) ·
  [`#dicom-item-eject-route`](agent-notes.md#dicom-item-eject-route)
- `deidentify()` output is metadata-de-identified only. Burned-in annotation is warned about and not
  removed, and `README.md` says so under "Known limitations and non-goals".
  [`#phi-warning-message-leak`](agent-notes.md#phi-warning-message-leak)

The PHI diagnostic gate does not make the surface PHI-free and must not be described that way. That
sentence is `CLAUDE.md`'s and is repeated here because a release document is exactly where somebody
would be tempted to round it up.

Consumer-facing consequence for the cut: `0.1.0` is the first minor release of a package whose
de-identification path carries the open residuals above. The release note that the changesets
generate carries the per-change disclosures; this document is the index, and the anchors are the
authority.

## Release timing and the S0161 gate

**The `0.1.0` cut is gated on `S0161-release-frequency-policy` landing. This item performs
preparation only.**

S0161 owns the policy question of when a library leaves the `0.0.x`-until-first-alpha ladder and how
often it cuts. No content of that policy is read, quoted or relied on anywhere in this document, and
nothing here waits on it to be checkable: the classification, the derived version, the export
snapshot and the gate results are all properties of this repository at the audit head. If S0161
never lands, this document is still accurate about what is in the repository; what it cannot do is
authorise the publish.

The remaining steps, which are explicitly NOT performed here, are the mechanical ones: `pnpm version`
(which runs `changeset version`, `scripts/sync-version.mjs` and a Prettier pass), a review of the
generated `CHANGELOG.md` and `src/version.ts`, and `pnpm release`. Publishing is irreversible: a
version cannot be unpublished or re-cut under the same number.

## Release gates

Run from the repository root on this branch, at the audit head plus this item's changes. Every gate
passed, so there is no verbatim failure output to record and nothing that withholds certification on
gate grounds.

| Gate | Command | Result |
|---|---|---|
| typecheck | `pnpm run typecheck` | PASS. `tsc --noEmit`, no diagnostics |
| lint | `pnpm run lint` | PASS. ESLint at `--max-warnings=0` over `src`, `scripts` and `test` |
| test | `pnpm run test` | PASS. 84 test files, 1546 passed and 1 todo of 1547 |
| build | `pnpm run build` | PASS. `tsup` emitted `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts` and `dist/index.d.cts` |
| attw | `pnpm run attw` | PASS. `scripts/attw.mjs`, not the bare CLI. No problems found; `node10`, `node16` from CJS, `node16` from ESM and `bundler` all green for `.` and for `./package.json` |
| typecheck:exports | `pnpm run typecheck:exports` | PASS. `scripts/attw.mjs --profile node16`. No problems found, `node10` ignored by profile |

The `attw` and `typecheck:exports` scripts run `scripts/attw.mjs` rather than the bare CLI on
purpose: the bare CLI reports "does not contain types" and exits 0, so the wrapper is the gate.
[`#the-attw-wrapper-gate`](agent-notes.md#the-attw-wrapper-gate)

A suite count is a moving base and is not a fact without its sha, so both figures here carry one and
both were measured rather than derived. On this branch, whose base is `0ba157b`, the suite reads 84
test files and 1546 passed with 1 todo of 1547. The same suite checked out at `0ba157b` itself, with
this item's guard absent, reads 83 test files and 1544 passed with 1 todo of 1545. The difference is
this item's one added test file and the two tests in it.

## Version and source-tree state

Both checked immediately before the pull request was opened.

- `package.json` reads `"version": "0.0.19"`. No version bump was performed.
- `CHANGELOG.md` has no `0.1.0` heading. The file is generated from the changeset summaries and was
  not hand-edited; the pending entries under `.changeset/` are still pending.
- `git diff --quiet main -- src` exits 0. Every file under `src/` is byte-identical to the branch
  point, so no parser, serializer, de-identification or logging behaviour moved under a release-prep
  item.
- No git tag was created and no GitHub release was drafted.

The audit did surface a defect-shaped observation, the `UnauditableSequenceFinding.applied`
narrowing recorded above. Per this item's contract that is recorded as a finding rather than
repaired here.

## Unverified

- **The currently published version of `@cosyte/dicom` on the npm registry.** UNVERIFIED. Resolving
  it needs a registry request (`npm view @cosyte/dicom version`), and the environment this audit ran
  in has no egress to the npm registry and no npm credentials, so the command could not be run. The
  expected answer is NOT presented here as a measured one. This matters more for this package than
  the phrasing suggests: `README.md` records that `package.json` once carried `0.0.9` while the
  publish never happened (an npm `E404`), so the registry has been behind this repository before.
  **Whoever cuts `0.1.0` must resolve the published version first and confirm that the release is
  being cut from `0.0.19` and not from something earlier.** If the registry is behind, the changeset
  set here still derives `0.1.0` from `package.json`, and whether that is the right published
  successor is a question this document cannot answer offline.
- **Everything else in this document was measured**, on this branch, with the commands quoted beside
  each claim.
