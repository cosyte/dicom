# The override log is parsed with CommonMark's line ending, and the spec is now a pinned precondition

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. **That is HEADROOM, not file size,
> and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> `.claude/hooks/doc-budget.mjs`. `documentation/agent-notes.md` is **257,209 B, over its 250,000
> ceiling** on `main`, so this record is here instead (budgeted at `REPO_DOC_MAX`, 90,000).
> **No trap deleted, no ceiling raised.** What points at it, verified by `git grep` rather than
> asserted: `scripts/phi-scan.ts`, `scripts/measure-phi-scan-line-endings.ts` and
> `vendor/commonmark/README.md`. **No always-read file does.**

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `734736f` (`#115`). Last verified 2026-08-10.

Closes the `PRE-EXISTING` residual `#115` filed against itself: **a lone `CR` in
`phi-scan-overrides.md` hides a heading AND a fence opener from the line split, so a `### <path>` a
human sees INSIDE a rendered code block becomes a LIVE allow entry at exit 0.** That is a silently
exempted PHI scan target, which is the one direction this parser exists to refuse.

## The mechanism, and why the fence opener is the dangerous half

`overrideLogPaths` produces the set of paths `--allow-fixture` will exempt. A lone `CR` hides two
different things from a `/\r?\n/` split:

| what the `CR` hides | why                                                       | cost                         |
| ------------------- | --------------------------------------------------------- | ---------------------------- |
| a `###` heading     | `tripleHashValue` anchors `###` at column 0                | a dropped entry, exit 2      |
| a fence **OPENER**  | `fenceRun` reads the first non-space character of the line | **an exempted target, exit 0** |

A hidden opener means the block never opens, so every `### <path>` a human sees inside that code
block is live.

## 🛑 The two readings are DISJOINT, so no direction is claimed and none is available

Measured with `scripts/measure-phi-scan-line-endings.ts` (shipped), head against `734736f` restored
**by file copy**:

| log                | head (section 2.1)  | base `734736f` (`/\r?\n/`) | relation           |
| ------------------ | ------------------- | -------------------------- | ------------------ |
| `committed`        | `{}`                | `{}`                       | equal (the anchor) |
| `hidden-opener`    | `{visible}`         | **`{smuggled}`**           | **disjoint**       |
| `hidden-opener-lf` | `{visible}`         | `{visible}`                | equal (the control)|
| `crlf-close`       | `{below-one}`       | `{below-one}`              | equal              |
| `heading-shapes`   | 14 of 14            | 8 of 14                    | base is a SUBSET   |

`smuggled` is a path base **exempts at exit 0** and head refuses at exit 2. `visible` is the
reverse. One log reads **disjoint** and another reads **strict subset**, which is why "narrower is
safer" is not available here and is not asserted: fence state is PARITY, so a wrong line ending
moves entries in both directions at once. What decides it is the document, not a direction.

The `hidden-opener-lf` row is what makes this a fact about the LINE ENDING rather than about the
fence rules `#113` already pinned: the same document with every lone `CR` written `LF` reads equal.

## The fix, and the one thing deliberately NOT changed

`splitCommonMarkLines` implements CommonMark 0.31.2 section 2.1's line ending; `overrideLogPaths`
calls it. **`loadAllowList` keeps `splitLines`, which stays `/\r?\n/` exactly.**

That split is deliberate and is the reason this is not one function. `scripts/phi-allow-list.txt` is
not a markdown document, and unifying the two would make a `CR`-joined line TWO live allow entries
where it is one dead one today (a name carrying a `CR` equals nothing a scan produces). **A live
allow entry SUPPRESSES a hit**, so unifying would widen the allow list as a side effect of a
markdown fix, which is the shape `#97` and `#104` were refused for. The case that would go red if
anyone did it is already in `test/scripts/phi-scan-matchers.test.ts`.

**🔴 THE COST, STATED RATHER THAN ARGUED AWAY:** `splitLines`'s `CRLF` half is unobservable through
its only caller again, because `loadAllowList` trims. That is a fact about the caller and not a
reason to drop the half, which would key the function to what today's caller does afterwards. The
observable `CRLF` claim `#115` bought did not disappear, it moved to `splitCommonMarkLines` with the
caller, through the same `--allow-fixture` oracle.

## 🩺 The CommonMark spec is vendored, because the previous slice named the missing oracle

`dicom-phi-scan-config-parsers.md` recorded this residual's figure as one it could not re-take,
"because grounding it needs a CommonMark oracle this repository does not vendor". So one is
vendored: `vendor/commonmark/spec/<sha256>/spec.txt`, the git-tagged 0.31.2 document, pinned exactly
as `vendor/nema/` pins NEMA's DocBook.

`test/scripts/commonmark-pin.test.ts` makes it a **precondition rather than a citation**:

1. the document **hashes to its pin**, so a byte cannot be edited to make a citation true;
2. the **version is read from its own front matter**, never from the URL it was fetched with. The
   published copy at `spec.commonmark.org` is byte-identical **apart from having that front matter
   stripped**, which is why the tagged one is vendored;
