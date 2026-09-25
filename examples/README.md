# Examples

Small runnable programs, one per job the package does. Each one imports `@cosyte/dicom` by its
published name, so it runs against the built package exactly as a consumer installs it, prints what
it read or wrote, and checks its own output: a mismatch exits non-zero. The one object they read is
synthetic: an invented patient, example-root UIDs, header attributes only.

Build once, then run them all:

```bash
pnpm install
pnpm build
pnpm examples
```

| File                                                         | What it shows                                                                                                                                    | Run                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [`read-metadata.ts`](read-metadata.ts)                       | Read the patient, study, series and image views, name the SOP class from the dictionary, and convert the study date.                             | `pnpm tsx examples/read-metadata.ts`            |
| [`walk-elements.ts`](walk-elements.ts)                       | Walk every element with its dictionary name and its typed, decoded value.                                                                        | `pnpm tsx examples/walk-elements.ts`            |
| [`tolerate-and-reserialize.ts`](tolerate-and-reserialize.ts) | Read an object saved without its preamble, see the stable warning code, and write it back as spec-clean Part 10 that reads back with no warning. | `pnpm tsx examples/tolerate-and-reserialize.ts` |
| [`deidentify.ts`](deidentify.ts)                             | De-identify the header with the PS3.15 Annex E Basic Profile, print the audit report, and write the result out.                                  | `pnpm tsx examples/deidentify.ts`               |

`data/ct-object.ts` holds the synthetic CT object as base64, a copy of the first-use fixture the
README and the quickstart parse, kept in a module because this repository builds every fixture in
one rather than committing binary files.

CI runs `pnpm typecheck:examples`, `pnpm lint:examples`, `pnpm examples` and
`pnpm phi-scan:examples` after `pnpm build` on every pull request, so an example that drifts from
the package fails the build. The PHI scan decodes the base64 object and scans it as DICOM.
