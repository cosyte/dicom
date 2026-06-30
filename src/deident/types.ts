/**
 * Public types + error taxonomy for Phase 7 metadata de-identification
 * (PS3.15 Annex E).
 *
 * @module
 */

import type { AnnexEActionCode, AnnexEOption } from "../dictionary/annex-e.js";
import type { Tag } from "../dictionary/types.js";
import type { Profile } from "../parser/types.js";
import type { DicomParseWarning } from "../parser/warnings.js";

/**
 * The PS3.15 Annex E option sets `deidentify` honours — the nine
 * *metadata-affecting* columns of Table E.1-1. The two pixel-level options
 * (`CleanPixelData` §E.3.1, `CleanRecognizableVisual` §E.3.2) are deliberately
 * excluded: this is a metadata-only de-identifier and cannot inspect pixels
 * (deferred to `@cosyte/dicom-pixel`). When pixel data is present it always
 * warns rather than claiming the image is clean.
 *
 * @example
 *   const retain: DeidentifyOption[] = ["RetainLongitudinalTemporal", "RetainSafePrivate"];
 */
export type DeidentifyOption = Exclude<AnnexEOption, "CleanPixelData" | "CleanRecognizableVisual">;

/**
 * The nine metadata option-set names, frozen for runtime validation.
 *
 * @example
 * ```ts
 * import { DEIDENTIFY_OPTIONS } from "@cosyte/dicom";
 * DEIDENTIFY_OPTIONS.includes("RetainUIDs"); // true
 * ```
 */
export const DEIDENTIFY_OPTIONS: readonly DeidentifyOption[] = Object.freeze([
  "CleanGraphics",
  "CleanStructuredContent",
  "CleanDescriptors",
  "RetainLongitudinalTemporal",
  "RetainPatientCharacteristics",
  "RetainDeviceIdentity",
  "RetainUIDs",
  "RetainSafePrivate",
  "RetainInstitutionIdentity",
]);

/**
 * What `deidentify` actually did to one attribute — the concrete outcome of the
 * resolved Annex E action.
 *
 * - `removed` — the element was deleted (`X`).
 * - `emptied` — replaced with a zero-length value (`Z`).
 * - `dummied` — replaced with a non-identifying dummy of compatible VR (`D`).
 * - `uid-remapped` — UID(s) replaced with internally-consistent UIDs (`U`).
 * - `cleaned` — conservatively blanked because a safe similar-meaning value
 *   cannot be synthesised at the metadata layer (`C`; see known limitations).
 * - `kept` — retained, either by an active Retain option or because the SQ was
 *   kept and its items cleaned recursively.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type AppliedAction } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * const removed = report.attributes.filter((a) => a.applied === ("removed" satisfies AppliedAction));
 * ```
 */
export type AppliedAction = "removed" | "emptied" | "dummied" | "uid-remapped" | "cleaned" | "kept";

/**
 * One audited attribute outcome. Carries only structural facts — tag, keyword,
 * the resolved Annex E action code, and the SQ context path — **never** a
 * decoded value, so a report is always safe to log.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type DeidentifiedAttribute } from "@cosyte/dicom";
 * const { report } = deidentify(parseDicom(buf));
 * report.attributes.forEach((a: DeidentifiedAttribute) => {
 *   console.log(a.keyword, a.action, a.applied); // structural facts only — safe to log
 * });
 * ```
 */
export interface DeidentifiedAttribute {
  readonly tag: Tag;
  readonly keyword: string;
  /** The resolved single action after collapsing any conditional code. */
  readonly action: Exclude<AnnexEActionCode, `${string}/${string}`>;
  readonly applied: AppliedAction;
  /** Tag/index chain for an attribute inside a sequence; omitted at the root. */
  readonly contextPath?: readonly string[];
}

/**
 * The audit trail returned alongside the de-identified dataset. Contains no
 * decoded values — only tags, keywords, action codes, and the UID map (whose
 * keys/values are UIDs, not patient data).
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type DeidentifyReport } from "@cosyte/dicom";
 * const { report }: { report: DeidentifyReport } = deidentify(parseDicom(buf));
 * console.log(report.attributes.length, "attributes acted on");
 * console.log(report.warnings.map((w) => w.code)); // e.g. burned-in annotation
 * ```
 */
