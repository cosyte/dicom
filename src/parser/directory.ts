/**
 * Parse-time half of the DICOMDIR record model: turn the findings of
 * {@link analyzeDirectory} into Tier-2 warnings, once per parse, through the
 * one `emit` chokepoint (so `{ strict: true }` escalates them and `onWarning`
 * sees them).
 *
 * Each warning is built from the registry by code alone. No offset value, no
 * record key and no record index reaches a message: the position names where
 * the attribute sits, the `contextPath` names which attribute of which record,
 * and both are structure this parser counted.
 *
 * @module
 */

import {
  analyzeDirectory,
  DIRECTORY_TAGS,
  isDeflated,
  type DirectoryFinding,
  type DirectorySource,
} from "../dataset/directory.js";
import type { DicomPosition } from "./types.js";
import {
  directoryOffsetDeflated,
  directoryOffsetMalformed,
  directoryOffsetUnresolved,
  directoryRecordRevisited,
  type DicomParseWarning,
} from "./warnings.js";

/**
 * Where the root Data Set sits: `origin` is the file offset of the input's byte
 * 0 (0 with a preamble, 132 without one), and `fileMetaEnd` is where the Data
 * Set begins in the input, which under Deflated is the start of the deflated
 * stream.
 *
 * @internal
 */
export interface DirectoryFrame {
  readonly origin: number;
  readonly fileMetaEnd: number;
}

/**
 * Resolve a DICOMDIR's offsets and emit one warning per finding. A Dataset that
 * is not a DICOMDIR emits nothing and costs one File Meta comparison.
 *
 * Positions are in the `"input"` frame, the frame `makeEmitter` cuts a
 * `{ strict: true }` snippet from at this point of the parse: a root attribute
 * at its own element header, a record's attribute at that record's Item tag,
 * and, under Deflated, where the deflated stream begins, since no byte inside it
 * has a position in the input.
 *
 * @internal
 */
export function emitDirectoryFindings(
  source: DirectorySource,
  frame: DirectoryFrame,
  emit: (w: DicomParseWarning) => void,
): void {
  const analysis = analyzeDirectory(source);
  if (analysis === undefined) return;
  const deflated = isDeflated(source.fileMeta);

  const positionOf = (finding: DirectoryFinding): DicomPosition => {
    if (deflated) return { byteOffset: frame.fileMetaEnd };
    if (finding.item === undefined) return { byteOffset: finding.element.byteOffset };
    // Outside Deflated every Item of the root Data Set has a file offset; the
    // origin is the fallback only so the type narrows.
    const byteOffset = (finding.item.fileOffset ?? frame.origin) - frame.origin;
    const contextPath = [
      DIRECTORY_TAGS.RECORD_SEQUENCE,
      String(finding.item.index),
      finding.element.tag,
    ];
    return { byteOffset, contextPath };
  };

  for (const finding of analysis.findings) {
    const position = positionOf(finding);
    switch (finding.kind) {
      case "unresolved":
        emit(directoryOffsetUnresolved(position));
        break;
      case "malformed":
        emit(directoryOffsetMalformed(position));
        break;
      case "revisited":
        emit(directoryRecordRevisited(position));
        break;
      case "deflated":
        emit(directoryOffsetDeflated(position));
        break;
    }
  }
}
