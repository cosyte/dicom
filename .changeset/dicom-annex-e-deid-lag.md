---
"@cosyte/dicom": patch
---

Fix a de-identification defect: `deidentify()` retained 35 patient-identifying attributes and
reported nothing.

The PS3.15 Annex E action table was generated from a third-party mirror alone, pinned at a snapshot
whose Table E.1-1 data is 2024b-era. Current PS3.15 publishes 652 concrete attributes; that snapshot
carried 617. `annexE()` returns `undefined` for a tag it does not carry, and `deidentify()` reads
`undefined` as "not listed, keep", so every missing attribute came through the call verbatim and the
`DeidentifyReport`, whose whole job is to say what was done, said nothing about them. The caller's
only signal was a clean return. This shipped at `0.0.3`.

32 of the 35 are marked X (remove) by the standard; the other three are `(0040,B020)` Waveform
Annotation Sequence (`X/D`), `(0070,0006)` Unformatted Text Value (`D`), and `(300A,0054)` Table Top
Position Alignment UID (`U`). The removals include:

- `(0010,0011)` through `(0010,0016)`, the person-names-to-use and pronoun block. `(0010,0012)`
  `NameToUse` is a patient's preferred name, and it survived verbatim.
- `(0010,0041)` through `(0010,0047)`, the gender-identity and sex-parameters-for-clinical-use
  attributes.
- `(0010,2161)` `EthnicGroupCodeSequence` and `(0010,2162)` `EthnicGroups`, the two attributes that
  replaced the retired `(0010,2160)` `EthnicGroup`. Advancing the data dictionary to the normative
  PS3.6 edition added these two to the registry, which widened the gap: the de-identifier recognized
  two more patient attributes it would not remove.
- The four `(0008,130x)` diagnosis code sequences, and the waveform, montage, acquisition-context and
  display-URI attributes at `(003A,xxxx)`, `(0040,Axxx)`, `(0040,Bxxx)` and `(0040,E012)`.

`(0032,1033)` `RequestingService` also gains the `CleanDescriptors: C` option column the mirror had
dropped.

The fix is the same authority rule the data dictionary already uses, pointed at PS3.15.
`vendor/nema/part15/` pins `part15.xml` (PS3.15 2026c) by SHA-256, and `scripts/generate-annex-e.ts`
applies Table E.1-1 as a per-field overlay over the mirror: for a tag both sources carry, PS3.15 wins
on attribute name, Basic Profile action code, and all nine metadata-affecting option columns; a tag
PS3.15 carries and the mirror does not is added; a tag the mirror carries and PS3.15 does not is
kept, because the standard retires rather than deletes, so an absence is far more likely to be a
parse gap here than a withdrawal there and dropping the entry would turn an attribute the
de-identifier acts on into one it silently keeps. That set is empty today, and its size prints on
every run so the assumption stays observable rather than assumed. Nothing is hand-corrected. No Basic
Profile code changed for a tag both sources carried, which is the reassuring half of the finding: the
mirror was not wrong about what it had, only silent about what it lacked.

The pin is a precondition, not a comment. The generator recomputes the SHA-256 of the file it reads
and refuses to generate on a mismatch, reads the edition from the document's own `<subtitle>` rather
than asserting it, and fails loudly rather than emitting a thinner table on a header row whose 15
column labels are not where the generator's indices expect them, a body row that is not 15 cells, a
tag cell it does not recognize, an action code outside Table E.1-1a in any non-empty action column,
an empty Basic Profile cell, a `<tr>` that resolves to neither a matched body row nor a header row,
or a total under 600 concrete rows. The header check is the one that catches a column reorder, which
a cell count cannot see and which would read one option's action code as another's. Every run prints the overlay it applied, with every
action-code override listed individually, because a changed action code is the one difference that
decides whether an identifier survives.

Two exclusions are deliberate and now print on every run instead of being assumed. Four rows of Table
E.1-1 state a family rather than a single tag (`(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data,
`(60xx,4000)` Overlay Comments, and the odd-group Private Attributes row); an exact-tag map cannot
key them, private attributes are removed through their own path, and the three repeating-group rows
remain a stated gap. And PS3.15's E.3.6 is two options, full dates and modified dates, against this
package's single `RetainLongitudinalTemporal`, which carries the full-dates column; the two columns
diverge on 169 of the 652 rows in 2026c, and that count now prints rather than living in a comment
that guessed "usually not".

There is deliberately no staleness clock, for the same reasons as PS3.6. What CI gates is unchanged
and offline: the committed table must be byte-for-byte what the pinned inputs produce.
