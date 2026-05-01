/**
 * Transfer Syntax dispatch table — maps TS UIDs to per-strategy parsers.
 *
 * Per `.planning/phases/02-core-parser/02-CONTEXT.md` D-20: a frozen
 * `Readonly<Record<string, ParserStrategy>>` with EXACTLY four entries —
 * the only Transfer Syntax UIDs supported by `@cosyte/dicom` v1.
 *
 * Plan 02-02 (this plan) ships stubs that return empty element maps. Plans
 * 02-03 (Implicit LE), 02-04 (Explicit LE / BE), and 02-05 (Deflated LE)
 * replace the bodies with real parser implementations. The dispatch table
 * itself does not change after 02-02.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";

/** A single transfer-syntax parser strategy. */
export type ParserStrategy = (
  buffer: Buffer,
  datasetStart: number,
  ctx: ParseContext,
  emit: (w: DicomParseWarning) => void,
) => { elements: ReadonlyMap<Tag, Element> };

/**
 * Implicit VR LE strategy — Plan 02-02 stub. Plan 02-03 replaces with the
 * real Implicit VR LE parser per CONTEXT D-21.
 *
 * @internal
 */
export function parseImplicitLE(
  _buffer: Buffer,
  _datasetStart: number,
  _ctx: ParseContext,
  _emit: (w: DicomParseWarning) => void,
): { elements: ReadonlyMap<Tag, Element> } {
  return { elements: new Map() };
}

/**
 * Explicit VR LE strategy — Plan 02-02 stub. Plan 02-04 replaces with the
 * real Explicit VR LE parser.
 *
 * @internal
 */
export function parseExplicitLE(
  _buffer: Buffer,
  _datasetStart: number,
  _ctx: ParseContext,
  _emit: (w: DicomParseWarning) => void,
): { elements: ReadonlyMap<Tag, Element> } {
  return { elements: new Map() };
}

/**
 * Explicit VR BE strategy — Plan 02-02 stub. Plan 02-04 replaces with the
 * real Explicit VR BE parser per CONTEXT D-23 / D-24 / D-25.
 *
 * @internal
 */
export function parseExplicitBE(
  _buffer: Buffer,
  _datasetStart: number,
  _ctx: ParseContext,
  _emit: (w: DicomParseWarning) => void,
): { elements: ReadonlyMap<Tag, Element> } {
  return { elements: new Map() };
}

/**
 * Deflated Explicit VR LE strategy — Plan 02-02 stub. Plan 02-05 replaces
 * with the real `zlib.inflateRawSync` + delegate-to-Explicit-LE pipeline
 * per CONTEXT D-26 / D-27.
 *
 * @internal
 */
export function parseDeflatedLE(
  _buffer: Buffer,
  _datasetStart: number,
  _ctx: ParseContext,
  _emit: (w: DicomParseWarning) => void,
): { elements: ReadonlyMap<Tag, Element> } {
  return { elements: new Map() };
}

/**
 * Frozen dispatch table per CONTEXT.md D-20. Exactly the four v1 Transfer
 * Syntax UIDs are registered. Any other UID → fatal
 * `UNSUPPORTED_TRANSFER_SYNTAX` from `parseDicom`.
 *
 * @example
 * ```ts
 * import { TRANSFER_SYNTAX_PARSERS } from "@cosyte/dicom";
 * const strategy = TRANSFER_SYNTAX_PARSERS["1.2.840.10008.1.2.1"];
 * ```
 *
 * @internal
 */
export const TRANSFER_SYNTAX_PARSERS: Readonly<Record<string, ParserStrategy>> = Object.freeze({
  "1.2.840.10008.1.2": parseImplicitLE,
  "1.2.840.10008.1.2.1": parseExplicitLE,
  "1.2.840.10008.1.2.2": parseExplicitBE,
  "1.2.840.10008.1.2.1.99": parseDeflatedLE,
});
