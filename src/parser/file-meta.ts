/**
 * File Meta Information group parser — hard-wired Explicit VR LE.
 *
 * Phase 2 core-parser context:
 *
 *   - D-17 — Always Explicit VR LE; does NOT consult the dispatch table.
 *   - D-18 — `(0002,0000)` group-length missing / present-but-wrong handling
 *     emits `DICOM_FILE_META_GROUP_LENGTH_{MISSING,MISMATCH}`.
 *   - D-19 — `(0002,0010)` Transfer Syntax UID is the ONLY parser-blocking
 *     element; missing throws `INVALID_FILE_META` regardless of strict mode.
 *     All other FM Type-1 elements are projected when present, NOT enforced
 *     (Phase 7's `validate()` enforces them).
 *   - T-02-02-01 — Truncated File Meta (declared length > remaining buffer)
 *     throws `INVALID_FILE_META` rather than over-reading.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { FileMeta, FileMetaRawElement } from "../dataset/file-meta.js";
import type { Tag, VR } from "../dictionary/types.js";
import { ByteCursor } from "./byte-cursor.js";
import { LONG_FORM_VRS } from "./element-header.js";
import { buildSnippet, DicomParseError, FATAL_CODES } from "./errors.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";
import { fileMetaGroupLengthMismatch, fileMetaGroupLengthMissing } from "./warnings.js";

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
  readonly value: Buffer;
  /** Total bytes consumed by this element on the wire (header + value). */
  readonly bytesConsumed: number;
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
 * Always Explicit VR LE per FM-01 / D-17. Returns a typed `FileMeta`
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
    if (err instanceof RangeError) {
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        "File Meta is truncated.",
        fmStart,
        buildSnippet(buffer, fmStart),
      );
    }
    throw err;
  }

  let declaredFmLength: number | undefined;
  let consumedAfterGroupLength = 0;
  const fmElements: FmRawElement[] = [];

  if (
    firstElement.tag === "00020000" &&
    firstElement.vr === "UL" &&
    firstElement.value.length === 4
  ) {
    declaredFmLength = firstElement.value.readUInt32LE(0);
    // T-02-02-01: declared length must fit in the remaining buffer.
    if (cursor.position + declaredFmLength > buffer.length) {
      throw new DicomParseError(
        FATAL_CODES.INVALID_FILE_META,
        `File Meta group length declares ${String(declaredFmLength)} bytes but only ${String(buffer.length - cursor.position)} bytes remain.`,
        fmStart,
        buildSnippet(buffer, fmStart),
      );
    }
  } else {
    // (0002,0000) absent — emit warning and treat the first element as the start of the FM body.
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
      if (err instanceof RangeError) {
        throw new DicomParseError(
          FATAL_CODES.INVALID_FILE_META,
          "File Meta is truncated.",
          fmStart,
          buildSnippet(buffer, fmStart),
        );
      }
      throw err;
    }
    fmElements.push(next);
    consumedAfterGroupLength += next.bytesConsumed;
  }

  // Step 3: Validate declared vs actual (D-18).
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
        if (err instanceof RangeError) {
          throw new DicomParseError(
            FATAL_CODES.INVALID_FILE_META,
            "File Meta is truncated.",
            fmStart,
            buildSnippet(buffer, fmStart),
          );
        }
        throw err;
      }
      fmElements.push(next);
    }
  }

  // Step 4: Project File Meta elements into the FileMeta interface.
  const tsElement = fmElements.find((e) => e.tag === "00020010");
  if (tsElement === undefined || tsElement.vr !== "UI") {
    throw new DicomParseError(
      FATAL_CODES.INVALID_FILE_META,
      "Required File Meta element (0002,0010) Transfer Syntax UID is missing or not UI.",
      fmStart,
      buildSnippet(buffer, fmStart),
    );
  }

  // Any (0002,xxxx) element not projected into a typed field above is preserved
  // verbatim so the serializer can re-emit the group byte-for-byte (LOSSLESS
  // File Meta round-trip). The group-length (00020000) is recomputed on write,
  // so it is never carried here.
  const extraElements: FileMetaRawElement[] = fmElements
    .filter((e) => !MODELED_FM_TAGS.has(e.tag))
    .map((e) => Object.freeze({ tag: e.tag, vr: e.vr, value: Buffer.from(e.value) }));

  const fileMeta: FileMeta = {
    transferSyntaxUID: trimUI(tsElement.value),
    ...projectUI(fmElements, "00020002", "mediaStorageSOPClassUID"),
    ...projectUI(fmElements, "00020003", "mediaStorageSOPInstanceUID"),
    ...projectRaw(fmElements, "00020001", "fileMetaInformationVersion"),
    ...projectUI(fmElements, "00020012", "implementationClassUID"),
    ...projectText(fmElements, "00020013", "implementationVersionName"),
    ...projectText(fmElements, "00020016", "sourceApplicationEntityTitle"),
    ...(extraElements.length > 0 ? { extraElements: Object.freeze(extraElements) } : {}),
  };

  return { fileMeta, fileMetaEnd: cursor.position };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readExplicitLeElement(cursor: ByteCursor): FmRawElement {
  const headerStart = cursor.position;
  const group = cursor.readUInt16();
  const element = cursor.readUInt16();
  const tag: Tag = (
    group.toString(16).padStart(4, "0") + element.toString(16).padStart(4, "0")
  ).toUpperCase();
  const vr = cursor.slice(2).toString("ascii") as VR;
  let length: number;
  let headerLength: number;
  if (LONG_FORM_VRS.has(vr)) {
    cursor.slice(2); // 2 reserved bytes — File Meta tolerates non-zero here; long-form check lives in dataset parsers.
    length = cursor.readUInt32();
    headerLength = 12;
  } else {
    length = cursor.readUInt16();
    headerLength = 8;
  }
  if (cursor.position + length > cursor.buffer.length) {
    throw new RangeError("File Meta element value extends past buffer end");
  }
  const value = cursor.slice(length);
  const bytesConsumed = cursor.position - headerStart;
  // Sanity invariant — bytesConsumed must equal headerLength + length.
  if (bytesConsumed !== headerLength + length) {
    throw new RangeError("File Meta element accounting mismatch");
  }
  return { tag, vr, value, bytesConsumed };
}

