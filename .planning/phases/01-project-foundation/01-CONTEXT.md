# Phase 1: Project Foundation & Data Dictionary - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Mode:** `/gsd-discuss-phase 1 --auto` — recommended defaults auto-selected; see DISCUSSION-LOG.md.

<domain>
## Phase Boundary

Phase 1 stands up the empty repo and the build-time data spine that every downstream phase consumes. Concretely, this phase delivers:

1. A scaffolded TypeScript package (`@cosyte/dicom`) with locked toolchain, dual ESM+CJS build, strict TS, lint+format+test wired up, and a clean `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` flow.
2. A build-time **Part 6 data + UID dictionary generator** consuming Innolitics' `dicom-standard/attributes.json` at a pinned commit SHA, emitting committed TypeScript artifacts under `src/dictionary/generated/`.
3. A build-time **PS3.15 Annex E attribute-action-table generator** emitting committed artifacts that Phase 7 will consume.
4. A **PHI-scan CI hook** that blocks fixture commits with non-synthetic patient names or recent dates.
5. A smoke step that exercises both generators and ESM+CJS imports.

This phase delivers infrastructure only — no parser, no dataset model, no helpers. The only public runtime API surface introduced is the `Dictionary.*` lookup namespace (consumed by Phase 2 onward).

**Out of phase scope (already decided in ROADMAP.md):**
- Any parsing logic, VR decoders, sequence handling, helpers, serialization, profiles, anonymization → later phases.
- Generator inputs: dictionary work uses Innolitics JSON; **NEMA DocBook XML is not parsed in v1**. Annex E table sourcing is a research flag tracked in research/SUMMARY.md "Gaps to Address" and resolved within this phase's research step (consult Innolitics first; if not machine-readable there, parse PS3.15 DocBook with a CI checksum gate).
</domain>

<decisions>
## Implementation Decisions

### Toolchain (already locked — restated for downstream agents)
- **D-01 Language:** TypeScript 5.9.x, `"strict": true`, `"noUncheckedIndexedAccess": true`. No `any`. No unjustified `as` casts.
- **D-02 Target:** ES2022, dual ESM + CJS via `tsup` 8.5.x. `"type": "module"`. `exports` map declares `import`, `require`, `types` conditions.
- **D-03 Node floor:** `"engines": { "node": ">=18.18.0" }`. Hold at 18 for v1; revisit at v1.1 (PROJECT.md decision).
- **D-04 Dev deps pinned for Node 18 floor:** Vitest 3.x (NOT 4.x), ESLint 9.x (NOT 10.x), TypeScript 5.9.x (NOT 6.x), tsup 8.5.x, Prettier 3.8.x, tsx 4.21.x. pnpm 10.33.x.
- **D-05 Runtime deps:** target **0**; ceiling **≤ 3**, each MIT/Apache + ADR-justified under `.planning/`. Phase 1 ships with **0** runtime deps. `iconv-lite@0.7.x` is the only conditional candidate (gated on a failing ISO 2022 multi-extension fixture in Phase 4 — not Phase 1).
- **D-06 Package manager:** pnpm. Workspace not required for v1.
- **D-07 License:** MIT. `LICENSE` file at repo root in this phase.

### Generator Output Shape
- **D-08 Part 6 dictionary output format:** generator emits **committed `.ts` files** under `src/dictionary/generated/` (NOT `.json` parsed at runtime). Each file exports frozen lookup maps + branded TS types so consumers get full IntelliSense and zero runtime parse cost. Mirrors `@cosyte/hl7`'s generated-TS pattern.
- **D-09 Generated artifacts (minimum):**
  - `src/dictionary/generated/tags.ts` — keyword + VR + VM + name lookup keyed by 8-char hex tag.
  - `src/dictionary/generated/keywords.ts` — reverse map (keyword → tag).
  - `src/dictionary/generated/uids.ts` — UID → human-readable name (transfer syntaxes, SOP classes, well-known UIDs).
  - `src/dictionary/generated/annex-e.ts` — attribute-action table from PS3.15 Annex E, keyed by tag, valued as the Annex E action plus per-option-set overrides.
  - Each file includes a header comment with the input source SHA + regen command.
