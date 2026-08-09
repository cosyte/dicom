# dicom - a hit line echoed the violating value UNBOUNDED (2026-08-09)

`DICOM-RESIDUALS`, one of the six residuals the item still carried. Written here rather than in
`documentation/agent-notes.md` because that file is **over** its 250,000-byte budget on `main` and
the hook refuses growth (ADR 0023). **Nothing dropped, no ceiling raised, no trap deleted.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT THE TRAP IS
SMALL.** Measured on this base: the file is 39,544 bytes against a 39,550-byte ratchet, so there
are **six bytes of headroom**, which is not a line. (Read the two numbers together. "`CLAUDE.md` has
6 bytes" is a misreading of this figure and is false; the file is 39 KB.) So the rule lives where a
worker touching this code reads it: the JSDoc on `MAX_HIT_VALUE_LENGTH`, on `excerptValue` and on
`report`, the block in `test/scripts/phi-scan.test.ts` under
`"phi-scan: a hit line echoes an EXCERPT of the value, bounded at construction"`, and this file.

**Provenance.** Every figure below was measured against base **`4984a96`**, quoted with that sha and
no other. Restore the base scanner **by file copy**, never by checkout:
`git show 4984a96:scripts/phi-scan.ts > <scratch>/base/phi-scan.ts`, then
`node <scratch>/base/phi-scan.ts <path>` with `cwd` set to a repo root, since the script resolves
its allow-list and its corpus from `process.cwd()`.

## The defect

`report()` wrote `value=${JSON.stringify(h.value)}` and `h.value` was a `string` off the payload.

**IT WAS THE ONLY UNBOUNDED PAYLOAD-DERIVED SLOT ON THE LINE, AND THE ONLY ONE WHOSE SIZE THE
PAYLOAD CHOSE.** `path` is the path the enumeration chose; `tag` is `tagDisplay`'s rendering of two
16-bit numbers; `offset` is a position; `reason` is one of this file's own literals; `vr` is a
literal at each `hits.push` and never the two bytes off the wire. `value` is the bytes. An element
declares its own length, so a `(0010,0010)` claiming the rest of the object put the rest of the
object - other elements' values, pixel data, whatever follows - on one stderr line, to say that a
name was not on the allow-list. **A diagnostic about a PHI leak is itself a PHI surface.**

Measured on base, one hit line per cell:

| value | base line length | after |
|---|---|---|
| text `PN` token, 1 MiB | **1,048,640 chars** | 281 |
| `(0010,0010) PN`, 65,000 chars | 65,066 | 281 |
| `(0008,002A) DT`, 65,000 chars | 65,083 | 298 |
| `(0010,0010) PN` inside a base64 doc fixture, 65,000 chars | 65,066 | 281 |

**Three of the six push sites can exceed the bound** (the `PN` and `DT` tag routes, and the text
sweep's `PN` token). The other three are held under it by their own recognizers: the two text date
passes match a fixed-width run, and `checkDate` refuses a `DA` value that is not exactly eight
digits. **That analysis is written down and is NOT what the bound rests on** - it is a fact about
what each caller happens to pass today, which is exactly the kind of bound this lineage has watched
relocate to a sibling.

## The remedy: the SLOT, not the printer

`Hit.value` is no longer a `string`. It is `HitValue`, a branded pair of the excerpt and the length
the value had, and `excerptValue()` is the only thing that makes one.

**Truncating inside `report` would have been a bound that holds only from where the printer is
CALLED** (`#93`): the hit would still carry the whole payload, and the next consumer of `Hit.value`
- a second printer, a summary line, a JSON mode - would start from an unbounded string again.

**THE TYPE IS THE ENFORCEMENT, AND IT WAS VERIFIED RATHER THAN ASSERTED.** Reverting one of the six
push sites to the raw string it used to pass fails the build:
`scripts/phi-scan.ts(1306,9): error TS2322: Type 'string' is not assignable to type 'HitValue'`,
and restoring it is green again. A test pins the arithmetic the compiler cannot state: the number of
`hits.push({` sites equals the number of `value: excerptValue(` sites.

## Where 194 comes from, and the UNIT that a refuter caught

**PS3.5 2026c Table 6.2-1, the `PN` row.** The sentences were located by the rule this repo pays
for: every `<tr>` of `table_6.2-1` was collected and **exactly one** contains all three of
`64 chars maximum per component group`, `up to 3 groups of components` and
`no more than two component group delimiters`; its first cell is `PN`. `3 x 64 + 2 = 194`, and `PN`
is the longest of the three VRs this scanner reads.

**🛑 AND THAT NUMBER IS IN CHARACTERS, WHILE THIS BOUND IS IN `String.length`. PASS 1 REFUTED THE
CLAIM BUILT ON MISSING THAT, AND IT WAS FALSE IN FOUR ARTIFACTS AT ONCE.** The draft said *"a single
conformant value prints WHOLE and its line is byte-identical to base"*, and qualified it with an
enumeration of two escape hatches. The `PN` row's length cell cross-references **`note_6.1-2-1`**,
which is where the unit is: the lengths of VRs whose Character Repertoire can be extended or
replaced are `expressly specified in characters rather than bytes`, *because the mapping from a
character to the number of bytes may depend on the character set*. Located the same way: the
sentence occurs **exactly once** in `part05.xml`. This script has no such unit - the tag route
decodes latin1, so it counts **bytes**, and the text route counts **UTF-16 code units**.

**🛑 AND PASS 2 REFUTED THE FIGURES THAT FIRST STOOD HERE, WHICH IS THE SAME DEFECT ONE LEVEL IN.**
The counter-example was re-measured rather than inherited, but on a PROBE fixture, and then the
figures were written beside a TEST that builds a different `PN` (the probe put a `^` inside the
ideographic and phonetic groups, which is 4 bytes cheaper). Three of five numerals were wrong.
**The figures below are measured on the fixture the committed test ships, and nothing else.**
A single-valued, conformant `(0010,0010) PN` of exactly three 64-character component groups under
`(0008,0005) ISO_IR 192`:

| | |
|---|---|
| characters | **194** |
| bytes on the wire | **450** |
| base line | 516 chars, whole value |
| here | 279 chars, **`[+256 not printed]`** |

**A BYTE FIGURE IS A FACT ABOUT THAT FIXTURE AND NOT ABOUT THE CLASS** - a conformant 194-character
`PN` has no one byte length, it depends on the characters - so no byte numeral is written in the
JSDoc at all, and the test asserts `wire.length - bound` with both terms derived.

**So 194 bounds what the report prints and says NOTHING about what the standard admits.** The
sentence is deleted rather than re-worded, in all four carriers, and the counter-example is pinned
as a **test** rather than as a disclosure (`"🛑 CUTS A CONFORMANT 194-CHARACTER PN"`), because a
shape in the harness is what this repo asks for in place of a sentence.

**THE WITHHELD AMOUNT THEREFORE CARRIES NO UNIT** - `value="..." [+64806 not printed]`. It was
`char(s)`, which was wrong on both routes. The unit is named once, exactly, on `excerptValue`.

**THE PRINTED FIELD IS BOUNDED, WHICH IS THE NUMBER THAT MATTERS.** `JSON.stringify`'s longest
expansion of one unit is a six-character escape, measured rather than assumed: 194 NULs and 194
lone surrogates both render as a **1,166-character** field, a doubled quote as 390. So the field is
at most `6 x 194 + 2` however many bytes the element declared.

## The superset proof: 30 cells, 0 violations

**A CAP IS A CANDIDATE NET LEAK** (`#97`, `#104`), so the grid runs **base and fixed side by side**
over both dispatch routes and compares exit code, stdout, the `N hits across M file(s)` summary, the
set of `HIT:` paths, the number of hit detail lines, and every line's tag, VR, offset and reason.

Cells: `{10, 193, 194, 195, 1000, 65000}` characters x `{text .txt, (0010,0010) PN .dcm,
(0008,002A) DT .dcm, base64 object in a .md}`, plus a 1 MiB text value, a 60,000-character `.dcm`,
a six-file corpus, an invocation error, `--max-hit-lines 1` over a 200-hit flood, and this
repository's own committed corpus.

**Result: 30 cells, 0 violations. 19 hit lines byte-identical, 30 excerpted.** In every cell the
exit code, the totals and the set of files named are **equal to base**; every excerpt is a **prefix**
of what base printed; and every withheld count equals `base length - 194` exactly. The committed
corpus is **byte-identical on stdout AND stderr, exit 0 both**.

**The `--max-hit-lines 1` cell is byte-identical**, which is the interaction with `#104` stated
rather than assumed: the excerpt shortens a line, the cap decides how many lines there are, and
neither reads the other.

**The harness was verified before its zeros were believed, and its first version was wrong.** It
parsed a hit line with one greedy regex, so a `DT` line's reason (`(>= 1906)`, parentheses) was read
as part of its value field and **three cells reported false violations**. The committed test helper
carries the fixed parser, which walks the JSON string to its closing quote.

## What is pinned, and what is green on base

Eight cases. **Seven are red on base `4984a96` and green here.** The eighth - *"cannot move the
verdict, the totals or the set of files named"* - is **green on base too, deliberately**: it pins a
property base already had and this change must not lose. It is named here so nobody quotes
"8 tests" as "8 regressions caught".

**No case writes the bound as a numeral.** Each derives it from a run that actually cut a value and
then places the two boundary cases either side of it, for the reason `#104`'s cases do not name
their default: a numeral copied into a test is a second source of truth that drifts from the
constant.

## Still open, and NOT touched by this slice

- **`hits` is still unbounded IN MEMORY.** Each element of it is now bounded; the array is not.
  Capping it would make the totals a claim about what was kept rather than about the corpus, which
  is the net-leak shape one level down (`#104`).
- **`report()` is still NOT MONOTONE at the per-file cap** (`#105`): `scanDicom`'s hits append
  before `scanText`'s, so a flooding file can push a caret name off the default report. Unchanged
  here in both directions; this slice shortens lines and never reorders them.
- **A never-draining reader still makes the gate WAIT** (`#107`), and `test/helpers/run-script.ts`
  still inherits `spawnSync`'s 1 MiB `maxBuffer`. This change makes the second one much harder to
  reach - the largest line the grid produced fell from 1,048,640 to 298 - but it does
  **not** close it: the number of lines is still unbounded.
- **The relocation, `position.contextPath` and `attributes[].tag`** are parser-side residuals and
  are untouched.