export interface DeidentifyReport {
  /** Per-attribute outcomes for every attribute Annex E acted on. */
  readonly attributes: readonly DeidentifiedAttribute[];
  /** Private tags removed under the Basic Profile (kept ones are omitted). */
  readonly removedPrivateTags: readonly Tag[];
  /** Source UID → replacement UID, for cross-file consistency. */
  readonly uidMap: ReadonlyMap<string, string>;
  /** Safety warnings — notably burned-in-pixel annotation that cannot be cleaned. */
  readonly warnings: readonly DicomParseWarning[];
  /** The Retain/Clean options that were active for this run. */
  readonly retained: readonly DeidentifyOption[];
}

/**
 * Options controlling a de-identification run. All optional — the default is
 * the Basic Application Level Confidentiality Profile with no Retain options.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, type DeidentifyOptions } from "@cosyte/dicom";
 * const opts: DeidentifyOptions = { retain: ["RetainLongitudinalTemporal", "CleanDescriptors"] };
 * const { dataset } = deidentify(parseDicom(buf), opts);
 * ```
 */
export interface DeidentifyOptions {
  /** Annex E option sets to activate (Retain* / Clean*). Default: none. */
  readonly retain?: readonly DeidentifyOption[];
  /** Root for generated UIDs (action `U`). Default `"2.25"`. */
  readonly uidRoot?: string;
  /**
   * A caller-owned source→replacement UID cache. Pass one shared map across a
   * whole study/archive to make UID remapping consistent by construction even
   * across separate calls (it is consistent anyway — the mapping is content-
   * derived — but a shared map also makes repeats O(1)).
   */
  readonly uidMap?: Map<string, string>;
  /**
   * A Phase 6 {@link Profile} whose private-dictionary overlay names the
   * known-safe private attributes to keep when `RetainSafePrivate` is active.
   * Without it, `RetainSafePrivate` keeps nothing (fail-safe).
   */
  readonly profile?: Profile;
  /**
   * Text written to `(0012,0063)` De-identification Method. Default names the
   * Basic Profile and the active options.
   */
  readonly deidentificationMethod?: string;
}

/**
 * The result of {@link deidentify}: a new dataset plus its audit report.
 *
 * @example
 * ```ts
 * import { deidentify, parseDicom, serializeDicom, type DeidentifyResult } from "@cosyte/dicom";
 * const { dataset, report }: DeidentifyResult<ReturnType<typeof parseDicom>> = deidentify(parseDicom(buf));
 * const safe = serializeDicom(dataset); // input dataset is never mutated
 * void report;
 * ```
 */
export interface DeidentifyResult<TDataset> {
  readonly dataset: TDataset;
  readonly report: DeidentifyReport;
}

/**
 * Stable codes for {@link DeidentifyError}.
 *
 * @example
 * ```ts
 * import { DEIDENTIFY_ERROR_CODES } from "@cosyte/dicom";
 * DEIDENTIFY_ERROR_CODES.INVALID_OPTIONS; // "INVALID_OPTIONS"
 * ```
 */
export const DEIDENTIFY_ERROR_CODES = Object.freeze({
  INVALID_OPTIONS: "INVALID_OPTIONS",
} as const);

/**
 * One of the {@link DEIDENTIFY_ERROR_CODES} values.
 *
 * @example
 * ```ts
 * import { DeidentifyError, type DeidentifyErrorCode } from "@cosyte/dicom";
 * const code: DeidentifyErrorCode = "INVALID_OPTIONS";
 * throw new DeidentifyError("unknown retain option", code);
 * ```
 */
export type DeidentifyErrorCode =
  (typeof DEIDENTIFY_ERROR_CODES)[keyof typeof DEIDENTIFY_ERROR_CODES];

/**
 * Thrown for an author-time misconfiguration of {@link deidentify} (an unknown
 * Retain option, a malformed UID root). Distinct from the parser's fatal codes,
 * the value layer's `DicomValueError`, and the serializer's `DicomSerializeError`.
 * The message carries only structural facts (option names, the UID root) — never
 * a decoded value.
 *
 * @example
 * ```ts
 * import { deidentify, DeidentifyError } from "@cosyte/dicom";
 * try {
 *   // @ts-expect-error — not a valid option
 *   deidentify(ds, { retain: ["RetainEverything"] });
 * } catch (e) {
 *   if (e instanceof DeidentifyError) console.error(e.code); // "INVALID_OPTIONS"
 * }
 * ```
 */
export class DeidentifyError extends Error {
  public readonly code: DeidentifyErrorCode;

  /**
   * @param message Human-readable, PHI-free description.
   * @param code    One of {@link DEIDENTIFY_ERROR_CODES}.
   */
  public constructor(message: string, code: DeidentifyErrorCode) {
    super(message);
    this.name = "DeidentifyError";
    this.code = code;
  }
}