- **D-10 Public API surface (Phase 1 only):** `Dictionary.lookup(tag)`, `Dictionary.lookup(keyword)`, `Dictionary.byKeyword(keyword)`, `Dictionary.uid(uid)`. Returns the typed entry or `undefined`. No throws on miss.
- **D-11 Generated files are committed.** CI gates byte-identical regen on every PR (`pnpm gen:dictionary && git diff --exit-code` and `pnpm gen:annex-e && git diff --exit-code`). Runtime has zero network/filesystem dependency on the generator inputs.

### Generator Input Pinning
- **D-12 Innolitics input pinning:** commit `dicom-standard/attributes.json` (and any required sibling files) under `vendor/innolitics/<short-sha>/` at the **pinned commit SHA** identified in research/STACK.md. The generator reads from disk only — no network calls during `pnpm gen:dictionary`. SHA + retrieval date documented in `vendor/innolitics/README.md`.
- **D-13 Innolitics license preservation:** the `LICENSE` file from the Innolitics repo is committed alongside the JSON under `vendor/innolitics/<sha>/LICENSE` (MIT — compatible with `@cosyte/dicom` MIT). Re-pin policy: monthly cadence, evaluated at minor releases.
- **D-14 Annex E sourcing:** **first preference** — Innolitics' parsed Annex E (if published as machine-readable JSON in their repo). **Fallback** — parse PS3.15 DocBook XML directly in `scripts/generate-annex-e.ts`, with a SHA-256 checksum of the input committed to gate regen. Resolution of which path applies is a research-step deliverable for the Phase 1 planner.

### PHI-Scan CI Hook
- **D-15 Implementation:** `scripts/phi-scan.ts` — pure Node, zero dep, walks **only** files matching `test/fixtures/**` that are added or modified in the diff. Reads them as raw `Buffer`, locates DICOM header (`DICM` magic at offset 128), then runs lenient tag-walk **using only built-in Node APIs** (Phase 1 cannot depend on the not-yet-built parser). Specifically:
  - For DA / DT elements (tags `(*,*,DA)` / `(*,*,DT)`): parse the value, reject any date later than `today - 120 years`.
  - For PN elements: reject any value not matching the synthetic allow-list — patterns starting `ANON^`, `TEST^`, `DOE^`, `SYNTHETIC^`, or matching `^[A-Z]+\^[A-Z]+$` with a documented allowlist. Allow-list lives at `scripts/phi-allow-list.txt`.
  - For non-DICOM fixture files (e.g. `.json`, `.txt` test data): regex scan only.
- **D-16 Wiring:** runs as (a) a GitHub Actions job `phi-scan` on every PR (failing build on hit), and (b) a husky `pre-commit` hook that scans only the staged diff. Both invoke the same `scripts/phi-scan.ts` entrypoint.
- **D-17 Exit policy:** scan emits a structured report to stdout; non-zero exit on first hit; documents how to add a new synthetic identifier to the allow-list. Bypass requires explicit `--allow-fixture <path>` invocation that is logged into a committed `phi-scan-overrides.md` (intentionally annoying — discourages bypass).

### attw (Are The Types Wrong) Verification
- **D-18 Local invocation:** `pnpm typecheck:exports` runs `attw --pack` against the built tarball. Wired as a script in `package.json`.
- **D-19 CI invocation:** the `build` job in `.github/workflows/ci.yml` runs `pnpm pack && pnpm typecheck:exports` after `pnpm build`, failing the build on type-export drift. Both ESM and CJS conditions must resolve.

### Test Runner & Smoke Verification
- **D-20 Vitest config:** single `vitest.config.ts` at repo root. Coverage provider **`@vitest/coverage-v8`** (no native deps). Coverage gates not yet enforced in Phase 1 (the ≥ 90% gate is a Phase 8 deliverable); coverage runs in CI for visibility, but does not fail builds in Phase 1.
- **D-21 Test layout:** unit tests live next to source in `*.test.ts` files (sibling to the unit under test). Smoke harness under `test/smoke/`. No Phase 1 unit tests for parser/dataset/etc. — those modules don't exist yet. Phase 1 unit tests cover only `src/dictionary/` (lookup correctness against a small hand-curated fixture set drawn from the generated dictionary).
- **D-22 Smoke verification:** `scripts/smoke.ts` plus `test/smoke/esm/index.mjs` and `test/smoke/cjs/index.cjs` minimal harnesses. Each imports `Dictionary.lookup('00100010')`, asserts `{ keyword: 'PatientName', vr: 'PN' }` (or current dictionary edition equivalent), then loads the Annex E artifact and asserts a known entry. CI runs `pnpm smoke` after `pnpm build`. Directly exercises Phase 1 success criteria #2 and #5.

