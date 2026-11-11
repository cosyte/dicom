/**
 * File Meta Information group parser - hard-wired Explicit VR LE.
 *
 * Four rules govern it:
 *
 *   - Always Explicit VR LE; it does NOT consult the dispatch table.
 *   - `(0002,0000)` group-length missing / present-but-wrong handling
 *     emits `DICOM_FILE_META_GROUP_LENGTH_{MISSING,MISMATCH}`.
 *   - `(0002,0010)` Transfer Syntax UID is the ONLY parser-blocking
 *     element; missing throws `INVALID_FILE_META` regardless of strict mode.
 *     All other File Meta Type-1 elements are projected when present, NOT
 *     enforced (`validate()` is what enforces them).
 *   - Truncated File Meta (declared length > remaining buffer)
 *     throws `INVALID_FILE_META` rather than over-reading.
 *
 * A repeated `(0002,xxxx)` tag is lossy here without being an overwrite. The
 * eight tags in `MODELED_FM_TAGS` are answered by a first-match search and are
 * excluded from `extraElements`, so a second copy of one is in neither - it left
 * the object. Step 3.5 emits `DICOM_DUPLICATE_FILE_META_ELEMENT` for each such
 * copy at the moment the projection drops it; the reading does not move.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { FileMeta, FileMetaRawElement } from "../dataset/file-meta.js";
import type { Tag, VR } from "../dictionary/types.js";
import { ByteCursor, uint32At } from "./byte-cursor.js";
import { LONG_FORM_VRS } from "./element-header.js";
import { isRecognizedVr } from "./endian.js";
import {
  fileMetaGroupLengthOverruns,
  fileMetaTransferSyntaxMissing,
  fileMetaTruncated,
} from "./fatals.js";
import type { ParseContext } from "./types.js";
import { tagOf, vrAt } from "./wire-tokens.js";
import type { DicomParseWarning } from "./warnings.js";
import {
  duplicateFileMetaElement,
  fileMetaGroupLengthMismatch,
  fileMetaGroupLengthMissing,
} from "./warnings.js";

/**
 * The `(0002,xxxx)` tags projected into typed {@link FileMeta} fields, plus the
 * group-length `(0002,0000)` (recomputed on write). Every other File Meta tag is
 * preserved as a {@link FileMetaRawElement} for byte-exact round-trip.
 */
const MODELED_FM_TAGS: ReadonlySet<Tag> = new Set<Tag>([
  "00020000",
  "00020001",
  "00020002",
  "00020003",
  "00020010",
  "00020012",
  "00020013",
  "00020016",
]);

interface FmRawElement {
  readonly tag: Tag;
  readonly vr: VR;
  /** The buffer the value is a range of, and the range: no view is made until one is needed. */
  readonly buffer: Buffer;
  readonly start: number;
  readonly end: number;
  /** Total bytes consumed by this element on the wire (header + value). */
  readonly bytesConsumed: number;
  /**
   * File-absolute offset of this element's own header start. Unambiguous here:
   * the File Meta group is never nested, so unlike `Element.byteOffset` there is
   * no item slice that could make it relative.
   */
  readonly byteOffset: number;
}

/** Result of {@link parseFileMeta}. */
export interface FileMetaResult {
  readonly fileMeta: FileMeta;
  /** Offset where the dataset (post-File-Meta) begins. */
  readonly fileMetaEnd: number;
}

/**
 * Parse the Part 10 File Meta Information group starting at `datasetStart`.
 *
 * Always Explicit VR LE. Returns a typed `FileMeta`
 * projection plus the offset where the post-FM dataset begins.
 *
 * @internal
 */
