---
"@cosyte/dicom": patch
---

Point the repo's PHI gate at the corpus it was named for (`PHI-SCAN-WALK-ROOT-SCOPE`).

`scripts/phi-scan.ts` rooted its walk at `test/fixtures/`, and every file this package writes there
is gitignored because the suite regenerates it on each run. So the fixture corpus contributed exactly
zero files and an all-mode run opened thirteen: the README and the twelve pages under
`docs-content/`. Against 226 tracked files at `8982a16`, 213 were scanned by neither route, 82 of
them under `test/`.

That mattered here more than the number suggests, because this package ships no committed `.dcm`
files at all: every fixture it owns is built in a `.ts` source by `test/helpers/build-dicom.ts`, so
the whole committed fixture corpus was in the 81 tracked files the walk root excluded. The root is
now `test/`, which replaces `test/fixtures/` rather than joining it so the roots stay disjoint, and
`--staged` covers the same three roots. Head opens 95 of 229 tracked files. All 81 newly opened files
were hand-read before this landed and none carries patient-identifying content; the synthetic fixture
names and dates the gate now sees are listed as exact entries in `scripts/phi-allow-list.txt`, never
as prefixes.

Enumerating buys the recognizer floor and nothing else, so the second half shipped with it.
`scanEmbeddedObjects` decoded base64 DICOM objects only for a name in `TEXT_EXTENSIONS`. Measured on
`8982a16` with one object and one name-bearing PatientName: found as `probe.md`, found as
`probe.dcm`, and `OK - no hits` as `probe.ts`. The decode now runs on the non-`isDicom` branch too,
in addition to the text sweep and never instead of it.

Four shapes let a declared root go unopened while the gate printed clean, all measured on
`8982a16` and all now refusals with exit 2, the code this script's own contract gives an invocation
error: a missing root (exit 0), a dangling symlink at a root (exit 0, because `existsSync` follows
the link and answers false so the walk returned before `readdirSync`), a symlink at a real directory
(exit 0, followed and walked), and a regular file at a root (exit 0 at `test`, and an uncaught
`ENOTDIR` exiting 1 at `test/fixtures`). Existence is not observation, so the emptied-root half is
closed separately by reconciling the walked set against `git ls-files`: every tracked path under a
declared root must be opened, gitignored or corpus-exempt, and anything else refuses. No scanned-file
count is printed, deliberately: a count counts the roots that did exist.

Still open and disclosed rather than claimed away: the reconciliation compares path sets, not the
bytes git carries at those paths, so a working tree that mirrors the tracked names still exits 0 over
decoy contents. A test pins that escape rather than a fix. Widening the root makes it narrower, not
closed. Also unchanged: `src/`, `vendor/`, `scripts/` and the root files are still outside the
declared scope, because a generated DICOM tag table produces hundreds of matches on tag numbers that
satisfy the `YYYYMMDD` shape and a pinned standards document is full of real publication dates.
Admitting them is a product call with its own false-positive surface.

The one corpus exemption is the one that was already here,
`test/fixtures/phi-scan/README.md`, which documents the deliberate violator values. It is now scoped
to a `readme.md` under `test/fixtures/` rather than to any `readme.md` the walk meets, so widening
the root did not widen it, it is printed on stdout every run, and `--staged` applies it too, which
ends a disagreement where committing that README red the pre-commit hook while all-mode called it
exempt. No new exemption was added: the values the scanner's own tests must have it reject are
assembled at runtime in `test/helpers/phi-scan-violators.ts`, so that file is scanned like any other.

Gate-only: no runtime, API or parser behaviour changes, and no published surface moves.
