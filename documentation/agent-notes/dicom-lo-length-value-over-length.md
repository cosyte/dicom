# dicom - the over-long `(0012,0063)` Value nothing disclosed, on either route (2026-08-08)

`DICOM-LO-LENGTH-AND-SILENT-REPLACE`, third and last open half. The first two closed in `#74`
(`f8f2c0d`) and `#75` (`6d05366`, 3 passes, NOT REFUTED, 512/512 subsets, 2,816 cells, 0 over).
Written here rather than in `documentation/agent-notes.md` because that file is **over** its
250,000-byte budget on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.** The
precedent is `#97` and `#98`, which relocated the same way.

**Provenance.** The spec claims are read from the SHA-pinned vendored copy under `vendor/nema/`,
**PS3.5 2026c** (Table 6.2-1's `LO` row) and **PS3.15 2026c** (§E.1.1). Every figure below is a
measurement taken in this repo and quoted with the sha it was taken at.

**`CLAUDE.md` CARRIES NO NEW LINE FOR THIS, DELIBERATELY, AND THAT IS A BUDGET GAP RATHER THAN A
JUDGEMENT THAT THE TRAP IS SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`:
six bytes, which is not a line. The remedy is relocation, never deleting a trap to make room and
never raising a ceiling. Its existing `(0012,0063)` bullet already points at
`agent-notes.md#dicom-lo-length-and-silent-replace`, which still holds halves one and two. The rules
this half paid for live in the JSDoc on `hasValueOverLoMaximum` and
`deidentMethodValueOverLength`, in `test/deident/deident-method-lo-length.test.ts` under "an
over-long Value this run did not compose is written through, and SAYS SO", and in this file.

## The defect

`(0012,0063)` De-identification Method is `LO`, and PS3.5 2026c Table 6.2-1's `LO` row is "64 chars
maximum". **That row describes a Value, and `(0012,0063)` is `1-n`**, so the bound falls on each
value between `5CH` delimiters and never on the Value Field. Reading a per-Value clause as a
per-Field one is exactly the misreading that left `#74`'s hole (there it was §6.4, a clause about
where the ENCODER puts its pad, read as a bound on a COMPARISON). A field of 619 bytes made of ten
Values of 61 is conformant; a field of 76 bytes made of one Value is not.

`#75` made the text this library composes for itself multi-valued, and swept all 512 option subsets
to prove no Value it writes can be over. **It left two Values the library does not compose written
through with nothing said about their length:**

1. a caller's `deidentificationMethod`, whose bytes are the caller's; and
2. a value the **source file** already carried, kept because PS3.15 2026c §E.1.1 says a method is
   "inserted in or **added to**" that attribute, so rewriting a prior de-identifier's record would
   destroy the provenance the attribute exists to carry.

Both were `PRE-EXISTING`, both had residual tests pinning the silence, and the item stayed open for
one reason:

> **🔴 THE LIBRARY IS THE LIKELIEST WRITER OF AN OVER-LONG PRIOR.** Every object de-identified
> without a caller method by **any published release** carries the 76-character value, and
> re-de-identifying one **KEEPS** it. **Retention is disclosed; the LENGTH is not.**

Measured, on a `(0012,0063)` seeded with the 76-character text every release up to `0.0.11` wrote:
flat **138** bytes over four passes, Values of **76** and **61**, `DICOM_DEIDENT_METHOD_PRIOR_RETAINED`
raised on every pass for the retention and **nothing at all about the length**. So "a sender's
non-conformant `LO` is the sender's" - the sentence a graded pass refuted in `#75` - does not reach
the common case, because in the common case the sender is us.

## The remedy, and what it deliberately is not

A new Tier-2 code, `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH`, raised when the `(0012,0063)` Value
Field `deidentify()` is about to write carries at least one Value longer than 64 bytes.

**🛑 IT IS A DISCLOSURE AND NOT A BOUND. NOTHING IS SHORTENED, SPLIT OR TRUNCATED BY IT.** Splitting
or truncating either Value would invent a de-identification record nobody made, which is the same
refusal `#75` wrote for the ceiling fallback ("this package reports rather than invents"). The act
is byte-for-byte unchanged; only the silence is closed. A test asserts the caller's over-long value
comes back out at its full length in the same row that asserts the code fires, so a future remedy
that started truncating would turn it red.

**The check is over the value WRITTEN, not over any one route.** One call site therefore covers the
caller route, the retained-prior route and both replacement fallbacks (which write `added`). That is
also why it fires on **every** pass rather than only the first: a code raised once would leave every
re-de-identification of an object carrying the 76-character Value silent again, which is the exact
shape this half exists to close. Pinned as four identical code arrays over four passes, not as one.

**🛑 WIDENED BY UNION, NEVER BY REPLACEMENT, AND THE SUPERSET IS PROVED.** `#97` made a dispatch
exclusive and introduced a worse leak than it closed; `#98`'s `INTRODUCED` major was an exemption
that subtracted a detection on a blocking route. Nothing here is exclusive: no existing branch moved
and the new code is only ever pushed **beside** the others. Proved two ways rather than argued:

