/**
 * Programmatic Part 10 fixture builder — internal test utility.
 *
 * Per `.planning/phases/02-core-parser/02-CONTEXT.md` D-37 / D-38: this
 * helper lives in `test/helpers/` and is NOT exported from `src/index.ts`.
 * Phase 2 ships zero curated `.dcm` fixture files; everything is built in
 * memory by this helper. Phase 5's serializer eventually subsumes the
 * production version of this code.
 *
 * Phase 2 plan 02-02 implements Implicit VR LE and Explicit VR LE encoders.
 * Plan 02-04 extends `encodeElement` with the Explicit VR BE branch and
 * plan 02-05 extends it with the Deflated Explicit VR LE branch.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { Tag, VR } from "../../src/dictionary/types.js";

const LONG_FORM_VRS = new Set<VR>([
  "OB",
  "OW",
  "OF",
  "OD",
  "OL",
  "SQ",
  "UT",
  "UN",
  "UC",
  "UR",
]);

/** A single dataset element to emit. */
export interface BuildDicomElement {
  /** 8-char uppercase hex tag, e.g. `"00100010"`. */
  readonly tag: Tag;
  /** Value Representation. */
  readonly vr: VR;
  /** Raw value bytes (caller pads to even length when required by the VR). */
  readonly value: Buffer;
}

/** Options for {@link buildDicom}. */
export interface BuildDicomOptions {
  /** Transfer Syntax UID for the dataset elements. */
  readonly transferSyntax: string;
  /** Dataset elements to emit (after File Meta). */
  readonly elements: readonly BuildDicomElement[];
  /** When `true`, omits the 128-byte preamble + DICM magic. */
  readonly skipPreamble?: boolean;
  /**
   * `(0002,0000)` FileMetaInformationGroupLength behaviour:
   *   - `undefined` (default): emit with the actual byte count.
   *   - `"omit"`: omit the element entirely.
   *   - `"wrong"`: emit with an intentionally incorrect byte count.
   *   - `number`: emit with the specified byte count.
   */
  readonly fileMetaGroupLength?: number | "omit" | "wrong";
  /** When `true`, omits the `(0002,0010)` Transfer Syntax UID element. */
  readonly skipTransferSyntaxUID?: boolean;
  /** Optional File Meta extras (FM-02 fields beyond TS UID). */
  readonly mediaStorageSOPClassUID?: string;
  readonly mediaStorageSOPInstanceUID?: string;
  readonly implementationClassUID?: string;
  readonly implementationVersionName?: string;
  /** Trailing junk appended to the buffer after all dataset elements. */
  readonly trailingBytes?: Buffer;
}

/**
 * Build a Part 10 buffer. Internal — do NOT export from `src/index.ts`.
 */
export function buildDicom(opts: BuildDicomOptions): Buffer {
  const parts: Buffer[] = [];

  if (opts.skipPreamble !== true) {
    parts.push(Buffer.alloc(128, 0x00));
    parts.push(Buffer.from("DICM", "ascii"));
  }

  // Build File Meta body (Explicit VR LE — hard-wired per FM-01 / D-17).
  const fileMetaElements: Buffer[] = [];
  if (opts.skipTransferSyntaxUID !== true) {
    fileMetaElements.push(buildExplicitLeElement("00020010", "UI", padUI(opts.transferSyntax)));
  }
  if (opts.mediaStorageSOPClassUID !== undefined) {
    fileMetaElements.push(
      buildExplicitLeElement("00020002", "UI", padUI(opts.mediaStorageSOPClassUID)),
    );
  }
  if (opts.mediaStorageSOPInstanceUID !== undefined) {
    fileMetaElements.push(
      buildExplicitLeElement("00020003", "UI", padUI(opts.mediaStorageSOPInstanceUID)),
    );
  }
  if (opts.implementationClassUID !== undefined) {
    fileMetaElements.push(
      buildExplicitLeElement("00020012", "UI", padUI(opts.implementationClassUID)),
    );
  }
  if (opts.implementationVersionName !== undefined) {
    fileMetaElements.push(
      buildExplicitLeElement("00020013", "SH", padText(opts.implementationVersionName)),
    );
  }
  const fileMetaBody = Buffer.concat(fileMetaElements);

  if (opts.fileMetaGroupLength !== "omit") {
    let declared: number;
    if (opts.fileMetaGroupLength === "wrong") {
      declared = fileMetaBody.length + 99;
    } else if (typeof opts.fileMetaGroupLength === "number") {
      declared = opts.fileMetaGroupLength;
    } else {
      declared = fileMetaBody.length;
    }
    const lengthValue = Buffer.alloc(4);
    lengthValue.writeUInt32LE(declared, 0);
    parts.push(buildExplicitLeElement("00020000", "UL", lengthValue));
  }
  parts.push(fileMetaBody);

  // Dataset elements per the requested transfer syntax.
  for (const el of opts.elements) {
    parts.push(encodeElement(el, opts.transferSyntax));
  }

  if (opts.trailingBytes !== undefined) {
    parts.push(opts.trailingBytes);
  }

  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Encoders
// ---------------------------------------------------------------------------

function buildExplicitLeElement(tag: Tag, vr: VR, value: Buffer): Buffer {
  const { group, element } = splitTag(tag);
  const groupBuf = Buffer.alloc(2);
  groupBuf.writeUInt16LE(group, 0);
  const elementBuf = Buffer.alloc(2);
  elementBuf.writeUInt16LE(element, 0);
  const vrBuf = Buffer.from(vr, "ascii");
  if (LONG_FORM_VRS.has(vr)) {
    const reserved = Buffer.from([0x00, 0x00]);
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(value.length, 0);
    return Buffer.concat([groupBuf, elementBuf, vrBuf, reserved, lengthBuf, value]);
  }
  const lengthBuf = Buffer.alloc(2);
  lengthBuf.writeUInt16LE(value.length, 0);
  return Buffer.concat([groupBuf, elementBuf, vrBuf, lengthBuf, value]);
}

function buildImplicitLeElement(tag: Tag, value: Buffer): Buffer {
  const { group, element } = splitTag(tag);
  const groupBuf = Buffer.alloc(2);
  groupBuf.writeUInt16LE(group, 0);
  const elementBuf = Buffer.alloc(2);
  elementBuf.writeUInt16LE(element, 0);
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(value.length, 0);
  return Buffer.concat([groupBuf, elementBuf, lengthBuf, value]);
}

function encodeElement(el: BuildDicomElement, ts: string): Buffer {
  if (ts === "1.2.840.10008.1.2") return buildImplicitLeElement(el.tag, el.value);
  if (ts === "1.2.840.10008.1.2.1") return buildExplicitLeElement(el.tag, el.vr, el.value);
  // Plan 02-04 extends with Explicit VR BE; plan 02-05 extends with Deflated Explicit VR LE.
  throw new Error(
    `buildDicom: encoder for transferSyntax="${ts}" not implemented yet (added in plan 02-04 / 02-05).`,
  );
}

function splitTag(tag: Tag): { group: number; element: number } {
  return {
    group: parseInt(tag.slice(0, 4), 16),
    element: parseInt(tag.slice(4, 8), 16),
  };
}

/** UI VR is even-length and pads with NUL (0x00) per PS3.5. */
function padUI(s: string): Buffer {
  const buf = Buffer.from(s, "ascii");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x00])]);
}

/** Short-string VRs (SH, etc.) pad with space (0x20) per PS3.5. */
function padText(s: string): Buffer {
  const buf = Buffer.from(s, "ascii");
  return buf.length % 2 === 0 ? buf : Buffer.concat([buf, Buffer.from([0x20])]);
}
