/**
 * `deidentify` — PS3.15 Annex E metadata-level de-identification.
 *
 * Applies the **Basic Application Level Confidentiality Profile** plus any of the
 * nine *metadata-affecting* Annex E Options, driven by the generated Table E.1-1
 * action map ({@link annexE}). It is a **pure** function: the input {@link Dataset}
 * is never mutated; a fresh `Dataset` (with a rebuilt element map and File Meta)
 * is returned alongside a value-free {@link DeidentifyReport}.
 *
 * **What it does**
 * - Resolves each attribute's action (basic profile, overridden by an active
 *   Retain/Clean Option), collapsing conditional codes to their leftmost branch
 *   (see {@link resolveAction}), and applies it: `X` remove, `Z` zero-length, `D`
 *   VR-consistent dummy (falling back to `Z` where no safe dummy exists), `C`
 *   conservative blank, `U` deterministic consistent-UID remap, `K` keep.
 * - Recurses into kept sequences and **re-encodes** them so nested PHI is removed
 *   in the *serialized* bytes too — not just the object model (the Phase 5 writer
 *   blits `SQ` spans verbatim, so a rebuilt `items` array alone would not survive
 *   serialization). Rebuilt sequences are normalized to defined length.
 * - Removes all private attributes by default; with `RetainSafePrivate` + a
 *   {@link Profile}, keeps the private data elements the profile's overlay names
 *   as safe (and the private-creator elements the profile recognizes).
 * - Remaps `(0002,0003)` Media Storage SOP Instance UID consistently (unless
 *   `RetainUIDs`), writes `(0012,0062)` Patient Identity Removed = `YES` and
 *   `(0012,0063)` De-identification Method, and warns
 *   (`DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`) when Pixel Data is present and not
 *   marked free of burned-in annotation — this metadata-only pass cannot clean
 *   pixels (deferred to `@cosyte/dicom-pixel`).
 *
 * **Known limitations** (documented, fail-safe toward *more* removal):
 * - No IOD Type-1 conformance analysis, so conditional codes always take the
 *   most-protective leftmost branch — a Type-1 attribute that strictly needed a
 *   dummy is instead removed/emptied.
 * - `C` (clean) is a conservative blank, not a meaning-preserving structured
 *   replacement (which needs domain context the metadata layer lacks).
 * - Pixel-level options (`CleanPixelData`, `CleanRecognizableVisual`) are out of
 *   scope; burned-in text is warned, never cleaned.
 * - A private data element kept under `RetainSafePrivate` is kept *verbatim* — if
 *   it is itself a sequence carrying standard PHI attributes, that nested content
 *   is not recursed. The profile vouches the element is safe; nest accordingly.
 * - A sequence whose `items` the parser did not materialize (e.g. an
 *   undefined-length `UN` value stored as an opaque span) is kept verbatim rather
 *   than recursed, so any nested listed attributes are not de-identified.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { annexE, type AnnexEAction, type AnnexEActionCode } from "../dictionary/annex-e.js";
import type { Tag, VR } from "../dictionary/types.js";
import { Dataset, type DatasetInit } from "../dataset/dataset.js";
import { Element, type ElementInit } from "../dataset/element.js";
import type { FileMeta } from "../dataset/file-meta.js";
import { Item } from "../dataset/item.js";
import { isPrivateTag, splitTag } from "../dataset/tag.js";
import type { Profile } from "../parser/types.js";
import type { DicomParseWarning } from "../parser/warnings.js";
import { burnedInAnnotationNotRemoved } from "../parser/warnings.js";
import { resolvePrivateTag } from "../profiles/lookup.js";
import { type BodyEncoding, encodeDatasetElement } from "../serialize/element.js";
import { dummyBytes, remapUidBytes, resolveAction, uidValueMultiplicity } from "./actions.js";
import {
  DEIDENTIFY_OPTIONS,
  DeidentifyError,
  type AppliedAction,
  type DeidentifiedAttribute,
  type DeidentifyOption,
  type DeidentifyOptions,
  type DeidentifyReport,
  type DeidentifyResult,
} from "./types.js";
import { makeUidRemapper, type UidRemapper } from "./uid.js";

const TAG_PATIENT_IDENTITY_REMOVED: Tag = "00120062";
const TAG_DEIDENTIFICATION_METHOD: Tag = "00120063";
const TAG_PIXEL_DATA: Tag = "7FE00010";
const TAG_BURNED_IN_ANNOTATION: Tag = "00280301";

/** Map a transfer syntax UID to the on-wire element encoding (mirrors the writer). */
const BODY_ENCODING: Readonly<Record<string, BodyEncoding>> = {
  "1.2.840.10008.1.2": "implicit",
  "1.2.840.10008.1.2.1": "explicitLE",
  "1.2.840.10008.1.2.2": "explicitBE",
  "1.2.840.10008.1.2.1.99": "explicitLE",
};