- a matrix over five input shapes strips the new code from `report.warnings` and asserts the
  remaining codes equal the base's answers exactly - no prior, a conformant `LO` prior, an over-long
  `LO` prior, a non-`LO` prior, and an over-long caller method beside a conformant prior. Nothing
  goes `1 -> 0`.
- a sweep of all **512** option subsets counts the new code raised **0** times on the text this
  library composes for itself. The `#75` sweep proves no Value it writes is over; this one proves
  the disclosure agrees with that measurement rather than firing beside it.

## The cost, disclosed rather than argued away

**The measurement is over BYTES.** No character repertoire encodes a character in fewer than one
byte, so a Value of 64 bytes or fewer can never hold more than 64 characters: the check **cannot
miss** a Value that is genuinely over the maximum.

**🛑 THE CONVERSE FAILS WHENEVER A VALUE'S BYTES OUTNUMBER ITS COUNTED CHARACTERS, AND THE
ENUMERATION OF WAYS THAT HAPPENS IS DELETED RATHER THAN WRITTEN A THIRD TIME.** Two graded passes
refuted two drafts of it, and this repo's rule for that is deletion, not a third wording:

- **Draft 1** put in the frozen registry message that 64 bytes is "the largest an `LO` Value may be
  **under a single-byte repertoire**". Pass 1 refuted it from the vendored PS3.5 2026c, in the
  paragraph immediately above Table 6.2-1: those lengths are "expressly specified in characters
  rather than bytes ... because the mapping from a character to the number of bytes used for that
  character's encoding may be dependent on the character set used. **Escape Sequences used for Code
  Extension shall not be included in the count of characters.**" Table 6.2-1's `LO` Character
  Repertoire cell admits ESC "when used for ISO/IEC 2022 escape sequences", and a multi-valued
  `(0008,0005)` (Level 4, §6.1.2.5.4) makes that legal.
- **Draft 2** said the converse fails "for two reasons", named the multi-byte repertoire and the
  escape sequence, and added that the encoder's trailing pad could not do it "because both operands
  reach the check trimmed" - true of the **field**, which is where `trimTrailingPad` runs at the
  write, and false of a Value that is not last. Pass 2 refuted it with a prior field of
  `"X"x64 + SPACE + "\" + "ACME"`, whose first Value is 65 bytes and raises the code. **That draft
  used §6.4 - a clause about what an ENCODER writes - to bound what the MEASUREMENT can see**, which
  is the misreading the item names as rule one of the three this lineage paid for.
- **Draft 3** wrote pass 2's own counter-example up as a third over-report direction, calling that
  65-byte Value "conformant". **Pass 3 refuted that too, and refuted pass 2's premise with it**,
  from the paragraph three above the note both earlier drafts quoted: "An individual Value,
  **including padding**, shall not exceed the Length of Value, **except in the case of the last
  Value of a multi-valued field** as specified in §6.4." So padding counts toward the length, the
  sole exception is the last Value, and a 65-character non-last Value is **not conformant**: the
  code firing on it is a **true positive**, not an over-report. Pass 3 measured the boundary and
  found the guard exactly on §6.2's line - `"X"x63 + SPACE` in a non-last Value raises nothing,
  `"X"x64 + SPACE` raises.

**🛑 SO THERE IS NO PADDING SENTENCE ANYWHERE, IN EITHER DIRECTION, AND THERE MUST NOT BE A FOURTH.**
Three graded passes refuted three drafts. This paragraph is the history, which is what this file is
for; every other artifact - the registry message, both JSDoc blocks, `types.ts`, `README.md`,
`docs-content/troubleshooting.md`, the changeset and the test module docblock - carries only the
general rule and says nothing about padding at all. The test row that measures the three padded
cases is named for what it measures and claims nothing.

What survives every counter-example is the general rule: the byte measurement over-reports whenever
a Value's bytes outnumber its **counted** characters, which is §6.2's escape-sequence exclusion and
its characters-not-bytes rule and nothing else. The two measurements that instantiate it stay,
because they are measurements rather than an enumeration: 40 characters of `ISO_IR 192` is 120
bytes, and `\ISO 2022 IR 100` with `ESC 2/13 4/1` plus 64 single-byte characters is 67 bytes carrying
64 counted characters and parses with no warnings.

The repertoire pins are files that **declare** the repertoire. A first draft built the multi-byte
fixture without `(0008,0005)`, under which the default repertoire is ISO-IR 6 and "40 characters"
would have been a claim the fixture could not support - green by fixture, which is this repo's
recurring failure mode.

**`position.byteOffset` locates the prior element, and is `0` when there was none.** This is the
first method code that can be raised on a Data Set carrying no `(0012,0063)` at all - the other three
cannot fire without a prior element - so on the caller route the offset is a sentinel rather than a
location. There is nothing to point at: the over-long bytes are the caller's argument, not the
file's. Stated rather than glossed, because that locator is the compensating control for withholding
the value, the length, the count and the origin, and pinned on both routes so the `0` reads as an
absence and not a constant.

