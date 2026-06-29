/**
 * File Meta Information (group `0002`) encoder for the Phase 5 writer.
 *
 * PS3.10 §7.1: the File Meta group is **always** Explicit VR Little Endian,
 * regardless of the dataset's transfer syntax, and is preceded by the
 * `(0002,0000)` File Meta Information Group Length whose value is the byte
 * count of every following `(0002,xxxx)` element. The writer reconstructs the
 * group from the typed {@link FileMeta} view (not from preserved raw bytes), so
 * the group length is always correct and the elements are always in ascending
 * tag order.
 *
 * Required (Type 1) elements per PS3.10 are always emitted — File Meta
 * Information Version `(0002,0001)`, Transfer Syntax UID `(0002,0010)`, and
 * Implementation Class UID `(0002,0012)` — with conservative defaults when the
 * parsed view omitted them. The Media Storage SOP Class/Instance UIDs and the
 * optional descriptive elements are emitted only when present (the writer never
 * invents a SOP identity).
 *
 * Known limitation (by design, until the parser retains them): only the typed
 * {@link FileMeta} fields round-trip. Any other `(0002,xxxx)` element a source
 * file carried — e.g. `(0002,0100)` Private Information Creator UID, `(0002,0102)`
 * Private Information, `(0002,0017)`/`(0002,0018)` Sending/Receiving AE — is
 * dropped at *parse* time (the Phase 2 `FileMeta` view does not model them), so
 * it cannot be re-emitted here. The output stays spec-clean; it is just not a
 * byte-exact copy of an exotic File Meta group.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import type { FileMeta } from "../dataset/file-meta.js";
import { splitTag } from "../dataset/tag.js";
import type { Tag, VR } from "../dictionary/types.js";
import { LONG_FORM_VRS } from "../parser/element-header.js";
import { padValue } from "./element.js";

/**
 * cosyte's Implementation Class UID, emitted as `(0002,0012)` when the source
 * dataset carried none. A UUID-derived UID under the `2.25` arc (PS3.5 §B.2),
 * which is globally unique without an organisationally registered root. Fixed
 * (not regenerated per call) so the writer is deterministic.
 *
 * @internal
 */
export const COSYTE_IMPLEMENTATION_CLASS_UID = "2.25.200853462534740285303254730069375064698";

/** Default File Meta Information Version value — `0x0001` (PS3.10 §7.1). */
const DEFAULT_FILE_META_VERSION = Buffer.from([0x00, 0x01]);

const TAG_GROUP_LENGTH: Tag = "00020000";

/** Encode one File Meta element as Explicit VR LE (short or long form). */
function encodeMetaElement(tag: Tag, vr: VR, rawValue: Buffer): Buffer {
  const { group, element } = splitTag(tag);
  const value = padValue(rawValue, vr);
  const groupBuf = Buffer.alloc(2);
  groupBuf.writeUInt16LE(group, 0);
  const elementBuf = Buffer.alloc(2);
  elementBuf.writeUInt16LE(element, 0);
  const vrBuf = Buffer.from(vr, "ascii");
  if (LONG_FORM_VRS.has(vr)) {
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(value.length, 0);
    return Buffer.concat([
      groupBuf,
      elementBuf,
      vrBuf,
      Buffer.from([0x00, 0x00]),
      lengthBuf,
      value,
    ]);
  }
  const lengthBuf = Buffer.alloc(2);
  lengthBuf.writeUInt16LE(value.length, 0);
  return Buffer.concat([groupBuf, elementBuf, vrBuf, lengthBuf, value]);
}

/**
 * UI/AE/SH text → bytes (padding to even length is handled on encode). Uses
 * `latin1` rather than `ascii` so a stray byte > 0x7F is preserved 1:1 instead
 * of being silently masked to 7 bits — these values (UIDs, AE titles) are ASCII
 * by spec, but a non-conformant source value must not be corrupted on write.
 */
function latin1(value: string): Buffer {
  return Buffer.from(value, "latin1");
}

/**
 * Encode the complete File Meta group (`(0002,0000)` group length + all
 * `(0002,xxxx)` elements) as Explicit VR LE bytes. The group-length value is
 * computed from the encoded body, so the result always satisfies PS3.10 §7.1.
 *
 * @internal
 */
export function encodeFileMeta(fileMeta: FileMeta): Buffer {
  const body: Buffer[] = [];

  body.push(
    encodeMetaElement(
      "00020001",
      "OB",
      fileMeta.fileMetaInformationVersion ?? DEFAULT_FILE_META_VERSION,
    ),
  );
  if (fileMeta.mediaStorageSOPClassUID !== undefined) {
    body.push(encodeMetaElement("00020002", "UI", latin1(fileMeta.mediaStorageSOPClassUID)));
  }
  if (fileMeta.mediaStorageSOPInstanceUID !== undefined) {
    body.push(encodeMetaElement("00020003", "UI", latin1(fileMeta.mediaStorageSOPInstanceUID)));
  }
  body.push(encodeMetaElement("00020010", "UI", latin1(fileMeta.transferSyntaxUID)));
  body.push(
    encodeMetaElement(
      "00020012",
      "UI",
      latin1(fileMeta.implementationClassUID ?? COSYTE_IMPLEMENTATION_CLASS_UID),
    ),
  );
  if (fileMeta.implementationVersionName !== undefined) {
    body.push(encodeMetaElement("00020013", "SH", latin1(fileMeta.implementationVersionName)));
  }
  if (fileMeta.sourceApplicationEntityTitle !== undefined) {
    body.push(encodeMetaElement("00020016", "AE", latin1(fileMeta.sourceApplicationEntityTitle)));
  }

  const bodyBytes = Buffer.concat(body);
  const groupLengthValue = Buffer.alloc(4);
  groupLengthValue.writeUInt32LE(bodyBytes.length, 0);
  const groupLength = encodeMetaElement(TAG_GROUP_LENGTH, "UL", groupLengthValue);

  return Buffer.concat([groupLength, bodyBytes]);
}