interface DeidentifyContext {
  readonly active: ReadonlySet<DeidentifyOption>;
  readonly remap: UidRemapper;
  readonly profile: Profile | undefined;
  readonly encoding: BodyEncoding;
  readonly littleEndian: boolean;
}

/** Validate caller-supplied options; throws {@link DeidentifyError} on misconfig. */
function validateRetain(
  retain: readonly DeidentifyOption[] | undefined,
): ReadonlySet<DeidentifyOption> {
  const valid = new Set<string>(DEIDENTIFY_OPTIONS);
  const active = new Set<DeidentifyOption>();
  for (const opt of retain ?? []) {
    if (!valid.has(opt)) {
      throw new DeidentifyError(
        `Unknown de-identify option "${String(opt)}"; expected one of ${DEIDENTIFY_OPTIONS.join(", ")}.`,
        "INVALID_OPTIONS",
      );
    }
    active.add(opt);
  }
  return active;
}

/**
 * The action code in effect for an attribute: the first active Option (in the
 * canonical {@link DEIDENTIFY_OPTIONS} order) that overrides it wins; otherwise
 * the Basic Profile action.
 */
function effectiveCode(
  action: AnnexEAction,
  active: ReadonlySet<DeidentifyOption>,
): AnnexEActionCode {
  for (const opt of DEIDENTIFY_OPTIONS) {
    if (active.has(opt)) {
      const override = action.optionSet[opt];
      if (override !== undefined) return override;
    }
  }
  return action.basicProfile;
}

/** Build a fresh value-only scalar {@link Element}, preserving structural fields. */
function freshScalar(orig: Element, value: Buffer, vm: number): Element {
  const init: ElementInit = {
    tag: orig.tag,
    vr: orig.vr,
    vm,
    length: value.length,
    rawBytes: value,
    byteOffset: orig.byteOffset,
    littleEndian: orig.littleEndian,
    ...(orig.privateCreator !== undefined ? { privateCreator: orig.privateCreator } : {}),
    ...(orig.specificCharacterSet !== undefined
      ? { specificCharacterSet: orig.specificCharacterSet }
      : {}),
  };
  return new Element(init);
}

/** Build a brand-new scalar {@link Element} for an inserted de-identification tag. */
function insertedScalar(tag: Tag, vr: VR, value: Buffer, littleEndian: boolean): Element {
  return new Element({
    tag,
    vr,
    vm: 1,
    length: value.length,
    rawBytes: value,
    byteOffset: 0,
    littleEndian,
  });
}

function le16(buf: Buffer, n: number, off: number, littleEndian: boolean): void {
  if (littleEndian) buf.writeUInt16LE(n, off);
  else buf.writeUInt16BE(n, off);
}

function le32(buf: Buffer, n: number, off: number, littleEndian: boolean): void {
  if (littleEndian) buf.writeUInt32LE(n, off);
  else buf.writeUInt32BE(n, off);
}

