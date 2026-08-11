# The override log refuses a `###` run an invisible character separates from the path

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,544 - 39,544 = 0 bytes**, so the file cannot take one more byte. **That is
> HEADROOM, not file size, and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> `.claude/hooks/doc-budget.mjs`. The **"a few bytes" reading is stale in the only direction that
> matters** - the ratchet was lowered on a shrink, and the answer today is zero.
> `documentation/agent-notes.md` is **over its 250,000 ceiling** on `main`, so this record is here
> instead (budgeted at `REPO_DOC_MAX`). **No trap deleted, no ceiling raised.** What points at it,
> derived with `git grep -an dicom-phi-scan-atx-heading` on the commit that carries it rather than
> asserted: `scripts/phi-scan.ts`, `scripts/measure-phi-scan-atx-heading.ts`,
> `test/scripts/phi-scan-matchers.test.ts`, `test/scripts/commonmark-pin.test.ts`,
> `vendor/commonmark/README.md` and `documentation/agent-notes/dicom-phi-scan-html-blocks.md`.
> **No always-read file does.** A first draft of this line named two of them and was caught by a
> gate: the ones it omitted were added by the same commit, which is exactly why the derivation has
> to be re-run against the commit rather than written from memory.

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `94069e8` (`#117`). Last verified 2026-08-11.
No pass count is written here: a draft carried one that had not happened yet when it was typed.

Closes the residual `#117`'s first pass named and left open, **`D-R6`**: `tripleHashValue`
separated the `###` run from the path with the whole of `\s`, where **CommonMark 0.31.2 section 4.2
says the opening run "must be followed by spaces or tabs, or by the end of line"**. So a line whose
separator was an invisible character was a **LIVE allow entry** where the document renders a
**PARAGRAPH**, and `--allow-fixture` exempted that PHI scan target at exit 0.

## The measurement that came first, because the row read UNMEASURED

Three trees, each restored **by file copy**, each run twice over a target holding a synthetic
`FAMILY^GIVEN`: once with `--allow-fixture` and once without.

| separator                                         | `58c9f2e`            | `8139687`            | `94069e8`            |
| ------------------------------------------------- | -------------------- | -------------------- | -------------------- |
| a space, a tab                                    | exit 0               | exit 0               | exit 0               |
| `NBSP`, `IDEOGRAPHIC SPACE`, `ZWNBSP`, `EM SPACE` | **exit 0, EXEMPTED** | **exit 0, EXEMPTED** | **exit 0, EXEMPTED** |
| no entry at all (control)                         | exit 2               | exit 2               | exit 2               |

Every one of those targets exits **1** on the same bytes without the flag, which is what makes exit
0 an exemption rather than an empty run. `PRE-EXISTING` is therefore measured rather than inherited,
and it reaches further back than the two trees the filed line named.

## 🛑 ONE CONJUNCT, WHICH IS WHY A DIRECTION CAN BE STATED HERE AT ALL

Everything else in this parser is parity, and this lineage has had a fail-safe-direction argument
refuted three times. This one is different, and the difference is structural rather than argued:
the change is **a single conjunct on the pattern the function replaced**, so for every line it
returns either `/^###\s+(.+?)\s*$/`'s answer or `null`, never a third answer. No line that was not
already an entry can become one, so every difference is a **REFUSAL at exit 2**.

**🛑 THAT IS A PROPERTY OF THE SOURCE, AND NO TEST HERE PROVES IT.** A draft of this slice shipped a
case that claimed to, and a gate showed the case was true by construction: it compared a test-local
oracle against the pattern the oracle was built from and never loaded `phi-scan.ts` at all, so
replacing the parser's return with a garbage string left it **green**. It is DELETED rather than
reworded, and the sentence it was sold as evidence for is corrected wherever it was written.

What stands behind the property instead, each re-derivable:

- the **comment-stripped diff**, below, which is one added early return before the pattern's scan
  and nothing else. That is what makes the reading structural rather than a hope;
- **behaviourally**, the per-log relation the instrument prints against a base: the one log the two
  trees differ on reads `a-subset-of-b`, and every other reads `equal`;
- the two cases that go **red on base**, which say the conjunct fires at all.

## 🔴 THE STRIP IS CONTESTED, AND TAKING IT WAS REFUSED BY THE GATE