/** Trim trailing NUL (0x00) and SPACE (0x20) bytes per UI VR semantics. */
function trimUI(buf: Buffer): string {
  let end = buf.length;
  while (end > 0) {
    const last = buf[end - 1];
    if (last === 0x00 || last === 0x20) {
      end--;
    } else {
      break;
    }
  }
  return buf.subarray(0, end).toString("ascii");
}

/** Trim only trailing SPACE (0x20) bytes per text-VR semantics (SH, AE, etc.). */
function trimText(buf: Buffer): string {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0x20) {
    end--;
  }
  return buf.subarray(0, end).toString("ascii");
}

type FileMetaPartial = { [K in keyof FileMeta]?: FileMeta[K] };

function projectUI(
  els: readonly FmRawElement[],
  tag: string,
  key: keyof FileMeta,
): FileMetaPartial {
  const e = els.find((x) => x.tag === tag);
  if (e === undefined) return {};
  const out: FileMetaPartial = { [key]: trimUI(e.value) };
  return out;
}

function projectText(
  els: readonly FmRawElement[],
  tag: string,
  key: keyof FileMeta,
): FileMetaPartial {
  const e = els.find((x) => x.tag === tag);
  if (e === undefined) return {};
  const out: FileMetaPartial = { [key]: trimText(e.value) };
  return out;
}

function projectRaw(
  els: readonly FmRawElement[],
  tag: string,
  key: keyof FileMeta,
): FileMetaPartial {
  const e = els.find((x) => x.tag === tag);
  if (e === undefined) return {};
  const out: FileMetaPartial = { [key]: e.value };
  return out;
}
