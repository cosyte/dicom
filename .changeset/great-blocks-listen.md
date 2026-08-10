---
"@cosyte/dicom": patch
---

Model CommonMark's HTML blocks in the PHI gate's override log, so a comment cannot exempt a scan
target.

`scripts/phi-scan.ts` refuses a `--allow-fixture <path>` bypass unless `phi-scan-overrides.md`
carries a `### <path>` heading, and its block structure was fenced code blocks and nothing else. A
fenced block shows its contents to a reviewer; an HTML comment shows nothing at all, so a heading
written inside `<!-- -->` was a live allow entry that exempted its target at exit 0 while the
rendered log looked empty. `overrideLogPaths` now models CommonMark 0.31.2 section 4.6's HTML
blocks, start conditions 1 to 6 and their end conditions, and ignores fences and headings inside
one exactly as section 4.6 requires.

Start condition 7 is deliberately out of scope, and its cost is measured in both directions rather
than assumed: it needs a complete tag AND the knowledge that the line does not interrupt a
paragraph, which is paragraph state this parser does not have. A heading under `<span>` on its own
line is still a live entry here where CommonMark hides it; after a paragraph line, where condition
7 cannot fire, the two agree. Both arms are pinned by tests.

No direction is claimed. A block boundary is parity, and on a log carrying an odd number of fence
delimiters inside a comment the two readings' entry sets are disjoint and both non-empty, each
exempting at exit 0 a target the other refuses at exit 2. The tag lists section 4.6 closes over are
read out of the vendored spec and driven name by name through the `--allow-fixture` membership
oracle, so the tables are checked against the document rather than against whoever typed them, and
no count of either is written anywhere. `scripts/measure-phi-scan-html-blocks.ts` ships beside the
change so the figures can be re-run against any tree.
