---
"@cosyte/dicom": patch
---

Gate the public surface against internal project bookkeeping, and sweep the tree it would have failed.

`no-internal-refs.yml` and `scripts/check-no-internal-refs.ts` enforce the founder directive of
2026-07-27 on every surface a consumer of `@cosyte/dicom` reads: the published markdown at the
repository root, `docs-content/`, the npm `description` and `keywords`, and all of `src/`. Work-item
and plan ids, phase and wave language, roadmap and plan citations, ADR numbers, meta-repo paths and
commentary about how the work is being run are findings; `CHANGELOG.md`, `.changeset/`, commit
messages, pull request text, `test/`, `.github/` and this repository's agent-context docs are
excluded, because those are the surfaces the identifiers belong on.

The gate self-tests before it reports: every rule has to match its own positive sample, a DICOM
reference corpus (`PS3.6`, `(0010,0010)`, `PN`, `UI`, `DICOM-SR`, `1.2.840.10008.1.2.1`,
`ICD-10-CM`, `CP-246`, `MRN-42` and the rest) has to survive every rule untouched, and the scope
function has to classify a fixed list of paths the way the rule says. It refuses to print a result
from a scan that read nothing, from a declared surface that selects no tracked file, or from a file
in scope it could not read or could not decode as UTF-8. There is no list of excused occurrences and
there must not be one.

The sweep is the other half, and it is why this is a `patch` rather than a chore: 530 findings, 526
of them in `src/` comment blocks that `tsup` copies verbatim into the published `dist/index.d.ts` and
`dist/index.d.cts`, against 4 in markdown anyone reviews. Comment and documentation TEXT is rewritten
and nothing else: no exported symbol, signature, message string or runtime behaviour changes, and the
build, the type declarations' shape, the lint ladder and all 1,586 tests are unchanged.
