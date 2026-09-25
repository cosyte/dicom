/**
 * `serializeDicom` - the Part 10 writer (the conservative half of
 * Postel's Law).
 *
 * Takes a {@link Dataset} (from `parseDicom`, or hand-built) and emits a
 * spec-clean DICOM Part 10 byte stream:
 *
 *   1. 128-byte zero preamble + `DICM` magic (PS3.10 §7.1).
 *   2. File Meta group `0002`, always Explicit VR LE, with a correct
 *      `(0002,0000)` group length - see {@link encodeFileMeta}.
 *   3. The dataset body, in the dataset's own transfer syntax (**no
 *      transcode**): Implicit VR LE; Explicit VR LE/BE; for the Deflated
 *      syntax, an Explicit VR LE body run through RFC 1951 raw deflate
 *      (`zlib.deflateRawSync`), symmetric to the parser's `inflateRawSync`; and
 *      for every Transfer Syntax PS3.5 2026c section A.4 names (the generated
 *      list the parser dispatches), an Explicit VR LE body whose top-level
 *      Pixel Data is an encapsulated fragment stream (see `./encapsulated.ts`).
 *
 * Conservative behaviour (PS3.5): scalar values are padded to even length on
 * write (§6.2); retired `(gggg,0000)` group-length elements are omitted from
 * the dataset (§7.2); short/long-form headers are chosen by VR (§7.1.2); the
 * Data Elements of the root Data Set, and of every Sequence Item the writer can
 * walk, are emitted in ascending tag order (PS3.5 2026c §7.1 / §7.5.1, see
 * `./order.ts`), with Items kept in their order and no value byte changed;
 * encapsulated-pixel-data fragments pass through byte-for-byte (§A.4), and
 * under a section A.4 syntax a top-level Pixel Data that is not a fragment
 * stream section A.4 allows is refused, never repaired.
 *
 * The ordering has limits, stated with it. A tag repeated inside an Item is
 * kept (both copies, in source order), so such output still breaks PS3.5 2026c
 * §7.1's "at most once". A Sequence that cannot be walked, one nested past
 * `NESTING_DEPTH_LIMIT`, one whose parsed `items` do not match its bytes, and
 * any `UN`-carried Sequence (under Implicit VR LE that includes a private
 * Sequence inside an Item, even one a `Profile` resolved to `SQ`, since a
 * default read resolves its tag to `UN`) are emitted as read, unordered. An
 * element whose own bytes do not show where a reader ends it (an
 * undefined-length `UN` the parser could not read as a Sequence, a value
 * missing its Sequence Delimitation Item) is written after the ascending rest of
 * its Data Set, since a reader would take whatever followed it into its value.
 * So is a Sequence nested past the bound, other than a defined-length one under
 * Implicit VR LE, since seeing where a reader ends it would take the walk past
 * the bound. An element the parser relocated because a length lied is ordered
 * where it was placed.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";

import type { Dataset } from "../dataset/dataset.js";
import { splitTag } from "../dataset/tag.js";
import { ENCAPSULATED_TRANSFER_SYNTAX_UIDS } from "../dictionary/generated/encapsulated-transfer-syntaxes.js";
import { type BodyEncoding, encodeDatasetElement } from "./element.js";
import { encapsulatedPixelData, PIXEL_DATA } from "./encapsulated.js";
import { DicomSerializeError, SERIALIZE_ERROR_CODES } from "./errors.js";
import { encodeFileMeta } from "./file-meta.js";
import { emissionOf, tagNumber } from "./order.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";

/** Map a native transfer syntax UID to the body element encoding it uses. */
const BODY_ENCODING: Readonly<Record<string, BodyEncoding>> = {
  [TS_IMPLICIT_LE]: "implicit",
  [TS_EXPLICIT_LE]: "explicitLE",
  [TS_EXPLICIT_BE]: "explicitBE",
  // Deflated TS body is Explicit VR LE before compression (PS3.5 Annex A.5).
  [TS_DEFLATED_LE]: "explicitLE",
};

