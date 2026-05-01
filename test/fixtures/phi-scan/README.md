# test/fixtures/phi-scan/

Synthetic DICOM fixtures for `scripts/phi-scan.ts` unit tests. **Every byte of every file in this directory was synthesized by `test/scripts/phi-scan.test.ts`'s `beforeAll` hook.** No real PHI; no third-party data.

| File                        | Purpose                                | PN             | DA         |
| --------------------------- | -------------------------------------- | -------------- | ---------- |
| `synthetic-pn-anon.dcm`     | clean — both fields allow-listed       | `ANON^PATIENT` | `19500101` |
| `synthetic-pn-doe.dcm`      | clean — DOE allow-list                 | `DOE^JANE`     | `19000101` |
| `old-date-1900.dcm`         | clean — DA pre-cutoff                  | `ANON^PATIENT` | `19000101` |
| `recent-date-violator.dcm`  | HIT — DA 2025                          | `ANON^PATIENT` | `20250612` |
| `recent-pn-violator.dcm`    | HIT — PN not allow-listed              | `SMITH^JOHN`   | `19000101` |
| `non-dicom-clean.json`      | clean text scan                        | n/a            | n/a        |
| `non-dicom-violator.txt`    | HIT — 1990 in text                     | n/a            | n/a        |

Fixtures are regenerated on every `pnpm test` run; do not edit by hand. The `.gitignore` at repo root excludes `test/fixtures/phi-scan/*.dcm` and other generated fixtures so a developer's local test run never accidentally stages them.
