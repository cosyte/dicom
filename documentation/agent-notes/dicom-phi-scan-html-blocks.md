# The override log models CommonMark's HTML blocks, so a comment can no longer exempt a scan target

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. **That is HEADROOM, not file size,
> and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> `.claude/hooks/doc-budget.mjs`. `documentation/agent-notes.md` is **over its 250,000 ceiling** on
> `main`, so this record is here instead (budgeted at `REPO_DOC_MAX`). **No trap deleted, no ceiling
> raised.** What points at it, derived with `git grep -an dicom-phi-scan-html-blocks` rather than
> asserted: `scripts/phi-scan.ts`, `scripts/measure-phi-scan-html-blocks.ts` and
> `vendor/commonmark/README.md`. **No always-read file does.**

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `8139687` (`#116`). Last verified 2026-08-10.

Closes the `PRE-EXISTING` residual `#116` filed against itself and handed to the meta-repo as its
own backlog line: **`overrideLogPaths` modelled fenced code blocks and nothing else, so a
`### <path>` a human sees inside a section 4.6 HTML block was a LIVE allow entry and
`--allow-fixture` exempted that target at exit 0.**

## Why this residual, out of everything on the open list

It is the only one left that **silently exempts a PHI scan target**, which is the direction this
parser exists to refuse, and it is the sharper form of what `#116` closed. A fenced code block
**shows** its contents to a reviewer; an HTML comment shows **nothing at all**. A log reading

```
<!--
### somebody-elses-study.dcm
-->
```

renders as an empty document and exempted that path. The rest of the open list is a dropped entry,
a diagnostic field, a memory bound or a decision already taken.

## What is modelled, and what is not

CommonMark 0.31.2 section 4.6 defines seven kinds of HTML block by a start and an end condition.
`htmlBlockStart` and `htmlBlockCloses` implement **kinds 1 to 6**, and `overrideLogPaths` treats an
open block the way section 4.6 says a parser must: _"any HTML within an HTML block that might
otherwise be recognised as a start condition will be ignored by the parser"_, and so is a fence, and
so is a heading.

**🔴 KIND 7 IS SCOPED OUT, WITH ITS COST MEASURED IN BOTH DIRECTIONS RATHER THAN ASSUMED.** Its
start condition is a complete open or closing tag alone on a line, and section 4.6 adds that
_"blocks of type 7 may not interrupt a paragraph"_. That is **paragraph state**, which this parser
does not have and cannot acquire without modelling every other leaf block, and **approximating it is
the parity trap below**: a guess that a line is not in a paragraph opens blocks CommonMark does not,
which moves entries in both directions at once. So it is scoped, named on the function, and pinned
by a test, arm by arm:

| log                                             | CommonMark         | base `8139687` | here                 |
| ----------------------------------------------- | ------------------ | -------------- | -------------------- |
| `<span>` after a BLANK line                     | kind 7, no heading | live entry     | **live entry**       |
| `<span>` after a PARAGRAPH line                 | no block, heading  | live entry     | live entry           |
| `</pre>`, then a comment holding a fence opener | kind 7, no heading | **exit 2**     | **exit 0, EXEMPTED** |

The second row is why the case asserts more than one arm: a test showing only the first would read
as an accepted behaviour rather than as a measured gap.

**🔴 THE THIRD ROW IS THIS SLICE WIDENING THE HOLE, AND IT WAS FOUND BY THE GATE RATHER THAN BY THE
SLICE.** `</pre>` alone on a line is a complete closing tag, so CommonMark starts a kind-7 block
there that runs to the end of the document; neither tree models that. But the comment opener beneath
it is read here, and it swallows the fence delimiter that used to hide the heading, so **this tree
exempts at exit 0 a target base refused at exit 2.** The CLASS was disclosed, the INSTANCE was not,
and that gap is the same shape `#116` disclosed against itself. It is now a corpus row
(`condition-seven-widened`) and a test arm.

**🛑 AND IT FALSIFIES THE `DICOM-RESIDUALS` LINE THAT EXISTS, WHICH THIS SUBMODULE CANNOT EDIT.** That
line reads that the class is `PRE-EXISTING` on the `LF` form and that `#116` widened its reach BY ONE
INPUT, the lone `CR` form. This input is pure `LF` and moves base exit 2 to head exit 0, so both
halves are now wrong. **The correction is OWED to the meta-repo and is named here rather than
asserted as already made.**

## 🛑 NO DIRECTION IS CLAIMED, AND THE DISJOINTNESS ROW IS WHY

A block boundary is **PARITY**. This lineage has had a fail-safe-direction argument refuted three
times (`#113` on the fence, `#115` on the entry sets, `#116` on the line ending), so the evidence
here is an input rather than an argument. On a log with an **odd** number of fence delimiters inside
a comment:

