---
"@cosyte/dicom": patch
---

Wire the em-dash gate into CI (`EMDASH-CONFORMANCE`).

Adds `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) and a dedicated
`.github/workflows/no-emdash.yml` job enforcing the brand ban on `U+2014` over both halves
the rule covers: the tracked files, and the PR title, body, and commit messages. The
workflow carries the non-default `edited` pull-request trigger, so retitling a PR re-checks
it, which matters because this repo squash-merges.

Content did change, unlike the earlier ports. An ecosystem survey had measured markdown only
(0 of 25 `.md` files) and read dicom as clean; measuring all 178 tracked files found six em
dashes in four non-markdown files, all removed here. One is user-visible: the npm
`description` in `package.json` now reads "Developer-focused DICOM Part 10 parser + utility
library for Node.js and TypeScript: metadata-first, vendor-quirky-tolerant, dual ESM/CJS."
The other three are `.github/CODEOWNERS`, `.github/workflows/release.yml`, and
`vendor/nema/SHA.txt`.

The script is the text-only variant taken from `ncpdp` (PR #34, `39212bb`), so it carries
that repo's two fixes to the shared shape rather than the older `knowledgebase` holes: a
tracked file named `-` was read by `grep` as standard input and never opened, and `-d skip`
silently passed a tracked symlink to a directory.

It omits `grep -I`, which is the load-bearing choice here. `src/dataset/vr/charset.ts` holds
a functional NUL inside `/[\x00 ]+$/u`, so grep classifies it binary. It carries no em dash
today and scans green (the red comes from a match, never from the NUL, which is why this port
was never actually blocked). If it ever gains one, grep reports a binary-file match on stderr
with empty stdout, the stderr capture fires, and the gate reds. Measured, and measured again
with `-I` added, where the same edit goes green.

Nine routes by which a dead or blind scan could still print OK are each checked red rather
than assumed. Tooling only: no runtime, public-API, or parse-behavior change.
