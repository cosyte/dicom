# dicom - the PHI gate's walk root excluded the only place fixtures live (2026-08-08)

`PHI-SCAN-WALK-ROOT-SCOPE`, the org-wide class filed against every `@cosyte/*` repo. Written here
rather than in `documentation/agent-notes.md` because that file is **over** its 250,000-byte budget
on `main` and the hook refuses growth (ADR 0023). **Nothing dropped.**

**`CLAUDE.md` CARRIES NO LINE FOR THIS, DELIBERATELY, AND THAT IS A GAP RATHER THAN A JUDGEMENT THAT
THE TRAP IS SMALL.** Its ratchet is 39,550 bytes and it measured 39,544 on `main`: six bytes, which
is not a line. The remedy in that situation is relocation, never deleting an existing trap to make
room, and never raising the ceiling. So the rules live where a worker touching this code actually
reads them: the banner on `scripts/phi-scan.ts`, the cases in `test/scripts/phi-scan.test.ts` under
"the walk root is test/, not test/fixtures/", "an embedded base64 object is decoded outside markdown
too", "a declared root that cannot be walked refuses the scan" and "the walk is reconciled against
git ls-files", and this file. This is the same disposition `DICOM-SCANTARGET-PREAMBLELESS` reached
one day earlier, for the same reason.

**Provenance:** every figure below is a measurement taken on this repo, quoted with the sha it was
taken at. Base is `8982a16`. The base-side measurements are reproducible with
`git show 8982a16:scripts/phi-scan.ts` run from a checkout of that sha, and the throwaway-repo cases
are reproducible from the tests themselves.

**🛑 THE SCOPE WAS RE-DERIVED FROM THIS REPO'S OWN FILES, NOT PORTED.** The class's governing rule is
that a sibling's residual is not evidence about this one, and `hl7` measured two ported residuals as
NOT open there. Two of the sibling numbers do not survive here at all: **this package has no
`test/fixtures/` corpus to widen from** (see below), and its regular-file-root exit code is neither
`hl7`/`fhir`/`cli`'s `2` nor `terminology`'s `1` but **two different wrong answers depending on which
path was replaced**, both measured.

## What the gate was actually reading

The walk rooted at `test/fixtures/` and `README.md` + `docs-content/`. The number that makes the rest
of this file make sense:

| | base `8982a16` | head |
| --- | --- | --- |
| tracked files | 226 | 229 |
| opened by all-mode | **13** | **95** |
| outside the all-mode walk | **213** | 134 (133 outside the roots + 1 corpus exemption) |
| tracked under `test/` outside it | **82** | **1** (the corpus exemption, printed every run) |

**"Outside the all-mode walk" is not "scanned by neither route", and the two are easy to quote as
each other.** One of those 82, `test/fixtures/phi-scan/README.md`, was reachable by `--staged`, which
has never applied the corpus exemption. So the figure for **neither** route is **212 and 81**. Both
are written down.

**The fixture root contributed EXACTLY ZERO files.** Every file this package writes under
`test/fixtures/` is gitignored, because the suite regenerates them on every run
(`test/fixtures/phi-scan/*.dcm|json|txt`); the one tracked file left there is a `README.md` the walk
skipped by name. So the "fixture corpus" the gate was named for was empty, and the 13 files it opened
were the package README and the twelve pages under `docs-content/`.

**That matters more here than the shape of the number suggests, and this is the part that is
dicom-specific.** This package ships **no committed `.dcm` files at all** - `test/integration/parser-security.test.ts`
asserts as much as an invariant. Every fixture it owns is BUILT IN A `.ts` SOURCE FILE by
`test/helpers/build-dicom.ts`. So the entire committed fixture corpus was inside the 81 tracked files
under `test/` that the walk root excluded, and the gate had never opened one of them.

Pointing this scanner at that root finds **81 PN/date hits across 20 files**. Naming all 82 tracked
files under `test/` by path finds **83 across 21**; the two extra are in the corpus-exempt README,
which all-mode does not open. Both numbers are written down so neither can be quoted as the other.

## The four ways a declared root went unopened while the gate printed clean

Each was measured on base, and each is pinned by a case with a positive beside it.

| shape | base `8982a16` | head |
| --- | --- | --- |
| root MISSING entirely | exit **0**, `OK - no hits` | exit 2, names the root |
| root a DANGLING symlink | exit **0**, `OK - no hits` | exit 2, "a symbolic link" |
| root a symlink at a REAL directory | **followed and walked** (see below) | exit 2, "a symbolic link" |
| root a REGULAR FILE | exit **0** at `test`, exit **1** at `test/fixtures` | exit 2 |
| root present but EMPTIED | exit **0** | exit 2, via `git ls-files` |