Decoding per `(0008,0005)` to count characters exactly was refused here: the charset of an attribute
whose Values may predate this run is not something the function can establish, and a disclosure that
under-reports is worth less than one that over-reports. **Read the code as "a Value in this
attribute is over 64 bytes", which is what is measured, never as "the attribute is
non-conformant".** That wording is in the registry message, in the JSDoc, in the README and in
`docs-content/troubleshooting.md`.

## The message carries no value, no length, no count and no origin

A diagnostic about a length defect is itself a PHI surface, and **a raw length has no table to be a
member of** - which is why `DICOM-DIAGNOSTIC-PHI-RESIDUALS` bound one out of six other messages. So:

- **64 is in the message**; it is a constant of the VR, like the tag in
  `DICOM_DEIDENT_METHOD_NOT_ADDED`.
- **the offending Value's own length is not**; it is a measurement over document content.
- **the count of how many Values are over is not**; same kind of number.
- **the origin is not**; which Value came from the caller and which from the file is not decidable
  when the two are equal, so naming one would be a claim rather than a report.

The message no longer says "which is the largest an `LO` Value may be under a single-byte
repertoire". It says the Value is longer than 64 bytes, cites §6.2's characters-not-bytes rule, and
states the one direction that holds: 64 bytes or fewer can never carry more than 64 characters, a
longer one is not necessarily over.

Pinned with a **name-bearing payload and a non-vacuity assertion**, because `#55`'s pin here was
vacuous by fixture: the over-long prior carries `SMITHSON^BRAIN`, the test asserts those bytes really
do reach the output before it asserts anything about the message, and every four-character window of
the name is checked against `warning.message` (four letters is a leak). The windows are taken over
the NAME rather than the whole value, for the reason `#75`'s first draft went red: the registry prose
is English and a four-character window of the surrounding words collides by coincidence.

The detector's clean result is pinned **beside a positive it does catch, one byte away** - 64 clean,
65 raised, `SMITHSON` in both - because a detector zero can be a gap rather than a clearance. And the
per-Value reading has its own row: ten Values of 61 in a 619-byte field are clean, one Value of 65
among nine conformant ones is caught. A detector that measured the Value Field would fail both. The
512-subset sweep asserts the size of the domain it walked beside its zero, so a tenth option (1,024)
or a removed one (256) cannot turn the clearance into a smaller sweep silently.

## Base-red, re-run after every test change

**12 of 125, in 2 files of 4, on `4bc6930`**, with `src/` **replaced** (`rm -rf src` then a file copy
from a pristine snapshot, never `git checkout`):

- `test/deident/deident-method-lo-length.test.ts` **11 of 34**
- `test/property/warning-codes.snapshot.test.ts` **1 of 5** (the locked public-surface snapshot)
- `test/deident/deident-method-add.test.ts` **0 of 29**, deliberately
- `test/integration/phi-diagnostic-surface.test.ts` **0 of 57**, deliberately

**This figure moved twice inside the slice, and the rule earned its fifth outing.** The first
measurement read 9 of 122 with the last file quoted at 0 of 50; **a graded pass refuted the 50**,
and the note's own total gave it away: 31 + 5 + 29 + 50 is 115, not 122. The file is byte-identical
on both trees, so no reading of "which base" rescues it. It was then re-run again after the pass-1
remedy added three rows to the first file. **Re-run it after every test you add, STRENGTHEN OR
DELETE, and never carry one forward.**

The two deliberate zeros pin behaviour this slice says it does not change, so a red in either would
mean it changed something it claims it did not.

**Two of the new rows are green on base and that is what they are for**, not an omission: the
512-subset sweep counts the new code at 0 on both trees, and the superset matrix pins the base's
answers so the new tree has something to be compared against. A row that is red on base is a change
detector; these two are non-regression pins, and saying so is the honest reading.

## Still open, and NOT folded in

**`(0012,0063)` records the UNION of the options ever applied, never a per-run history**, so a later
pass with fewer options leaves no trace an earlier one had more. `#75` introduced that when it split
the record per option and de-duplicated per value; the base's one-value-per-run text did distinguish
two such runs. It is **conservative** - the union over-states retention, never understates it - so it
is not a leak, and it stays a backlog line rather than a rider here for three reasons:

1. it changes what **every** run writes into every de-identified object, which is a product decision
   about what E.1.1's provenance carrier holds, not a disclosure;
2. a per-run history re-opens unbounded growth. Each pass would append its own record even when a
   superset is already present, which is precisely the growth the fixed-point rule cost five graded
   passes to close and which the 65,534-byte ceiling guard exists to stop; and
3. entangling it with a length disclosure would make one base-red figure answer for two unrelated
   properties.

Its residual test is unchanged and still pins it.

**Also open, `PRE-EXISTING`, raised by pass 1 and left as a backlog line:**
`test/integration/phi-diagnostic-surface.test.ts` claims in its header to enumerate every
consumer-controlled position on the diagnostic surface, and it has no slot for this code. The
enumeration was already incomplete before this slice; widening it is a sweep across every code in
`WARNING_MESSAGES`, not a rider on one of them. The code's own PHI properties are pinned in
`test/deident/deident-method-lo-length.test.ts` under "the disclosure carries no value, no length,
no count and no origin".