### CI Matrix
- **D-23 Node matrix:** **18.18, 20.x LTS, 22.x LTS** on **Ubuntu only**. macOS/Windows runners deferred to v1.1 (cost vs value at v1).
- **D-24 Workflow files:** `.github/workflows/ci.yml` (build/lint/test/smoke/attw/phi-scan) + `.github/workflows/dictionary-regen.yml` (gates byte-identical generator output). All workflows pass `actionlint` (validated as part of Phase 1 — kit precedent).
- **D-25 Branch protection:** documented in PHASE summary at the end of execution; `main` requires CI green. Setting branch protection itself is out of phase scope (manual GitHub repo admin).

### Layout Decisions Carried Forward to Later Phases
- **D-26** Generator artifacts at `src/dictionary/generated/*.ts` — Phase 2 imports `Dictionary` from `@cosyte/dicom/dictionary` (declared in `exports` map).
- **D-27** Phase 1 does NOT introduce: a `Dataset` type, an `Element` type, parser entry points, helpers, or serialization. Phase 1's `src/index.ts` exports **only** the `Dictionary` namespace + version constant. Subsequent phases extend the public surface.

### Claude's Discretion
- Exact file/folder names within `src/dictionary/generated/` — recommended above; planner may rename for ergonomics as long as the generator output is committed TS and the public `Dictionary.*` API matches D-10.
- Husky vs. lefthook vs. simple-git-hooks for the pre-commit wiring — planner chooses based on dev-dep weight (target the lightest viable; `simple-git-hooks` is the leading candidate at zero transitive cost).
- Specific `eslint.config.js` flat-config rule set — start from `@cosyte/hl7`'s and remove HL7-specific rules. Diff documented in plan.
- Whether to ship a `tsconfig.base.json` + `tsconfig.json` split now or wait until v1.x — planner discretion; sibling parity not required.

### Folded Todos
None — `gsd-todo` parking lot is empty (project just initialized).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before acting on this phase.**