````
<!--
```
-->
### alpha
```
### bravo
````

| target                  | head                 | base `8139687`       |
| ----------------------- | -------------------- | -------------------- |
| `--allow-fixture alpha` | **exit 0, exempted** | exit 2, refused      |
| `--allow-fixture bravo` | exit 2, refused      | **exit 0, EXEMPTED** |

The two entry sets are `{alpha}` and `{bravo}`: **disjoint, both non-empty**, each exempting at exit
0 a target the other refuses at exit 2. Modelling HTML blocks is therefore not "narrower" and is not
defended as safer. What decides it is the document.

## The measurement

`scripts/measure-phi-scan-html-blocks.ts` (shipped, `pnpm measure:phi-scan-html-blocks`) reads the
entry sets of one or two `phi-scan.ts` PATHS, so nothing here touches the working tree and a base is
restored **by file copy, never `git checkout`**.

**🛑 THE PER-LOG GRID IS NOT TRANSCRIBED HERE, AND THAT IS THE REMEDY FOR A DEFECT A GATE CAUGHT IN
THIS FILE.** A hand-copied grid stated eleven rows while the commit carrying it grew the corpus to
twelve, and the row it omitted was the only one showing the leak direction. That is the item's
`AN INHERITED FIGURE IS NOT A RE-MEASUREMENT`, inside the remedy for a different trap, which is the
shape `#109` paid for. The instrument ships, so the grid is **one command** and cannot go stale:

```
pnpm measure:phi-scan-html-blocks scripts/phi-scan.ts <a copy of base>
```

What is quoted is its SUMMARY, re-run against `8139687` on the tree that carries this sentence:

```
logs where the two scripts differ: 7 of 12
  comment: a-subset-of-b
  comment-lone-cr: a-subset-of-b
  div: a-subset-of-b
  pre: a-subset-of-b
  fence-in-comment: b-subset-of-a
  parity: disjoint
  condition-seven-widened: b-subset-of-a
controls: scanner identity OK, committed-log anchor OK, positive control OK
```

Two rows carry the whole argument and are named rather than left to be read off: **`parity`** is
`{alpha}` against `{bravo}`, and **`condition-seven-widened`** is `{widened}` against `{}`. The
`committed` anchor reads `{}` on both.

**🛑 THE `relate` HELPER DIFFERS FROM THE SIBLING LINE-ENDINGS INSTRUMENT BY ONE ORDERING, AND THE
DIFFERENCE IS THE POINT.** An empty set shares nothing with anything **and** is a subset of
everything, so `disjoint` and a subset label are both true of it. Reported as `disjoint`, the
`fence-in-comment` row would have looked like parity evidence while resting on an empty side. The
subset test runs first here, and the disjointness claim rests on the `parity` row, whose two sides
are both non-empty.

Three checks **throw** rather than report, unchanged in kind from the sibling instrument: the
scanner-identity negative control (a bad `--max-hit-lines` must be refused with phi-scan's own
message, which is what catches a same-named file from another package in a shared scratch area), the
**committed-log anchor** (every script measured must read zero live entries in this repository's own
log), and the **positive control** (the corpus must produce both an empty and a non-empty entry set,
and a comparison must produce at least one non-`equal` relation).

## The tag tables are read out of the pinned document, not typed

Start conditions 1 and 6 close over tag names, and a table nobody checked against the spec is a
table somebody typed. `test/helpers/commonmark-spec.ts` re-hashes `vendor/commonmark/spec/` on load,
walks the headings to **derive** that HTML blocks are section 4.6, and reads both lists out of the
section between anchors that are **required to occur exactly once in the section and once in the
document**. Zero and two are both refusals, which is the meta-repo's rule about locating a spec
section, and this repository has paid for the first-match shape before (`#80` cited PS3.5 section 7.5
twice when the sentence is in 7.5.2).

`test/scripts/phi-scan-matchers.test.ts` then drives **one `--allow-fixture` per derived name, from
BOTH lists**, through the membership oracle in a single subprocess, so each committed table is
checked **behaviourally** rather than by a text regex over the source. **NO COUNT OF EITHER LIST IS
WRITTEN ANYWHERE**, here or in `phi-scan.ts`.

**🛑 CONDITION 1's LIST WAS DRIVEN BY NOTHING IN THE FIRST DRAFT, AND THE GATE PROVED IT WITH A
MUTANT: reducing that table to a single name left the WHOLE SUITE GREEN.** The claim above was
written in the plural while half of it was verified by a second typed literal in a test, which is
the "table somebody typed" this section names, one file over. The loop was extended rather than the
sentence narrowed, because the unguarded direction is the leak direction: a name missing from the
shipped table means that tag starts no block, so the heading under it is a live allow entry.

