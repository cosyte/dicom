# vendor/nema/

Pinned copies of NEMA's **normative** DICOM DocBook sources. NEMA publishes the standard itself;
everything else in `vendor/` is a mirror of it. Where a mirror and this directory disagree about
something PS3.6 publishes, this directory wins.

Runtime has zero dependency on these files. They are inputs to the generators under `scripts/`, and
only the generated TypeScript under `src/dictionary/generated/` is imported by the library.

## Layout

| Path                                   | Part   | Status                                                       |
| -------------------------------------- | ------ | ------------------------------------------------------------ |
| `part06/SHA.txt` + `part06/<sha256>/`  | PS3.6  | **Active.** Normative overlay for the data dictionary.        |
| `part15/SHA.txt` + `part15/<sha256>/`  | PS3.15 | **Active.** Normative overlay for the Annex E action table.   |

One directory per part, each with its own `SHA.txt` and its own `<sha256>/` tree, because each part
is a separate document with a separate hash. PS3.15 used to be reserved as a flat
`vendor/nema/SHA.txt` + `vendor/nema/<sha256>/part15-annex-e.xml`; when it was activated it moved
under `part15/` to match, and the whole `part15.xml` is vendored rather than an Annex E slice, so
that the pin can be verified against the published document byte for byte. New parts go under
`<part>/`.

## PS3.6, Part 6: Data Dictionary

- **Source:** `https://dicom.nema.org/medical/dicom/current/source/docbook/part06/part06.xml`
- **Edition:** PS3.6 **2026c** (read from the document's own
  `<subtitle>DICOM PS3.6 2026c - Data Dictionary</subtitle>`, not asserted here)
- **Retrieved:** 2026-07-28
- **SHA-256:** `ff1dcdfb557d57db96420614fcaf6d739bb76aa74b73eba77f367be9fab0be3e` (`part06/SHA.txt`)
- **Committed at:** `part06/ff1dcdfb.../part06.xml`, 9,665,786 bytes, verbatim
- **Copyright:** NEMA. Vendored unmodified as a build input, in the same way the standard's tables
  are quoted by every DICOM toolkit; the generated dictionary is the derived work.

### What it is authoritative for

The four registry tables, and only those: **Table 6-1** (Registry of DICOM Data Elements),
**Table 7-1** (File Meta Elements), **Table 8-1** (Directory Structuring Elements), **Table 9-1**
(Dynamic RTP Payload Elements). 5,309 rows in 2026c.

For a tag that appears in both PS3.6 and the Innolitics mirror, PS3.6 wins **per field** on
everything it publishes: name, keyword, VR, VM, and retirement. A tag PS3.6 carries and the mirror
does not is added. A tag the mirror carries and PS3.6 does not is kept, because PS3.6 retires
elements rather than deleting them, so an absence is much more likely to be a parse gap here than a
withdrawal there, and dropping the entry would turn a decoded element into an unknown one. That set
is empty today.

Deliberately **not** overlaid:

- **UIDs (Table A-1 / A-2).** `uids.ts` stays on `sops.json` + the curated table in
  `scripts/generate-dictionary.ts`. Its deviations from Table A-1 are intentional: four short forms
  every DICOM toolkit uses in place of PS3.6's "...: Default Transfer Syntax for ..." clauses, and
  retirement carried as a structured `retired` boolean instead of a trailing " (Retired)" glued into
  the name. An overlay would undo both, and PS3.6 Table A-1 is a superset this package covers only
  in part by design. Measured agreement is tabulated in `vendor/innolitics/README.md`.
- **PS3.15 Annex E.** A different part and a different generator; see its own section below.

### Verifying the pin

One command, and it compares content rather than dates:

```bash
curl -fsSL https://dicom.nema.org/medical/dicom/current/source/docbook/part06/part06.xml \
  | sha256sum | cut -d' ' -f1
# equal to vendor/nema/part06/SHA.txt -> `current` is still the pinned edition
# different                           -> NEMA published a new edition; re-pin (below)
```

Once 2026c is superseded, the archived edition URL becomes the stable one and must reproduce the pin
byte for byte: `https://dicom.nema.org/medical/dicom/2026c/source/docbook/part06/part06.xml`.
`current/` is a moving target by design, so it is the right URL for "has it moved" and the wrong one
for "is this still the same document".