**One row of that table is a different KIND of fact and saying so cost a refuter pass.** Four of the
five are exit 0 *structurally*: nothing was opened, so nothing could be found. The symlinked-at-a-
real-directory row is not - base FOLLOWED the link and scanned whatever was behind it, so it exits 0
over clean contents and **1** over a name-bearing file. The defect there is not the exit code; it is
that the gate reported on a tree the declared root does not name, and would have reported clean over
the corpus if the link pointed somewhere empty.

**The dangling case is the sharpest, and it is an `existsSync` fact rather than a `walk()` fact.**
`existsSync` FOLLOWS the link, so a dangling one answers `false`; the old code's
`if (existsSync(root))` returned before `readdirSync` was ever called, which means the
not-a-regular-file rule that catches a link INSIDE a root could not fire for the root itself. The fix
is `lstatSync`, which answers about the link rather than the target, so a root is classified by the
same closed set as any entry under it.

**🛑 THE EXIT CODE IS DERIVED FROM THIS SCRIPT'S OWN CONTRACT AND PORTING ONE IS THE BUG.** The
banner says 0 clean / 1 hits / 2 invocation error, and every refusal here is an `InvocationError`, so
it is **2**. Base answered the regular-file shape two different wrong ways and neither was 2: a
regular file at `test` meant the old root `test/fixtures` did not exist, so the run exited **0**; a
regular file at `test/fixtures` itself raised an uncaught `ENOTDIR` out of `readdirSync` and the
process exited **1**, the one code that means "PHI was found".

**EXISTENCE IS NOT OBSERVATION, so both halves ship.** Refusing a MISSING root leaves the other half
open, because an EMPTIED root is perfectly present and hands the walk nothing. The remedy for that
half is reconciling the walked set against `git ls-files` over the declared roots: every tracked path
must land in exactly one of OPENED, GITIGNORED or corpus-EXEMPT, and anything else refuses.

**🛑 AND A DENOMINATOR DOES NOT DETECT IT.** `ncpdp` refuted that remedy and the refutation holds
here: a count of the files that were reached counts only the roots that were there to reach. Nothing
in this change prints a scanned-file count, deliberately.

## 🔴 The escape this does NOT close, and no repo in the org has

**The reconciliation compares path SETS, not the bytes git carries at those paths.** A working tree
whose files are clean reconciles and exits 0 even when the INDEX at the same paths holds PHI, and a
root swapped for a directory that mirrors the tracked names does the same over decoy contents. It is
pinned by a test that asserts the escape rather than a fix, with the control that the identical bytes
ARE caught by `--staged`.

Widening the root makes this **narrower rather than safer**: a decoy now has to mirror every tracked
name under `test/` instead of the handful under `test/fixtures/`. Narrower is not closed.

## 🛑 Enumeration buys the floor, and the other half was open here too

The class's most expensive rule is that widening the walk and widening the recognizer are **two
different changes**, each "in addition to" and never "instead of". Both halves were open here, and
the second is dicom-specific.

`scanEmbeddedObjects` decodes base64 runs and scans the ones that are DICOM objects, and it ran
**only for a name in `TEXT_EXTENSIONS`** (`.json`, `.txt`, `.md`, `.csv`). A `.ts` file got
`scanText` and nothing else. Measured on base with one object and one name-bearing `(0010,0010)`:

- the same bytes as `probe.md` -> exit 1, `(0010,0010) PN` reported
- the same bytes as `probe.dcm` -> exit 1, `(0010,0010) PN` reported
- the same bytes as `probe.ts` -> exit 0, `OK - no hits`

So widening the walk root alone would have opened 81 `.ts` files and read straight past every object
encoded in one, in a package whose fixtures are exactly that. The decode runs **in addition to**
`scanText` and never instead of it, which keeps the strict-superset property the `scanTarget` banner
already documents.

> **⚠ `TEXT_EXTENSIONS` NO LONGER EXISTS**, so the measurement above is a record of base and not a
> description of the scanner. `DICOM-PHI-SCAN-RESIDUALS` (2026-08-09) deleted the by-name branch
> outright; every target now gets `scanText`, `scanEmbeddedObjects` and - if its bytes say so -
> `scanDicom`. `dicom-phi-scan-name-dispatch.md`.

**🩺 THE CLEAN RESULTS ARE PINNED BESIDE POSITIVES THE DETECTOR DOES CATCH, because a detector zero
can be a gap rather than a clearance.** The `.ts` zero above sits beside the `.md` and `.dcm` ones on
identical bytes; the "allow-listed payload in a `.ts`" case sits beside the violator case; the
narrow-exemption case writes the SAME payload one directory across and requires a hit. `#55`'s pin in
this repo was vacuous BY FIXTURE, so no payload here is anonymous: each carries a person name.

