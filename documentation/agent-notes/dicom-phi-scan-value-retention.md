# dicom - the PHI gate's hit excerpt now OWNS its bytes (2026-08-09)

`DICOM-RESIDUALS`, the slice `dicom-phi-scan-value-excerpt.md` deferred in its own words: _"V8 returns
a sliced string from `raw.slice(0, 194)`, which retains its parent. So `HitValue.text` is bounded
logically while the hit may still retain the whole payload in memory."_ Written here rather than in
`documentation/agent-notes.md` because that file is over its 250,000-byte budget on `main` and the
hook refuses growth (ADR 0023). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Derive the headroom, never restate it: `git show origin/main:CLAUDE.md | wc -c` against this
repo's entry in the meta-repo's `.claude/hooks/doc-budget.mjs`. It is a handful of bytes, which is
not a line. So the rule lives where a worker touching this code reads it: the JSDoc on
`excerptValue`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: a hit does NOT retain the payload its excerpt was cut from"`, and this file.

**Provenance.** Every figure below was measured on the tree that shipped, against base **`88be779`**
restored **by file copy**, and is re-derivable:

```
git show 88be779:scripts/phi-scan.ts > /tmp/base-phi-scan.ts
pnpm measure:phi-scan-retention /tmp/base-phi-scan.ts
```

## The defect

`excerptValue` cut the value with `raw.slice(0, MAX_HIT_VALUE_LENGTH)`, and the value it was handed
was itself either a regexp match against a file's whole decoded text or a trimmed decode of an
element's declared span. **V8 answers both with a string that points into its parent.** So a 19
character name matched inside an 8 MiB page produced an excerpt whose 19 characters kept the 8 MiB
page alive for the rest of the run, and `hits` lives for the whole run.

**BOTH BRANCHES LEAKED, AND THE SHORT ONE IS THE EASY ONE TO MISS.** The truncating branch is the
obvious carrier, but a value already under the bound is returned unchanged, and a regexp match under
the bound is a pointer too. Fixing only the branch that cuts would have left the text sweep's PN
route, which is the route that finds names, retaining exactly as much as before.

## The instrument, and why the obvious one reads zero

`scripts/phi-scan.ts` is synchronous from its first line to its last, so **nothing on its event loop
runs while it is scanning.** A `setInterval` sampler preloaded into it fires once before the scan and
once after it, when `hits` is already unreachable; both readings are about an idle process. That was
measured, not assumed: the first sampler built for this slice reported the same 5.1 MiB for a 16 MiB
corpus and for a 160 MiB one, which is what a sampler that never fires looks like.

**A GENERATOR IS AN INSTRUMENT.** Three further readings were discarded for the same class of reason
before the shape below was settled on, and each is worth knowing:

- **`--max-old-space-size` does not bound this at all.** A string produced by `Buffer.toString()` is
  counted in `process.memoryUsage().external`, not in `heapUsed`, and the old-space limit does not
  apply to it. Base finished a 80 MiB corpus under `--max-old-space-size=16`. **The retained payload
  is invisible to the heap limit**, which makes it harder to notice rather than safer.
- **Peak RSS is swamped by garbage.** Polling `/proc/<pid>/status` VmHWM separated base from the fix
  by 16 MiB on a corpus where the real difference is 64, because a hit-free control already read
  159.5 MiB of uncollected transient.
- **An at-exit reading measures garbage too.** Without a forced GC it reported an `external` that
  went DOWN as the corpus grew.

What works: preload an observer that hooks `fs.readFileSync`, so it runs **inside** the scan, once
per file, with `hits` live, and force a full GC before reading `process.memoryUsage()`. The observer
lives in the test and in the measurement script; `scripts/phi-scan.ts` is not touched and runs
exactly as it ships.

**🩺 THE INSTRUMENT IS VERIFIED BEFORE ANY NUMBER IT PRINTS IS BELIEVED.** Every corpus is scanned
twice: once with one PN-shaped token per file, and once byte-for-byte the same size with no token in
it. The second is the negative control, and it is what says a retention difference is the doing of
the hits rather than of the corpus. The harness throws rather than reports if the positive corpus
does not produce exactly one hit per file, if the observer did not fire once per file, or if the
control is not clean.

## What it measures

Retained peak, forced GC, sampled once per file during the scan:

| corpus               | base `88be779` | shipped  | hit-free control, base / shipped |
| -------------------- | -------------- | -------- | -------------------------------- |
| 2 x 8 MiB = 16 MiB   | 34.0 MiB       | 33.6 MiB | 26.0 / 25.6 MiB                  |
| 5 x 8 MiB = 40 MiB   | 58.0 MiB       | 33.6 MiB | 26.0 / 25.6 MiB                  |
| 10 x 8 MiB = 80 MiB  | 98.0 MiB       | 33.7 MiB | 26.0 / 25.7 MiB                  |
| 20 x 8 MiB = 160 MiB | 178.0 MiB      | 33.7 MiB | 26.0 / 25.7 MiB                  |