There is deliberately **no automated staleness check**. A clock-based gate would fire on the day it
was written, demand an action nobody can take on demand (NEMA publishes when NEMA publishes), red
unrelated pull requests, and teach people to bump a date instead of re-deriving anything. What *is*
gated, in `.github/workflows/dictionary-regen.yml`, is that the committed dictionary is byte-for-byte
what these pinned inputs produce. That gate is offline, deterministic, and cannot fail on a calendar.

The generator adds a second, stronger check: it recomputes the SHA-256 of the file it reads and
refuses to generate if it does not match `part06/SHA.txt`. The pin is a precondition, not a comment.

### Re-pinning procedure

1. Fetch and hash:
   ```bash
   curl -fsSL -o /tmp/part06.xml \
     https://dicom.nema.org/medical/dicom/current/source/docbook/part06/part06.xml
   NEMA_SHA=$(sha256sum /tmp/part06.xml | cut -d' ' -f1)
   ```
2. `mkdir -p "vendor/nema/part06/${NEMA_SHA}" && mv /tmp/part06.xml "vendor/nema/part06/${NEMA_SHA}/part06.xml"`
3. `printf '%s\n' "${NEMA_SHA}" > vendor/nema/part06/SHA.txt`
4. Delete the previous `vendor/nema/part06/<old-sha>/` directory in the same commit.
5. `pnpm gen:dictionary`. It prints the edition it read and the overlay it applied: how many tags are
   shared, added, and mirror-only, and how many fields PS3.6 overrode, broken out by field. **Every
   VR override is printed individually**, because a changed VR is the one difference that changes how
   bytes become a value.
6. Review `git diff src/dictionary/generated/` against that summary, then `pnpm test`.
7. Commit the new `vendor/nema/part06/` tree and the regenerated `src/dictionary/generated/`
   together. The regen gate requires lockstep.

If the DocBook table shape changes, the generator fails loudly rather than emitting a thinner
dictionary: it requires exactly six cells per row, a well-formed `(gggg,eeee)` tag cell, an
identifier-shaped keyword, a VR token it recognizes, and at least 5,000 registry rows in total.

The row accounting is the part worth understanding, because a parser that quietly reads fewer rows
is how a dictionary shrinks without anyone noticing. Every `<tr>` inside a registry table must be
accounted for as either a body row that was matched or a header row. That single check covers all
three silent-drop shapes at once: a row whose markup the matcher does not recognize, a row in a
second `<tbody>`, and a row outside any `<tbody>`. An earlier version counted `<tr>` opens only
within the slice it had already truncated at the first `</tbody>`, which structurally could not see
the rows it had dropped; splitting Table 6-1 into two bodies made it read 207 rows instead of 5,309.
Do not simplify the check back into the body slice.

**A closed-up name like `PolynomialCoefficients` on `(0014,605F)` is correct, not a bug.** PS3.6
prints those names with a ZERO WIDTH SPACE where a reader sees a word break, and stripping it is
what makes the keyword column usable at all. Six entries that predate this pin have the same shape,
and the Innolitics mirror, an independent parse of the same document, produces character-for-character
the same names. Inserting a space would be hand-editing a generated table to taste.

## PS3.15, Part 15: Annex E de-identification action table

- **Source:** `https://dicom.nema.org/medical/dicom/current/source/docbook/part15/part15.xml`
- **Edition:** PS3.15 **2026c** (read from the document's own
  `<subtitle>DICOM PS3.15 2026c - Security and System Management Profiles</subtitle>`, not asserted
  here)
- **Retrieved:** 2026-07-28
- **SHA-256:** `77d60b856faf4223ab40a398c53130fc0ee9490d0d811ee3536e6d25c02ac717` (`part15/SHA.txt`)
- **Committed at:** `part15/77d60b85.../part15.xml`, 3,553,659 bytes, verbatim
- **Copyright:** NEMA. Vendored unmodified as a build input; the generated action table is the
  derived work.

### What it is authoritative for

**Table E.1-1** (Application Level Confidentiality Profile Attributes), and only that table. 656
rows in 2026c, of which 652 name a single tag.

