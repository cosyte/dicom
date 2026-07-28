# Annex E generator input source: discovery resolution

This file records how `scripts/generate-annex-e.ts` gets its input, and why.

**Current resolution: the normative PS3.15 DocBook is the authority, overlaid per field
on the Innolitics mirror.** Both inputs are read on every run. There is no branch and no
mode; the sections below are the history that got here.

## Why the mirror alone was not enough

The generator originally consumed only Innolitics'
`standard/confidentiality_profile_attributes.json`, pinned at
`90571bcc4e46b08bc815bd683e6c466308bcff9a`. That pin carries 621 entries, of which 617 are
concrete tags. PS3.15 2026c Table E.1-1 carries 656 rows, 652 of them concrete.

The 35 concrete attributes the mirror was missing were not obscure. They included
`(0010,0011)` Person Names to Use Sequence through `(0010,0016)` Pronoun Comment,
`(0010,0041)` through `(0010,0047)` (gender identity and sex-parameters-for-clinical-use),
and `(0010,2161)` / `(0010,2162)`, the two attributes that replaced the retired
`(0010,2160)` Ethnic Group. **32 of the 35 are marked X (remove)** by the current standard; the
other three are `(0040,B020)` Waveform Annotation Sequence (`X/D`), `(0070,0006)` Unformatted Text
Value (`D`), and `(300A,0054)` Table Top Position Alignment UID (`U`). Because `annexE()` returns `undefined` for a tag it does not carry, and
`deidentify()` treats `undefined` as "not listed, keep", each of those patient attributes
survived a call whose entire contract is that it does not, and the returned
`DeidentifyReport` said nothing about them.

A mirror is a third-party parse on a third party's schedule. For a table that decides
whether a patient identifier survives, the schedule has to be NEMA's.

## What each input is authoritative for

| Input | Path | Authority |
| ----- | ---- | --------- |
| NEMA PS3.15 DocBook | `vendor/nema/part15/<sha256>/part15.xml` | **Normative.** Table E.1-1: attribute name, Basic Profile action code, and all nine metadata-affecting option columns, for every tag it publishes. |
| Innolitics mirror | `vendor/innolitics/<short-sha>/confidentiality_profile_attributes.json` | Base rows. Supplies a tag PS3.15 does not publish, and nothing else. |

The overlay is **per field, not wholesale**:

- A tag both carry: PS3.15 supplies the name, the Basic Profile code, and the whole option
  set. Every action-code override is printed individually at generation time, because a
  changed action code is the one difference that decides whether an identifier survives.
- A tag only PS3.15 carries: added.
- A tag only the mirror carries: **kept.** PS3.15 retires rows rather than deleting them,
  so an absence is far more likely to be a parse gap here than a withdrawal there, and
  dropping one would turn an attribute the de-identifier acts on into one it silently
  keeps. That set is **empty today**, and the generator prints its size on every run so
  the claim stays observable rather than assumed.

The pin is a **precondition**, not a comment: the generator re-hashes `part15.xml` and
refuses to run if it does not match `vendor/nema/part15/SHA.txt`.

There is deliberately **no staleness clock**. See `vendor/nema/README.md` for the reasoning
and for the one content-comparing command that answers "has NEMA moved".

## Files at `90571bc/standard/` searched (original discovery, 2026-05-01)

```
standard/attributes.json
standard/ciod_to_func_group_macros.json
standard/ciod_to_modules.json
standard/ciods.json
standard/confidentiality_profile_attributes.json   <-- candidate
standard/macro_to_attributes.json
standard/macros.json
standard/module_to_attributes.json
standard/modules.json
standard/references.json
standard/sops.json
```

| File                                       | Schema notes                                                                                                                                                                                                                                                                                                                                                                                  | Annex-E-suitable? |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `confidentiality_profile_attributes.json`  | JSON array, 621 entries. Each entry: `{ name, tag (paren-comma form), id (8-char hex), stdCompIOD, basicProfile, ...optionFields }`. Per-option-set fields: `cleanDescOpt, cleanGraphOpt, cleanStructContOpt, rtnDevIdOpt, rtnInstIdOpt, rtnLongFullDatesOpt, rtnLongModifDatesOpt, rtnPatCharsOpt, rtnSafePrivOpt, rtnUIDsOpt`. | YES (as the base) |
| `attributes.json`                          | Part 6 attribute table: keyword/VR/VM/name. Not Annex E.                                                                                                                                                                                                                                                                                                                                      | NO                |
| `uids.json`                                | UID dictionary. Not Annex E.                                                                                                                                                                                                                                                                                                                                                                  | NO                |
| `ciods.json` / `modules.json` / `macros.json` / `*_to_*.json` | Composite IOD / module / macro composition tables. Not Annex E.                                                                                                                                                                                                                                                            | NO                |

