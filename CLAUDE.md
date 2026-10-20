# @cosyte/dicom

Our DICOM Part 10 parser and utility library for Node.js and TypeScript, published to npm under MIT.
It reads vendor-quirky files leniently with coded warnings, writes spec-clean Part 10, and de-identifies header metadata per PS3.15 Annex E.
Pixel data stays raw bytes; DIMSE and DICOMweb are out of scope.

## Gate

From the repo root, in this order. `.github/workflows/ci.yml` runs this ladder on Node 22 and 24 through the shared Cosyte `ci.yml`.
First put the pnpm that `packageManager` pins on PATH (`corepack enable pnpm --install-directory <dir>`, then prepend `<dir>`): another major refuses the frozen lockfile, and `test/docs-content.test.ts` shells out to `pnpm build`.

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm format:check`
5. `pnpm phi-scan`
6. `pnpm test`
7. `pnpm test:coverage` (per-directory floors live in `vitest.config.ts`)
8. `pnpm build`
9. `pnpm attw`
10. `pnpm check:no-emdash` (`.github/workflows/no-emdash.yml`, which also scans the PR title, body and commit messages)
11. `pnpm check:no-internal-refs` (`.github/workflows/no-internal-refs.yml`)

After the build, the `examples` job in `ci.yml` runs the scripts `typecheck:examples`, `lint:examples`, `examples` and `phi-scan:examples`.
A change to a path `.github/workflows/dictionary-regen.yml` watches (`vendor/`, the generators in `scripts/`, `src/dictionary/generated/`, `package.json`) also runs it: `pnpm gen:clean`, `pnpm gen:all`, then `git diff --exit-code src/dictionary/generated/` must print nothing.
CI also loads `dist/` as ESM and as CJS, runs actionlint (CI installs it), and checks the manifest and installs the packed tarball into a clean directory; none of these has a script here.
Required on `main`: `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)`, `ci / actionlint` and `no-emdash / tracked-files`.
A change that reaches the published package adds a changeset (`pnpm changeset`).

## Hazard

DICOM headers carry PHI: patient names, IDs, birth dates, accession numbers, free text, and private tags whose content only the sender knows.
A change to how headers are parsed, kept, written or reported can carry a patient's identity out of a study inside `deidentify()` output that reports itself clean, and nobody reads those headers again.
Treat every header byte as PHI, including bytes a wrong length moved into the wrong element, and every diagnostic as a route out.

## Rules

Each rule names the pull request in this repo that fixed the failure behind it (`gh pr view <n>`).

- Diagnostics take no string from the file: messages come by code from the frozen registries in `src/parser/warnings.ts` and `src/parser/fatals.ts`, and factories take a position and structural constants. (#48, #80)
- A diagnostic names an element only through `renderTag` or `renderVr`, which check membership in a closed table; never render a raw tag, length or byte from the wire, `position.byteOffset` locates it. (#55, #88, #90, #92, #93)
- Cap every diagnostic a file can multiply once per run, on `DeidentifyContext`, not on `ProcessResult`: #53 shipped one unbounded. (#54)
- Keep the Annex E table current with the dictionary, and move the PS3.6 and PS3.15 pins under `vendor/nema/` together: `deidentify()` keeps a registered tag the table lacks, which once kept 35 identifying attributes behind a clean report. (#38, #146)
- PS3.15's repeating-group rows are masks over the even groups `5000`-`501E` and `6000`-`601E`, not exact tags: matched by exact tag, `(6000,4000)` Overlay Comments survived with a clean report. (#39, #40)
- Private block reservations are scoped per Data Set at every depth, on parse and on de-identify: an Item starts with an empty creator map and inherits the charset, not the reservations. (#48, #49)
- A retention decision never decides the Data Sets nested in the retained value: walk a vouched-for private `SQ`, never keep it verbatim. (#77)
- A report never reads as a scrub the run did not perform: a private value the run did not walk is removed and reported, not kept under `PatientIdentityRemoved = YES`. (#119, #121)
- An over-declaring element and a well-formed one are byte-identical, so the remedy is at the de-identify boundary or a warning, never a parser bound; a moved element can replace one with the same tag in the Data Set's `Map`. (#51, #70)
- Hand a descent the slice cut at its declared end, never the whole buffer, or the same bytes are read twice (#50); descend in one pass, as a try-then-fallback cost 2^depth. (#51)
- A PHI test needs a name-bearing payload and a mutation control that turns it red; a benign payload cannot fail. (#55)
- Quote a "red on base" test count only with its sha, re-run after every test you add or strengthen, with `src/` replaced rather than overlaid. (#71)
- Locate a spec section by its normative sentence: collect every heading match, keep those holding the sentence, require exactly one. First match reads the table of contents. (#40)
- Cite the clause that holds the sentence: PS3.5 §7.5.2 for an `SQ`'s own length and §7.5.1 for an Item's, PS3.15 §E.1.1 not §E.1, and §E.3.10 whole, both branches; `test/docs/spec-citations.test.ts` checks the docs. (#50, #54, #66)
- Run attw only as `pnpm attw` or `pnpm typecheck:exports` (both run `scripts/attw.mjs`): the bare CLI exits 0 when the declarations are missing. (#59)
- `CHANGELOG.md` is generated from changesets: never hand-edit it or add an `[Unreleased]` heading, under which ten versions shipped calling released work unreleased. (#82)
- A changeset's opening sentence fits in 200 characters: the release gate refuses a longer one after the version commit, and nothing publishes. (#42, #57)
- `packageManager` is the only pnpm pin in CI: a `version:` input to `pnpm/action-setup` failed every regen run for weeks. (#34)