## What the 81 newly opened files turned out to hold

**🩺 A HAND-WRITTEN CENSUS IS A CLAIM; the file list is derived** with
`git ls-files test/ | grep -v '^test/fixtures/'`. Every one of the 81 was read end to end before this
change landed, across five fresh contexts, and the readings agreed: **no patient-identifying content**.

The hits the gate now sees are synthetic fixture values, disposed of as EXACT allow-list entries
(the entries this change ADDS are exact; the pre-existing prefixes are untouched, and it is the
pre-existing `Doe^` that excuses `Doe^Jane` across the newly opened files): `BOND^JAMES`,
`DEEPER^PATIENT`, `DEFLATE^TEST`, `NESTED^PATIENT`, `ROOT^PATIENT`, `SMITH^REF`, `SMITHSON^BRAIN`,
`XOE^JANE`, and `Yamada^Tarou`, which is PS3.5's own worked example for the three PN component
groups. `Yam^Tar` beside it is **not** in the standard: the vendored PS3.5 2026c carries
`Yamada^Tarou=<ideographic>=<phonetic>`, and `Yam^Tar` is the test's ASCII stand-in for the
ideographic group. A draft of the allow-list comment cited both as the standard's. Dates
`19800101` and `20240115`. And four entries that are **not dates at all** but DICOM tag numbers
satisfying the `YYYYMMDD` shape - `40101006`, `70011001`, `70011002`, `70011003` - listed as such in
the allow-list rather than mislabelled.

**🛑 WHAT THE HAND-READ FOUND THAT THIS GATE CANNOT SEE, and would not have seen if it ran forever.**
The recognizers look for caret-joined person names, ISO and compact dates, and PN/DA/DT values under
a hardcoded tag table. They do not look for an MRN, an accession number, an institution name, a phone
number, an email address, an SSN, or a vendor UID root. The newly opened files carry all of those
shapes, and every instance is synthetic or public:

- synthetic MRNs and accession numbers: `MRN-11111`, `MRN-99999`, `SECRET-MRN-123`, `ID-000123`, `ACC0099`, `12345`
- an invented institution: `ACME GENERAL HOSPITAL`, and the institution-shaped carriers
  `MERCY GENERAL HOSPITAL` / `MERCY GENERAL HOSPITALS` used as `(0008,0080)` fillers
- real, published, non-patient organisation identifiers, correct by necessity: DCMTK's
  `1.2.276.0.7230010.3.0.3.6.4` and `OFFIS_DCMTK_364`; the vendor private-creator strings
  `GEMS_IDEN_01`, `GEMS_ACQU_01`, `SIEMENS CSA HEADER`, `SIEMENS MEDCOM HEADER`; the NEMA
  `1.2.840.10008.*` registry; the GE root `1.2.840.113619` and the Medical Connections root
  `1.2.826.0.1.3680043` under invented suffixes

**"Newly scanned" is therefore not "newly cleared", and the reading is what cleared them, not the
gate.** Saying otherwise would be the exact overstatement this class keeps refuting.

## The circularity the widening creates, and why it is not answered with an exemption

The scanner's own test suite has to carry values the scanner must **reject**, and once the walk root
covers `test/` those values are in the corpus. Three ways out, and the reasons the first two were
refused:

1. **Allow-list them.** Not available: the tests assert `exit 1` on exactly those values, so
   allow-listing them makes the assertions fail. It would also have put the most plausible real name
   in the set on a permanent global allow-list.
2. **Exempt `test/scripts/phi-scan.test.ts` by path.** Available, and rejected: it is a 50 KB file,
   and an exemption that large is a hole the gate cannot see into.
3. **Assemble the values from parts that match no recognizer.** Chosen, in
   `test/helpers/phi-scan-violators.ts`. That file's bytes carry no caret-joined name and no date
   run, so **it is scanned like every other file under `test/` and needs no exemption at all**, while
   the values stay plain to a reader. The gate proved it works during this change: a first draft of
   that file's own explanatory comment spelled the PN shape out and the scanner reported it.

**So this change adds ZERO new exemptions.** The one exemption in force is the one that was already
here, `test/fixtures/phi-scan/README.md`, which documents the deliberate violator values in a table.
Two things changed about it and both are narrowings:

- it is now **ONE LITERAL PATH**, `test/fixtures/phi-scan/README.md`, rather than the old
  skip-any-`readme.md`-the-walk-meets rule, so widening the root did not widen the exemption by a
  single file. A `README.md` one level up at `test/fixtures/README.md` is scanned, and so is
  `test/smoke/README.md`; a case writes the same payload into two of those paths and requires one
  hit and one pass.
