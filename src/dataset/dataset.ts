/**
 * The structural `Dataset` - top-level container produced by
 * `parseDicom`.
 *
 * Only `fileMeta` and `warnings` are public data; the element map is held
 * internally and reached through the `get` / `has` / `elements` / `getAll` /
 * `setElement` / `addElement` / `removeElement` / `addItem` / `removeItem`
 * navigation surface.
 *
 * The `warnings` array is frozen at the constructor boundary (mirrors
 * `@cosyte/hl7` sibling `model/message.ts`) so consumers receive
 * `readonly DicomParseWarning[]` and downstream mutation cannot escape.
 *
 * @module
 */

import type { Tag } from "../dictionary/types.js";
import type { DicomParseWarning } from "../parser/warnings.js";
import { analyzeDirectory, type DicomDirectory } from "./directory.js";
import type { Element } from "./element.js";
import type { FileMeta } from "./file-meta.js";
import { buildImage } from "./helpers/image.js";
import { buildPatient } from "./helpers/patient.js";
import { buildSeries } from "./helpers/series.js";
import { buildStudy } from "./helpers/study.js";
import type { ImageView, PatientView, SeriesView, StudyView } from "./helpers/types.js";

/**
 * Initialiser shape accepted by the `Dataset` (and `Item`) constructor.
 *
 * `fileMeta` is optional because nested `Item` datasets do not carry
 * their own File Meta - only the root `Dataset` returned by
 * `parseDicom` does.
 *
 * @internal
 */
export interface DatasetInit {
  readonly fileMeta?: FileMeta;
  readonly warnings: readonly DicomParseWarning[];
  readonly elements: ReadonlyMap<Tag, Element>;
}

/**
 * One parsed DICOM dataset - the structural shell.
 *
 * Public data: `fileMeta`, `warnings`. The internal element map is stored
 * on `_elements` (protected) and reached through the public
 * `get` / `has` / `elements` / `getAll` navigation API.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * console.log(ds.fileMeta?.transferSyntaxUID);
 * for (const w of ds.warnings) {
 *   console.warn(w.code, w.message);
 * }
 * ```
 */
export class Dataset {
  public readonly fileMeta: FileMeta | undefined;
  public readonly warnings: readonly DicomParseWarning[];
  /**
   * Element map, keyed by uppercase 8-hex tag. Reached publicly through the
   * navigation surface; kept `protected` here so only subclasses (`Item`, and
   * any later extension) can introspect it directly.
   *
   * @internal
   */
  protected readonly _elements: ReadonlyMap<Tag, Element>;

  /** Memoised domain views (built once, on first access). */
  private _patient?: PatientView;
  private _study?: StudyView;
  private _series?: SeriesView;
  private _image?: ImageView;
  /** Boxed so a memoised "not a DICOMDIR" is told apart from "not read yet". */
  private _directory?: { readonly value: DicomDirectory | undefined };

  /**
   * Construct a new structural `Dataset`. The warnings array is frozen at
   * the model boundary.
   *
   * @internal
   */
  public constructor(init: DatasetInit) {
    this.fileMeta = init.fileMeta;
    this.warnings = Object.freeze([...init.warnings]);
    this._elements = init.elements;
  }

  /**
   * Look up a single element by tag. Tags are normalised to 8-char
   * uppercase hex, so `"7fe00010"` and `"7FE00010"` resolve to the same
   * element. Returns `undefined` when the tag is absent.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const ds = parseDicom(buf);
   * const rows = ds.get("00280010"); // Rows
   * if (rows?.value.kind === "numbers") console.log(rows.value.values[0]);
   * ```
   */
  public get(tag: Tag): Element | undefined {
    return this._elements.get(tag.toUpperCase());
  }

  /**
   * `true` when an element with the given tag is present (case-insensitive).
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const ds = parseDicom(buf);
   * if (ds.has("00100010")) console.log("has Patient's Name");
   * ```
   */
  public has(tag: Tag): boolean {
    return this._elements.has(tag.toUpperCase());
  }

