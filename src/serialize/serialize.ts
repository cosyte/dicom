/**
 * `serializeDicom` — the Phase 5 Part 10 writer (the conservative half of
 * Postel's Law).
 *
 * Takes a {@link Dataset} (from `parseDicom`, or hand-built) and emits a
 * spec-clean DICOM Part 10 byte stream:
 *
 *   1. 128-byte zero preamble + `DICM` magic (PS3.10 §7.1).
 *   2. File Meta group `0002`, always Explicit VR LE, with a correct
 *      `(0002,0000)` group length — see {@link encodeFileMeta}.
 *   3. The dataset body, in the dataset's own transfer syntax (**no
 *      transcode**): Implicit VR LE, Explicit VR LE/BE, or — for the Deflated
 *      syntax — an Explicit VR LE body run through RFC 1951 raw deflate
 *      (`zlib.deflateRawSync`), symmetric to the parser's `inflateRawSync`.
 *
 * Conservative behaviour (PS3.5): scalar values are padded to even length on
 * write (§6.2); retired `(gggg,0000)` group-length elements are omitted from
 * the dataset (§7.2); short/long-form headers are chosen by VR (§7.1.2);
 * sequence and encapsulated-pixel-data spans pass through byte-for-byte
 * (§7.5 / §A.4).
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";

import type { Dataset } from "../dataset/dataset.js";
import { splitTag } from "../dataset/tag.js";
import { type BodyEncoding, encodeDatasetElement } from "./element.js";
import { DicomSerializeError, SERIALIZE_ERROR_CODES } from "./errors.js";
import { encodeFileMeta } from "./file-meta.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

/** Map a transfer syntax UID to the body element encoding it uses. */
const BODY_ENCODING: Readonly<Record<string, BodyEncoding>> = {
  [TS_IMPLICIT_LE]: "implicit",
  [TS_EXPLICIT_LE]: "explicitLE",
  [TS_EXPLICIT_BE]: "explicitBE",
  // Deflated TS body is Explicit VR LE before compression (PS3.5 Annex A.5).
  [TS_DEFLATED_LE]: "explicitLE",
};

/** 128-byte zero preamble + the `DICM` magic (PS3.10 §7.1). */
function part10Preamble(): Buffer {
  return Buffer.concat([Buffer.alloc(128, 0x00), Buffer.from("DICM", "ascii")]);
}

/**
 * Encode the dataset body (every element except retired group lengths) under
 * `encoding`, in the dataset's parse (insertion) order.
 */
function encodeBody(ds: Dataset, encoding: BodyEncoding): Buffer {
  const parts: Buffer[] = [];
  for (const el of ds.elements()) {
    // PS3.5 §7.2: omit retired (gggg,0000) group-length elements on write.
    // (File Meta group lengths are handled separately and never appear in the
    // dataset element map.)
    if (splitTag(el.tag).element === 0x0000) continue;
    parts.push(encodeDatasetElement(el, encoding));
  }
  return Buffer.concat(parts);
}

/**
 * Serialize a {@link Dataset} to a spec-clean DICOM Part 10 `Buffer`.
 *
 * The dataset's transfer syntax is preserved (no transcoding): pixel-data
 * fragments and nested sequences are written back byte-for-byte, while scalar
 * values are re-emitted with correct even-length padding and File Meta group
 * length. Pure function — the input `Dataset` is never mutated.
 *
 * **Input contract.** The writer is designed for a {@link Dataset} produced by
 * `parseDicom`: it relies on the parser's `Element.rawBytes` representation
 * (value-only for scalars and Implicit-LE defined-length `SQ`; full on-wire span
 * for Explicit `SQ`, undefined-length spans, encapsulated Pixel Data, and the
 * `UN`/CP-246 fallbacks). A hand-built `Dataset` must follow the same
 * convention for its bytes to be encoded correctly.
 *
 * **Round-trip scope.** `parseDicom(out)` re-reads to a dataset that is equal
 * over the *modeled* surface (every dataset element + the typed
 * {@link "../dataset/file-meta".FileMeta} fields plus any non-modeled File Meta
 * elements preserved on `extraElements`), not a byte-exact copy of the original
 * file: the 128-byte preamble is normalized to zeros, the File Meta group is
 * rebuilt in ascending tag order (modeled fields + `extraElements` — see
 * {@link encodeFileMeta}), odd-length values are padded even, and retired
 * `(gggg,0000)` group lengths are dropped.
 *
 * @throws {@link DicomSerializeError} with code `MISSING_TRANSFER_SYNTAX` when
 *   the dataset has no File Meta Transfer Syntax UID, or
 *   `UNSUPPORTED_TRANSFER_SYNTAX` when that UID is outside the v1 set.
 *
 * @example
 * ```ts
 * import { parseDicom, serializeDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * const out = serializeDicom(ds); // spec-clean Part 10, same transfer syntax
 * // parseDicom(out) re-reads to a structurally-equal dataset.
 * ```
 */
export function serializeDicom(ds: Dataset): Buffer {
  const tsUid = ds.fileMeta?.transferSyntaxUID;
  if (ds.fileMeta === undefined || tsUid === undefined || tsUid.length === 0) {
    throw new DicomSerializeError(
      SERIALIZE_ERROR_CODES.MISSING_TRANSFER_SYNTAX,
      "Dataset has no File Meta Transfer Syntax UID to serialize under.",
    );
  }
  const encoding = BODY_ENCODING[tsUid];
  if (encoding === undefined) {
    throw new DicomSerializeError(
      SERIALIZE_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX,
      `Transfer Syntax UID "${tsUid}" is not supported by the @cosyte/dicom v1 writer.`,
    );
  }

  const preamble = part10Preamble();
  const fileMeta = encodeFileMeta(ds.fileMeta);
  const body = encodeBody(ds, encoding);
  const datasetBytes = tsUid === TS_DEFLATED_LE ? deflateRawSync(body) : body;

  return Buffer.concat([preamble, fileMeta, datasetBytes]);
}