### Project planning
- `.planning/PROJECT.md` — vision, constraints, key decisions (toolchain pinning, runtime-dep budget, Postel's law, fatal-error tier).
- `.planning/REQUIREMENTS.md` — REQ-IDs assigned to Phase 1: SETUP-01..06, DICT-01..06, TEST-09 (CI-scan half).
- `.planning/ROADMAP.md` §"Phase 1: Project Foundation & Data Dictionary" — goal + success criteria + plan suggestions.
- `.planning/CLAUDE.md` (repo root) — engineering guardrails (no `any`, no `console.*`, JSDoc on public exports, immutability, Buffer-first, coverage target).

### Research
- `.planning/research/SUMMARY.md` — overall research synthesis + open questions for the orchestrator (especially Q1 runtime-dep budget, Q2 Node floor — both resolved here).
- `.planning/research/STACK.md` — version-pinning rationale (Vitest 3 / ESLint 9 / TS 5.9 hold; Innolitics SHA pinning; `zlib.inflateRawSync` callout for Phase 2).
- `.planning/research/FEATURES.md` — feature gap matrix (informs DICT-* completeness expectations).
- `.planning/research/ARCHITECTURE.md` — `src/` layout (validates `src/dictionary/` placement and the planned `src/charset/`, `src/path/`, `src/pixel/` modules introduced in later phases).
- `.planning/research/PITFALLS.md` — pitfall #1 (Deflated TS raw inflate) and #2 (Private Creator block reservation) are NOT this phase's concern; documented for cross-reference only.

### External (read at research time, not committed)
- Innolitics `dicom-standard` repo (MIT) — `https://github.com/innolitics/dicom-standard` — pinned commit SHA recorded in `.planning/research/STACK.md`. Phase 1 research step must verify the SHA is still resolvable and capture `attributes.json` (and any Annex E artifact, if published).
- DICOM PS3.6 (Data Dictionary) — `dicom.nema.org/medical/dicom/current/output/html/part06.html` — only consulted to spot-check the Innolitics output; not a build input.
- DICOM PS3.15 Annex E (Anonymization) — `dicom.nema.org/medical/dicom/current/output/html/part15.html#chapter_E` — input to the action-table generator if Innolitics doesn't ship a parsed version.

### Sibling reference
- `/home/nschatz/projects/cosyte/hl7-parser/` — particularly `.planning/phases/01-*/` and `package.json`/`tsup.config.ts`/`vitest.config.ts`/`eslint.config.js` at the repo root. Tooling, scripts, and CI workflows mirror this sibling closely; **divergences require explicit ADR**.
</canonical_refs>

<code_context>
## Existing Code Insights

**Codebase state:** repo is empty save for `CLAUDE.md`, `.gitignore`, and `.planning/`. There is NO source code, NO `package.json`, NO `tsconfig.json` yet. Phase 1 creates all of these from scratch.

### Reusable Assets (external — sibling repo)
- `@cosyte/hl7` repo — `package.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`, `.github/workflows/`, `.husky/`, `scripts/` are direct templates. Copy, then prune HL7-specifics, then minor-version refresh.
- `@cosyte/hl7` generator pattern — `scripts/generate-*.ts` pattern (whatever the sibling repo uses for its own generated artifacts) is the reference for `scripts/generate-dictionary.ts` and `scripts/generate-annex-e.ts`.

### Established Patterns (project-level guardrails — already in CLAUDE.md)
- No `any`, no unjustified `as` casts; use `unknown` and narrow.
- JSDoc with `@example` on every public export.
- Immutable by default; mutation only via explicit named methods.
- No `console.*` in library code — throw typed errors or return results.
- Postel's Law (parser liberal, serializer conservative) — relevant from Phase 2 onward.
- Stable warning codes with byte-offset positional context — relevant from Phase 2 onward.
- Coverage target ≥ 90% on `src/parser/`, `src/dataset/`, `src/dictionary/`, `src/helpers/` — Phase 1 establishes the gate config but does not enforce it (Phase 8 enforces).

### Integration Points (forward-looking)
- Phase 2 (`src/parser/`) imports `Dictionary` for VR resolution + warning code human messages.
- Phase 3 (`src/dataset/vr/`) imports `Dictionary` for keyword resolution and VM validation.
- Phase 7 (`src/anonymize/`) imports the generated Annex E action table.
- Phase 1 must therefore stabilize the **`Dictionary` public-surface shape and the generator output schemas** before any other phase runs against them. Schema-breaking changes after Phase 1 ships will cascade.
</code_context>

<specifics>
## Specific Ideas

- `pnpm` script naming should mirror sibling: `build`, `typecheck`, `typecheck:exports`, `lint`, `lint:fix`, `format`, `format:check`, `test`, `test:watch`, `test:coverage`, `gen:dictionary`, `gen:annex-e`, `gen:all`, `smoke`, `phi-scan`, `prepublishOnly` (= `pnpm build && pnpm typecheck:exports`).
- README-at-the-end-of-Phase-1 is **out of scope** — the comprehensive README is a Phase 8 deliverable. Phase 1 ships only a stub README pointing at the roadmap (one line + link), so npm doesn't show empty content if accidentally published.
- `package.json` `"private": true` for v1 development; flip to `false` only at v1 release (Phase 8).
- A `.npmignore` or `files` allowlist in `package.json` is set up in Phase 1 so `pnpm pack` produces a clean tarball for `attw` testing.
</specifics>

<deferred>
## Deferred Ideas

None — auto-mode discussion stayed strictly within Phase 1's infrastructure scope. All forward-looking ideas (parser, dataset, helpers, profiles, anonymization, README cookbook, examples) belong to Phases 2–8 as already mapped in ROADMAP.md.

### Reviewed Todos (not folded)
None reviewed (todo parking lot is empty).
</deferred>

---

*Phase: 1-project-foundation*
*Context gathered: 2026-04-30*
