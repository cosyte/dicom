# Stack Research — @cosyte/dicom

**Domain:** Node.js/TypeScript DICOM Part 10 parser library (metadata-first; no pixel decode, no DIMSE, no DICOMweb in v1)
**Researched:** 2026-04-22
**Overall confidence:** HIGH (versions and licenses verified against npm registry + GitHub API; Node/ICU behavior verified against official docs; DICOM-specific claims verified against nema.org)

> Scope: answers the specific questions raised for the STACK dimension. Does NOT reproduce REQUIREMENTS or ROADMAP content. No prescriptions that contradict PROJECT.md's ≤ 3 runtime deps rule.

---

## Top-Line Recommendations

1. **Runtime deps at v1: target 1 (possibly 0).** Only `iconv-lite` is genuinely defensible as a runtime dep, and even that is optional if you assume full-ICU Node. See §3.
2. **Data dictionary source: Innolitics' [`innolitics/dicom-standard`](https://github.com/innolitics/dicom-standard) JSON (`attributes.json`), committed as a build-time input.** Actively maintained (last commit 2026-04-17), auto-regenerated monthly from dicom.nema.org, MIT-licensed. The NEMA XML is the canonical source of truth but parsing it in-repo (vs. consuming Innolitics' pre-parsed JSON) is an unnecessary build-time burden. See §2.
3. **Build tool: stick with `tsup`.** The "tsup is dead, use tsdown" narrative in some 2026 blog posts is premature — `tsup@8.5.1` was published 2025-11-12 and the repo has a new active maintainer (sxzz, who also maintains tsdown). tsdown (0.21.x) requires Node 20.19+ and is still pre-1.0. See §5.
4. **Test framework: Vitest, but pin major.** Vitest 4.x **dropped Node 18**. Since Node 18+ is a stated constraint in PROJECT.md, use **Vitest 3.x** (last 3.x is 3.2.x) or re-evaluate the Node floor. See §6.
5. **Linter: ESLint 9.x (not 10.x).** ESLint 10 dropped Node 18 as of 2026-02-06. See §7.
6. **TypeScript 5.9 vs 6.0: pick 5.9.x for v1.** TS 6.0.3 shipped 2026-04-16 (six days ago) — too fresh for a library foundation that wants stable IDE/IntelliSense across the ecosystem. `typescript-eslint@8.x` declares peer range `>=4.8.4 <6.1.0`, so 6.0 is newly in-range but untested at scale. See §7.

---

## 1. Existing DICOM Library Landscape (what's out there, what to study, what to avoid)

