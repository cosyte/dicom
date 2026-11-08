# @cosyte/dicom

Our DICOM Part 10 parser and utility library for Node.js and TypeScript, published to npm under
MIT: lenient reads with coded warnings, spec-clean Part 10 writes, and PS3.15 Annex E header
de-identification. Pixel data stays raw bytes; DIMSE and DICOMweb are out of scope.

@AGENTS.md

## Gate

Required on `main`: `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)`,
`ci / actionlint`, and `no-emdash / tracked-files`; CI also runs Node 26 and the `examples` and
`standards` jobs. Use the pnpm `packageManager` pins (AGENTS.md says how). In CI order:

```sh
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check
pnpm phi-scan && pnpm test && pnpm test:coverage && pnpm build && pnpm attw
pnpm typecheck:examples && pnpm lint:examples && pnpm examples && pnpm phi-scan:examples
pnpm check:readme && pnpm check:claude-card && pnpm check:catalog
pnpm check:no-emdash && pnpm check:no-internal-refs
```

A change to `vendor/`, the generators, or `src/dictionary/generated/` also runs `pnpm gen:clean`,
`pnpm gen:all`, then `git diff --exit-code src/dictionary/generated/`, which must print nothing.

## Hazard

DICOM headers carry PHI: names, IDs, birth dates, accession numbers, free text, and private tags
only the sender understands. A change to how headers are parsed, kept, written, or reported can
carry a patient's identity out inside `deidentify()` output that reports itself clean, and nobody
reads those headers again. Treat every header byte as PHI, including bytes a wrong length moved,
and every diagnostic as a route out.

## Rules

- Diagnostics take no string from the file: messages come by code from the frozen registries in
  `src/parser/warnings.ts` and `src/parser/fatals.ts` (#48, #80).
- Name an element only through `renderTag` or `renderVr`, never a raw tag, length, or byte from
  the wire (#55, #88, #90, #92, #93).
- Cap a diagnostic a file can multiply once per run, on `DeidentifyContext` (#53, #54).
- Keep the Annex E table current with the dictionary, and move the PS3.6 and PS3.15 pins under
  `vendor/nema/` together: a tag the table lacks is kept (#38, #146).
- PS3.15 repeating-group rows are masks over the even groups `5000` to `501E` and `6000` to
  `601E`, never exact tags (#39, #40).
- Private block reservations are scoped per Data Set at every depth, on parse and de-identify (#48,
  #49), and a retained private `SQ` is walked, never kept verbatim (#77).
- A private value the run did not walk is removed and reported, never kept as clean (#119, #121).
- An over-declaring element is remedied at the de-identify boundary or by a warning, never by a
  parser bound (#51, #70).
- Hand a descent the slice cut at its declared end (#50), and descend in one pass (#51).
- A PHI test needs a name-bearing payload and a mutation control that turns it red (#55); quote a
  "red on base" count only with its sha, `src/` replaced rather than overlaid (#71).
- Locate a spec section by its normative sentence (#40) and cite the clause that holds it, which
  `test/docs/spec-citations.test.ts` checks (#50, #54, #66).
- `pnpm attw` runs `cosyte-attw`, never the bare `attw` CLI, which exits 0 with no types (#59).
- Changesets write `CHANGELOG.md`: never hand-edit it or add an `[Unreleased]` heading (#82), and
  keep a changeset's opening sentence under 200 characters (#42, #57).
- `packageManager` is the only pnpm pin in CI (#34).