**Base grows by one whole file per hit-bearing file. The shipped tree does not grow at all.** Three
repeats of every cell agreed to the tenth of a MiB. **At two files the two trees read the same**, and
that row is kept rather than dropped: the fix buys nothing on a small corpus, and a table that only
showed the loud rows would be arguing rather than reporting.

## The shape, which is the same one `#109` used

The copy is inside **`excerptValue`, the only constructor of `HitValue`**, so it is on the slot and
not on a caller. There is no `hits.push` that can put a pointer-into-a-payload on a hit, for the same
reason there is none that can put an unbounded string on one.

**The round trip is `utf16le`, and `utf8` would have been a silent value corruption.**
`Buffer.from(s, "utf8")` turns an unpaired surrogate into U+FFFD, so the report would print a
character the file does not contain, which is the same class of wrong answer as printing too much.
`utf16le` round-trips all 65,536 code units, paired or not; that was checked by sweeping every one of
them, plus lone surrogates either side and an astral pair, through the candidate. **That no caller
can hand this an unpaired surrogate today is exactly the reasoning this slot exists to not depend
on.**

## The superset, in the strongest form available

**42 of 42 grid cells byte-identical to base on exit code, stdout AND stderr; 0 violations.** The
grid crosses six routes (tag PN, tag DA, tag DT, text PN, text dates, embedded object) with five
value lengths either side of the bound and three cap settings, plus a clean corpus per cap.

**NON-VACUITY IS PRINTED, NOT ASSUMED: 39 of the 42 cells exit 1, 47 hit lines are printed, and 18 of
them carry a cut value.** A grid whose cells printed nothing would read identical on every one.

**PROVED BY MUTATION.** Cutting one character less (`MAX_HIT_VALUE_LENGTH - 1`) takes the grid from
42 identical to **24 identical and 18 violations**. The grid can see a changed value.

**And the loud case, which is where a per-hit copy would be paid the most.** An 8 MiB
`(7FE0,0010) OW` payload uniform over `0x41-0x60` produced **71,734 hits** with
`--max-hit-lines 0`: stderr is **byte-identical** between the two trees (6,063,059 bytes, `cmp`
clean), and the wall clocks overlap across three runs each. **No ratio is quoted, and 71,734 is a
fourth draw of a spread that is not a rate** (the item already carries 71,122 / 71,447 / 71,525, and
a dark frame reads 0).

## The tests, and which of them run red on base

Three cases. **One is the property and it goes red on base**: nine hit-bearing files must not cost
more retention than three, and on `88be779` six more files cost **12,626,394 bytes** against a
threshold of one file. **The other two are green on base by design and are named as such** rather
than counted as evidence: the detector-zero control (the filler alone is hit-free, so the difference
is the hits' doing) and the `utf16le` round-trip fidelity case, which guards the new copy and has
nothing to regress on a tree without it.

**No case writes down how many bytes a run may hold.** The claim is a shape, not a size, so the
assertion is a difference between two corpus sizes; `pnpm measure:phi-scan-retention` prints the
sizes.

## 🔴 Residuals, disclosed and NOT closed

- **⚠ V8's legacy `RegExp` statics retain ONE subject string, and that is why the shipped column is
  not the control.** `RegExp.input` holds the last successfully matched subject, so one file's whole
  decoded text stays alive after its scan regardless of anything `Hit` does. Measured directly:
  after a match on an 8 MiB subject, with every local reference dropped and a forced GC,
  `RegExp.input.length` reads 8,388,628. It is what the constant 8 MiB gap between the shipped
  column and the control is, and the gap tracked file size exactly across 2, 4, 8 and 16 MiB files.
  **Bounded by the LARGEST SINGLE FILE, not by the corpus.** Its own slice if ever; the obvious
  remedy is a throwaway match after each file, which is a bound holding only from where it is
  called.
- **The `hits` ARRAY is still unbounded.** Each element is now bounded in what it prints AND in what
  it holds; the array is not. Capping it would make the totals a claim about what was kept rather
  than about the corpus, which is the net-leak shape `#104` refused.
- **`report()` is still NOT MONOTONE at the per-file cap** (`#105`). Untouched here in both
  directions: this slice changes no printed byte.
- **A never-draining reader still makes the gate WAIT** (`#107`), and `test/helpers/run-script.ts`
  still inherits `spawnSync`'s 1 MiB `maxBuffer`.
- **The relocation, `position.contextPath` and `attributes[].tag`** are parser-side residuals and are
  untouched.
