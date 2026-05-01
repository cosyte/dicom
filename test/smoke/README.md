# test/smoke/

Two minimal harnesses that exercise the published-shape `dist/` artifacts:

- `esm/index.mjs` — ESM consumer (`import` syntax; runs as ECMAScript module)
- `cjs/index.cjs` — CJS consumer (`require` syntax; runs as CommonJS regardless of `"type": "module"`)

Each harness imports `VERSION` + `Dictionary` from `../../../dist/index.{mjs,cjs}`, runs ~9 assertions covering DICT-03 / DICT-04 / DICT-06 / D-10, and prints a single `[smoke:<label>] OK` line on success (assertion failures throw and exit non-zero).

Why a relative path into `dist/` instead of `from "@cosyte/dicom"`? The package is **not** installed in `node_modules` during smoke. We test the built artifacts directly so any `exports`-map or condition-resolution bug surfaces immediately. `pnpm typecheck:exports` (= `attw --pack .`) covers the install-shape resolution complementarily.

The driver `scripts/smoke.ts` (run via `pnpm smoke`) spawns each harness in its own `node` subprocess (array-form `spawnSync`, `shell: false`) and aggregates exit codes. The harnesses must run **after** `pnpm build`; CI's job order is `build` → `smoke` so the `dist/` artifacts are guaranteed present.

This complements vitest unit tests (which run against the source TypeScript) by confirming the built tarball's module-system resolution is correct end-to-end. SETUP-02 + D-22 deliverable.

## Running locally

```bash
pnpm build
pnpm smoke
```

Expected output (truncated):

```
[smoke:esm] OK — VERSION=0.0.0 PN=PatientName TS=Explicit VR Little Endian
[smoke:cjs] OK — VERSION=0.0.0 PN=PatientName TS=Explicit VR Little Endian
[smoke] OK — both ESM and CJS harnesses passed.
```

## When to update

- Anytime `Dictionary`'s public surface changes shape (new method, renamed export, changed entry shape) — update both harnesses in lockstep so they exercise the new surface.
- Anytime the package `exports` map gains a new condition (e.g. `worker`, `browser`) — add a harness under a new subdirectory and wire it into `scripts/smoke.ts`'s `HARNESSES` array.

The harness intentionally keeps its assertions minimal: deep coverage lives in `src/dictionary/index.test.ts` and the various `*.test.ts` siblings. Smoke's job is to prove the build artifact loads at all and exposes the documented surface.
