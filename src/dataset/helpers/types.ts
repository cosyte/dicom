/**
 * Typed view model for the Phase 4 safety-critical domain helpers
 * (`Dataset.patient` / `study` / `series` / `image`).
 *
 * Every field here obeys the §4 fail-safe contract from the dicom roadmap:
 * a missing value is **typed-absent** (`undefined`), never a substituted
 * default; a malformed numeric component stays `null` inside its array
 * rather than being coerced; raw bytes are always still reachable via the
 * underlying `Element`. These views *interpret* nothing about pixels — they
 * surface the metadata a downstream renderer needs to interpret them
 * correctly.
 *
 * The dangerous DICOM failure is the confident, wrong image — so the
 * deliberate omissions are as load-bearing as the fields: there is no
 * `signed` boolean unless `(0028,0103)` was actually present, no rescale
 * slope unless `(0028,1053)` was, and the three pixel-spacing tags are
 * three distinct fields that are never aliased.
 *
 * @module
 */

import type { Item } from "../item.js";
import type { DicomDate, DicomTime, PersonName } from "../vr/types.js";

/**
 * One entry of Other Patient IDs Sequence `(0010,1002)` — a `{id, issuer,
 * typeCode}` triple (PS3.3 §10.15, the DICOM analogue of an HL7 v2 CX
 * repetition). Surfaced so a caller never matches on a bare `(0010,0020)`.
 *
 * @example
 * ```ts
 * import type { OtherPatientId } from "@cosyte/dicom";
 * const o: OtherPatientId = { id: "MRN-42", issuer: "HOSP_A", typeCode: "TEXT" };
 * ```
 */
export interface OtherPatientId {
  readonly id?: string;
  readonly issuer?: string;
  readonly typeCode?: string;
}

/**
 * Patient & study identity (§4.1 — the wrong-patient failure class).
 *
 * `id` is **not globally unique**; correct cross-system matching needs the
 * `{id, issuerOfId, issuerQualifiers}` tuple plus `otherIds`. `name` keeps
 * its full `PN` component structure, never flattened to a string.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const p = parseDicom(buf).patient;
 * p.id;                       // "MRN-42" — meaningless without the issuer
 * p.issuerOfId;              // "HOSP_A"
 * p.name?.alphabetic.familyName; // "Doe"
 * ```
 */
export interface PatientView {
  readonly id?: string;
  readonly issuerOfId?: string;
  readonly issuerQualifiers?: readonly Item[];
  readonly otherIds: readonly OtherPatientId[];
  readonly name?: PersonName;
  readonly birthDate?: DicomDate;
  readonly sex?: string;
}

/**
 * Study-level identity (§4.1). `instanceUid` is the cross-system study key;
 * `accessionNumber` ties the study to the order.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const s = parseDicom(buf).study;
 * s.instanceUid;     // "1.2.840.113619..."
 * s.accessionNumber; // "ACC123"
 * ```
 */
export interface StudyView {
  readonly instanceUid?: string;
  readonly id?: string;
  readonly accessionNumber?: string;
  readonly date?: DicomDate;
  readonly time?: DicomTime;
  readonly description?: string;
}

/**
 * Series-level identity & co-registration (§4.1, §4.3). Images sharing a
 * `frameOfReferenceUid` are spatially co-registered.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const s = parseDicom(buf).series;
 * s.modality;            // "CT"
 * s.frameOfReferenceUid; // shared ⇒ co-registered
 * ```
 */
export interface SeriesView {
  readonly instanceUid?: string;
  readonly number?: number;
  readonly modality?: string;
  readonly description?: string;
  readonly frameOfReferenceUid?: string;
}

/**
 * A coded triplet (PS3.16 §8, Table 8-1): `Code Value (0008,0100)`,
 * `Coding Scheme Designator (0008,0102)`, `Code Meaning (0008,0104)`. The
 * canonical scheme OID is resolved only for the four standard designators;
 * legacy SNOMED designators (`SRT`/`SNM3`/`99SDM`) deliberately resolve to
 * `undefined` because their code values differ from `SCT` (CP-730).
 *
 * @example
 * ```ts
 * import type { CodedConcept } from "@cosyte/dicom";
 * const c: CodedConcept = {
 *   codeValue: "C-B1003",
 *   codingSchemeDesignator: "SCT",
 *   codeMeaning: "Hounsfield unit",
 *   schemeUid: "2.16.840.1.113883.6.96",
 * };
 * ```
 */
export interface CodedConcept {
  readonly codeValue?: string;
  readonly codingSchemeDesignator?: string;
  readonly codeMeaning?: string;
  readonly schemeUid?: string;
}

/**
 * A Real World Value Mapping (§4.5) — slope/intercept bound atomically to
 * its UCUM measurement-units code, so a number is never detached from its
 * units. From Real World Value Mapping Sequence `(0040,9096)`.
 *
 * @example
 * ```ts
 * import type { RealWorldValueMap } from "@cosyte/dicom";
 * const m: RealWorldValueMap = { slope: 1, intercept: 0, unitsCode: { codeValue: "[hnsf'U]" } };
 * ```
 */
