# Phase 2: Core Parser & Transfer Syntaxes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `02-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 2-core-parser
**Mode:** `--auto` — Claude auto-selected the recommended option for every gray area; no AskUserQuestion calls were issued. Single-pass per `modes/auto.md` "CRITICAL — Auto-mode pass cap". Pass count: 1.
**Areas discussed (auto-resolved):** Public Parser Surface, Module Layout, Warnings/Errors Architecture, Input & Preamble, Buffer Slicing, File Meta Strategy, Transfer-Syntax Dispatch, Implicit VR Inference, Explicit VR LE/BE Mechanics, Deflated LE, Sequence Parsing & CP-246, Encapsulated Pixel Data, Private-Tag Creator Tracking, Strict Mode, Test Strategy, Plan Decomposition.

---

## Public Parser Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Two overloads now (buffer; buffer + options) — defer Profile overload to Phase 6 | Mirrors HL7 sibling without dragging Profile types into Phase 2 | ✓ |
| Three overloads now including reserved Profile slot | Forward-compatible but ships a type that isn't yet implemented | |
| Single positional `parseDicom(buffer, options?)` with `options.profile` Phase 6 only | Loses HL7 sibling parity on overload signature | |

**Rationale:** Phase 6 will add the third overload + the `discriminateOptionsOrProfile` helper that the HL7 sibling already uses. Phase 2 keeps the signature minimal so the public type does not advertise unimplemented features. (D-01)

[auto] Public Parser Surface — Q: "Overload signature for `parseDicom`" → Selected: "Two overloads now (buffer; buffer+options) — defer Profile overload to Phase 6" (recommended default).

## Module Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Validated layout from research/ARCHITECTURE.md §1 | Matches lazy-vs-eager structural pass + sibling parity | ✓ |
| Flat `src/parser/` with embedded VR decoders | Smaller surface but conflicts with Phase 3's separate `dataset/vr/` tree | |
| Split parser ↔ structural shell into separate packages | Premature; v1 ships as one package | |

**Rationale:** Architecture research already validated the layout. Phase 2 owns `src/parser/*` + the structural-only subset of `src/dataset/*`. (D-05, D-06)

[auto] Module Layout — Q: "Where do parser/dataset modules live?" → Selected: "Validated layout from research/ARCHITECTURE.md §1" (recommended default).

## Warnings & Errors Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror HL7 sibling: frozen `WARNING_CODES`, factory per code, single chokepoint | Proven pattern; Phase 7 `validate()` will integrate cleanly | ✓ |
| Generic `emitWarning(code, payload)` with payload-shape table | Less code but loses per-code typed payload + JSDoc per-code messages | |
| String-template warnings without a registry | Rejected by PROJECT.md "stable string codes + byte-offset positional context" | |

**Rationale:** HL7 sibling's pattern works — verified by reading `src/parser/warnings.ts` and `src/parser/index.ts`. The factory-per-code pattern scales for the bounded ~25-code TOL-03 catalog. (D-08, D-11, D-12)

**Notes captured during analysis:** the `DicomPosition.deflated` flag (D-27) and `DicomPosition.fileMeta` flag emerged from thinking through how byte offsets in the inflated dataset differ from on-disk offsets — chose to surface this as a typed flag rather than overloading `byteOffset` semantics.

[auto] Warnings & Errors — Q: "Warning emission pattern" → Selected: "Mirror HL7 sibling chokepoint + factory pattern" (recommended default).

## Input Normalization & Preamble

| Option | Description | Selected |
|--------|-------------|----------|
| Tri-state `stripPreamble: 'tolerate' \| 'require'` + dual EMPTY check | Covers PARSE-04 + PARSE-06 + TOL-06 cleanly | ✓ |
| Single `tolerantPreamble: boolean` flag | Loses the `'require'` strict-orthogonal escape hatch | |
| Always tolerate; rely solely on `strict: true` for escalation | Couples preamble policy to mode policy; harder to test | |

**Rationale:** TOL-06 already mandates `'tolerate' \| 'require'`. The dual EMPTY-INPUT check is copied directly from HL7 sibling — it catches `ArrayBuffer(0)` corner cases that slip past pre-normalize checks. (D-13, D-14, D-15)

[auto] Input & Preamble — Q: "How are input variants and missing preamble handled?" → Selected: "Tri-state `stripPreamble` + dual EMPTY check" (recommended default).

## Buffer Slicing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Zero-copy `Buffer.subarray()` default + `copyValues: true` opt-out | Maximal performance + memory escape hatch as MODEL-03 requires | ✓ |
| Always copy values | Safe but defeats lazy-decode performance gain on 50 MB files | |
| Always zero-copy without opt-out | Fails MODEL-03 (`copyValues: true` is required) | |

**Rationale:** MODEL-03 explicitly mandates `copyValues: true`. Implementing it now (Phase 2) is cheap; retrofitting in Phase 3+ would touch every Element constructor. (D-16)