3. every section number is **DERIVED by walking the headings**, not asserted. The walk must exclude
   the spec's own example blocks, which contain markdown headings: counting those reads
   `Fenced code blocks` as **section 14.1** instead of 4.5;
4. each cited sentence occurs **EXACTLY ONCE** in the document and inside the section claimed for
   it. Zero and two are both refusals, and the locator's own control asserts both:
   `"a carriage return is not a line ending"` (absent) and `"interrupt a paragraph"` (in many
   sections) each make it throw.

Three numbers stop being asserted as a result: **2.1** Characters and lines, **4.5** Fenced code
blocks (which `Fence.bare` already cited through two refuter passes) and **4.2** ATX headings.
4.2 and 4.5 are load-bearing for the disjointness log specifically: a fence opener on the line after
a paragraph line really does open a block, and a `###` on the line after one really is a heading, so
the log is a claim about the rendered document rather than about our parser.

**The spec is hard-wrapped, so every search folds whitespace first.** A line-based `grep` for any of
these sentences finds nothing, which reads as absence. That is this lineage's own sweep trap, hit
inside the file written to avoid it.

## 🛑 The em-dash gate needed a second named vendor root, and that is a real widening

`vendor/commonmark/spec/<sha256>/spec.txt` carries **five em dashes**, every one in John
MacFarlane's own prose. `VENDOR_PINNED_DOC` in `scripts/check-no-emdash.sh` becomes
`^vendor/(nema|commonmark)/[^/]+/[0-9a-f]{64}/`.

The case is byte for byte the NEMA one the script already argues: the rule's own remedy ("rewrite
the sentence") cannot be applied to a document vendored VERBATIM, and editing one byte breaks the
SHA-256 pin a test re-hashes as a precondition. **It is a second NAMED root, never a widening to
`vendor/`**: a new vendor root still cannot inherit the exemption without being named, and a full
SHA-256 still cannot be written as prose. Every hand-written file under `vendor/commonmark/` stays
in scope (`README.md` and `spec/SHA.txt`), which is where this tree's only real violation was ever
found. **Measured after the change: 5 files match, up from 4; the gate reports 244 of 250 tracked
files scanned.**

## Tests: 2 red on base of 1,377, and 6 green on base BY DESIGN

Full suite with base `734736f`'s `scripts/phi-scan.ts` restored **by file copy** into this tree:
**`2 failed | 1374 passed | 1 todo` across 76 files.** Both failures are this slice's new
behavioural cases, and the second names exactly which entries base drops
(`{cm-a2, cm-a3, cm-b2, cm-b3, cm-b4, cm-b6}`), predicted before it was run.

**The 6 `commonmark-pin` cases are GREEN on base and that is not a defect**: they read a vendored
document and say nothing about `phi-scan`'s behaviour. A red one would mean the pin was wrong. They
are counted separately rather than folded into the red fraction, because an inherited or padded
figure is this lineage's recurring claim defect.

The new behavioural cases:

- **the exempted target**, both directions asked and the `LF` control run beside it;
- **the split itself, differentially against an INDEPENDENT reading of section 2.1** (`/\r\n|\n|\r/`,
  the sentence's three alternatives as a pattern), over one fence-free log carrying a heading pair
  per line-ending shape, answered in one subprocess by the membership oracle. **Its non-vacuity
  control is the other split**: the shapes are chosen so `/\r?\n/` and section 2.1 disagree on
  several, and the case asserts that they do, so it cannot pass against a `CR`-blind parser.

## The instrument

`scripts/measure-phi-scan-line-endings.ts`, `pnpm measure:phi-scan-line-endings`, takes one or two
`phi-scan.ts` PATHS so nothing has to touch the working tree. Three checks **throw** rather than
report: the scanner-identity negative control (a bad `--max-hit-lines` must be refused with
phi-scan's own message), the **committed-log anchor** (every script must read zero live entries in
this repository's own log), and the **positive control** (the corpus must produce both an empty and
a non-empty entry set, and a comparison must produce at least one non-`equal` relation). A detector
that cannot fire is not a detector.

## 🔴 Not closed, and named rather than claimed away

- **`tripleHashValue` still refuses a heading whose text contains `LS` or `PS`** (`U+2028`,
  `U+2029`). CommonMark makes neither a line ending, so a human sees the heading and this parser
  does not produce it. That is a dropped entry (exit 2), it is `PRE-EXISTING`, and it is **not
  re-measured here**: closing it is a fourth selection change on the heading recognizer and belongs
  beside the open section 4.5 backtick-info-string line. The `isLineTerminatorCode` check stays
  exactly as it is, because removing it would key the function to what today's caller hands it.
- **Section 4.5's backtick-info-string opener** is untouched, as is `#113`'s record of it.
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a later
  hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the `rawRecordMode`
  shapes git cannot emit. **This slice measures nothing about the heap and nothing about the
  corpus**, and the false-positive count remains a property of the byte histogram rather than a rate.
- **The scan route is untouched.** Every change to `scripts/phi-scan.ts` outside
  `splitCommonMarkLines` and the one call site is a comment.
