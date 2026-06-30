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
 * Lossless round-trip: non-modeled `(0002,xxxx)` elements a source file carried
 * — e.g. `(0002,0017)`/`(0002,0018)` Sending/Receiving AE Title, `(0002,0100)`
 * Private Information Creator UID, `(0002,0102)` Private Information — are
 * retained by the parser on {@link FileMeta.extraElements} and merged back here,
 * with the whole group emitted in ascending tag order. So an exotic File Meta
 * group round-trips byte-for-byte, not just the typed fields.
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
  // Collect every modeled element present, plus any preserved non-modeled
  // elements, then emit in ascending tag order (PS3.5 §7.4) so the group is
  // both spec-clean and a byte-exact round-trip of an exotic source group.
  const entries: { tag: Tag; vr: VR; value: Buffer }[] = [
    {
      tag: "00020001",
      vr: "OB",
      value: fileMeta.fileMetaInformationVersion ?? DEFAULT_FILE_META_VERSION,
    },
    { tag: "00020010", vr: "UI", value: latin1(fileMeta.transferSyntaxUID) },
    {
      tag: "00020012",
      vr: "UI",
      value: latin1(fileMeta.implementationClassUID ?? COSYTE_IMPLEMENTATION_CLASS_UID),
    },
  ];
  if (fileMeta.mediaStorageSOPClassUID !== undefined) {
    entries.push({ tag: "00020002", vr: "UI", value: latin1(fileMeta.mediaStorageSOPClassUID) });
  }
  if (fileMeta.mediaStorageSOPInstanceUID !== undefined) {
    entries.push({ tag: "00020003", vr: "UI", value: latin1(fileMeta.mediaStorageSOPInstanceUID) });
  }
  if (fileMeta.implementationVersionName !== undefined) {
    entries.push({ tag: "00020013", vr: "SH", value: latin1(fileMeta.implementationVersionName) });
  }
  if (fileMeta.sourceApplicationEntityTitle !== undefined) {
    entries.push({
      tag: "00020016",
      vr: "AE",
      value: latin1(fileMeta.sourceApplicationEntityTitle),
    });
  }
  for (const extra of fileMeta.extraElements ?? []) {
    entries.push({ tag: extra.tag.toUpperCase(), vr: extra.vr, value: extra.value });
  }

  // 8-char uppercase hex tags sort lexicographically in ascending numeric order.
  entries.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const bodyBytes = Buffer.concat(entries.map((e) => encodeMetaElement(e.tag, e.vr, e.value)));
  const groupLengthValue = Buffer.alloc(4);
  groupLengthValue.writeUInt32LE(bodyBytes.length, 0);
  const groupLength = encodeMetaElement(TAG_GROUP_LENGTH, "UL", groupLengthValue);

  return Buffer.concat([groupLength, bodyBytes]);
}