## Coverage vs PS3.15 Annex E option sets

The 11 option sets in `AnnexEOption` map to Table E.1-1 columns as follows.

| `AnnexEOption` (E.3.x)                        | Table E.1-1 column           | Notes |
| --------------------------------------------- | ---------------------------- | ----- |
| `CleanPixelData` (E.3.1)                      | _none_ (pixel-level)         | E.3.1 acts on pixel data, not metadata; Table E.1-1 has no per-attribute column for it. Enforced at the pixel-decode layer. |
| `CleanRecognizableVisual` (E.3.2)             | _none_ (pixel-level)         | Same: pixel/burned-in-text scrubbing, not per-attribute. |
| `CleanGraphics` (E.3.3)                       | `Clean Graph. Opt.`          | Direct. |
| `CleanStructuredContent` (E.3.4)              | `Clean Struct. Cont. Opt.`   | Direct. |
| `CleanDescriptors` (E.3.5)                    | `Clean Desc. Opt.`           | Direct. |
| `RetainLongitudinalTemporal` (E.3.6)          | `Rtn. Long. Full Dates Opt.` | **Collapsed.** See below. |
| `RetainPatientCharacteristics` (E.3.7)        | `Rtn. Pat. Chars. Opt.`      | Direct. |
| `RetainDeviceIdentity` (E.3.8)                | `Rtn. Dev. Id. Opt.`         | Direct. |
| `RetainUIDs` (E.3.9)                          | `Rtn. UIDs Opt.`             | Direct. |
| `RetainSafePrivate` (E.3.10)                  | `Rtn. Safe Priv. Opt.`       | Direct. |
| `RetainInstitutionIdentity` (E.3.11)          | `Rtn. Inst. Id. Opt.`        | Direct. |

### The E.3.6 collapse, measured

E.3.6 is two options in PS3.15, not one: retain longitudinal temporal information **with
full dates**, and **with modified dates**. `AnnexEOption` carries a single
`RetainLongitudinalTemporal`, which takes the full-dates column. The original resolution
said the two columns "usually don't" diverge and that the generator would record it if
they did. They diverge on **169 of the 652 concrete rows** in PS3.15 2026c, essentially
all of them `K` under full dates and `C` under modified dates.

That number is now printed on every generator run rather than asserted here. Splitting the
option in two is a public-surface change (`AnnexEOption`, `DEIDENTIFY_OPTIONS`, and the
`deidentify()` option semantics) and is deliberately not part of the normative-overlay
slice. Until it happens, activating `RetainLongitudinalTemporal` means the full-dates
sub-option, which is what the collapse has always meant.

### Rows that are not a single tag

Four Table E.1-1 rows name a family rather than one attribute: `(50xx,xxxx)` Curve Data,
`(60xx,3000)` Overlay Data, `(60xx,4000)` Overlay Comments, and `(gggg,eeee) where gggg is
odd` Private Attributes. An exact-tag map cannot key them, and both the mirror path and
this one skip them. They are **counted and printed on every run** instead of being dropped
in silence. Private attributes are removed by `deidentify()` through a separate path
(`isPrivateTag`); the three repeating-group rows are a known, stated gap that this
generator does not close.

## Generator behavior

`pnpm gen:annex-e` reads `vendor/innolitics/SHA.txt` for the mirror path and
`vendor/nema/part15/SHA.txt` for the normative one, verifies the PS3.15 SHA-256 against the
bytes on disk, reads the edition from the document's own `<subtitle>`, parses Table E.1-1,
overlays, and writes `src/dictionary/generated/annex-e.ts`. Output is deterministic. CI
gates that the committed artifact is byte-for-byte what the pinned inputs produce
(`.github/workflows/dictionary-regen.yml`).

The parser fails loudly rather than emitting a thinner table: it requires a single header row whose
15 column labels sit where the generator's column indices expect them, exactly 15 cells per body row,
a tag cell it recognizes, an action code from Table E.1-1a in every non-empty action column, a
non-empty Basic Profile cell, every `<tr>` in the table accounted for as a matched body row or a
header row, and at least 600 concrete rows. The header check is the one that catches a column
**reorder**: a cell count cannot, and a reorder would read one option's action code as another's.

Re-pinning either input is documented in `vendor/nema/README.md` and
`vendor/innolitics/README.md`; both end in `pnpm gen:all` plus a review of the printed
overlay summary.