  /**
   * All elements in this dataset, in parse (insertion) order.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const ds = parseDicom(buf);
   * for (const el of ds.elements()) console.log(el.tag, el.vr);
   * ```
   */
  public elements(): readonly Element[] {
    return [...this._elements.values()];
  }

  /**
   * All elements matching a tag as an array (never `undefined`). A dataset
   * holds at most one element per tag, so this returns a 0- or 1-length
   * array - the convenience complement of {@link Dataset.get} for callers
   * that prefer an always-array shape.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const ds = parseDicom(buf);
   * for (const el of ds.getAll("00080060")) console.log(el.value);
   * ```
   */
  public getAll(tag: Tag): readonly Element[] {
    const el = this._elements.get(tag.toUpperCase());
    return el !== undefined ? [el] : [];
  }

  /**
   * Patient-identity view. Fail-safe typed-absent fields; `id` is
   * **not** globally unique - match on the `{id, issuerOfId, ...}` tuple
   * plus `otherIds`, never on a bare `(0010,0020)`. Memoised on first read.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const p = parseDicom(buf).patient;
   * p.name?.alphabetic.familyName; // structured PN, never flattened
   * ```
   */
  public get patient(): PatientView {
    return (this._patient ??= buildPatient(this));
  }

  /**
   * Study-identity view. `instanceUid` is the cross-system study
   * key; `accessionNumber` ties it to the order. Memoised on first read.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const s = parseDicom(buf).study;
   * s.instanceUid; // "1.2.840.113619..."
   * ```
   */
  public get study(): StudyView {
    return (this._study ??= buildStudy(this));
  }

  /**
   * Series-identity & co-registration view. A shared
   * `frameOfReferenceUid` means images are spatially co-registered.
   * Memoised on first read.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const s = parseDicom(buf).series;
   * s.modality; // "CT"
   * ```
   */
  public get series(): SeriesView {
    return (this._series ??= buildSeries(this));
  }

  /**
   * Pixel-interpretation + geometry view. Surfaces exactly
   * what a renderer needs without guessing: `rescaleSlope`/`signed`/
   * `photometricInterpretation` stay absent rather than defaulted, and the
   * three pixel-spacing tags are distinct. Memoised on first read.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const img = parseDicom(buf).image;
   * img.rescaleSlope; // undefined ⇒ MUST NOT assume 1
   * ```
   */
  public get image(): ImageView {
    return (this._image ??= buildImage(this));
  }

  /**
   * The DICOMDIR Directory Record tree, or `undefined` when this Dataset is not
   * a DICOMDIR (its File Meta Media Storage SOP Class UID is not
   * `1.2.840.10008.1.3.10`). Read from the four offset attributes (PS3.3 2026d
   * Table F.3-3): `root` is the record `(0004,1200)` names and each
   * `(0004,1400)` successor, and each record's `lowerLevel` is the record its
   * `(0004,1420)` names and each successor. An offset resolves only when it is
   * exactly the file offset of an Item of the Directory Record Sequence
   * `(0004,1220)`; one that is not names no record, and `parseDicom` warns
   * (`DICOM_DIRECTORY_OFFSET_UNRESOLVED`, `DICOM_DIRECTORY_OFFSET_MALFORMED`,
   * `DICOM_DIRECTORY_RECORD_REVISITED`, `DICOM_DIRECTORY_OFFSET_DEFLATED`).
   * Memoised on first read.
   *
   * Limits: record keys are not checked against PS3.3 F.5, the File-set
   * Consistency Flag and `(0004,1202)`'s agreement with the end of the root
   * chain are not checked, and under Deflated Explicit VR LE no offset resolves,
   * so every record is listed in `records` and none is linked.
   *
   * @example
   * ```ts
   * import { parseDicom } from "@cosyte/dicom";
   * const dir = parseDicom(buf).directory;
   * for (const patient of dir?.root ?? []) {
   *   for (const study of patient.lowerLevel) {
   *     for (const series of study.lowerLevel) {
   *       for (const image of series.lowerLevel) console.log(image.referencedFileId);
   *     }
   *   }
   * }
   * ```
   */
  public get directory(): DicomDirectory | undefined {
    this._directory ??= { value: analyzeDirectory(this)?.directory };
    return this._directory.value;
  }
}