export function parseFileMeta(
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
): FileMetaResult {
  const cursor = new ByteCursor(buffer, true, datasetStart);
  const fmStart = cursor.position;

  // Step 1: Try to read the first element. Truncated input → INVALID_FILE_META.
  let firstElement: FmRawElement;
  try {
    firstElement = readExplicitLeElement(cursor);
  } catch (err) {
    /* v8 ignore else -- unreachable: `readExplicitLeElement` throws only RangeError. */
    if (err instanceof RangeError) {
      throw fileMetaTruncated(ctx.frame, fmStart);
    }
    /* v8 ignore next -- unreachable: `readExplicitLeElement` throws only RangeError. */
    throw err;
  }

  let declaredFmLength: number | undefined;
  let consumedAfterGroupLength = 0;
  const fmElements: FmRawElement[] = [];

  if (
    firstElement.tag === "00020000" &&
    firstElement.vr === "UL" &&
    firstElement.end - firstElement.start === 4
  ) {
    declaredFmLength = uint32At(buffer, firstElement.start, true);
    // Truncation guard: declared length must fit in the remaining buffer.
    if (cursor.position + declaredFmLength > buffer.length) {
      // NEITHER length is passed. The declared one is four document bytes; the
      // remaining count was `buffer.length - cursor.position`, which the factory
      // no longer accepts - see `fileMetaGroupLengthOverruns` for why the bound
      // is its signature and not this call site's frame.
      throw fileMetaGroupLengthOverruns(ctx.frame, fmStart);
    }
  } else {
    // (0002,0000) absent - emit warning and treat the first element as the start of the FM body.
    emit(fileMetaGroupLengthMissing({ byteOffset: fmStart, fileMeta: true }));
    fmElements.push(firstElement);
    consumedAfterGroupLength = firstElement.bytesConsumed;
  }

  // Step 2: Read remaining File Meta elements.
  while (cursor.remaining() > 0) {
    if (declaredFmLength !== undefined && consumedAfterGroupLength >= declaredFmLength) break;
    if (cursor.position + 2 > buffer.length) break;
    const peekGroup = cursor.readUInt16At(cursor.position);
    if (peekGroup !== 0x0002) break;
    let next: FmRawElement;
    try {
      next = readExplicitLeElement(cursor);
    } catch (err) {
      /* v8 ignore else -- unreachable: `readExplicitLeElement` throws only RangeError. */
      if (err instanceof RangeError) {
        throw fileMetaTruncated(ctx.frame, fmStart);
      }
      /* v8 ignore next -- unreachable: `readExplicitLeElement` throws only RangeError. */
      throw err;
    }
    fmElements.push(next);
    consumedAfterGroupLength += next.bytesConsumed;
  }

  // Step 3: Validate declared vs actual.
  if (declaredFmLength !== undefined && consumedAfterGroupLength !== declaredFmLength) {
    emit(
      fileMetaGroupLengthMismatch(
        { byteOffset: fmStart, fileMeta: true },
        declaredFmLength,
        consumedAfterGroupLength,
      ),
    );
    // Trust actual: keep parsing forward through any remaining (0002,xxxx)
    // elements until we hit the first non-FM group.
    while (cursor.remaining() > 0) {
      if (cursor.position + 2 > buffer.length) break;
      const peekGroup = cursor.readUInt16At(cursor.position);
      if (peekGroup !== 0x0002) break;
      let next: FmRawElement;
      try {
        next = readExplicitLeElement(cursor);
      } catch (err) {
        /* v8 ignore else -- unreachable: `readExplicitLeElement` throws only RangeError. */
        if (err instanceof RangeError) {
          throw fileMetaTruncated(ctx.frame, fmStart);
        }
        /* v8 ignore next -- unreachable: `readExplicitLeElement` throws only RangeError. */
        throw err;
      }
      fmElements.push(next);
    }
  }

  // Step 3.5: disclose every copy the projection below is about to drop.
  //
  // The group is an array, so nothing is overwritten - but a MODELED tag is
  // answered by a first-match search and is then EXCLUDED from `extraElements`,
  // so a second copy of one is in neither the typed fields nor the verbatim
  // residue. It simply left the object. `(0002,0010)` makes that the more
  // dangerous half of that shape: it is the element that decides how every
  // byte after this group is read.
  //
  // Nothing about the reading moves. The first copy still wins, no value is
  // guessed for the one that lost, and no residue is invented for it: adding one
  // would make the conservative serializer re-emit a group it should not write.
  // A repeated NON-modeled tag is not reported, because every copy of one is
  // kept verbatim in `extraElements` and nothing is dropped.
  //
  // `(0002,0000)` is seeded as already-seen when it was consumed as the group
  // length above, because a second group length is dropped by exactly the same
  // route and never reaches `fmElements` twice.
  const seenModeledTags = new Set<Tag>();
  if (declaredFmLength !== undefined) seenModeledTags.add("00020000");
  for (const e of fmElements) {
    if (!MODELED_FM_TAGS.has(e.tag)) continue;
    if (seenModeledTags.has(e.tag)) {
      emit(duplicateFileMetaElement({ byteOffset: e.byteOffset, fileMeta: true }));
      continue;
    }
    seenModeledTags.add(e.tag);
  }

  // Step 4: Project File Meta elements into the FileMeta interface.
  const tsElement = fmElements.find((e) => e.tag === "00020010");
  if (tsElement === undefined || tsElement.vr !== "UI") {
    throw fileMetaTransferSyntaxMissing(ctx.frame, fmStart);
  }

  // Any (0002,xxxx) element not projected into a typed field above is preserved
  // verbatim so the serializer can re-emit the group byte-for-byte (LOSSLESS
  // File Meta round-trip). The group-length (00020000) is recomputed on write,
  // so it is never carried here.
  const extraElements: FileMetaRawElement[] = fmElements
    .filter((e) => !MODELED_FM_TAGS.has(e.tag))
    .map((e) => Object.freeze({ tag: e.tag, vr: e.vr, value: Buffer.from(valueOf(e)) }));

  const fileMeta = projectFileMeta(fmElements, trimUI(tsElement), extraElements);
  return { fileMeta, fileMetaEnd: cursor.position };
}

/**
 * The File Meta object: the Transfer Syntax UID, then each modeled field the group carries, read
 * from its first element with that tag, then the elements kept verbatim. A field the group lacks
 * is left out rather than set to `undefined`, and the keys come in this order every time.
 */
