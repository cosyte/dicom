/**
 * Shared parser-pipeline types for `@cosyte/dicom`.
 *
 * Phase 2 core-parser context:
 *   - D-02 — `ParseOptions` shape (Phase 2 only; no `profile` field).
 *   - D-03 — `OnWarningCallback` ordering contract (invoked AFTER push to `ctx.warnings`).
 *   - D-07 — `DicomPosition` shape (`byteOffset`, optional `fileMeta` / `deflated` / `contextPath`).
 *   - D-45 — `ParseContext.profile?: unknown` is reserved for Phase 6; Phase 2 never sets it.
 *
 * Public types (exported via `src/index.ts`): `DicomPosition`, `ParseOptions`, `OnWarningCallback`.
 * Internal type (NOT exported from `src/index.ts`): `ParseContext`.
 *
 * @module
 */

import type { Buffer } from "node:buffer";
import type { VR } from "../dictionary/types.js";
import type { DicomParseWarning, WarningCode } from "./warnings.js";

/**
 * One private-data attribute definition supplied by a {@link Profile}'s
 * private-dictionary overlay. The `vr` resolves the Implicit-VR of a private
 * data element whose on-wire encoding carries no VR; `keyword` / `name` carry
 * the vendor-documented identity for tooling and docs.
 *
 * @example
 * ```ts
 * import type { PrivateTagDefinition } from "@cosyte/dicom";
 * const def: PrivateTagDefinition = {
 *   vr: "OB",
 *   keyword: "CSAImageHeaderInfo",
 *   name: "CSA Image Header Info",
 * };
 * ```
 */
export interface PrivateTagDefinition {
  readonly vr: VR;
  readonly keyword: string;
  readonly name: string;
}

/**
 * A source/vendor tolerance preset (Phase 6). A `Profile` bundles three
 * things that only ever **tighten or annotate** a parse — never loosen it
 * past the Postel's-Law default:
 *
 *  - `escalations` — Tier-2 warning codes promoted to a thrown
 *    `DicomParseError` (a stricter posture for known-unsafe deviations).
 *  - `suppressions` — Tier-2 warning codes silenced because they are a
 *    documented, benign quirk of the named source (annotation, not loss).
 *  - `privateDictionary` — a private-creator-keyed overlay resolving the
 *    Implicit-VR of vendor private data elements via the file's **live**
 *    private-creator string (never a hard-coded block number).
 *
 * Build one with `defineProfile()`; never hand-author the frozen shape.
 * Profiles are immutable and composable via `extends`.
 *
 * @example
 * ```ts
 * import { parseDicom, profiles } from "@cosyte/dicom";
 * const ds = parseDicom(buf, { profile: profiles.siemens });
 * console.log(ds.fileMeta?.transferSyntaxUID);
 * ```
 */
export interface Profile {
  readonly name: string;
  readonly lineage: readonly string[];
  readonly description?: string;
  readonly escalations: ReadonlySet<WarningCode>;
  readonly suppressions: ReadonlySet<WarningCode>;
  /**
   * Creator string → canonical private-tag key (`"GGGGxxEE"`, e.g.
   * `"0029xx10"`) → definition. The `xx` placeholder stands for the
   * file-assigned private block byte, mirroring the published DICOM
   * private-dictionary notation; resolution is therefore by creator string,
   * never by a fixed block number.
   */
  readonly privateDictionary: ReadonlyMap<string, ReadonlyMap<string, PrivateTagDefinition>>;
  /** Render a human-readable, deterministic one-line summary of the profile. */
  readonly describe?: () => string;
}

/**
 * Positional context for a `DicomParseWarning` or `DicomParseError`.
 *
 * Byte offsets are relative to the source buffer for non-deflated transfer
 * syntaxes; for the Deflated Explicit VR LE transfer syntax (D-27),
 * `deflated: true` indicates the offset is into the inflated dataset buffer
 * rather than the on-disk source.
 *
 * With `exactOptionalPropertyTypes: true`, callers should omit unset keys
 * rather than passing `undefined` (mirrors `@cosyte/hl7` sibling discipline).
 *
 * @example
 * ```ts
 * import type { DicomPosition } from "@cosyte/dicom";
 * const p: DicomPosition = { byteOffset: 132, fileMeta: true };
 * ```
 */
export interface DicomPosition {
  readonly byteOffset: number;
  /** True when offset is inside the File Meta group. Omit (do not pass `undefined`) when not applicable. */
  readonly fileMeta?: boolean;
  /** True when offset is into the inflated dataset buffer (Deflated TS only). Omit when not applicable. */
  readonly deflated?: boolean;
  /** Tag chain for nested SQ items, e.g. `["0040A730", "0", "00080100"]`. Omit when at root. */
  readonly contextPath?: readonly string[];
}

/**
 * Synchronous callback invoked once per Tier-2 warning emitted during parse.
 *
 * Per `02-CONTEXT.md` D-03, the callback fires AFTER the warning has been
 * pushed to `ctx.warnings`; if the callback throws, the parser silently
 * swallows the exception and continues (mirrors `@cosyte/hl7` sibling).
 *
 * @example
 * ```ts
 * import type { OnWarningCallback } from "@cosyte/dicom";
 * const onWarning: OnWarningCallback = (w) => {
 *   if (w.code === "DICOM_MISSING_PREAMBLE") {
 *     // ...
 *   }
 * };
 * ```
 */
