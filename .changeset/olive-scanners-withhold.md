---
"@cosyte/dicom": patch
---

Withhold the PHI gate's verdict over a target it enumerated and never opened, and put the install
hardening the estate baseline asks for actually in force.

`scripts/phi-scan.ts` filters an `--allow-fixture` target out of the run after enumerating it, and
until now the run then reported on whatever was left as if that were the whole corpus. The shape
that costs the most is not the obvious one: withdraw the ONLY violator and every surviving target is
clean, so the same argv that means "excuse this one fixture" produced a run indistinguishable from a
clean sweep. The scanner now tracks the paths a run declared against the paths it read, and a
non-empty difference exits **3** with a `WITHHELD:` line naming each path, after printing the hit
detail for everything it did read.

3 rather than 1 or 2, and each is a different sentence. 1 says "PHI is here", and overloading it
would make a bypass look like a finding and a finding look like a bypass. 2 says "the scan never
ran" and is what an UNLOGGED `--allow-fixture` already returns, having opened nothing; a withheld
run opened every other target and its hit lines are real. The rule is computed off the two sets
rather than off the flag, so the boundary is "enumerated and not read": a bypass naming a path this
run never enumerated withdraws nothing and still exits 0.

Every path with no bypass on it is byte-for-byte unchanged, which is the property the pre-commit
hook and CI depend on: `pnpm measure:phi-scan-unread` against the pre-change scanner reports
`violations: 0` over 195 cells, identical exit codes and an identical hit-line multiset. The new
suite coverage carries a mutation control that removes the rule from a planted copy and asserts the
graded run falls back to the hits code, and refuses as vacuous if the line it removes is ever
reworded.

`package.json` gains the `js-yaml@>=4.0.0 <4.3.0` override the shared baseline requires, ordered so
the stronger `<4.3.1` pin this repo already carried is the one that applies; no resolved version
moves. `pnpm-workspace.yaml` declares `minimumReleaseAge: 1440` and `trustPolicy: no-downgrade`, and
`packageManager` moves to `pnpm@10.34.5` because a pnpm below `10.21.0` ignores those keys entirely,
which is a settings file that decorates rather than defends.