function projectFileMeta(
  els: readonly FmRawElement[],
  transferSyntaxUID: string,
  extraElements: FileMetaRawElement[],
): FileMeta {
  const fileMeta: { -readonly [K in keyof FileMeta]: FileMeta[K] } = { transferSyntaxUID };
  const sopClass = firstWithTag(els, "00020002");
  if (sopClass !== undefined) fileMeta.mediaStorageSOPClassUID = trimUI(sopClass);
  const sopInstance = firstWithTag(els, "00020003");
  if (sopInstance !== undefined) fileMeta.mediaStorageSOPInstanceUID = trimUI(sopInstance);
  const version = firstWithTag(els, "00020001");
  if (version !== undefined) fileMeta.fileMetaInformationVersion = valueOf(version);
  const implementation = firstWithTag(els, "00020012");
  if (implementation !== undefined) fileMeta.implementationClassUID = trimUI(implementation);
  const versionName = firstWithTag(els, "00020013");
  if (versionName !== undefined) fileMeta.implementationVersionName = trimText(versionName);
  const source = firstWithTag(els, "00020016");
  if (source !== undefined) fileMeta.sourceApplicationEntityTitle = trimText(source);
  if (extraElements.length > 0) fileMeta.extraElements = Object.freeze(extraElements);
  return fileMeta;
}

/** The first element with `tag`, as `Array.prototype.find` gives it. */
function firstWithTag(els: readonly FmRawElement[], tag: Tag): FmRawElement | undefined {
  for (const e of els) if (e.tag === tag) return e;
  return undefined;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readExplicitLeElement(cursor: ByteCursor): FmRawElement {
  const headerStart = cursor.position;
  const group = cursor.readUInt16();
  const element = cursor.readUInt16();
  // The same eight upper-case hex digits `joinTag` builds, and the VR as an ASCII decode of its
  // two bytes gives it; each throws a RangeError past the end, as a short read does.
  const tag: Tag = tagOf(group, element);
  const vr = vrAt(cursor.buffer, cursor.position);
  cursor.position += 2;
  let length: number;
  let headerLength: number;
  // A VR outside the 34 PS3.5 2026c defines is long-form too, per section 6.2's
  // "shall" - the File Meta group is Explicit VR LE (PS3.10 section 7.1), so the
  // same structure rule governs it. See `readExplicitElementHeader`.
  if (LONG_FORM_VRS.has(vr) || !isRecognizedVr(vr)) {
    // 2 reserved bytes - File Meta tolerates non-zero here; long-form check lives in dataset parsers.
    if (cursor.position + 2 > cursor.buffer.length) {
      throw new RangeError("ByteCursor: read past end of buffer");
    }
    cursor.position += 2;
    length = cursor.readUInt32();
    headerLength = 12;
  } else {
    length = cursor.readUInt16();
    headerLength = 8;
  }
  if (cursor.position + length > cursor.buffer.length) {
    throw new RangeError("File Meta element value extends past buffer end");
  }
  const start = cursor.position;
  cursor.position += length;
  const bytesConsumed = cursor.position - headerStart;
  // Sanity invariant - bytesConsumed must equal headerLength + length.
  /* v8 ignore next 3 -- unreachable: every read above advanced the cursor by exactly its width. */
  if (bytesConsumed !== headerLength + length) {
    throw new RangeError("File Meta element accounting mismatch");
  }
  return {
    tag,
    vr,
    buffer: cursor.buffer,
    start,
    end: start + length,
    bytesConsumed,
    byteOffset: headerStart,
  };
}

/** An element's value bytes, as a view. */
function valueOf(e: FmRawElement): Buffer {
  return e.buffer.subarray(e.start, e.end);
}

/** Trim trailing NUL (0x00) and SPACE (0x20) bytes per UI VR semantics. */
function trimUI(e: FmRawElement): string {
  const buf = e.buffer;
  let end = e.end;
  while (end > e.start) {
    const last = buf[end - 1];
    if (last === 0x00 || last === 0x20) {
      end--;
    } else {
      break;
    }
  }
  return buf.toString("ascii", e.start, end);
}

/** Trim only trailing SPACE (0x20) bytes per text-VR semantics (SH, AE, etc.). */
function trimText(e: FmRawElement): string {
  const buf = e.buffer;
  let end = e.end;
  while (end > e.start && buf[end - 1] === 0x20) {
    end--;
  }
  return buf.toString("ascii", e.start, end);
}

/**
 * A File Meta object with every field, kept for the life of the process so V8 keeps the hidden
 * classes each File Meta is built through: see `ELEMENT_SHAPES` in `../dataset/element.ts`.
 */
export const FILE_META_SHAPES: readonly FileMeta[] = (() => {
  const value = Buffer.alloc(0);
  const els = ["00020002", "00020003", "00020001", "00020012", "00020013", "00020016"].map(
    (tag): FmRawElement => ({
      tag,
      vr: "UI",
      buffer: value,
      start: 0,
      end: 0,
      bytesConsumed: 0,
      byteOffset: 0,
    }),
  );
  return [projectFileMeta(els, "", [{ tag: "00020100", vr: "UN", value }])];
})();