| Package | Latest | Last publish | License | Deps (runtime) | TS types | Maintenance | Role to `@cosyte/dicom` |
|---|---|---|---|---|---|---|---|
| **[`dicom-parser`](https://github.com/cornerstonejs/dicomParser)** (cornerstonejs) | 1.8.21 | 2023-02-20 (npm); last repo commit 2023-10-17 (dependabot) | MIT | 0 | None (plain JS, UMD/webpack bundle) | **Effectively unmaintained.** 3+ years of stagnation. | **Study, don't reuse.** Canonical byte-offset-oriented parser; useful reference for element header parsing quirks. Do NOT import; do NOT copy code wholesale (it's webpack-bundled plain JS targeting browsers-first; Buffer is aliased away; no ESM). |
| **[`dcmjs`](https://github.com/dcmjs-org/dcmjs)** | 0.50.1 | 2026-02-17 | MIT | 7 (adm-zip, gl-matrix, lodash.clonedeep, loglevel, ndarray, pako, @babel/runtime-corejs3) | None (plain JS, rollup bundle) | **Active** (2026) | **Study** for DICOM-JSON encoding semantics (their `DicomMetaDictionary.naturalizeDataset` etc.) and for their dictionary-generation pipeline (they ship a dictionary script). Do NOT reuse as a dep — 7 runtime deps, none of which we want (`pako` would double up with Node's built-in `zlib`; `adm-zip` is irrelevant; `@babel/runtime-corejs3` is heavy). |
| **[`@cornerstonejs/*`](https://cornerstonejs.org)** (core, tools, dicom-image-loader) | Active | 2026 | MIT | Many | Yes | Active | Out of scope — viewer/renderer stack. The **dicom-image-loader** package wraps `dicom-parser` + pixel codecs. Not relevant to a metadata-first library. |
| **[`dicomweb-client`](https://github.com/dcmjs-org/dicomweb-client)** | Active | 2025+ | MIT | Minimal | Yes (ships `.d.ts`) | Active | Irrelevant to v1 (v1 explicitly excludes DICOMweb). Note for future `@cosyte/dicomweb`. |
| **[`dcmjs-dimse`](https://github.com/PantelisGeorgiadis/dcmjs-dimse)** | Active | 2025+ | MIT | Several (winston, smart-buffer, dcmjs) | No (plain JS) | Active (third-party, Pantelis Georgiadis) | Irrelevant to v1. Prior art for future `@cosyte/dicom-net`. |
| **[`dicom.ts`](https://www.npmjs.com/package/dicom.ts)** | 1.x | Active-ish | MIT | Small | Yes | Small community | **Study for TS idioms.** A ground-up TypeScript DICOM parser oriented at browsers/WebGL rendering. Narrower scope than `@cosyte/dicom` (rendering-focused), but good reference for idiomatic TS typings of VRs. |
| **[`dicom-data-dictionary`](https://github.com/ohif/dicom-data-dictionary)** (OHIF) | 0.3.1 | 2019 (last publish); node 0.10 in `package.json` | MIT | 0 | No | **Abandoned.** | Do NOT use. Dictionary revision is frozen at 2014b. |
| **[`@iwharris/dicom-data-dictionary`](https://github.com/iwharris/dicom-data-dictionary)** | 1.26.0 | 2019-12-29 | MIT | 0 | Yes (generated `.d.ts`) | **Stale** (7+ years since last publish). Revision = 2014b. | Do NOT depend on it — revision is stale, last updated 2019. Build pipeline (fetch part06.xml → ts-gen with handlebars) is a reasonable prior-art reference for our own generator. |

### Takeaways for `@cosyte/dicom`

- **There is a real market gap** for a strict-TypeScript, dep-minimized, metadata-first parser. PROJECT.md's framing is correct.
- **Study `dicom-parser` for byte-level quirks** (implicit/explicit VR switching, undefined-length sequence termination, encapsulated pixel fragment iteration). Its bug tracker and issue history are a free source of real-world quirk fixtures.
- **Study `dcmjs` for DICOM-JSON encoding** (DICOM-JSON is PS3.18; `dcmjs` has a working, widely-used implementation) — relevant to REQ SER-06 (`ds.toJSON()` DICOM-JSON-style).
- **Do NOT introduce `pako` as a dep** even though `dcmjs` uses it. Node ≥18's built-in `zlib.inflateRawSync` covers DICOM deflate entirely (§4).

**Confidence: HIGH.** Verified against npm registry JSON and GitHub commit APIs.

---

## 2. Data Dictionary Source

**Recommendation: Commit Innolitics' [`attributes.json`](https://github.com/innolitics/dicom-standard/blob/master/standard/attributes.json) as a build-time input artifact at a pinned commit SHA; run a TS generator over it to produce `src/dictionary/generated.ts`.**

### Candidates compared

| Source | Format | License | Update cadence | Active? | Suitability |
|---|---|---|---|---|---|
| **[`innolitics/dicom-standard`](https://github.com/innolitics/dicom-standard)** | JSON (attributes.json, ciods.json, uids.json, etc.) | **MIT** | **GitHub Action regenerates monthly** from nema.org; last commit 2026-04-17 | **YES** | **Best.** Pre-parsed, clean JSON, active maintainer (Innolitics powers dicom.innolitics.com). Separate files for attributes, UIDs, CIODs — consume only what you need. |
| DICOM PS3.6 XML from `dicom.nema.org/medical/dicom/current/source/docbook/part06/part06.xml` | DocBook XML (~9.6 MB) | NEMA (freely redistributable as part of the standard) | Published with each DICOM edition (quarterly-ish) — Last-Modified: Fri, 27 Mar 2026 | YES | **Canonical source of truth**, but parsing DocBook in our build pipeline adds meaningful complexity (xml2js / sax / fast-xml-parser as dev-dep; table-structure-sensitive selectors). Use only if you want provenance-from-NEMA-directly. |
| DICOM PS3.6 HTML | DocBook-rendered HTML | NEMA | With each edition | YES | Harder to parse than XML; don't. |
| DCMTK `dicom.dic` | Custom flat ASCII | BSD-style (DCMTK license) | With each DCMTK release | Active (OFFIS) | **Avoid.** Custom format, license-compatible but not MIT-identical, not a JS ecosystem artifact. |
| [`@iwharris/dicom-data-dictionary`](https://www.npmjs.com/package/@iwharris/dicom-data-dictionary) | pre-generated TS module | MIT | **Stale (2019)**, revision 2014b | NO | Avoid. |
| [`dicom-data-dictionary`](https://www.npmjs.com/package/dicom-data-dictionary) (OHIF, 0.3.1) | CommonJS module | MIT | Stale (2019, node 0.10) | NO | Avoid. |
| `dcmjs` `generate/` pipeline output | Packed binary (dcmjs' own format) | MIT | With each dcmjs release | Active | Entangled with dcmjs internals; do not consume as a dictionary source. |

### Why Innolitics

1. **Active maintenance is the gate.** The standard evolves (new SOP classes, new UIDs, retired attributes). A dictionary frozen at edition 2014b (the `@iwharris` package) is unacceptable for a library shipping in 2026.
2. **Already machine-friendly JSON.** Saves 200+ lines of DocBook XML parsing code and a `xml2js`/`fast-xml-parser` devDep.
3. **Splittable.** You need only `attributes.json` for v1 (tag → keyword/VR/VM/retired). `ciods.json` and `modules.json` are available later if you pursue IOD-level validation (currently out-of-scope per REQUIREMENTS.md).
4. **MIT-compatible licensing.** Safe to commit the input JSON file into the repo.

### Generator recipe (conceptual)

```
.planning/vendored-data/dicom-standard-attributes.json    ← committed, pinned by SHA; update via PR
scripts/generate-dictionary.ts                            ← devDep: none needed (just Node built-ins)
src/dictionary/generated.ts                               ← committed; CI gate (re-gen → git diff clean)
```

The generator is a dozen lines: read JSON, emit `const DICT = { '00100010': { keyword: 'PatientName', vr: 'PN', vm: '1', retired: false } as const, ... } as const;` plus a `Keyword → Tag` index and a `Keyword` union type. Zero devDep footprint for parsing (JSON is built-in).

**Gotchas worth knowing (surface these in PITFALLS.md):**

- Some attributes have multiple VRs in the standard (e.g., `(0028,0106) SmallestImagePixelValue` is `US or SS`). Representation must allow `vr: 'US' | 'SS'` (union), not `vr: string`.
- VM values include ranges like `2-n`, `1-3`, `3-3n`, `0-n`. Parse them into a structured form, not a raw string.
- Retired attributes: keep them in the dictionary with `retired: true`. Real files still emit retired tags.
- Private "standard" tag templates (e.g., GenericGroupLength `(gggg,0000)`) are not data-dictionary entries in the same sense; Innolitics flags these separately.
- Repeating-group attributes (curves, overlays — `(50xx,xxxx)`, `(60xx,xxxx)`) — historically modeled as families in Part 6. Make sure the generator output preserves the family information, not just one concrete instance.

**Confidence: HIGH.** Verified against GitHub API (commits) + npm registry JSON + NEMA HTTP response.

---

## 3. Character Set Decoding

**Recommendation: Start with Node's built-in `TextDecoder`. Add `iconv-lite` as a single runtime dep only if a failing fixture proves it's needed.** Track this as an ADR per PROJECT.md's Key Decision #12.

### Node.js TextDecoder encoding coverage

- **Node.js since v13 ships with full-ICU by default.** (Source: [Node.js intl docs](https://nodejs.org/api/intl.html) — `--with-intl=full-icu` is the default, and "the official binaries are also built in this mode.")
- **With full-ICU, TextDecoder supports every encoding in the WHATWG Encoding Standard labels table except `iso-8859-16`.** That includes:
  - `iso-8859-1` (ISO_IR 100) ✓
  - `iso-8859-2` (ISO_IR 101) ✓
  - `iso-8859-3..9` (ISO_IR 109, 110, 144, 127, 126, 138, 148) ✓ (incl. Cyrillic, Arabic, Hebrew)
  - `iso-8859-15` (ISO_IR 203 / Latin-9) ✓
  - `utf-8` (ISO_IR 192) ✓
  - `gb18030` ✓
  - `gbk` ✓
  - `shift_jis` (ISO IR 13 / JIS X 0201) ✓ (includes JIS Roman single-byte)
  - `euc-jp` ✓
  - `euc-kr` (ISO_IR 149) ✓
  - `iso-2022-jp` ✓
  - `big5` ✓

### The catch: DICOM Specific Character Set ≠ WHATWG labels

DICOM `(0008,0005)` values like `ISO_IR 100`, `ISO 2022 IR 13`, `ISO 2022 IR 87`, `GB18030`, `GBK` are **defined by PS3.3 Table C.12-2** — not by WHATWG. You have to map DICOM charset terms → WHATWG encoding labels. Example mapping (representative, not exhaustive):

| DICOM Specific Character Set | WHATWG label | Notes |
|---|---|---|
| (absent) / `ISO_IR 6` | `iso-8859-1` (ASCII subset) | Default is 7-bit ASCII per DICOM; `iso-8859-1` is a safe superset for ASCII bytes |
| `ISO_IR 100` | `iso-8859-1` | Latin-1 |
| `ISO_IR 101` | `iso-8859-2` | Latin-2 |
| `ISO_IR 109` | `iso-8859-3` | |
| `ISO_IR 110` | `iso-8859-4` | |
| `ISO_IR 144` | `iso-8859-5` | Cyrillic |
| `ISO_IR 127` | `iso-8859-6` | Arabic |
| `ISO_IR 126` | `iso-8859-7` | Greek |
| `ISO_IR 138` | `iso-8859-8` | Hebrew |
| `ISO_IR 148` | `iso-8859-9` | Turkish |
| `ISO_IR 13` (single-byte) | `shift_jis` (JIS X 0201 subset) | DICOM single-byte Japanese |
| `ISO_IR 166` | `tis-620` | Thai; WHATWG label `windows-874` is the common mapping |
| `ISO_IR 192` | `utf-8` | |
| `GB18030` | `gb18030` | |
| `GBK` | `gbk` | |
| **`ISO 2022 IR 87`** (JIS X 0208) | **no direct WHATWG label** — part of `iso-2022-jp` code-extension | ⚠ see below |
| **`ISO 2022 IR 159`** (JIS X 0212) | similar — extension | ⚠ |
| **`ISO 2022 IR 149`** (KS X 1001) | extension of `iso-2022-kr` / `euc-kr` territory | ⚠ |

### Where TextDecoder alone isn't enough: ISO 2022 code-extension

- DICOM `(0008,0005)` can be **multi-valued** (`\`-separated): e.g., `ISO 2022 IR 6\ISO 2022 IR 87` declares a message that uses ISO 2022 escape sequences to switch between the default ASCII G0 register and the JIS X 0208 Japanese repertoire.
- WHATWG's `iso-2022-jp` decoder implements the *full* ISO-2022-JP stateful sequence, which is close to what DICOM needs for single-extension IR-87 cases — but DICOM allows combinations WHATWG doesn't define a label for (e.g., IR-87 + IR-159 concurrently, or IR-149 Korean in a non-iso-2022-kr context).
- **REQ CHARSET-02 scopes this correctly:** "multi-valued `(0008,0005)` … supported at least for single-byte + single code-extension cases (e.g., `ISO 2022 IR 87`)". Fall back with `DICOM_UNSUPPORTED_CHARSET` for everything more exotic.

### Decision tree for the runtime dep

```
Is every REQ CHARSET-01/02 fixture decoded correctly with TextDecoder?
  YES → 0 runtime deps for charset. Ship.
  NO, but only ISO 2022 code-extension fixtures fail → evaluate implementing a tiny custom
      ISO 2022 dispatcher on top of TextDecoder (invoke `iso-2022-jp` TextDecoder per segment),
      OR add `iconv-lite` as 1 runtime dep.
  NO, and even basic encodings fail → user is on small-icu Node (rare; document it).
      Add `iconv-lite` as 1 runtime dep.
```

### If you add `iconv-lite`

- **`iconv-lite@0.7.2`** (latest, published late 2025 from the registry data). MIT. Single transitive dep: `safer-buffer`. Ships `.d.ts`. Tiny install footprint.
- Covers every DICOM charset cleanly, including the ISO 2022 CJK cases.
- Trade-off: commits to one runtime dep and one supply-chain lineage. Defensible per PROJECT.md's ≤ 3 deps rule and "likely candidates to evaluate in discuss-phase" language.

**Confidence: HIGH** on TextDecoder coverage (verified against Node.js docs + WHATWG encoding labels); **MEDIUM** on exact behavior for ISO-2022 multi-extension edge cases (needs real-world fixtures to confirm — flag in research for phase 4).

---

## 4. Deflate (Deflated Explicit VR Little Endian, `1.2.840.10008.1.2.1.99`)

**Recommendation: Use Node's built-in `zlib.inflateRawSync` (or the streaming variant). No dep.**

### Verified facts

- DICOM PS3.5 §A.5: the dataset is compressed using the **Deflate algorithm as defined in [RFC 1951](https://www.ietf.org/rfc/rfc1951.txt)** — i.e., **raw deflate, without the zlib (RFC 1950) wrapper**.
- If the deflated bit stream has an odd byte count, DICOM appends a single trailing NULL byte (PS3.5 §A.5). Your inflate must tolerate or strip this trailing byte.
- Node's [`zlib`](https://nodejs.org/api/zlib.html) module provides exactly this: `zlib.inflateRawSync(buffer)` (and async/stream variants). `inflateSync` expects the zlib header — **the wrong function for DICOM.** Easy mistake to make.

### Edge cases worth documenting

- **Only the dataset is deflated; File Meta Information is always uncompressed and Explicit VR LE.** So you parse File Meta first, then inflate the remaining buffer, then parse the inflated bytes as Explicit VR LE.
- **Truncated streams:** use `{ finishFlush: zlib.constants.Z_SYNC_FLUSH }` if you want graceful handling of partially-delivered deflate data. Default throws.
- **Don't use `zlib.unzip` / `unzipSync`:** auto-detects gzip vs zlib — but **neither format is what DICOM uses**. It would fail on raw deflate.
- **Avoid `pako`.** `dcmjs` ships `pako`; there's no reason to duplicate it when Node has this built-in. Saves a runtime dep slot.

**Confidence: HIGH.** Verified against Node.js docs + DICOM PS3.5 §A.5 + multiple third-party confirmations.

---

## 5. Build Tooling

**Recommendation: `tsup@^8.5.1`. Same as `@cosyte/hl7`. Don't switch to tsdown yet.**

### Verified state of the landscape

| Tool | Latest | Last publish | Node engine | Status | Verdict |
|---|---|---|---|---|---|
| **tsup** | **8.5.1** | 2025-11-12 | `>=18` | Active (new maintainer sxzz joined egoist) | **Recommended.** Mature, widely used, esbuild-backed, zero-config, produces dual ESM+CJS + `.d.ts`. Matches `@cosyte/hl7` exactly. |
| tsdown | 0.21.10 | 2026-04-22 | `>=20.19.0` | Active, pre-1.0, rolldown-based | **Reject for v1.** Pre-1.0 means API churn. Requires Node 20.19+, conflicting with Node 18+ target. Future re-evaluation fine. |
| unbuild | 3.6.1 | 2025-08-15 | `>=20` (via peer) | Active (unjs / Nuxt org) | Viable alternative; heavier than tsup; rollup-based; stubbing is nice in dev. Not worth deviating from tsup for a sibling-pattern library. |
| tshy | 4.1.1 | 2026-04-08 | `20 \|\| >=22` | Active (isaacs) | Opinionated, uses `tsc` (now `tsgo`), no bundling. Good for libs that want *nothing but TS compilation*. Requires Node 20+ — rules it out. Also BlueOak license (not a blocker, but worth noting). |
| rolldown / rolldown-vite | — | — | — | Rolldown is the underlying bundler (Rust, `oxc`); not itself a library-build CLI. Wrap it via tsdown. | N/A |
| vite-node | — | — | — | Node ESM runner; not a library builder. | N/A |

### tsup configuration sketch (same shape as @cosyte/hl7)

```ts
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  outExtension: ({ format }) => ({ js: format === 'esm' ? '.mjs' : '.cjs' }),
  treeshake: true,
  splitting: false, // libraries generally ship a single bundle per format
});
```

### Sharp edge worth flagging

- `tsup` composes esbuild for code and calls `rollup-plugin-dts` (or similar) for `.d.ts` bundling. Occasionally produces subtly wrong `.d.ts` for re-exports and conditional types. Run [`attw` (are-the-types-wrong)](https://arethetypeswrong.github.io/) in CI — already a de facto standard for dual ESM+CJS TS libraries. The `tsup` team uses `fix-dts-default-cjs-exports` internally as of 8.x; don't disable it.

**Confidence: HIGH.** All versions verified against npm registry; narrative about "tsup is dead" in some 2026 blog posts is contradicted by the registry data (new 8.5.1 release + new co-maintainer sxzz).

---

## 6. Testing

**Recommendation: `vitest@^3.2.0` with `@vitest/coverage-v8@^3.2.0`.** Pin the major. Do NOT take `vitest@^4` if Node 18 is a shipping target.

### Why not Vitest 4

- `vitest@4.1.5` (latest, 2026-04-21) declares `engines.node: "^20.0.0 || ^22.0.0 || >=24.0.0"`.
- PROJECT.md constraint: Node 18+.
- Using Vitest 4 would either (a) silently break Node 18 consumers, or (b) require bumping the Node floor. If the Node floor is raised to 20, Vitest 4 is fine — but that's a separate decision.

### Vitest 3 is the sweet spot

- Supports Node 18+.
- Stable for a year+.
- Same ergonomic API as v4 for the test surface a library like this uses (`describe`, `it`, `expect`, `beforeAll`, `vi.fn`, snapshot testing, `vitest run --coverage`).

### Binary / fixture-driven testing notes

- Vitest runs on Vite; static binary fixtures committed at `test/fixtures/**/*.dcm` are read in tests with `fs.readFileSync(new URL('./fixtures/ct.dcm', import.meta.url))` (or `path.join(__dirname, ...)` under CJS tests). No special config.
- For snapshot-style fixtures of parsed output, Vitest's built-in snapshot is fine; `toMatchFileSnapshot` lets you write a readable `.snap.txt` per fixture for easier review.
- Coverage: `@vitest/coverage-v8` (matches sibling @cosyte/hl7). Istanbul alternative exists; v8 is faster and no-instrumentation.
- For deterministic binary round-trip tests, write helpers that do byte-level diffs with a `Buffer.compare` + offset locator — commit these to `test/helpers/`.

### Anti-patterns to avoid

- Don't commit large (> 1 MB) fixtures into the repo; use small synthetic fixtures or git-lfs for one or two real-world CT / enhanced-MR cases.
- Don't write fixtures in hex inline; use `Buffer.from([...])` helpers or generate them from canonical `toBuffer()` output in a small `test/fixtures/gen/*.ts` script.

**Confidence: HIGH** on Vitest 4 Node-drop (verified against npm package metadata); **MEDIUM** on the "pin to 3.x" recommendation (depends on whether the project is willing to revisit the Node 18 floor).

---

## 7. Recommended Versions (verified 2026-04-22)

| Package | Recommended version | Rationale | Source |
|---|---|---|---|
| **Node.js runtime** | `>=18.18.0` (`engines.node: ">=18.18.0"`) | Matches `@cosyte/hl7`. All our ecosystem choices work here. Using `>=18.18.0` rather than `>=18.0.0` avoids some `import.meta.url` / ESM-loader edge cases in early 18.x. | Node.js release history |
| **TypeScript** | `^5.9.0` (latest 5.x line; `^5.9.3` or `~5.9.3` for tighter pinning) | TS 6.0.3 (2026-04-16) is six days old. Adoption across editors, typescript-eslint, downstream consumers is still lagging. Revisit at next milestone. | npm registry |
| **tsup** | `^8.5.1` | Latest, actively maintained. | npm registry |
| **Vitest** | `^3.2.0` | Last Vitest major that supports Node 18. | npm registry / Vitest GitHub releases |
| **@vitest/coverage-v8** | `^3.2.0` | Must match Vitest major. | npm registry |
| **ESLint** | `^9.39.0` (use `9.x`, NOT `10.x`) | ESLint 10 (2026-02-06) dropped Node 18. 9.39.x is actively receiving patches (9.39.4 on 2026-03-06). | npm registry |
| **typescript-eslint** | `^8.59.0` | Peer range accepts ESLint 8/9/10 and TS `<6.1.0`. Only moving target; supports TS 5.9 fine. | npm registry |
| **Prettier** | `^3.8.3` | Stable. Matches `@cosyte/hl7` direction. | npm registry |
| **eslint-config-prettier** | `^9.1.0` (matching @cosyte/hl7) or latest | Disables stylistic rules that conflict with Prettier. | — |
| **tsx** | `^4.21.0` | For running examples and generator scripts. Matches sibling. | npm registry |
| **pnpm** (packageManager) | `pnpm@10.33.1` (or whatever is current at scaffold time — pin exactly) | pnpm 9 → 10 transition complete; 10.x is stable. `@cosyte/hl7` uses `9.0.0`; library is not blocked by moving forward. | npm registry |
| **@types/node** | `^20.x` or `^22.x` (matching Node floor) | `^20` gives broad compatibility. | — |
| **iconv-lite** *(conditional runtime dep)* | `^0.7.2` | Only if TextDecoder proves insufficient for a required fixture. MIT, ~50 KB, single transitive dep (`safer-buffer`). | npm registry |

### Version compatibility matrix

| A | B | Status |
|---|---|---|
| Node 18.18+ | Vitest 3.x | ✅ Supported |
| Node 18.18+ | Vitest 4.x | ❌ **BREAKS** — Vitest 4 engines require Node 20+ |
| Node 18.18+ | ESLint 9.x | ✅ Supported |
| Node 18.18+ | ESLint 10.x | ❌ **BREAKS** — ESLint 10 engines require Node 20.19+ |
| Node 18.18+ | TS 5.9.x | ✅ Supported |
| Node 18.18+ | TS 6.0.x | ✅ Supported (TS `engines.node: ">=14.17"`) but risky (brand new, six days old) |
| TS 5.9.x | typescript-eslint 8.59.x | ✅ Supported (peer `>=4.8.4 <6.1.0`) |
| TS 6.0.x | typescript-eslint 8.59.x | ✅ Just in range (`<6.1.0`), untested at scale |
| tsup 8.5.1 | Node 18.18+ | ✅ `engines.node: ">=18"` |
| iconv-lite 0.7.2 | Node 18+ | ✅ `engines.node: ">=0.10.0"` |

**Confidence: HIGH** across all version claims (verified against npm registry `time` field).

---

## Installation (aligned with the above)

```bash
# Initialize
pnpm init
pnpm pkg set packageManager=pnpm@10.33.1
pnpm pkg set engines.node=">=18.18.0"
pnpm pkg set type=module

# Core build / test / lint devDeps (exact versions are registry-latest as of 2026-04-22)
pnpm add -D \
  typescript@^5.9.3 \
  tsup@^8.5.1 \
  vitest@^3.2.0 \
  @vitest/coverage-v8@^3.2.0 \
  eslint@^9.39.0 \
  typescript-eslint@^8.59.0 \
  eslint-config-prettier@^9.1.0 \
  prettier@^3.8.3 \
  tsx@^4.21.0 \
  @types/node@^20.11.0

# Runtime deps — add only after the ADR per PROJECT.md. Likely 0–1 of these:
# pnpm add iconv-lite@^0.7.2    # ONLY if TextDecoder insufficient; see §3
```

---

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| `dicom-parser` as a dependency | Unmaintained (last real commit 2023-10-17; webpack-bundled plain JS; browser-first; no ESM) | Write the parser from scratch; study their code for byte-level quirks |
| `dcmjs` as a dependency | 7 runtime deps, plain JS, large install footprint, heavy `@babel/runtime-corejs3` | Write from scratch; study DICOM-JSON encoding |
| `pako` | Node ≥ 18 built-in `zlib.inflateRawSync` is sufficient for DICOM deflate | `node:zlib` |
| `@iwharris/dicom-data-dictionary` | Frozen at 2019 / DICOM edition 2014b | Innolitics' `attributes.json` (active, monthly regen) |
| `dicom-data-dictionary` (OHIF) | Frozen at 2019, `node: 0.10` in package.json | Innolitics' `attributes.json` |
| DCMTK `dicom.dic` as the generator input | Custom ASCII format; license/compat OK but format is annoying | Innolitics' `attributes.json` (already JSON) |
| `zlib.inflateSync` | Expects zlib (RFC 1950) header. DICOM deflate is raw (RFC 1951). **Silently wrong**. | `zlib.inflateRawSync` |
| `zlib.unzip` / `unzipSync` | Auto-detects gzip vs zlib; neither matches DICOM's raw deflate | `zlib.inflateRawSync` |
| Vitest 4.x (if keeping Node 18 floor) | Drops Node 18 | Vitest 3.x |
| ESLint 10.x (if keeping Node 18 floor) | Drops Node 18 | ESLint 9.x |
| tsdown (for v1) | Pre-1.0, Node 20.19+ required, API churn risk | tsup |
| TypeScript 6.0.x (for v1) | Released 2026-04-16; ecosystem adoption lagging | TypeScript 5.9.x |

---

## Stack Patterns by Variant

**If the team decides to raise the Node floor to Node 20+:**
- Upgrade to Vitest 4.x, ESLint 10.x. Everything else stays.
- Publish `engines.node: ">=20.19.0"` in `package.json`.
- No other changes needed.

**If `TextDecoder` proves sufficient for all fixtures (likely in most deployment scenarios):**
- **Zero runtime deps.** Matches `@cosyte/hl7`'s zero-dep discipline. Document in the ADR that the ≤3 runtime-dep budget was preserved unused.
- Small-ICU Node distributions (uncommon — distros almost always ship full-ICU) would degrade gracefully: emit `DICOM_UNSUPPORTED_CHARSET` and fall back to UTF-8 best-effort decode (aligns with CHARSET-02).

**If fixture-driven testing surfaces an unavoidable ISO 2022 multi-extension case (e.g., a fixture declaring `ISO 2022 IR 6\ISO 2022 IR 87\ISO 2022 IR 159`):**
- Add `iconv-lite@^0.7.2` as 1 runtime dep. Justify in ADR. Still inside the ≤3 budget.

---

## Sources

**npm registry (verified via `https://registry.npmjs.org/<pkg>`, 2026-04-22):**
- [`dicom-parser@1.8.21`](https://registry.npmjs.org/dicom-parser) — MIT, last publish 2023-02-20
- [`dcmjs@0.50.1`](https://registry.npmjs.org/dcmjs) — MIT, last publish 2026-02-17
- [`@iwharris/dicom-data-dictionary@1.26.0`](https://registry.npmjs.org/@iwharris/dicom-data-dictionary) — MIT, last publish 2019-12-29 (frozen)
- [`dicom-data-dictionary@0.3.1`](https://registry.npmjs.org/dicom-data-dictionary) (OHIF) — MIT, last publish 2019 (frozen)
- [`tsup@8.5.1`](https://registry.npmjs.org/tsup) — MIT, last publish 2025-11-12
- [`vitest@4.1.5`](https://registry.npmjs.org/vitest) — MIT, engines: Node ^20 || ^22 || >=24
- [`@vitest/coverage-v8@4.1.5`](https://registry.npmjs.org/@vitest/coverage-v8)
- [`typescript@6.0.3`](https://registry.npmjs.org/typescript) — Apache-2.0, published 2026-04-16
- [`eslint@10.2.1`](https://registry.npmjs.org/eslint) — MIT, engines: Node ^20.19 || ^22.13 || >=24
- [`typescript-eslint@8.59.0`](https://registry.npmjs.org/typescript-eslint) — MIT, peer TS `<6.1.0`
- [`prettier@3.8.3`](https://registry.npmjs.org/prettier) — MIT
- [`iconv-lite@0.7.2`](https://registry.npmjs.org/iconv-lite) — MIT
- [`tsx@4.21.0`](https://registry.npmjs.org/tsx) — MIT
- [`pnpm@10.33.1`](https://registry.npmjs.org/pnpm)
- [`tsdown@0.21.10`](https://registry.npmjs.org/tsdown) — MIT, engines Node >=20.19
- [`tshy@4.1.1`](https://registry.npmjs.org/tshy) — BlueOak-1.0.0, engines Node 20 || >=22
- [`unbuild@3.6.1`](https://registry.npmjs.org/unbuild) — MIT

**GitHub API (verified 2026-04-22):**
- [innolitics/dicom-standard](https://github.com/innolitics/dicom-standard) — MIT, last commit 2026-04-17 (active); monthly auto-regen from nema.org
- [cornerstonejs/dicomParser](https://github.com/cornerstonejs/dicomParser) — last meaningful commit 2023-10-17 (dependabot only since)
- [dcmjs-org/dcmjs](https://github.com/dcmjs-org/dcmjs) — active (2026)

**Official / standards docs:**
- [Node.js Internationalization (`intl`) docs](https://nodejs.org/api/intl.html) — full-ICU is the default; TextDecoder supports all WHATWG labels except `iso-8859-16`
- [Node.js `zlib` docs](https://nodejs.org/api/zlib.html) — `inflateRawSync`, `inflateSync`, truncated-stream handling
- [DICOM PS3.5 §A.5 Deflated Explicit VR Little Endian Transfer Syntax (current)](https://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_A.5.html) — raw deflate per RFC 1951, trailing NULL on odd byte count
- [DICOM PS3.6 XML source](https://dicom.nema.org/medical/dicom/current/source/docbook/part06/part06.xml) — 9.6 MB DocBook XML, Last-Modified 2026-03-27
- [DICOM PS3.3 Table C.12-2](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.12.html) — Specific Character Set values and ISO 2022 code-extension semantics
- [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/) — canonical list of encoding labels

---

## Confidence Assessment Summary

| Area | Confidence | Reason |
|---|---|---|
| Existing-library survey (licenses, maintenance, deps) | HIGH | npm registry + GitHub API cross-checked |
| Data dictionary source recommendation | HIGH | Innolitics recent commit + monthly regen verified |
| Character set — TextDecoder coverage (common encodings) | HIGH | Node.js intl docs + WHATWG Encoding Standard |
| Character set — ISO 2022 multi-extension behavior | MEDIUM | Needs real fixtures in Phase 4 to confirm exact failure modes |
| Deflate via `zlib.inflateRawSync` | HIGH | DICOM PS3.5 §A.5 + Node zlib docs agree |
| Build tool (tsup vs tsdown) | HIGH | Version metadata and maintainer activity verified |
| Test tool pinning (Vitest 3.x for Node 18) | HIGH | Vitest 4 engines field is explicit |
| ESLint 9 vs 10 pinning | HIGH | ESLint 10 engines field is explicit |
| TypeScript 5.9 vs 6.0 recommendation | MEDIUM | 6.0 just shipped; ecosystem-adoption argument is qualitative but well-founded |

---

*Stack research for: `@cosyte/dicom` v1 (metadata-first DICOM Part 10 parser, Node.js + TypeScript)*
*Researched: 2026-04-22*
