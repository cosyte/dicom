# The gate constructs no `RegExp` at all, and its override log is no longer fence-blind

> **⚠ DISCOVERABILITY, DISCLOSED RATHER THAN PAPERED OVER.** `CLAUDE.md` was **not** edited: derived
> headroom is **39,550 - 39,544 = 6 bytes**, which is not a line. **That is HEADROOM, not file size,
> and the shorthand has been misread twice.** Derive it, never restate it:
> `git show origin/main:CLAUDE.md | wc -c` against `REPO_CLAUDE` in the meta-repo's
> `.claude/hooks/doc-budget.mjs`. `documentation/agent-notes.md` is **257,209 B, over its 250,000
> ceiling** on `main`, so this record is here instead. **No trap deleted, no ceiling raised.**
> What points at it is `scripts/phi-scan.ts`, `scripts/measure-phi-scan-regex-statics.ts` and
> `documentation/agent-notes/dicom-phi-scan-regex-statics.md`, which are unbudgeted and cite this
> slug. **No always-read file does.**

`DICOM-RESIDUALS`, `conformance-refuter` gate. Base `01d0983`. Last verified 2026-08-10.

Closes the two residuals `#112` left open, and they turned out to be **one mechanism**, which the
census showed rather than an argument:

- *"The gate's own CONFIGURATION is still a `RegExp` subject"*, disclosed **by a measured figure
  rather than a description**: every clean column read `input 3772`.
- *"`PRE-EXISTING`: `loadOverrideLog` is FENCE-BLIND, so the committed `phi-scan-overrides.md`
  template line parses as a live allow entry."*

## The disclosed figure, verified before anything was built to it

`scripts/phi-allow-list.txt` is **3,774 bytes** and **3,772 UTF-16 code units**. The two differ by
exactly the one astral emoji in it, four bytes for two units. So `input 3772` is the allow-list
**in code units**, and quoting the byte count would have been wrong by two.

A runtime census over five invocation modes on `01d0983`, taken by wrapping `RegExp.prototype`'s
`exec`/`test` and the four `Symbol` methods and recording every call with its stack:

| route | regex operations | subject held at exit |
| --- | --- | --- |
| no arguments (all-mode) | **3,773**, every one `loadAllowList`'s split | `input` 3,772, `lastMatch` `"\n"` |
| `--max-hit-lines 5 <path>` | 3,775 | `input` 3,772 |
| `--staged` | 3,774 | `input` 32, the git raw record |
| `--allow-fixture <path>` | 597 | **`input` = `lastMatch` = `"### <path>"`** |
| `--max-hit-lines banana` | 2 | `input` 0 |

## 🛑 The census is what made this ONE slice rather than two

The last row is the finding. On the route that reads the override log, **the retained `RegExp`
subject IS the fence-blind template line**, held verbatim in both `input` and `lastMatch`. The two
residuals are not neighbours, they are the same eleven lines of code: `loadOverrideLog` held **two
of the five** live regex sites, and its fence-blindness is a defect of the same line-oriented parse
the regex was doing.

Every one of the five sites was on the configuration route. There were none anywhere else, which is
what `#112` had already achieved for the scan route.

## The fix

**The script now constructs no `RegExp`.** Five sites became forward scanners: `isAllDigits`,
`splitLines`, `tripleHashValue`, `fenceRun` + `overrideLogPaths`, and `rawRecordMode`.

**The carve-out sentence is DELETED rather than worded a fifth time.** `#112` was refused in passes
1, 2 and 3 for a universal its own config parsers falsified, and its final remedy deleted the
sentence. The way to stop wording a carve-out is to remove what it carved out, and the universal is
now simply true. **A scrub was again available and again refused** (`#109`, `#111`, `#112`): a bound
that holds only from where a cleanup is called is not a bound. There is nothing to clean up.

## 🔴 One parser is DELIBERATELY narrower, in the fail-closed direction

`overrideLogPaths` is **not** an equivalence, and this is the only intended behaviour change:

1. **Fence-awareness**, the residual itself.
2. **An all-whitespace heading no longer registers a lone space as a path.** Found while measuring
   the pattern, not inherited: `\s+` is greedy and `(.+?)` needs one character, so `"###  "` makes
   the engine hand one space back out of the run and capture it. `normalizePath(" ")` is then a
   root-level entry for a file named with a single space.

Both directions are fail-closed: a dropped entry makes `--allow-fixture` **refuse** (exit 2), which
scans the target rather than exempting it. `fenceRun` is deliberately **liberal about openings and
strict about closings** for the same reason. Seeing a fence CommonMark would not drops entries;
missing one is the direction that silently exempts a PHI target.

## 🛑 The inertness was RE-MEASURED, not inherited, and it holds twice over

`#112` recorded the fence-blind entry as inert. Re-measured here, in a throwaway repository with a
PHI-bearing file whose repo-relative path IS the placeholder:

| route | can a target normalize to `<path>`? | outcome |
| --- | --- | --- |
| `all` (what CI runs) | **no**, the placeholder is a ROOT-LEVEL path and `SCAN_ROOTS` is `test`, `README.md`, `docs-content` | never a target |
| `--staged` (what the pre-commit hook runs) | **no**; the file was staged, git listed it in `--raw`, and `SCAN_SCOPE` dropped it | never a target |
| explicit paths | **yes** | **exit 0, target exempted, silently** |

So the inertness is stronger than "no tracked path is named `<path>`": **neither gating route can
produce such a target at all.** It was live only where a caller names the file itself. Pinned beside
its controls: the same bytes with no flag exit **1**, and a path with no entry at all exits **2**.

**This is NOT a stop-the-line finding.** It is closed here regardless, because an allow-list entry
no human wrote is a silent exemption waiting for a path to match it.

## Figures, all re-measured on the shipped artifact

Base `01d0983` restored **by file copy**, never `git checkout`. Instrument extended and shipped as
`scripts/measure-phi-scan-regex-statics.ts`.

| | base | here |
| --- | --- | --- |
| scan shapes leaving a `RegExp` subject | **7 of 7**, `input 3772` | **0 of 7** |
| config routes leaving one | **5 of 6** | **0 of 6** |
| config routes byte-identical to base, as required | | **5** |
| config routes DELIBERATELY different | | **1**, and the instrument refuses if it is not |
| routes disagreeing with either expectation | | **0** |

| equivalence, whole output byte for byte | |
| --- | --- |
| cells (real corpus + adversarial + 32 fuzz corpora) | **34** |
| **cells differing from base in any byte** | **0** |
| cells that refused (exit 1) | 33 |
| hit lines compared | **9,283** |
| **MUTATION CONTROL, same cells, one character** | **17 cells differ** |
| detector positive control | fires, and **the instrument throws if it does not** |

**🛑 THE ZERO IS PINNED BESIDE POSITIVE CONTROLS AT BOTH ENDS.** The detector must report a token a
regex has just matched; the equivalence grid must report a one-character mutant; and the config
comparison names the one route that MUST differ, refusing with `NO CHANGE, where one was intended`
if the fence fix ever stops working. A control that cannot fail is not a control.

## Tests: 11 new cases, 7 red on base, and why 4 are green by design

**7 of 11 are red on `01d0983`.** The other **4 are GREEN ON BASE BY DESIGN**: they assert that
removing the regexes moved nothing, so a red one would mean the slice changed behaviour it should
not have. The figure that says they are not vacuous is the mutation grid, over the 17 cases in the
two files:

| mutant | cases red |
| --- | --- |
| `splitLines` splits on a lone `CR` | 1 |
| `isAllDigits` widened to `Number()` | 1 |
| `tripleHashValue` drops the `LineTerminator` check | 1 |
| `fenceRun` never sees a fence (base behaviour) | **5** |
| a closing fence need not be bare | 1 |
| fence indent allowance removed | 1 |
| tilde fences not recognized | 1 |
| all-whitespace narrowing reverted (base behaviour) | 1 |
| `isSpaceCode` drops `NBSP` | **4** |
| **`rawRecordMode` accepts UPPERCASE hex** | **0** |

The override-log parser is driven as a **membership oracle**: `--allow-fixture` is repeatable and
the refusal names every path it could not find an entry for, so one subprocess reports exactly which
of a candidate set the parser produced. Both directions are asked separately.

## 🔴 Not closed, and named rather than claimed away

- **Two shapes are unreachable from outside the script and NO TEST CLAIMS THEM.** `splitLines`'s
  `CRLF` handling is invisible because both callers `trim()`, and a `CR`-blind mutant passes the
  whole suite; `rawRecordMode` cannot be shown an uppercase-hex sha or trailing bytes after the
  status, because git does not emit either, and mutants widening both pass. **A first draft of this
  slice's JSDoc claimed an exhaustive differential for each. Both sentences were DELETED** rather
  than reworded, on this repo's own rule that a disclosure naming a test must name one that exists.
  What does pin `rawRecordMode` was measured instead: a mutant that never parses a record reds **14**
  of `phi-scan.test.ts`'s 138 cases, and one returning the SOURCE mode reds **12**.
- **The `#112` note's own two carriers of the closed disclosure were found by a `-a` phrase sweep
  with newlines folded** and updated rather than left to read as current. The sweep's positive
  control is `test/integration/fatal-diagnostic-surface.test.ts`, which plain `grep` prints nothing
  for: **7 tracked files in this repo are binary to a plain grep.**
- Unchanged by this slice, in either direction: `hits` unbounded as an array; the relocation,
  `contextPath` and `attributes[].tag`; a flood within one recognizer entry still burying a later
  hit; the never-draining-reader wait and `run-script.ts`'s 1 MiB `maxBuffer`; the exit code still
  cannot see an unread tail. **This slice measures nothing about the heap.**