/** Encode one item's body (its elements, less retired group lengths) under `encoding`. */
function encodeItemBody(item: Item, encoding: BodyEncoding): Buffer {
  const parts: Buffer[] = [];
  for (const el of item.elements()) {
    if (splitTag(el.tag).element === 0x0000) continue;
    parts.push(encodeDatasetElement(el, encoding));
  }
  return Buffer.concat(parts);
}

/** Encode a sequence's value as defined-length items (FFFE,E000 + length + body). */
function encodeSequenceValue(items: readonly Item[], encoding: BodyEncoding): Buffer {
  const littleEndian = encoding !== "explicitBE";
  const parts: Buffer[] = [];
  for (const item of items) {
    const body = encodeItemBody(item, encoding);
    const header = Buffer.alloc(8);
    le16(header, 0xfffe, 0, littleEndian);
    le16(header, 0xe000, 2, littleEndian);
    le32(header, body.length, 4, littleEndian);
    parts.push(header, body);
  }
  return Buffer.concat(parts);
}

/**
 * Rebuild an `SQ` {@link Element} from cleaned `items`, re-encoding `rawBytes` to
 * the representation the Phase 5 writer expects: value-only for Implicit VR LE
 * (defined length), full on-wire span for Explicit VR. Always defined length.
 */
function rebuildSequence(orig: Element, items: readonly Item[], encoding: BodyEncoding): Element {
  const value = encodeSequenceValue(items, encoding);
  let rawBytes: Buffer;
  if (encoding === "implicit") {
    rawBytes = value;
  } else {
    const littleEndian = encoding === "explicitLE";
    const { group, element } = splitTag(orig.tag);
    const header = Buffer.alloc(12);
    le16(header, group, 0, littleEndian);
    le16(header, element, 2, littleEndian);
    header.write("SQ", 4, "ascii");
    le32(header, value.length, 8, littleEndian);
    rawBytes = Buffer.concat([header, value]);
  }
  const init: ElementInit = {
    tag: orig.tag,
    vr: "SQ",
    vm: items.length,
    length: value.length,
    rawBytes,
    byteOffset: orig.byteOffset,
    littleEndian: encoding !== "explicitBE",
    items,
    ...(orig.privateCreator !== undefined ? { privateCreator: orig.privateCreator } : {}),
    ...(orig.specificCharacterSet !== undefined
      ? { specificCharacterSet: orig.specificCharacterSet }
      : {}),
  };
  return new Element(init);
}

/** Decode a private-creator element's value (an `LO` vendor schema id — not PHI). */
function decodeCreator(el: Element): string {
  return el.rawBytes
    .toString("latin1")
    .replace(/[\0 ]+$/, "")
    .trim();
}

/** True when the (private) tag is a Private Creator data element `(gggg,00EE)`. */
function isPrivateCreatorElement(tag: Tag): boolean {
  const { element } = splitTag(tag);
  return element >= 0x0010 && element <= 0x00ff;
}

interface ProcessResult {
  readonly elements: Map<Tag, Element>;
  readonly attributes: DeidentifiedAttribute[];
  readonly removedPrivateTags: Tag[];
}

/** Decide whether to keep a private element under `RetainSafePrivate` + a profile. */
function keepsPrivate(el: Element, ctx: DeidentifyContext): boolean {
  if (!ctx.active.has("RetainSafePrivate") || ctx.profile === undefined) return false;
  if (isPrivateCreatorElement(el.tag)) {
    return ctx.profile.privateDictionary.has(decodeCreator(el));
  }
  const creator = el.privateCreator;
  if (creator === undefined) return false;
  return resolvePrivateTag(ctx.profile, el.tag, creator) !== undefined;
}

/**
 * De-identify one ordered run of elements (a dataset body or a sequence item),
 * returning the rebuilt element map plus the audit accumulated at this depth.
 */