This is the table `deidentify()` acts on, so the failure mode of a stale copy is not a wrong label:
it is a patient identifier that survives a call whose entire contract is that it does not, with a
clean return and an audit report that says nothing. The mirror snapshot this overlay replaced was
missing 35 concrete attributes, **32 of them marked X** (remove) by the current standard and the
other three `X/D`, `D` and `U`, including
`(0010,0012)` Name to Use, a patient's preferred name.

For a tag that appears in both PS3.15 and the Innolitics mirror, PS3.15 wins **per field** on
everything it publishes: the attribute name, the Basic Profile action code, and all nine
metadata-affecting option columns. A tag PS3.15 carries and the mirror does not is added. A tag the
mirror carries and PS3.15 does not is kept, for the same reason as in PS3.6: the standard retires
rather than deletes, so an absence is far more likely to be a parse gap here than a withdrawal
there, and dropping the entry would turn an attribute the de-identifier acts on into one it silently
keeps. That set is empty today, and the generator prints its size on every run.

Deliberately **not** represented:

- **The four family rows.** `(50xx,xxxx)`, `(60xx,3000)`, `(60xx,4000)`, and `(gggg,eeee) where gggg
  is odd` state a mask rather than a tag, and an exact-tag map cannot key them. Private attributes
  are handled by `deidentify()` through their own path; the three repeating-group rows are a stated
  gap. All four are counted and printed on every run rather than dropped in silence.
- **The second E.3.6 sub-option.** PS3.15 has two longitudinal-temporal options, full dates and
  modified dates; `AnnexEOption` carries one, which takes the full-dates column. The two columns
  diverge on 169 rows in 2026c, and that count prints on every run. See
  `scripts/_annex-e-discovery.md`.

### Verifying the pin

Same shape as PS3.6, and it compares content rather than dates:

```bash
curl -fsSL https://dicom.nema.org/medical/dicom/current/source/docbook/part15/part15.xml \
  | sha256sum | cut -d' ' -f1
# equal to vendor/nema/part15/SHA.txt -> `current` is still the pinned edition
# different                           -> NEMA published a new edition; re-pin (below)
```

Once 2026c is superseded, the archived edition URL becomes the stable one and must reproduce the pin
byte for byte: `https://dicom.nema.org/medical/dicom/2026c/source/docbook/part15/part15.xml`.

There is deliberately **no automated staleness check** here either, for exactly the reasons given
above for PS3.6. The generator recomputes the SHA-256 of the file it reads and refuses to generate on
a mismatch: the pin is a precondition, not a comment.

### Re-pinning procedure

1. Fetch and hash:
   ```bash
   curl -fsSL -o /tmp/part15.xml \
     https://dicom.nema.org/medical/dicom/current/source/docbook/part15/part15.xml
   NEMA_SHA=$(sha256sum /tmp/part15.xml | cut -d' ' -f1)
   ```
2. `mkdir -p "vendor/nema/part15/${NEMA_SHA}" && mv /tmp/part15.xml "vendor/nema/part15/${NEMA_SHA}/part15.xml"`
3. `printf '%s\n' "${NEMA_SHA}" > vendor/nema/part15/SHA.txt`
4. Delete the previous `vendor/nema/part15/<old-sha>/` directory in the same commit.
5. `pnpm gen:annex-e`. It prints the edition it read and the overlay it applied: how many tags are
   shared, added, and mirror-only, and **every action-code override individually**, because a changed
   action code is the one difference that decides whether an identifier survives the call.
6. Review `git diff src/dictionary/generated/annex-e.ts` against that summary, then `pnpm test`.
7. Commit the new `vendor/nema/part15/` tree and the regenerated artifact together. The regen gate
   requires lockstep.

If the DocBook table shape changes, the generator fails loudly rather than emitting a thinner table:
it requires a single header row whose 15 column labels sit where the generator's column indices
expect them (a cell count catches an inserted or dropped column but not a REORDER, which would
silently read one option's action code as another's), exactly 15 cells per body row, a tag cell it
recognizes, an action code from Table E.1-1a in every non-empty action column, a non-empty Basic
Profile cell, every `<tr>` in the table accounted for as a matched body row or a header row, and at
least 600 concrete rows.