Section 4.2 also says the raw contents are "stripped of leading and trailing space or tabs". **The
reference implementation of the pinned document version does not do that.**
`commonmark@0.31.2`, `lib/inlines.js`, strips with `block._string_content.trim()`, which is
`String.prototype.trim`, which is the whole of `\s` - what this parser does and what the pattern
did. Re-measured directly rather than taken from the gate that raised it:

| input                | `commonmark@0.31.2` renders | this parser names |
| -------------------- | --------------------------- | ----------------- |
| `###<NBSP>path`      | `<p>###<NBSP>path</p>`      | nothing           |
| `### path<NBSP>`     | `<h3>path</h3>`             | `path`            |
| `### <NBSP>path`     | `<h3>path</h3>`             | `path`            |
| `### path` (control) | `<h3>path</h3>`             | `path`            |

The separator row is why this slice exists and the parser now agrees with both the prose and the
implementation. The other rows are a document arguing with itself, and **a gate whose job is to
agree with a rendered page does not get to pick a side of that on prose alone.**

**A DRAFT OF THIS SLICE TOOK THE PROSE, AND IT IS DELETED RATHER THAN REWORDED.** It made
`### path<NBSP>` name `path<NBSP>`, which **exempted at exit 0 a target this parser refuses at exit
2** - a new invisible route, introduced inside the remedy for an invisible route - under a headline
saying an invisible character could no longer exempt a target. The gate measured it in the real `all`
mode and refused the slice. What shipped is the separator alone, which is what `D-R6` names.
`test/scripts/phi-scan-matchers.test.ts` pins the strip as it is, so the draft cannot return by
accident.

**Reproducing the implementation column needs a package this repository does not vendor** (no
network in CI, and `vendor/commonmark/` is the document, not an implementation):
`npm i commonmark@0.31.2` in a scratch directory, then render the four inputs above.

## What else is not modelled, and each one is a CASE

**🛑 THAT HEADING IS A CLAIM AND IT WAS FALSE WHEN IT WAS FIRST WRITTEN.** A gate mutated
`isLineTerminatorCode` down to `LF` and `CR` - deleting the only thing between `### a<LS>b.dcm` and
a live allow entry - and the **whole suite stayed green**, so the `LS`/`PS` line was a sentence
dressed as a pin. It is a case now, and so is the container-block line, which had none either.

- **Section 4.2's optional CLOSING sequence.** `### x ###` is a heading whose contents are `x`;
  this parser names `x ###`. **And `### ###` names `###`**, where the contents are empty and the
  heading names nothing - a second shape, found by the gate after the first was disclosed alone.
- **INLINE parsing.** The contents are "parsed as inline content", so a backslash escape or an
  emphasis run renders as something other than itself: `### a\_b.dcm` renders `a_b.dcm` and this
  parser names `a\_b.dcm`; `### a*b*.dcm` renders `ab.dcm` and it names `a*b*.dcm`.
- **No CONTAINER blocks.** `### <path>` is recognised at column 0 only, so a heading a reviewer sees
  inside a block quote or a list item is a DROPPED entry.
- the `###` run is anchored at **column 0**, where section 4.2 allows up to three spaces of
  indentation. Pinned by ` ### indented` in the shared case list;
- an **`LS` or `PS`** inside the heading text refuses the whole line, which is what is left of the
  pattern's `(.+?)`. `splitCommonMarkLines` ends a line at neither, so they are the only two that
  reach it, and the mutant above is now red on one case.

The first three are the ones with a direction worth naming, and **all three are VISIBLE to whoever
reviews the rendered log** - which is exactly what the separator was not. That is the line this
slice cut along. Each is offered as a `DICOM-RESIDUALS` row rather than a sentence filed here alone.

## The measurement instrument

`scripts/measure-phi-scan-atx-heading.ts` (shipped, `pnpm measure:phi-scan-atx-heading`) reads the
entry sets of one or two `phi-scan.ts` PATHS, so nothing here touches the working tree and a base is
restored **by file copy, never `git checkout`**. Its corpus is **derived from `\s` over all 65,536
code points**, not typed: an earlier draft of this class named six characters and a gate measured
three more, so the list a reader would have checked is not written anywhere.

**THE PER-LOG GRID IS NOT TRANSCRIBED HERE.** A hand-copied grid is the item's
`AN INHERITED FIGURE IS NOT A RE-MEASUREMENT`, and one has already been caught in this lineage
stating a row count the commit carrying it had moved. The instrument ships, so the grid is one
command:

```
pnpm measure:phi-scan-atx-heading scripts/phi-scan.ts <a copy of base>
```

What is quoted is its SUMMARY, re-run against `94069e8` on the tree that carries this sentence:

```
logs where the two scripts differ: 1 of 7
  invisible-separator: a-subset-of-b
controls: scanner identity OK, entry-exempts OK, committed-log anchor OK, positive control OK
```

The `invisible-trailer` and `invisible-leader` rows reading **`equal`** are what says the contested
strip did not move; they are in the corpus for that reason and not as decoration.

**🩺 IT CARRIES ONE CONTROL THE SIBLING INSTRUMENTS DO NOT, AND IT IS THE ONE THIS ITEM KEEPS
ASKING FOR.** The other three are the HTML-blocks instrument's, unchanged in kind: the
scanner-identity negative control, the **committed-log anchor** (every script measured must read
zero live entries in this repository's own log), and the **positive control** (the corpus must
produce both an empty and a non-empty entry set, and a comparison at least one non-`equal`
relation). The fourth is **THE EXEMPTION CONTROL**: an entry is measured everywhere else by whether
`--allow-fixture` was ACCEPTED, which is one inference away from what matters, so one log is run
twice over a target holding a synthetic `PN` and the pair must be **exit 0 with the flag against
exit 1 without it**. A script that exited 0 on both would be finding no PHI at all and every
acceptance it reported would mean nothing. All four **throw**; they do not report. A gate confirmed
each one fires against a script built to trip it.

## Tests: 2 red on base of 1,394, and the rest green on base BY DESIGN

Full suite with base `94069e8`'s `scripts/phi-scan.ts` restored **by file copy** into this tree:
**`2 failed | 1391 passed | 1 todo` across 76 files**, both in
`test/scripts/phi-scan-matchers.test.ts`. **The red fraction is small because the change is small**,
and the number is stated rather than padded: the refused draft read 6 of 1,393, and four of those
six were cases going red for a behaviour that is no longer shipped.

**The green-on-base cases are counted separately rather than folded in**, because a padded red
fraction is this lineage's recurring claim defect:

- the new `commonmark-pin` case reads the **vendored document** and says nothing about `phi-scan`'s
  behaviour. A red one would mean the pin was wrong;
- the **contested strip**, the **all-whitespace** heading, the **closing sequence**, **inline
  parsing**, **container blocks** and the **`LS`/`PS` refusal** cases all pin behaviour this slice
  deliberately did not change. Green on base is what they are for, and each is red under a mutant.

**Mutants, re-measured on what shipped rather than carried from the draft:**

| mutant                                                    | result                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| the section 4.2 conjunct removed                          | 2 cases red                                                         |
| **the refused draft put back** (strip made section 4.2's) | **6 cases red**, including the strip pin and the all-whitespace pin |
| `isLineTerminatorCode` narrowed to `LF` and `CR`          | 1 case red                                                          |
| the all-whitespace narrowing DELETED                      | **whole suite green**                                               |

**🔴 THE LAST ROW IS A GAP AND IS PRINTED AS ONE RATHER THAN LEFT OUT.** Under the shipped strip the
guard is reachable only as the EMPTY string, which names no path either way, so nothing observes it.
It becomes load-bearing only under the refused draft, where the second row shows the pin catching
it. That is a rule no test can break today, stated rather than claimed. **The third row was the same
shape until a gate measured it** - it read whole-suite green too, which is why the `LS`/`PS` case
exists.

## The scan route is untouched, checked with the transpiler rather than by eye

Comment-stripped with `removeComments`, base and head differ by **one added conjunct inside
`tripleHashValue` and nothing else**: **43,351 B on base, 43,497 B on head.** The base figure is the
one `#117` recorded for its own head, which is a cross-check rather than an inherited number.

## 🔴 Not closed, and named rather than claimed away

- **The contested strip**, above. Not a defect to fix - a disagreement between the pinned document
  and its reference implementation, and the slice that resolves it needs an oracle this repository
  does not have.
- **Section 4.2's optional closing sequence** (two shapes), **inline parsing** and **container
  blocks**, above. All three offered to the meta-repo as new `DICOM-RESIDUALS` rows.
- **Start condition 7** and **section 4.5's backtick-info-string opener** are untouched, both
  `PRE-EXISTING`, both already `DICOM-RESIDUALS` lines.
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `position.contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a
  later hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`. **This slice
  measures nothing about the heap and nothing about the corpus.**