function processElements(
  source: readonly Element[],
  ctx: DeidentifyContext,
  contextPath: readonly string[],
): ProcessResult {
  const out: ProcessResult = {
    elements: new Map<Tag, Element>(),
    attributes: [],
    removedPrivateTags: [],
  };

  for (const el of source) {
    if (isPrivateTag(el.tag)) {
      if (keepsPrivate(el, ctx)) out.elements.set(el.tag, el);
      else out.removedPrivateTags.push(el.tag);
      continue;
    }

    const action = annexE(el.tag);
    if (action === undefined) {
      // Not in Table E.1-1: unaffected (keep). Still recurse into sequences so
      // nested attributes that *are* listed get de-identified.
      if (el.vr === "SQ" && el.items !== undefined) {
        out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out));
      } else {
        out.elements.set(el.tag, el);
      }
      continue;
    }

    const resolved = resolveAction(effectiveCode(action, ctx.active));

    if (el.vr === "SQ") {
      applySequenceAction(el, resolved, action, ctx, contextPath, out);
      continue;
    }

    let applied: AppliedAction;
    switch (resolved) {
      case "K":
        out.elements.set(el.tag, el);
        applied = "kept";
        break;
      case "X":
        applied = "removed";
        break;
      case "Z":
        out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));
        applied = "emptied";
        break;
      case "C":
        out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));
        applied = "cleaned";
        break;
      case "D": {
        const dummy = dummyBytes(el.vr);
        if (dummy !== null) {
          out.elements.set(el.tag, freshScalar(el, dummy, 1));
          applied = "dummied";
        } else {
          out.elements.set(el.tag, freshScalar(el, Buffer.alloc(0), 0));
          applied = "emptied";
        }
        break;
      }
      case "U": {
        const remapped = remapUidBytes(el.rawBytes, ctx.remap.map);
        out.elements.set(el.tag, freshScalar(el, remapped, uidValueMultiplicity(remapped)));
        applied = "uid-remapped";
        break;
      }
    }

    out.attributes.push(auditAttribute(el.tag, action.keyword, resolved, applied, contextPath));
  }

  return out;
}

/** Recurse into a sequence's items and rebuild it, merging nested audit upward. */
function descendSequence(
  el: Element,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
): Element {
  const newItems: Item[] = [];
  (el.items ?? []).forEach((item, index) => {
    const childPath = [...contextPath, `${el.tag}[${String(index)}]`];
    const inner = processElements(item.elements(), ctx, childPath);
    out.attributes.push(...inner.attributes);
    out.removedPrivateTags.push(...inner.removedPrivateTags);
    newItems.push(new Item({ index, warnings: [], elements: inner.elements }));
  });
  return rebuildSequence(el, newItems, ctx.encoding);
}

/** Apply a resolved action to an `SQ` element (X remove · Z/D empty · else recurse). */
function applySequenceAction(
  el: Element,
  resolved: ReturnType<typeof resolveAction>,
  action: AnnexEAction,
  ctx: DeidentifyContext,
  contextPath: readonly string[],
  out: ProcessResult,
): void {
  let applied: AppliedAction;
  switch (resolved) {
    case "X":
      applied = "removed";
      break;
    case "Z":
    case "D":
      out.elements.set(el.tag, rebuildSequence(el, [], ctx.encoding));
      applied = "emptied";
      break;
    case "C":
      out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out));
      applied = "cleaned";
      break;
    case "U":
    case "K":
      out.elements.set(el.tag, descendSequence(el, ctx, contextPath, out));
      applied = "kept";
      break;
  }
  out.attributes.push(auditAttribute(el.tag, action.keyword, resolved, applied, contextPath));
}

function auditAttribute(
  tag: Tag,
  keyword: string,
  action: DeidentifiedAttribute["action"],
  applied: AppliedAction,
  contextPath: readonly string[],
): DeidentifiedAttribute {
  const base = { tag, keyword, action, applied };
  return contextPath.length > 0 ? { ...base, contextPath: [...contextPath] } : base;
}