[auto] Buffer Slicing — Q: "rawBytes default: zero-copy slice or owned copy?" → Selected: "Zero-copy + copyValues opt-out" (recommended default).

## File Meta Parser & Type 1 Element Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 enforces only the dispatch-blocking subset (`(0002,0010)`); STRICT-03 elements deferred to Phase 7 `validate()` | Keeps fatal-vs-warning boundary crisp; matches PROJECT.md "Fatal errors only for unrecoverable structural corruption" | ✓ |
| Phase 2 throws `INVALID_FILE_META` on any missing FM-03 / STRICT-03 element | Over-broadens the fatal tier and conflicts with Phase 7 ownership | |
| Phase 2 emits Tier-2 warnings for every missing required FM element | Underdelivers — strict mode would not throw on a missing TS UID, breaking dispatch | |

**Rationale:** PROJECT.md is explicit that the fatal tier covers "unrecoverable structural corruption." Missing TS UID is unrecoverable (cannot pick a parser). Missing other Type 1 elements is recoverable for parsing — `validate()` (Phase 7) is the right place to flag those. (D-17, D-18, D-19)

[auto] File Meta Strategy — Q: "Which missing FM elements throw INVALID_FILE_META in Phase 2?" → Selected: "Only `(0002,0010)` Transfer Syntax UID; STRICT-03 elements deferred to Phase 7" (recommended default).

## Transfer-Syntax Dispatch

| Option | Description | Selected |
|--------|-------------|----------|
| Const dispatch table with exactly the 4 v1 UIDs | Simple, exhaustive, correctly throws UNSUPPORTED_TRANSFER_SYNTAX for everything else | ✓ |
| Dynamic dispatch with optional plug-in registration | Premature — companion `@cosyte/dicom-pixel` will not need TS plug-ins | |

[auto] TS Dispatch — Q: "Dispatch table shape" → Selected: "Const map of 4 UIDs" (recommended default — D-20).

## Implicit VR Inference

| Option | Description | Selected |
|--------|-------------|----------|
| 5-rule fallback (single-VR / multi-VR-pick-first / repeating-group / private-with-creator-tracking / unknown→UN) | Covers every Implicit VR case; matches PITFALLS §1.1 | ✓ |
| Throw on dictionary miss | Rejects every file with private data — incorrect | |
| Always fall back to UN regardless of dictionary | Loses VR fidelity for known tags | |

**Rationale:** Implicit VR LE is the most common transfer syntax; the 5-rule cascade is the only correct shape. Multi-VR-pick-first is documented; consumers can override through Phase 6 profiles. (D-21)

[auto] Implicit VR — Q: "VR fallback rules" → Selected: "5-rule cascade" (recommended default).

## Explicit VR LE / BE Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Long-form VR set + per-VR endian-stride table, both shared with Phase 5 | Single source of truth; closes BE-AT and OB-no-swap canonical bugs | ✓ |
| Hand-rolled per-VR swap functions in BE parser | Drift risk between parser and serializer | |
| Generate the long-form set from VR metadata at build time | Premature; the 10-VR set is bounded and stable | |

**Notes:** Reserved-bytes-zero assert added (`DICOM_NONZERO_RESERVED_BYTES`) per PITFALLS §1.2. AT documented as two independent 2-byte swaps (NOT one 4-byte swap) per PITFALLS §1.3.

[auto] Explicit VR — Q: "Endian-swap implementation" → Selected: "Per-VR stride table shared with Phase 5" (recommended default — D-22, D-23, D-24, D-25).

## Deflated Explicit VR LE

| Option | Description | Selected |
|--------|-------------|----------|
| `zlib.inflateRawSync` (RFC 1951 raw deflate) | Spec-correct per PS3.5 §A.5 | ✓ |
| `zlib.inflateSync` (RFC 1950 zlib-wrapped) | **Silent-wrong bug** — fails on real Deflated TS files | |
| `pako` runtime dep | Unjustified; Node built-in covers it (D-05 Phase 1 toolchain) | |

**Rationale:** The "single highest-leverage technical recommendation #3" from research/SUMMARY.md. Position offsets in deflated TS are inflated-buffer-relative with `position.deflated = true` flag (D-27).

[auto] Deflated LE — Q: "Inflate function" → Selected: "`zlib.inflateRawSync`" (recommended default — D-26, D-27).

## Sequence Parsing & CP-246

| Option | Description | Selected |
|--------|-------------|----------|
| Encoding-context stack + CP-246 in Phase 2 (structural descent only) | Closes PITFALLS §2.1 + §2.2; Phase 3 layers navigation on top | ✓ |
| Defer all SQ structural parsing to Phase 3 | Phase 2 cannot return a complete Dataset shell — breaks downstream ordering | |
| Implement SQ + navigation methods in Phase 2 | Conflicts with Phase 3 ownership of MODEL-* / SQ-04 navigation API | |

**Rationale:** Sequence structural parsing must happen in Phase 2 to produce a complete Dataset shell. Phase 3 owns the higher-level navigation surface. CP-246 detection lives with the Explicit VR parsers (where UN+undefined-length is detectable). (D-28, D-29, D-30)

