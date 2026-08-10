---
"@cosyte/dicom": patch
---

Stop the PHI gate constructing any `RegExp` at all, and stop its override log honouring a template
line as a live bypass. Both were disclosed by the previous slice and turn out to be one mechanism.
V8 keeps the last successful match on the `RegExp` constructor, so a matched subject stays readable
from `RegExp.input` and `RegExp.lastMatch` anywhere in the process. The scan route stopped handing
target bytes to a pattern last time; the gate's own configuration did not, and that residual was
disclosed as a number rather than a description, every clean column of the instrument reading
`input 3772`. Re-measured before building to it: that is `scripts/phi-allow-list.txt` in UTF-16 code
units, not the 3,774 bytes the file is on disk.

A runtime census of every pattern the script runs found five live sites, all four config parsers,
and `loadOverrideLog` held two of them. On the route that reads the override log the retained
subject IS the fence-blind template line, held verbatim, which is what made this one slice and not
two. All five are now forward scanners, so the carve-out sentence that was refused in three wordings
is deleted rather than worded again. A scrub was available and refused once more: a bound that holds
only from where a cleanup is called is not a bound.

`overrideLogPaths` is the one parser deliberately narrower than the pattern it replaces, in the
fail-closed direction, because a dropped entry makes `--allow-fixture` refuse and therefore scan.
It is fence-aware, so the committed `### <path>` template inside the "Format" block is no longer an
allow entry, and an all-whitespace heading no longer registers a lone space as a path. The template
entry's inertness was re-measured rather than inherited and holds twice over: neither gating route
can produce a target that normalizes to a root-level path, and it was live only where a caller names
the file itself.

Everything else is equivalence, measured: 0 differing bytes across 34 cells and 9,283 hit lines
against a mutation control differing in 17, and 5 of 6 config routes byte-identical with the sixth
required to differ. Developer-facing only, no public API change.