**No exhaustiveness is claimed in the other direction.** An over-wide table is caught only for
NAMED controls: `divx` and `paramx`, each a LISTED NAME FOLLOWED BY MORE tag-name characters, which
is what pins the maximal-munch read (the listed name is the prefix, not the control), plus `source`,
`canvas` and `video`, which are unrelated names a table grown by one entry would fail on. A method
plus a named list, asserting no completeness.

Both mutants the gate used are now red, re-measured on the remedy rather than argued:

| mutant                                  | before the remedy     | after      |
| --------------------------------------- | --------------------- | ---------- |
| condition 1's table reduced to one name | **whole suite green** | 1 case red |
| `source` added to condition 6's table   | both test files green | 1 case red |

**The control for the other direction is `<divx` and `<paramx`**: a listed name followed by more
tag-name characters. CommonMark starts no block on either, and they are not complete tags so
condition 7 does not reach them, so the heading below each must stay live. That is what makes the
maximal-munch read of the name safe to state: the five things section 4.6 allows after a listed name
(space, tab, end of line, `>`, `/>`) are none of them tag-name characters, so a listed name that is
a strict PREFIX of the run is never followed by one of them.

## Tests: 8 red on base of 1,388, and 3 green on base BY DESIGN

Full suite with base `8139687`'s `scripts/phi-scan.ts` restored **by file copy** into this tree:
**`8 failed | 1379 passed | 1 todo` across 76 files.** All eight are this slice's new behavioural
cases and all eight are in one file. **The figure was re-taken after the remedy rather than carried:
it read 7 of 1,388 before the condition-7 case gained its widening arm**, which is red on base
because base refuses the target this tree exempts.

**The 3 green-on-base cases are counted separately rather than folded in**, because a padded red
fraction is this lineage's recurring claim defect:

- the two `commonmark-pin` cases read a **vendored document** and say nothing about `phi-scan`'s
  behaviour. A red one would mean the pin was wrong;
- the **committed-log anchor** is green on both trees, which is exactly what it is for: this
  repository's own log carries no HTML and adding a block class must not have moved it.

The condition-7 case's first two arms are green on base, and only its third is red. It is counted in
the red fraction as one case, which is what the runner counts.

Every behavioural case asks **both directions** in the same run, so a parser that dropped everything
fails as surely as one that dropped nothing.

## The scan route is untouched, checked with the transpiler rather than by eye

Comment-stripped with `removeComments`, base and head differ by exactly the new block machinery and
the `overrideLogPaths` wiring, and nothing else: **39,046 B on base, 43,351 B on head**. The base
figure is the one `#116` recorded for its own head, which is a cross-check rather than an inherited
number, and the detector produced a real diff rather than the empty-output false "identical" `#115`
caught.

## 🔴 Not closed, and named rather than claimed away

- **Start condition 7**, above. It is a `DICOM-RESIDUALS` line, not a sentence filed here alone.
- **`tripleHashValue` still refuses a heading whose text contains `LS` or `PS`** (`U+2028`,
  `U+2029`), and **section 4.5's backtick-info-string opener** is untouched. Both `PRE-EXISTING`.
- **🟢 `tripleHashValue` ADMITTED IN THE OTHER DIRECTION TOO, WHICH WAS UNNAMED UNTIL A GATE NAMED
  IT, AND IT IS CLOSED NOW** (`D-R6`, `#118`). It separated the `###` run from the text with
  `isSpaceCode`, the whole of `\s`, where section 4.2 allows only a space or a tab. So a heading
  whose separator is whitespace that section 4.2 does not admit and that does not end the line
  renders as a PARAGRAPH and was a **live allow entry on both trees**. **The enumeration that stood
  here is DELETED rather than completed**: it named six such characters and a gate measured three
  more, and this lineage's rule is that a list corrected once is cut, not extended. The predicate is
  the whole of `\s`, which is complete and does not need an illustration. **Only the SEPARATOR is
  closed.** The strip is a second class, it is contested between the pinned document and its
  reference implementation, and a draft that changed it opened a new exit-0 exemption and was
  refused. The record is `documentation/agent-notes/dicom-phi-scan-atx-heading.md`.
- **This parser still models no CONTAINER blocks.** A `### <path>` is only ever recognised at column
  0, so a heading inside a block quote or a list item is a dropped entry rather than an admitted
  one, and nothing here changes that. It is stated because "models section 4.6" must not be read as
  "agrees with a renderer".
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `position.contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a
  later hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the
  `rawRecordMode` shapes git cannot emit. **This slice measures nothing about the heap and nothing
  about the corpus**, and the false-positive count remains a property of the byte histogram rather
  than a rate.