[auto] SQ — Q: "Where does CP-246 detection live?" → Selected: "Phase 2 structural descent; Phase 3 navigation" (recommended default).

## Encapsulated Pixel Data

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 recognizes structurally + captures fragment metadata; Phase 4 surfaces accessor | Clean phase split; PIXEL-* REQs are Phase 4 | ✓ |
| Phase 2 ships `ds.pixelData` accessor | Crosses into Phase 4 scope (PIXEL-01/02) | |
| Phase 2 leaves encapsulated pixel data unparsed (raw OB blob) | Loses fragment metadata; Phase 4 would have to re-parse | |

[auto] Pixel Data — Q: "Phase 2 ownership of encapsulated pixel data" → Selected: "Recognize + capture metadata; defer accessor to Phase 4" (recommended default — D-31, D-32).

## Private-Tag Creator Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Two-dim `creators[gggg][XX]` map populated as elements parse in order | Spec-correct per PS3.5 §7.8.1 + closes PITFALLS §7.1 off-by-0x1000 | ✓ |
| Single-dim `creators[gggg]` (assume one creator per group) | Wrong for files with multiple creators sharing a group | |
| Defer creator tracking to Phase 6 | TOL-09 is a Phase 2 REQ; Phase 6 only adds *profile* matching | |

**Rationale:** Block-reservation rule is the canonical bug every competing library got wrong (PROJECT.md key decision). Phase 2 implements it correctly with a fixture exercising the off-by-0x1000 case. (D-33, D-34)

[auto] Private Creator — Q: "Tracking strategy" → Selected: "Two-dim per-group/per-XX map" (recommended default).

## Strict Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Single chokepoint flips emit→throw based on `ctx.strict` | Mirrors HL7 sibling; impossible to drift | ✓ |
| Per-call-site `if (strict) throw` | Drift risk; harder to audit | |
| Two parsers (lenient and strict) sharing primitives | Doubles surface for no gain | |

[auto] Strict Mode — Q: "Where is strict-mode escalation enforced?" → Selected: "Single chokepoint" (recommended default — D-35, D-36).

## Test Strategy (Phase 2-Local)

| Option | Description | Selected |
|--------|-------------|----------|
| Programmatic builder + defer real fixtures to Phase 8 | Phase 2 stays self-contained; no fixture commits before Phase 8 | ✓ |
| Land canonical fixtures in Phase 2 | Cross-phase bleed; conflicts with TEST-02 / TEST-05 ownership | |
| Reuse upstream pydicom-data / dicom-test-files fixtures | License + provenance work; Phase 8's job per .planning/research/ARCHITECTURE.md §8 | |

**Rationale:** Phase 1 already shipped the PHI-scan CI hook (D-15..D-17 of `01-CONTEXT.md`); programmatic builders cannot accidentally commit real PHI. Phase 8 owns the curated fixture suite + provenance README. (D-37, D-38, D-39)

[auto] Test Strategy — Q: "Phase 2 fixture sourcing" → Selected: "Programmatic builder; defer real fixtures to Phase 8" (recommended default).

## Plan Decomposition

| Option | Description | Selected |
|--------|-------------|----------|
| 6 plans matching ROADMAP suggestion (warnings/dataset-shell → header/file-meta → implicit-LE → explicit-LE+BE+SQ+CP-246 → deflated-LE → strict-mode-capstone) | Matches roadmap; 02-03 ∥ 02-04; 02-05 depends on 02-04 | ✓ |
| 4 fewer plans (merge implicit + explicit) | Loses parallelism; harder to bisect failures | |
| Per-warning-code micro-plans | Excessive overhead; warning factories cluster naturally in 02-01 | |

[auto] Plan Decomposition — Q: "Plan structure" → Selected: "6 plans matching ROADMAP" (recommended default — D-40, D-41).

---

## Claude's Discretion

Areas where the planner has flexibility — recorded in `02-CONTEXT.md` `<decisions>` "Claude's Discretion" subsection:

- Internal representation of element map inside `Dataset` (Map vs sorted-array vs object).
- Whether `parser/emit.ts` is a separate file or co-located in `parser/warnings.ts`.
- Internal naming of warning factory functions.
- Whether `dataset/tag.ts` exposes a `Tag` class or just utility functions in Phase 2.
- The `ParseContext` (internal) shape beyond the documented required fields.

## Deferred Ideas

Captured in `02-CONTEXT.md` `<deferred>` for the right downstream phases:

- Profile-aware private-tag VR override at parse time (Phase 6).
- Implicit-creator-by-Manufacturer fallback (Phase 6).
- Streaming / pull-parser API (v2+).
- Byte-exact round-trip preservation of fragment boundaries (Phase 5 / Phase 8).
- `ds.toJSON({ bulkDataMode: 'uri' })` (v1.x).

## Reviewed Todos (not folded)

None — `gsd-todo` parking lot is empty per Phase 1's `01-CONTEXT.md` and current STATE.md.
