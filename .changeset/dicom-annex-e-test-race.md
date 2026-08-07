---
"@cosyte/dicom": patch
---

Test infrastructure: the generator suites prove their pins in a sandbox, so nothing mutates the
vendored standards while another worker is reading them.

**The pin is not relaxed. The mutation is relocated.** Both generator suites prove their vendored
DocBook pins are preconditions rather than comments, and the only way to prove that is to defeat one:
repoint `vendor/nema/<part>/SHA.txt` at a mutant document, and, for the check that re-hashes the
CONTENT rather than the pointer, overwrite the bytes at the pinned path itself. Vitest runs test files
in parallel, so for as long as a mutation was live every other worker saw it. The documentation
citation gate re-hashes PS3.5, PS3.6 and PS3.15 at **module load**, which made it a fresh concurrent
reader of exactly those files, and a reader that throws at module load takes its whole file down
rather than one case. The generators now run against a `mkdtemp` copy of `scripts/`, `src/` and
`vendor/`, so there is nothing for a concurrent reader to observe.

**Neither generator took a new input, which is what makes this affordable.** Both resolve their own
repository root from `import.meta.url`, so relocating the script relocates the document it reads and
the artifact it writes. The byte-identical regen gate keeps depending on a script with no vendor-root
argument and no output-path argument; the new `root` option is on the test helper that spawns them,
not on the scripts. The artifact comparison still reads the **committed**
`src/dictionary/generated/` file as its baseline, so "regenerates what is committed" still means that.

**The window was measured, and so was the fix.** A probe running the citation gate's own `readPinned`
in a loop, against ten runs of the two generator suites, logged 1,542 read cycles and 953 anomalous
observations in four classes: `SHA.txt` holding a non-hash, `SHA.txt` naming a directory not on disk,
the file at the pinned path not hashing to its pin, and the one that matters most, **a pin that
verified against a document that is not the committed one**. A mutant is written into a directory
named by its own hash, so re-hashing it succeeds: an integrity check cannot see that at all, and the
reader resolves clauses against a mutated standard and reports green. A SHA pin rewritten mid-run
means the thing being corrupted is the integrity check itself, which is why teaching a reader to
tolerate a writer was never on the table. Same probe after the change: 1,437 read cycles, zero
observations of any class. End to end, looping the reader file against ten runs of the two mutating
suites: ten of 31 reader runs failed before, zero of 30 after. Both controls were run, because a clean
after-figure is also what a dead probe prints.

**This also closes a flake the repeating-groups suite had disclosed and declined to fix**, and its
disclosure is deleted rather than reworded: the two generator suites raced each other through
`src/dictionary/generated/`, which reaches the whole test run and not just those two files, because
the shipped library imports both artifacts. It was declined then because the obvious fix was an
output-path override on a script the regen gate depends on. Relocating the tree costs the generators
no new input at all, so that trade is not the one on the table any more.

No library code changed, and no public surface moved.