export type OnWarningCallback = (warning: DicomParseWarning) => void;

/**
 * Options accepted by `parseDicom`.
 *
 * Per `02-CONTEXT.md` D-02 — Phase 2 form only. No `profile` field; Phase 6
 * adds it. With `exactOptionalPropertyTypes: true`, callers omit unset keys
 * rather than passing `undefined` for any field below.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf, {
 *   strict: false,
 *   stripPreamble: "tolerate",
 *   copyValues: false,
 *   onWarning: (w) => console.warn(w.code),
 * });
 * ```
 */
export interface ParseOptions {
  /**
   * When `true`, every Tier-2 warning is escalated to a thrown
   * `DicomParseError` carrying the warning code. Default `false`.
   *
   * Omit (do not pass `undefined`) to use the default.
   */
  readonly strict?: boolean;
  /**
   * Preamble policy:
   *   - `"tolerate"` (default): attempt to start at offset 0 if `DICM` magic
   *     is missing at offset 128; emit `DICOM_MISSING_PREAMBLE`.
   *   - `"require"`: throw `DicomParseError(NOT_DICOM_PART_10)` when no
   *     `DICM` magic is present.
   *
   * Omit to use the default.
   */
  readonly stripPreamble?: "tolerate" | "require";
  /**
   * Synchronous callback invoked once per Tier-2 warning, after the warning
   * has been pushed to `Dataset.warnings`. Throwing handlers are silently
   * swallowed (parser-state safety per D-03).
   *
   * Omit to skip the callback entirely.
   */
  readonly onWarning?: OnWarningCallback;
  /**
   * When `true`, every `Element.rawBytes` is `Buffer.from(slice)` — copying
   * each value out so the source buffer can be released. When `false` (the
   * default), `Element.rawBytes` is `Buffer.subarray(slice)` — a zero-copy
   * view that pins the source ArrayBuffer until every Element is GC'd.
   *
   * Per D-16 / MODEL-03. Omit to use the default.
   */
  readonly copyValues?: boolean;
  /**
   * Source/vendor tolerance preset (Phase 6, D-45). Applies the profile's
   * `escalations` / `suppressions` to warning emission and its
   * `privateDictionary` to Implicit-VR resolution of private data elements.
   * A profile only tightens or annotates — it never makes the default
   * lenient parse throw outside the four Tier-3 fatals, and a private
   * creator the profile does not recognize degrades to generic UN handling
   * plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning, never a wrong decode.
   *
   * Omit (do not pass `undefined`) for the unprofiled default behaviour.
   */
  readonly profile?: Profile;
}

/**
 * Internal pipeline state threaded through every parser stage.
 *
 * Not exported from `src/index.ts`. Phase 6 will populate the `profile`
 * field reserved here per D-45; Phase 2 always leaves it absent.
 *
 * @internal
 */
export interface ParseContext {
  readonly buffer: Buffer;
  readonly strict: boolean;
  readonly stripPreamble: "tolerate" | "require";
  readonly onWarning?: OnWarningCallback;
  readonly warnings: DicomParseWarning[];
  /**
   * Group → block-id (low byte `0x10..0xFF`) → creator string. Populated as
   * Private Creator elements `(gggg,00XX)` are seen during parse. Phase 2's
   * private-creator stack tracking lives here (D-33).
   */
  readonly creators: Map<number, Map<number, string>>;
  /**
   * Sequence-encoding stack — the top entry determines FFFE-marker semantics
   * per D-28. Initial stack is `["Root"]`.
   */
  readonly encodingContextStack: Array<"Root" | "SqItem" | "EncapsulatedPixelData">;
  /**
   * Hard-cap counter — incremented on SQ descent, decremented on ascent.
   * Plan 02-04 enforces a depth cap; Phase 2-06 adds the overflow security
   * test (T-02-01-07).
   */
  nestingDepth: number;
  /**
   * The `(0008,0005)` Specific Character Set terms resolved so far during
   * this parse, threaded onto each `Element` so Phase 3 text decoders can
   * honour the dataset's charset. Mutable: set when `(0008,0005)` is read,
   * inherited into SQ items and restored per-item by `parseSequence`.
   * `undefined` means the Default Repertoire (ISO_IR 6).
   */
  currentCharset?: readonly string[];
  /**
   * Active source/vendor {@link Profile} (Phase 6, D-45). Threaded from
   * `ParseOptions.profile`. When absent the parse is unprofiled (the Phase 2
   * baseline). Consulted by the emitter (escalations / suppressions) and by
   * Implicit-VR private-tag resolution (private-dictionary overlay).
   */
  readonly profile?: Profile;
  /**
   * When `true`, `Element.rawBytes` is `Buffer.from(slice)` (copy); when
   * `false` (default), `Buffer.subarray(slice)` (view). Per D-16.
   */
  readonly copyValues: boolean;
}
