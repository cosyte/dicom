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
open block the way section 4.6 says a parser must: *"any HTML within an HTML block that might
otherwise be recognised as a start condition will be ignored by the parser"*, and so is a fence, and
so is a heading.

**🔴 KIND 7 IS SCOPED OUT, WITH ITS COST MEASURED IN BOTH DIRECTIONS RATHER THAN ASSUMED.** Its
start condition is a complete open or closing tag alone on a line, and section 4.6 adds that
*"blocks of type 7 may not interrupt a paragraph"*. That is **paragraph state**, which this parser
does not have and cannot acquire without modelling every other leaf block, and **approximating it is
the parity trap below**: a guess that a line is not in a paragraph opens blocks CommonMark does not,
which moves entries in both directions at once. So it is scoped, named on the function, and pinned
by a test with both of its arms:

| log                                | CommonMark        | here            | agrees |
| ---------------------------------- | ----------------- | --------------- | ------ |
| `<span>` after a BLANK line        | kind 7, no heading | **live entry** | no     |
| `<span>` after a PARAGRAPH line    | no block, heading | live entry      | yes    |

The second arm is why the case asserts both: a test showing only the first would read as an accepted
behaviour rather than as a measured gap.

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

`scripts/measure-phi-scan-html-blocks.ts` (shipped, `pnpm measure:phi-scan-html-blocks`), head
against `8139687` restored **by file copy, never `git checkout`**:

| log                | head          | base `8139687`                   | relation      |
| ------------------ | ------------- | -------------------------------- | ------------- |
| `committed`        | `{}`          | `{}`                             | equal, the anchor |
| `comment`          | `{visible}`   | **`{commented, visible}`**       | a-subset-of-b |
| `comment-lone-cr`  | `{visible}`   | **`{commented, visible}`**       | a-subset-of-b |
| `div`              | `{after}`     | **`{after, in-div, still-in-div}`** | a-subset-of-b |
| `pre`              | `{after}`     | **`{after, in-pre, still-in-pre}`** | a-subset-of-b |
| `one-line-comment` | `{after}`     | `{after}`                        | equal         |
| `fence-in-comment` | `{after}`     | `{}`                             | b-subset-of-a |
| `parity`           | `{alpha}`     | `{bravo}`                        | **disjoint**  |
| `comment-in-fence` | `{after}`     | `{after}`                        | equal         |
| `indent-four`      | `{after}`     | `{after}`                        | equal         |
| `condition-seven`  | `{under-span}` | `{under-span}`                  | equal         |

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

`test/scripts/phi-scan-matchers.test.ts` then drives **one `--allow-fixture` per derived name**
through the membership oracle in a single subprocess, so the committed table is checked
**behaviourally** rather than by a text regex over the source. **NO COUNT OF EITHER LIST IS WRITTEN
ANYWHERE**, here or in `phi-scan.ts`.

**The control for the other direction is `<divx` and `<paramx`**: a listed name followed by more
tag-name characters. CommonMark starts no block on either, and they are not complete tags so
condition 7 does not reach them, so the heading below each must stay live. That is what makes the
maximal-munch read of the name safe to state: the five things section 4.6 allows after a listed name
(space, tab, end of line, `>`, `/>`) are none of them tag-name characters, so a listed name that is
a strict PREFIX of the run is never followed by one of them.

## Tests: 7 red on base of 1,388, and 4 green on base BY DESIGN

Full suite with base `8139687`'s `scripts/phi-scan.ts` restored **by file copy** into this tree:
**`7 failed | 1380 passed | 1 todo` across 76 files.** All seven are this slice's new behavioural
cases and all seven are in one file.

**The 4 green-on-base cases are counted separately rather than folded in**, because a padded red
fraction is this lineage's recurring claim defect:

- the two `commonmark-pin` cases read a **vendored document** and say nothing about `phi-scan`'s
  behaviour. A red one would mean the pin was wrong;
- the **condition-7 case** is green on base because base does not model kind 7 either. It is the
  disclosure, not the fix;
- the **committed-log anchor** is green on both trees, which is exactly what it is for: this
  repository's own log carries no HTML and adding a block class must not have moved it.

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
  `U+2029`), and **section 4.5's backtick-info-string opener** is untouched. Both `PRE-EXISTING`,
  both unmeasured here.
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