/** Rebuild File Meta, remapping the SOP Instance UID unless `RetainUIDs`. */
function rebuildFileMeta(
  fileMeta: FileMeta | undefined,
  ctx: DeidentifyContext,
): FileMeta | undefined {
  if (fileMeta === undefined) return undefined;
  if (ctx.active.has("RetainUIDs") || fileMeta.mediaStorageSOPInstanceUID === undefined)
    return fileMeta;
  return {
    ...fileMeta,
    mediaStorageSOPInstanceUID: ctx.remap.map(fileMeta.mediaStorageSOPInstanceUID),
  };
}

function defaultMethod(active: ReadonlySet<DeidentifyOption>): string {
  const base = "Cosyte @cosyte/dicom: PS3.15 Basic Application Level Confidentiality Profile";
  return active.size === 0 ? base : `${base} + ${[...active].join(", ")}`;
}

/** True when Pixel Data is present and not affirmatively marked free of burned-in text. */
function hasUncleanedBurnedIn(ds: Dataset): boolean {
  if (!ds.has(TAG_PIXEL_DATA)) return false;
  const flag = ds.get(TAG_BURNED_IN_ANNOTATION);
  if (flag === undefined) return true;
  return (
    flag.rawBytes
      .toString("latin1")
      .replace(/[\0 ]+$/, "")
      .trim()
      .toUpperCase() !== "NO"
  );
}

/**
 * De-identify a {@link Dataset} per PS3.15 Annex E — the Basic Application Level
 * Confidentiality Profile, plus any Retain/Clean Options passed in `retain`.
 *
 * Pure: `ds` is never mutated. Returns a fresh dataset and a value-free
 * {@link DeidentifyReport} (tags, keywords, action codes, the UID map, warnings).
 *
 * @throws {@link DeidentifyError} (`INVALID_OPTIONS`) for an unknown Retain option
 *   or a malformed `uidRoot`.
 *
 * @example
 * ```ts
 * import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";
 * const { dataset, report } = deidentify(parseDicom(buf));
 * const clean = serializeDicom(dataset); // safe to share
 * console.log(report.attributes.length, "attributes acted on");
 * ```
 */
export function deidentify(
  ds: Dataset,
  options: DeidentifyOptions = {},
): DeidentifyResult<Dataset> {
  const active = validateRetain(options.retain);
  const remap = makeUidRemapper(options.uidRoot, options.uidMap);
  const tsUid = ds.fileMeta?.transferSyntaxUID ?? "";
  const encoding = BODY_ENCODING[tsUid] ?? "explicitLE";
  const littleEndian = encoding !== "explicitBE";
  const ctx: DeidentifyContext = {
    active,
    remap,
    profile: options.profile,
    encoding,
    littleEndian,
  };

  const { elements, attributes, removedPrivateTags } = processElements(ds.elements(), ctx, []);

  // Required de-identification metadata (PS3.15 §E.1.1), inserted last.
  elements.set(
    TAG_PATIENT_IDENTITY_REMOVED,
    insertedScalar(TAG_PATIENT_IDENTITY_REMOVED, "CS", Buffer.from("YES", "latin1"), littleEndian),
  );
  const method = options.deidentificationMethod ?? defaultMethod(active);
  elements.set(
    TAG_DEIDENTIFICATION_METHOD,
    insertedScalar(TAG_DEIDENTIFICATION_METHOD, "LO", Buffer.from(method, "latin1"), littleEndian),
  );

  const warnings: DicomParseWarning[] = [];
  if (hasUncleanedBurnedIn(ds)) {
    const offset = ds.get(TAG_PIXEL_DATA)?.byteOffset ?? 0;
    warnings.push(burnedInAnnotationNotRemoved({ byteOffset: offset, fileMeta: false }));
  }

  const newFileMeta = rebuildFileMeta(ds.fileMeta, ctx);
  const datasetInit: DatasetInit = {
    warnings: ds.warnings,
    elements,
    ...(newFileMeta !== undefined ? { fileMeta: newFileMeta } : {}),
  };
  const dataset = new Dataset(datasetInit);

  const report: DeidentifyReport = {
    attributes,
    removedPrivateTags,
    uidMap: remap.cache,
    warnings,
    retained: [...active],
  };

  return { dataset, report };
}
