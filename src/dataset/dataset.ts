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
import type { CompactTable } from "./compact.js";
import { analyzeDirectory, type DicomDirectory } from "./directory.js";
import type { Element } from "./element.js";
import type { FileMeta } from "./file-meta.js";
import { buildImage } from "./helpers/image.js";
import { buildPatient } from "./helpers/patient.js";
import { buildSeries } from "./helpers/series.js";
import { buildStudy } from "./helpers/study.js";
import { tagNumber } from "./tag.js";
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
 * Hands the parser a way to back a Dataset with its compact table, and to set the warnings of the
 * root once the parse has raised them all. Set once by the class's static block; not exported
 * from the package.
 */
let setTable: (ds: Dataset, table: CompactTable, set: number) => void;
let setWarnings: (ds: Dataset, warnings: readonly DicomParseWarning[]) => void;

/**
 * One parsed DICOM dataset - the structural shell.
 *
 * Public data: `fileMeta`, `warnings`. The elements are held internally and
 * reached through the public `get` / `has` / `elements` / `getAll`
 * navigation API. A Dataset `parseDicom` returns, and each of its Items,
 * reads them from the parse's compact table and builds each `Element` the
 * first time it is asked for, then returns that same Element every time.
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
  /** The elements of a Dataset built by hand, keyed by uppercase 8-hex tag. */
  #map: ReadonlyMap<Tag, Element>;
  /** The parse's table, for a Dataset `parseDicom` built; `#set` is this Data Set in it. */
  #table: CompactTable | undefined;
  #set = 0;
  /** The Elements built so far from the table, by position. */
  #built: (Element | undefined)[] | undefined;
  /** Tag to position, for a long Data Set whose tags do not ascend. */
  #positions: Map<number, number> | undefined;
  /** `_elements`, once a subclass has asked for it. */
  #elementMap: ReadonlyMap<Tag, Element> | undefined;

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
    this.#map = init.elements;
    this.#table = undefined;
  }

  static {
    setTable = (ds, table, set): void => {
      ds.#table = table;
      ds.#set = set;
    };
    setWarnings = (ds, warnings): void => {
      (ds as { warnings: readonly DicomParseWarning[] }).warnings = Object.freeze([...warnings]);
    };
  }

  /**
   * The elements as a map keyed by uppercase 8-hex tag, in parse order, for a subclass that reads
   * them that way. A Dataset built by hand returns the map it was built with; a parsed one builds
   * the map, and every Element, the first time this is read.
   *
   * @internal
   */
  protected get _elements(): ReadonlyMap<Tag, Element> {
    if (this.#table === undefined) return this.#map;
    if (this.#elementMap === undefined) {
      const map = new Map<Tag, Element>();
      for (const el of this.elements()) map.set(el.tag, el);
      this.#elementMap = map;
    }
    return this.#elementMap;
  }

  /** The Element at `i` of the table's Data Set, built the first time. */
  #at(table: CompactTable, i: number): Element {
    const built = (this.#built ??= new Array<Element | undefined>(table.size(this.#set)));
    let el = built[i];
    if (el === undefined) {
      el = table.element(this.#set, i);
      built[i] = el;
    }
    return el;
  }

  /** The position of `tag` in the table's Data Set, or -1. */
  #find(table: CompactTable, tag: Tag): number {
    const n = tagNumber(tag);
    if (n === -1) return -1;
    const set = this.#set;
    if (this.#positions === undefined && table.wantsIndex(set)) {
      const positions = new Map<number, number>();
      const size = table.size(set);
      for (let i = 0; i < size; i++) positions.set(table.tagAt(set, i), i);
      this.#positions = positions;
    }
    return table.indexOf(set, n, this.#positions);
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
    const table = this.#table;
    if (table === undefined) return this.#map.get(tag.toUpperCase());
    const i = this.#find(table, tag);
    return i === -1 ? undefined : this.#at(table, i);
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
    const table = this.#table;
    if (table === undefined) return this.#map.has(tag.toUpperCase());
    return this.#find(table, tag) !== -1;
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
    const table = this.#table;
    if (table !== undefined) {
      const size = table.size(this.#set);
      const out = new Array<Element>(size);
      for (let i = 0; i < size; i++) out[i] = this.#at(table, i);
      return out;
    }
    // An array of exactly the map's size, filled in insertion order: the same
    // elements a spread of `values()` gives, without growing an array to fit or
    // stepping an iterator.
    const map = this.#map;
    const out = new Array<Element>(map.size);
    let i = 0;
    map.forEach((el) => {
      out[i++] = el;
    });
    return out;
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
    const el = this.get(tag);
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

/**
 * Back `ds` with Data Set `set` of the parse's compact table.
 *
 * @internal
 */
export function datasetOverTable(ds: Dataset, table: CompactTable, set: number): void {
  setTable(ds, table, set);
}

/**
 * Set the root Dataset's warnings, frozen, once the parse has raised the last of them.
 *
 * @internal
 */
export function setDatasetWarnings(ds: Dataset, warnings: readonly DicomParseWarning[]): void {
  setWarnings(ds, warnings);
}

/**
 * Instances kept for the life of the process so V8 keeps the Dataset class's hidden classes.
 *
 * A hidden class past an object's first field is reachable only from the objects that use it, so
 * once a collection finds no live instance it drops the chain, and the next instance built pays to
 * make every one of them again: 1 to 2 KiB a field, measured, which after a collection
 * outweighs the parse of a small file. These instances hold the chain. They are built with the
 * field kinds a parse stores (a number or nothing, a string or nothing, an object or nothing), so
 * later instances share their hidden classes rather than branching from them.
 */
export const DATASET_SHAPES: readonly Dataset[] = [
  new Dataset({ warnings: [], elements: new Map() }),
  new Dataset({ fileMeta: { transferSyntaxUID: "" }, warnings: [], elements: new Map() }),
];