/**
 * Every Transfer Syntax UID PS3.5 2026c section A.4 names: the generated list
 * `parseDicom` dispatches to its Explicit VR LE reader, so the writer accepts
 * exactly the set the reader reads. Section A.4 makes the whole Data Set
 * Explicit VR Little Endian.
 */
const ENCAPSULATED_SYNTAXES: ReadonlySet<string> = new Set(ENCAPSULATED_TRANSFER_SYNTAX_UIDS);

/** 128-byte zero preamble + the `DICM` magic (PS3.10 §7.1). */
function part10Preamble(): Buffer {
  return Buffer.concat([Buffer.alloc(128, 0x00), Buffer.from("DICM", "ascii")]);
}

/**
 * Encode the dataset body (every element except retired group lengths) under
 * `encoding`, in ascending tag order (PS3.5 2026c §7.1), whatever order the
 * `Dataset` holds them in. Each `SQ` has the Data Sets of the Items it can walk
 * ordered the same way (see {@link emissionOf}). An element whose own bytes do
 * not show where a reader ends it follows the ascending rest, in the
 * `Dataset`'s order. The input `Dataset` is read, never changed.
 *
 * `pixelData`, when given, is the whole on-wire top-level Pixel Data element a
 * section A.4 syntax writes (see {@link encapsulatedPixelData}); it ends on its
 * own Sequence Delimitation Item, so it is placed by its tag like any other.
 */
function encodeBody(ds: Dataset, encoding: BodyEncoding, pixelData?: Buffer): Buffer {
  // PS3.5 §7.2: omit retired (gggg,0000) group-length elements on write.
  // (File Meta group lengths are handled separately and never appear in the
  // dataset element map.)
  const kept = ds.elements().filter((el) => splitTag(el.tag).element !== 0x0000);
  const closed: { readonly tag: number; readonly bytes: Buffer }[] = [];
  const open: Buffer[] = [];
  for (const el of kept) {
    if (pixelData !== undefined && el.tag === PIXEL_DATA) {
      closed.push({ tag: tagNumber(el.tag), bytes: pixelData });
      continue;
    }
    const emission = emissionOf(el, encoding);
    const bytes = encodeDatasetElement(el, encoding, emission.rawBytes);
    if (emission.closed) closed.push({ tag: tagNumber(el.tag), bytes });
    else open.push(bytes);
  }
  // Stable, so two model elements with one tag keep their relative order.
  closed.sort((a, b) => a.tag - b.tag);
  return Buffer.concat([...closed.map((entry) => entry.bytes), ...open]);
}

