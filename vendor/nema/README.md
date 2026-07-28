# vendor/nema/

Pinned copies of NEMA's **normative** DICOM DocBook sources. NEMA publishes the standard itself;
everything else in `vendor/` is a mirror of it. Where a mirror and this directory disagree about
something PS3.6 publishes, this directory wins.

Runtime has zero dependency on these files. They are inputs to the generators under `scripts/`, and
only the generated TypeScript under `src/dictionary/generated/` is imported by the library.

## Layout

| Path                                   | Part  | Status                                                   |
| -------------------------------------- | ----- | -------------------------------------------------------- |
| `part06/SHA.txt` + `part06/<sha256>/`  | PS3.6 | **Active.** Normative overlay for the data dictionary.   |
| `SHA.txt`                              | PS3.15| Reserved, inactive. Annex E fallback (see below).         |

The PS3.15 pin keeps the flat `vendor/nema/<sha256>/part15-annex-e.xml` shape because
`scripts/generate-annex-e.ts` already contracts for it. PS3.6 cannot share that file (two documents,
two hashes), so it lives under `part06/`. New parts go under `<part>/`.

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
- **PS3.15 Annex E.** A different part, a different generator, and a resolved input path.

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

### PS3.15 Annex E fallback (reserved, inactive)

`SHA.txt` at this level still reads `RESERVED`. The Annex E action table is generated from the
Innolitics machine-readable input; see `scripts/_annex-e-discovery.md`. To activate the DocBook
fallback, follow the procedure in `scripts/generate-annex-e.ts`: pin
`https://dicom.nema.org/medical/dicom/current/source/docbook/part15/part15.xml` by SHA-256 into
`SHA.txt`, commit it at `vendor/nema/<sha-256>/part15-annex-e.xml`, flip the discovery doc's
`Decision:` line to `NEMA-DocBook-fallback`, and implement `parseNemaDocBook`.