export interface RealWorldValueMap {
  readonly slope?: number;
  readonly intercept?: number;
  readonly unitsCode?: CodedConcept;
}

/**
 * The five Enhanced multi-frame functional-group macros, resolved for a
 * single frame Per-Frame-else-Shared (§4.4, PS3.3 §C.7.6.16). Each macro is
 * typed-absent when present in neither the per-frame nor the shared group
 * (the three *geometry* macros are treated as required for an enhanced
 * object — see {@link ImageView.frame}).
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const f = parseDicom(enhancedBuf).image.frame(0);
 * f.planePosition?.imagePositionPatient; // this frame's [x,y,z]
 * f.pixelMeasures?.pixelSpacing;         // this frame's [row,col] mm
 * ```
 */
export interface FrameFunctionalGroups {
  readonly index: number;
  readonly pixelMeasures?: {
    readonly pixelSpacing?: readonly (number | null)[];
    readonly sliceThickness?: number;
    readonly spacingBetweenSlices?: number;
  };
  readonly planePosition?: {
    readonly imagePositionPatient?: readonly (number | null)[];
  };
  readonly planeOrientation?: {
    readonly imageOrientationPatient?: readonly (number | null)[];
  };
  readonly pixelValueTransformation?: {
    readonly rescaleSlope?: number;
    readonly rescaleIntercept?: number;
    readonly rescaleType?: string;
  };
  readonly frameVoiLut?: {
    readonly windowCenter?: readonly (number | null)[];
    readonly windowWidth?: readonly (number | null)[];
  };
}

/**
 * Pixel-interpretation + geometry metadata (§4.2 / §4.3 / §4.4 / §4.5) — the
 * "wrong pixels look fine" and "looks fine, measures wrong" classes. v1 does
 * not decode pixels; this view surfaces exactly what a renderer needs so it
 * does not have to guess.
 *
 * Safety-critical omissions are intentional: `rescaleSlope` is absent (not
 * `1`) when the tag is absent; `signed` is absent (not a guess) unless
 * `(0028,0103)` was present; `photometricInterpretation` is absent (not
 * `MONOCHROME2`) when absent; the three pixel-spacing fields are distinct.
 * When `modalityLutSequence` / `voiLutSequence` are present they are
 * authoritative over the linear `rescale*` / `window*` pairs.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const img = parseDicom(buf).image;
 * img.rescaleSlope; // undefined ⇒ caller MUST NOT assume 1
 * img.signed;       // undefined ⇒ signedness unknown, never guess
 * img.pixelSpacing; // patient-plane mm — distinct from imagerPixelSpacing
 * ```
 */
export interface ImageView {
  readonly sopInstanceUid?: string;
  readonly rows?: number;
  readonly columns?: number;
  readonly samplesPerPixel?: number;
  readonly photometricInterpretation?: string;
  readonly planarConfiguration?: number;
  readonly bitsAllocated?: number;
  readonly bitsStored?: number;
  readonly highBit?: number;
  /** Raw `(0028,0103)` value: 0 = unsigned, 1 = signed. Absent ⇒ unknown. */
  readonly pixelRepresentation?: number;
  /** `true`/`false` only when `(0028,0103)` was 1/0; absent ⇒ never guessed. */
  readonly signed?: boolean;
  readonly rescaleSlope?: number;
  readonly rescaleIntercept?: number;
  readonly rescaleType?: string;
  readonly windowCenter?: readonly (number | null)[];
  readonly windowWidth?: readonly (number | null)[];
  readonly modalityLutSequence?: readonly Item[];
  readonly voiLutSequence?: readonly Item[];
  readonly pixelSpacing?: readonly (number | null)[];
  readonly imagerPixelSpacing?: readonly (number | null)[];
  readonly nominalScannedPixelSpacing?: readonly (number | null)[];
  readonly sliceThickness?: number;
  readonly spacingBetweenSlices?: number;
  readonly imagePositionPatient?: readonly (number | null)[];
  readonly imageOrientationPatient?: readonly (number | null)[];
  readonly frameOfReferenceUid?: string;
  readonly numberOfFrames?: number;
  readonly units?: string;
  readonly realWorldValueMaps?: readonly RealWorldValueMap[];
  /** `true` when this object carries Per-Frame/Shared Functional Groups. */
  readonly isEnhancedMultiFrame: boolean;
  /**
   * Resolve the functional-group macros for frame `index` Per-Frame-else-Shared.
   * Throws {@link DicomValueError} `FRAME_INDEX_OUT_OF_RANGE` for an index
   * outside `[0, numberOfFrames)` and `MISSING_REQUIRED_FUNCTIONAL_GROUP`
   * when an enhanced object lacks a required geometry macro in both groups.
   */
  frame(index: number): FrameFunctionalGroups;
}