/**
 * Serialize a {@link Dataset} to a spec-clean DICOM Part 10 `Buffer`.
 *
 * The dataset's transfer syntax is preserved (no transcoding): pixel-data
 * fragments are written back byte-for-byte, nested sequences carry the same
 * bytes with each Item's Data Elements in ascending tag order, and scalar values
 * are re-emitted with correct even-length padding and File Meta group length.
 * Pure function - the input `Dataset` is never mutated.
 *
 * **Element order.** Every Data Set is written in ascending tag order (PS3.5
 * 2026c §7.1, §7.5.1): the root, and the Data Set of every Item in every
 * Sequence the writer can walk on the wire, at every depth up to
 * `NESTING_DEPTH_LIMIT`. Items stay in their order (PS3.5 2026c §7.5) and no
 * value changes; only whole element spans move, and only where the parsed
 * `items` match the bytes, so the output reads back as the source did. Limits:
 * a tag repeated inside an Item is kept twice, in source order, so that output
 * still breaks PS3.5 2026c §7.1's "at most once"; a Sequence whose Item stream
 * cannot be walked to exactly its end, one nested past the bound, one whose
 * `items` do not match its bytes (a Sequence the parser did not descend, for
 * one), and any `UN`-carried Sequence (under Implicit VR LE that includes a
 * private Sequence inside an Item, even one a `Profile` resolved to `SQ`, since
 * a default read resolves its tag to `UN`) are written as read, unordered; an
 * element whose own bytes do not show where a reader ends it (an
 * undefined-length `UN` the parser could not read as a Sequence, or a value
 * missing its Sequence Delimitation Item) is written after the ascending rest
 * of its Data Set, because a reader takes what follows it into its value, and
 * so is a Sequence nested past the bound (other than a defined-length one under
 * Implicit VR LE), whose end the writer would have to walk past the bound to
 * see; and an element the parser relocated because a length lied is ordered
 * where it was placed, since ordering cannot recover an order the source
 * destroyed.
 *
 * **Encapsulated objects.** Under every Transfer Syntax PS3.5 2026c section A.4
 * names (JPEG, JPEG-LS, JPEG 2000, HTJ2K, RLE and the rest: the list `parseDicom`
 * reads), the File Meta Transfer Syntax UID is kept, the Data Set is written as
 * Explicit VR Little Endian, and the top-level Pixel Data `(7FE0,0010)` is
 * written as `OB` of undefined length: the input's Basic Offset Table Item and
 * fragment Items byte for byte and in order, then a zero-length Sequence
 * Delimitation Item. Nothing is decoded, transcoded or re-framed, and no offset
 * table is interpreted or rebuilt. The limit sits with it: a top-level Data Set
 * that section A.4 does not allow is refused with
 * `INVALID_ENCAPSULATED_PIXEL_DATA` rather than repaired, which includes a
 * fragment stream `parseDicom` read with `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED`,
 * an odd Item Length, an empty fragment, native or absent top-level Pixel Data,
 * and Float or Double Float Pixel Data. Pixel Data nested in a Sequence Item is
 * written as read.
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
 * rebuilt in ascending tag order (modeled fields + `extraElements` - see
 * {@link encodeFileMeta}), the Data Sets are ordered as above, odd-length values
 * are padded even, and retired `(gggg,0000)` group lengths are dropped.
 *
 * @throws {@link DicomSerializeError} with code `MISSING_TRANSFER_SYNTAX` when
 *   the dataset has no File Meta Transfer Syntax UID,
 *   `UNSUPPORTED_TRANSFER_SYNTAX` when that UID is neither one of the four
 *   native syntaxes nor a section A.4 one, or `INVALID_ENCAPSULATED_PIXEL_DATA`
 *   when it is a section A.4 one and the top-level Pixel Data is not a fragment
 *   stream section A.4 allows. Nothing is returned on a throw.
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
  const encapsulated = ENCAPSULATED_SYNTAXES.has(tsUid);
  // PS3.5 2026c section A.4: the whole Data Set is Explicit VR Little Endian.
  const encoding = encapsulated ? "explicitLE" : BODY_ENCODING[tsUid];
  if (encoding === undefined) {
    // Not interpolated, for the same reason the reader does not interpolate it:
    // a caller can hand the writer any `Dataset`, so `transferSyntaxUID` is a
    // consumer-controlled string on this path and this message is an
    // `err.message`.
    throw new DicomSerializeError(
      SERIALIZE_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX,
      `The Dataset's File Meta Transfer Syntax UID is not supported by the @cosyte/dicom writer (supported: ${Object.keys(BODY_ENCODING).join(", ")}, and every PS3.5 2026c section A.4 encapsulation syntax).`,
    );
  }
  // Checked before a byte is built, so a refusal returns nothing.
  const pixelData = encapsulated ? encapsulatedPixelData(ds) : undefined;

  const preamble = part10Preamble();
  const fileMeta = encodeFileMeta(ds.fileMeta);
  const body = encodeBody(ds, encoding, pixelData);
  const datasetBytes = tsUid === TS_DEFLATED_LE ? deflateRawSync(body) : body;

  return Buffer.concat([preamble, fileMeta, datasetBytes]);
}