- it is **printed on stdout every run**. An exemption nobody can see is the same shape as a root
  nobody notices is empty.

**🛑 AND A DRAFT MADE IT WORSE IN THE ONE DIRECTION THIS ITEM FORBIDS, WHICH A REFUTER CAUGHT.** That
draft wrote the exemption as a PREDICATE ("a `readme.md` under `test/fixtures/`") and applied it to
`--staged` as well, on the reasoning that a rule cannot go stale and that the two routes ought to
agree. Both halves were wrong:

- **A predicate fails OPEN, an exact path fails CLOSED.** A stale exact path means the file moved,
  so it gets scanned and the gate reds until somebody looks. A predicate means every future
  `README.md` anywhere under `test/fixtures/`, at any depth, is exempt for as long as nobody
  notices. Staleness that reds is the cheap failure.
- **`--staged` is the pre-commit gate** (`package.json`'s `pre-commit` is `pnpm phi-scan --staged`)
  and it had never applied the exemption, so teaching it to SUBTRACTED a detection the base had, on
  the commit-blocking route. Measured on the refused draft: a staged README under `test/fixtures/`
  carrying a name exited **1** on base and **0** on the draft. The class went from one route to
  zero.

So the exemption is one literal path, on the `all` route only. The two routes disagree about exactly
that one file, they disagreed about it on base too, and the disagreement fails CLOSED: `--staged` is
the stricter of the two. That friction (a commit touching that README reds the hook) is
`PRE-EXISTING` and stays, because the only way to close it here is to scan less.

## Two more things the widening does not fix, disclosed

**The allow-list is GLOBAL and has no path scoping, so adding to it is a real widening.** The scanner
reads `scripts/phi-allow-list.txt` into one Set and applies it to every corpus it opens, so a value
listed because a `.ts` fixture needs it is equally excused in `README.md`, in `docs-content/` and in
a `.dcm`. A refuter measured exactly that on a `docs-content` page carrying the new values: clean at
head, exit 1 at the previous sha. The two worth naming are `DATE:19800101` and `DATE:20240115`, which
are plausible real birth and study dates. Path scoping is a change to the allow-list FORMAT and is
deliberately not made here; the cost is written into the file itself instead.

**🔴 The reconciliation is vacuous on an empty index.** `trackedInScope()` guards a git FAILURE, but
a legitimately empty answer passes in silence: in a repository where nothing under the declared roots
is tracked yet, there is nothing to reconcile against. It is a check against the INDEX and is exactly
as strong as the index is. Most of the throwaway-repo cases in `test/scripts/phi-scan.test.ts` never
commit, so the reconciliation is vacuous in them by construction; the four that exercise it call
`git add` first, and they are the only ones that say anything about it.

**An unexpected error used to exit 1.** `main()` had no top-level catch, so a `readdirSync` `EACCES`
on an unreadable subdirectory exited 1, the code that means "PHI was found". Widening the walk root
from `test/fixtures/` to `test/` enlarged the surface that can happen on, so it is closed here rather
than disclosed: an unexpected throw now prints `This is not a hit` and exits 2. Measured before the
catch existed: exit **1**.

## What is still out of scope, with the reason

Of 229 tracked files, 95 are opened, 1 is corpus-exempt, and **133 are outside the declared roots
entirely**: `src/` (72), `vendor/` (17), `scripts/` (13), `.github/` (8), `.changeset/` (4),
`documentation/` (3), `.claude/` (1) and 15 files at the repository root. Admitting them is a
**product call with its own false-positive surface**, not a side effect of this one.

**No hit count for them is written down, deliberately.** It is a number about prose as much as about
code: a draft of the banner comment moved the `scripts/` figure by one just by naming a tag in
eight-digit form, and a draft of this file moved the `documentation/` figure by one just by
existing. Derive it instead, in one command:
`git ls-files -z <dir> | xargs -0 pnpm phi-scan --`.

The two big ones are structural rather than accidental. `src/dictionary/generated/annex-e.ts` is a
generated table of DICOM tags, and tag numbers like `(4008,0101)` written as eight digits satisfy the `YYYYMMDD` shape, so the
compact-date pass matches hundreds of them; `vendor/nema/` is a SHA-pinned copy of a standards
document full of real publication dates. Neither is PHI, and neither is fixed by a walk root.

## What this change does NOT touch

`DICOM-SCANDICOM-SILENT-HALT` is a separate open item and is untouched: a **preamble-ful** Part 10
object still gets no text sweep behind `scanDicom`, so an early halt on one is still silent. Closing
it means sweeping every Part 10 object as text too, which would flag eight-digit runs inside pixel
data. That is a gate-behaviour change with its own false-positive surface and its own item.
