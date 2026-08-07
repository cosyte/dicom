/**
 * Tier-3 fatal message registry and factories for the `@cosyte/dicom` parser
 * pipeline.
 *
 * This module is to {@link DicomParseError} what `./warnings.ts` is to
 * `DicomParseWarning`, and it exists for one reason: **a diagnostic about a PHI
 * leak is itself a PHI surface.** Tier-2 messages have been built from a frozen
 * registry since `#48`; Tier-3 messages were still assembled at the throw site
 * out of template literals, and four of them interpolated a tag, a VR or a raw
 * 32-bit length read off the wire.
 *
 * ## What was measured, on `0a8c6e3`, with a name-bearing payload
 *
 * An `ST` carrier holding `"MR BRAIN SMITHSON "` whose Value Length
 * under-declares desynchronizes the reader onto a fabricated header inside the
 * name. The old messages then rendered it:
 *
 * - `Element 41524E49 declared length=1330858068 exceeds remaining buffer` -
 *   `41524E49` is `"RAIN"` and `1330858068` is `"THSO"`, both in wire order and
 *   both reversible with one `readUInt16LE` / `readUInt32LE` pair. Explicit VR
 *   LE at delta `-14`, Implicit VR LE at delta `-12`.
 * - `Unexpected tag 524D4220 inside sequence` - `"MR B"`.
 * - `Item length=1109414477 exceeds remaining buffer` - `"MR B"`.
 * - `Unexpected FFFE marker FFFEE00D (length=1109414477)` - `"MR B"`.
 *
 * `#55` shipped that shape under a *"safe to log"* claim and paid a blocker for
 * it; `#64` hit it again through `DICOM_NONZERO_RESERVED_BYTES` and fixed it the
 * durable way. This module copies that remedy exactly.
 *
 * ## The bound is the factory signature, not a branch
 *
 * {@link FatalTokens} **has no tag field and no wire-length field**, so a tag
 * cannot be rendered here even by a call site that wants to: there is nothing to
 * check, because there is no slot. **That is still stronger than `renderTag` in
 * `./warnings.ts`, and it stayed stronger when `renderTag` became a membership
 * test.** A membership test refuses a tag PS3.6's registry does not name; the
 * absence of a slot refuses one it does. `position.byteOffset` identifies the
 * element instead, and it is a count this parser kept rather than anything the
 * document said.
 *
 * The numbers that do reach a template are named one at a time in
 * {@link FATAL_MESSAGES}, and every one of them is a library constant or a cap
 * the caller passed in. **No template takes a count measured over the bytes
 * being read**, and that is a property of the factory signatures rather than of
 * any branch inside them.
 *
 * ## The ninth instance: a VARIABLE shift is still the wire number
 *
 * Through `0.0.14` two entries rendered `{n} = buffer.length - cursor.position`.
 * At the root that is the caller's own input less a cursor the parser kept, and
 * it is not document content. But `parseSequence` hands a defined-length
 * Sequence Item's descent a **slice**, so inside one the buffer *is* that Item
 * and `buffer.length` *is* the Item's 32-bit Value (Item) Length off its own
 * header - four document bytes on exactly the files these fatals fire for, where
 * a reader has desynchronized onto a fabricated Item header. The message
 * publishes `byteOffset` beside the count and `cursor.position` is that offset
 * plus the header just read, so an addition returns the declared length.
 *
 * Measured on `"MR BRAIN SMITHSON "` with a planted Item Length of `21320`
 * (`"HS\0\0"`, two letters of the surname and the two zero high bytes every
 * reachable fabricated length carries): the shipped messages read `21312`,
 * `21288` and `21272` with the over-declaring element first in the Item, one
 * 24-byte element in, and one 40-byte element in. **The shift is
 * `cursor.position`, so it is variable**, which is why no fixed-offset arm on
 * the detector in `test/integration/fatal-diagnostic-surface.test.ts` can hunt
 * it: that arm covers the 8-byte case and says so on its own constant. The
 * remedy does not depend on the shift's size, because the bound is the
 * signature - the same conclusion `#88`, `#90`, `#91` and `#92` each reached.
 *
 * **There is no string parameter for a value to travel through.** The two
 * exceptions look like one and are not: {@link unsupportedTransferSyntax} takes
 * the `(0002,0010)` UID and renders **the PS3.6 registry's own name for it**,
 * and {@link inflateFailed} takes zlib's `err.code` and renders it only if it is
 * one of the nine `zlib.codes` names. Both are membership tests against a closed
 * table, in the shape `renderVr` established; neither echoes its argument.
 *
 * ## What this module does NOT do
 *
 * **It does not make `DicomParseError` PHI-free, and it must never be described
 * that way.** `DicomParseError.snippet` is 16 raw source bytes rendered as hex
 * (D-10), it is attached to every fatal here, and hex is a re-encoding the
 * shared PHI runner cannot match. The registry bounds the **message**. The
 * snippet is documented as PHI on `ParseOptions.strict` and on the class, and
 * that documentation is the whole of the guarantee there.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import { uid as dictionaryUid } from "../dictionary/index.js";
import type { VR } from "../dictionary/types.js";
import { DicomParseError, FATAL_CODES, buildSnippet, type FatalCode } from "./errors.js";
import { WITHHELD, renderVr } from "./tokens.js";

/**
 * The four Transfer Syntax UIDs `TRANSFER_SYNTAX_PARSERS` registers, rendered
 * for the one message that lists them. A literal rather than a derivation so
 * this module does not import the dispatch table it is thrown out of; the
 * `fatals.test.ts` "supported list matches the dispatch table" case is what
 * keeps the two in step.
 */
const SUPPORTED_TRANSFER_SYNTAXES =
  "1.2.840.10008.1.2, 1.2.840.10008.1.2.1, 1.2.840.10008.1.2.2, 1.2.840.10008.1.2.1.99";

/**
 * `zlib.codes`, as a closed set of names.
 *
 * Written out rather than imported so this module pulls in no runtime
 * dependency of its own; `fatals.test.ts` asserts it is exactly
 * `Object.keys(zlib.codes)` filtered to the name direction, so a Node release
 * that adds a code reds a test instead of silently widening what may be
 * printed.
 */
const ZLIB_CODES: ReadonlySet<string> = Object.freeze(
  new Set([
    "Z_OK",
    "Z_STREAM_END",
    "Z_NEED_DICT",
    "Z_ERRNO",
    "Z_STREAM_ERROR",
    "Z_DATA_ERROR",
    "Z_MEM_ERROR",
    "Z_BUF_ERROR",
    "Z_VERSION_ERROR",
  ]),
);

/**
 * Stable keys for every distinct Tier-3 message this parser can throw.
 *
 * A key is **not** a {@link FatalCode}. The four codes are locked (D-09) and
 * several of them are raised for structurally different reasons, so the code is
 * what a consumer narrows on and the key is what selects the prose. The mapping
 * from key to code lives in {@link FATAL_MESSAGES} and is total over this union,
 * which is what makes "every fatal message comes from the registry" a fact the
 * type system checks rather than one a reader has to verify.
 *
 * @internal
 */
export type FatalMessageKey = keyof typeof FATAL_MESSAGES;

/** A registry entry: the Tier-3 code to raise, and the only place its prose exists. */
interface FatalMessageEntry {
  readonly code: FatalCode;
  readonly message: string;
}

/**
 * The frozen message registry: one entry per {@link FatalMessageKey}, and the
 * only place a Tier-3 message's prose exists.
 *
 * Every `{...}` below is a {@link FatalTokens} field, and each entry that
 * carries one says what the number is:
 *
 * - `SQ_NESTING_DEPTH_EXCEEDED`: `{n}` is `NESTING_DEPTH_LIMIT`, this library's
 *   own bound and not PS3.5's.
 * - `INFLATED_PAYLOAD_EXCEEDS_CAP`: `{n}` is the cap the caller passed in.
 *
 * Nothing else takes a number, no entry takes a tag, and **no entry takes a
 * count measured over the bytes being read**.
 */
const FATAL_MESSAGES = Object.freeze({
  EMPTY_INPUT: {
    code: FATAL_CODES.EMPTY_INPUT,
    message: "Input is empty.",
  },
  EMPTY_INPUT_AFTER_NORMALIZATION: {
    code: FATAL_CODES.EMPTY_INPUT,
    message: "Input is empty after normalization.",
  },
  NOT_DICOM_PART_10_REQUIRED: {
    code: FATAL_CODES.NOT_DICOM_PART_10,
    message: "Missing DICM magic at offset 128 (stripPreamble='require').",
  },
  NOT_DICOM_PART_10: {
    code: FATAL_CODES.NOT_DICOM_PART_10,
    message:
      "Input is not a DICOM Part 10 file (no DICM magic at offset 128 and no recognizable File Meta group at offset 0).",
  },
  // `{ts}` is NOT the UID. It is the PS3.6 registry's own name for the UID, or a
  // fixed phrase when PS3.6 does not publish one - see `renderTransferSyntax`.
  UNSUPPORTED_TRANSFER_SYNTAX: {
    code: FATAL_CODES.UNSUPPORTED_TRANSFER_SYNTAX,
    message: `{ts} in (0002,0010) is not supported by @cosyte/dicom v1 (supported: ${SUPPORTED_TRANSFER_SYNTAXES}).`,
  },
  FILE_META_TRUNCATED: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "File Meta is truncated.",
  },
  // The declared group length is deliberately absent. It is four bytes of the
  // document read as a 32-bit integer, and this code fires precisely when those
  // four bytes are not what they claim to be.
  FILE_META_GROUP_LENGTH_OVERRUNS: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "(0002,0000) FileMetaInformationGroupLength declares more bytes than remain in the input. The declared length and the count of bytes that remain are withheld; the byte offset locates the group.",
  },
  FILE_META_TRANSFER_SYNTAX_MISSING: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "Required File Meta element (0002,0010) Transfer Syntax UID is missing or not UI.",
  },
  TRUNCATED_DATASET_HEADER: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "Truncated dataset (header read past buffer end).",
  },
  TRUNCATED_FFFE_HEADER: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "Truncated dataset (FFFE header read past buffer end).",
  },
  TRUNCATED_EXPLICIT_VR_HEADER: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "Truncated dataset (Explicit VR header read past buffer end).",
  },
  SQ_ITEM_HEADER_TRUNCATED: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "Truncated dataset (SQ item header read past buffer end).",
  },
  // Neither the marker's element number nor its length field is here. Both are
  // read at a position the reader may have desynchronized to, so both are
  // document content: the length field measured as 1109414477, `"MR B"`.
  UNEXPECTED_FFFE_AT_DATASET_LEVEL: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "An (FFFE,xxxx) delimitation item appears at Data Set level under Explicit VR, where no sequence is open. Its element number and its length field are withheld; the byte offset locates it.",
  },
  UNEXPECTED_FFFE_AT_DATASET_ROOT: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "An (FFFE,xxxx) delimitation item appears at Data Set level under Implicit VR LE, where no sequence is open. Its element number is withheld; the byte offset locates it.",
  },
  UNDEFINED_LENGTH_ON_NON_SQ_EXPLICIT: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "An element with VR={vr} declares undefined length (0xFFFFFFFF) under Explicit VR. PS3.5 2026c permits that for a Sequence (7.5.2 Delimitation of The Sequence of Items), for encapsulated (7FE0,0010) Pixel Data (A.4), and for the UN form CP-246 addresses (6.2.2 Unknown (UN) Value Representation), and this element is none of them. Its tag is withheld; the byte offset locates it.",
  },
  UNDEFINED_LENGTH_ON_NON_SQ_IMPLICIT: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "An element whose VR resolved to {vr} declares undefined length (0xFFFFFFFF) under Implicit VR LE, and the descent as an Implicit VR LE item stream (PS3.5 2026c 6.2.2, the UN form CP-246 addresses) did not succeed. Its tag is withheld; the byte offset locates it.",
  },
  ELEMENT_LENGTH_EXCEEDS_BUFFER: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "An element declares a Value Length reaching past the end of the bytes being read. Its tag, its declared length and the count of bytes that remain are withheld; the byte offset locates it.",
  },
  UNEXPECTED_TAG_INSIDE_SEQUENCE: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "A sequence's item stream holds a tag that is neither (FFFE,E000) Item nor (FFFE,E0DD) Sequence Delimitation Item (PS3.5 7.5). That tag is withheld: a value being read as an item stream makes its four bytes document content. The byte offset locates it.",
  },
  ENCAPSULATED_FRAGMENT_EXCEEDS_BUFFER: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "An encapsulated Pixel Data fragment declares a length reaching past the end of the bytes being read. The declared length is withheld; the byte offset locates the fragment.",
  },
  ITEM_LENGTH_EXCEEDS_BUFFER: {
    code: FATAL_CODES.INVALID_FILE_META,
    message:
      "An (FFFE,E000) Item declares a length reaching past the end of the bytes being read. The declared length is withheld; the byte offset locates the item.",
  },
  SQ_NESTING_DEPTH_EXCEEDED: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "SQ nesting depth exceeds {n}.",
  },
  INFLATED_PAYLOAD_EXCEEDS_CAP: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "Inflated Deflated TS payload exceeds {n}-byte cap.",
  },
  // `{zlib}` is a member of the nine-name `zlib.codes` table or nothing. zlib's
  // own `err.message` is never forwarded: it is a string from a library handed
  // the sender's bytes, which is the one shape of third-party text this parser
  // cannot vouch for.
  INFLATE_FAILED: {
    code: FATAL_CODES.INVALID_FILE_META,
    message: "Failed to inflate Deflated TS payload (zlib error code: {zlib}).",
  },
} as const satisfies Readonly<Record<string, FatalMessageEntry>>);

/**
 * The substitutions a registry template may take.
 *
 * **There is no `tag` field, no wire-length field and no field for a count
 * measured over the bytes being read, and that is the design.** `renderTag` in
 * `./warnings.ts` is a membership test against PS3.6's registry now, and it
 * would refuse a fabricated tag - but a Tier-3 fatal is raised where the
 * structure has already failed, so the absence of the slot is the bound that
 * does not depend on a table. A **wire length** has no such test available at
 * all, in either registry, and neither has a number derived from one: a count of
 * the bytes left in the buffer is the enclosing frame's own declared length less
 * an offset the same message publishes, wherever that frame is a slice. Every
 * field below is either a constant this library or its caller chose, or a token
 * checked for membership in a closed table before it is rendered.
 *
 * @internal
 */
interface FatalTokens {
  /** A VR, checked against the closed 34-VR set before rendering. */
  readonly vr?: VR;
  /** A Transfer Syntax UID, rendered as the PS3.6 registry's name for it. */
  readonly ts?: string;
  /** A zlib error code, checked against `zlib.codes` before rendering. */
  readonly zlib?: string;
  /** A library constant, or a cap the caller passed in. Never a count over the document. */
  readonly n?: number;
}

/**
 * Render the Transfer Syntax token.
 *
 * The `(0002,0010)` value is a `UI` a sender authored, and this token's only
 * message fires precisely when it is **not** one of the four this build
 * supports, so the UID itself is never printed. What is printed comes from a
 * closed set the parser controls: PS3.6's own name for the UID when the
 * generated registry publishes one, so `JPEG Baseline (Process 1)` still reads
 * usefully, and a fixed phrase when it does not.
 */
function renderTransferSyntax(ts: string | undefined): string {
  if (ts === undefined) return "The Transfer Syntax UID";
  const name = dictionaryUid(ts)?.name ?? "";
  return name.length > 0 ? `Transfer Syntax ${name}` : "The Transfer Syntax UID";
}

/**
 * Render the zlib token. zlib's `code` is drawn from a nine-name table, and a
 * membership test is what makes that a property of the code rather than a
 * property of a comment.
 */
function renderZlibCode(code: string | undefined): string {
  return code !== undefined && ZLIB_CODES.has(code) ? code : WITHHELD;
}

/**
 * The single construction point for every Tier-3 fatal: look the entry up in
 * {@link FATAL_MESSAGES} and substitute only checked structural tokens.
 *
 * @internal
 */
function build(
  key: FatalMessageKey,
  byteOffset: number,
  snippet: string,
  tokens: FatalTokens = {},
): DicomParseError {
  const entry: FatalMessageEntry = FATAL_MESSAGES[key];
  const message = entry.message
    .replace("{vr}", renderVr(tokens.vr))
    .replace("{ts}", renderTransferSyntax(tokens.ts))
    .replace("{zlib}", renderZlibCode(tokens.zlib))
    .replace("{n}", String(tokens.n ?? 0));
  return new DicomParseError(entry.code, message, byteOffset, snippet);
}

/**
 * Build a fatal whose snippet is cut from `buffer` at `offset`, which is the
 * shape every fatal but the two `EMPTY_INPUT` forms takes.
 */
function at(
  key: FatalMessageKey,
  buffer: Buffer,
  offset: number,
  tokens: FatalTokens = {},
): DicomParseError {
  return build(key, offset, buildSnippet(buffer, offset), tokens);
}

// ---------------------------------------------------------------------------
// Factories. One per key, and the signature is the bound: none of them accepts
// a tag, and none accepts a length field read off the wire.
// ---------------------------------------------------------------------------

/**
 * `EMPTY_INPUT` for a caller-supplied buffer of length zero, before
 * normalization. There is no buffer to cut a snippet from, so it is empty.
 *
 * @example
 * ```ts
 * throw emptyInput();
 * ```
 */
export function emptyInput(): DicomParseError {
  return build("EMPTY_INPUT", 0, "");
}

/**
 * `EMPTY_INPUT` for a view that normalizes to zero bytes (D-13's second half).
 *
 * @example
 * ```ts
 * throw emptyInputAfterNormalization();
 * ```
 */
export function emptyInputAfterNormalization(): DicomParseError {
  return build("EMPTY_INPUT_AFTER_NORMALIZATION", 0, "");
}

/**
 * `NOT_DICOM_PART_10` under `stripPreamble: "require"`, where the absence of
 * `DICM` at offset 128 is refused rather than tolerated (D-14).
 *
 * @example
 * ```ts
 * throw notDicomPart10Required(buffer, 0);
 * ```
 */
export function notDicomPart10Required(buffer: Buffer, offset: number): DicomParseError {
  return at("NOT_DICOM_PART_10_REQUIRED", buffer, offset);
}

/**
 * `NOT_DICOM_PART_10` after the tolerant path also failed to find a bare File
 * Meta group at offset 0.
 *
 * @example
 * ```ts
 * throw notDicomPart10(buffer, 0);
 * ```
 */
export function notDicomPart10(buffer: Buffer, offset: number): DicomParseError {
  return at("NOT_DICOM_PART_10", buffer, offset);
}

/**
 * `UNSUPPORTED_TRANSFER_SYNTAX` for a `(0002,0010)` value outside the four this
 * build registers.
 *
 * @remarks
 * The UID is a parameter and is **not** printed: `renderTransferSyntax` replaces
 * it with the PS3.6 registry's name for it, or with a fixed phrase. The snippet
 * follows the same rule and keeps the behaviour every released version has: the
 * registry name when there is one, and 16 raw bytes at `offset` when there is
 * not. **That makes this the one fatal whose `snippet` may not be hex**, which
 * is worth knowing before writing code that parses it.
 *
 * @example
 * ```ts
 * throw unsupportedTransferSyntax(buffer, fileMetaEnd, "1.2.840.10008.1.2.4.50");
 * ```
 */
export function unsupportedTransferSyntax(
  buffer: Buffer,
  offset: number,
  ts: string,
): DicomParseError {
  const name = dictionaryUid(ts)?.name ?? "";
  return build(
    "UNSUPPORTED_TRANSFER_SYNTAX",
    offset,
    name.length > 0 ? name : buildSnippet(buffer, offset),
    { ts },
  );
}

/**
 * `INVALID_FILE_META` for a File Meta group cut short mid-element.
 *
 * @example
 * ```ts
 * throw fileMetaTruncated(buffer, fmStart);
 * ```
 */
export function fileMetaTruncated(buffer: Buffer, offset: number): DicomParseError {
  return at("FILE_META_TRUNCATED", buffer, offset);
}

/**
 * `INVALID_FILE_META` for a `(0002,0000)` group length declaring more bytes than
 * the input holds.
 *
 * @remarks
 * **The declared length is bound out of this signature**: it is four document
 * bytes read as a 32-bit integer, on the one element whose job is to say how
 * long the group is, raised exactly when those bytes are not what they claim.
 *
 * **So is the count of bytes left in the buffer, which this message printed
 * through `0.0.14`.** File Meta is read at the root today, where that count is
 * the caller's own input less a cursor and leaks nothing - but that is a fact
 * about the one call site, not about the factory, and the sibling that shares
 * the expression is raised inside a Sequence Item's slice where the same
 * subtraction publishes the Item's declared length. A bound that holds only
 * where a function happens to be called from is the shape this module exists to
 * refuse, so the slot is gone rather than conditioned.
 *
 * @example
 * ```ts
 * throw fileMetaGroupLengthOverruns(buffer, fmStart);
 * ```
 */
export function fileMetaGroupLengthOverruns(buffer: Buffer, offset: number): DicomParseError {
  return at("FILE_META_GROUP_LENGTH_OVERRUNS", buffer, offset);
}

/**
 * `INVALID_FILE_META` when the group carries no usable `(0002,0010)`.
 *
 * @example
 * ```ts
 * throw fileMetaTransferSyntaxMissing(buffer, fmStart);
 * ```
 */
export function fileMetaTransferSyntaxMissing(buffer: Buffer, offset: number): DicomParseError {
  return at("FILE_META_TRANSFER_SYNTAX_MISSING", buffer, offset);
}

/**
 * `INVALID_FILE_META` for a Data Set element header read past the buffer end.
 * Raised by both the Explicit and the Implicit element loops.
 *
 * @example
 * ```ts
 * throw truncatedDatasetHeader(buffer, headerStart);
 * ```
 */
export function truncatedDatasetHeader(buffer: Buffer, offset: number): DicomParseError {
  return at("TRUNCATED_DATASET_HEADER", buffer, offset);
}

/**
 * `INVALID_FILE_META` for an `(FFFE,xxxx)` header read past the buffer end.
 *
 * @example
 * ```ts
 * throw truncatedFffeHeader(buffer, headerStart);
 * ```
 */
export function truncatedFffeHeader(buffer: Buffer, offset: number): DicomParseError {
  return at("TRUNCATED_FFFE_HEADER", buffer, offset);
}

/**
 * `INVALID_FILE_META` for an Explicit VR element header read past the buffer end.
 *
 * @example
 * ```ts
 * throw truncatedExplicitVrHeader(buffer, headerStart);
 * ```
 */
export function truncatedExplicitVrHeader(buffer: Buffer, offset: number): DicomParseError {
  return at("TRUNCATED_EXPLICIT_VR_HEADER", buffer, offset);
}

/**
 * `INVALID_FILE_META` for an SQ item header read past the buffer end.
 *
 * @example
 * ```ts
 * throw sqItemHeaderTruncated(buffer, itemHeaderStart);
 * ```
 */
export function sqItemHeaderTruncated(buffer: Buffer, offset: number): DicomParseError {
  return at("SQ_ITEM_HEADER_TRUNCATED", buffer, offset);
}

/**
 * `INVALID_FILE_META` for a delimitation item at Data Set level under Explicit VR.
 *
 * @remarks
 * **The marker's element number and its length field are bound out of this
 * signature and must not come back.** Measured on `"MR BRAIN SMITHSON "`: the
 * old message printed `length=1109414477`, which is `"MR B"` in wire order and
 * reverses with one `readUInt32LE`. The four-byte group check that reaches this
 * branch constrains only the group half.
 *
 * @example
 * ```ts
 * throw unexpectedFffeAtDatasetLevel(buffer, headerStart);
 * ```
 */
export function unexpectedFffeAtDatasetLevel(buffer: Buffer, offset: number): DicomParseError {
  return at("UNEXPECTED_FFFE_AT_DATASET_LEVEL", buffer, offset);
}

/**
 * `INVALID_FILE_META` for a delimitation item at Data Set level under Implicit
 * VR LE, which has no length field in the message to withhold because the
 * Implicit loop never read one before refusing.
 *
 * @example
 * ```ts
 * throw unexpectedFffeAtDatasetRoot(buffer, headerStart);
 * ```
 */
export function unexpectedFffeAtDatasetRoot(buffer: Buffer, offset: number): DicomParseError {
  return at("UNEXPECTED_FFFE_AT_DATASET_ROOT", buffer, offset);
}

/**
 * `INVALID_FILE_META` for undefined length on a VR that may not carry it under
 * Explicit VR.
 *
 * @remarks
 * The tag is bound out; the VR is not. Under Explicit VR those two bytes are a
 * sender's, so they are checked against the closed 34-VR set by `renderVr` and
 * render as `<withheld>` when they miss it. `renderTag` enforces the same kind
 * of bound in `./warnings.ts` against PS3.6's registry; the tag has no slot here
 * because a Tier-3 fatal fires where the structure has already failed, so the
 * bound that does not depend on a table is the one to take.
 *
 * @example
 * ```ts
 * throw undefinedLengthOnNonSqExplicit(buffer, headerStart, "LO");
 * ```
 */
export function undefinedLengthOnNonSqExplicit(
  buffer: Buffer,
  offset: number,
  vr: VR,
): DicomParseError {
  return at("UNDEFINED_LENGTH_ON_NON_SQ_EXPLICIT", buffer, offset, { vr });
}

/**
 * `INVALID_FILE_META` for undefined length on a VR that may not carry it under
 * Implicit VR LE, after the CP-246 descent failed.
 *
 * @remarks
 * The VR here is *resolved* by `resolveImplicitVR` from PS3.6 or from the active
 * profile rather than read off the wire, so it was already a closed-set value
 * before `renderVr` saw it. The message says "resolved to" for that reason: the
 * sender wrote no VR at all.
 *
 * @example
 * ```ts
 * throw undefinedLengthOnNonSqImplicit(buffer, headerStart, "UN");
 * ```
 */
export function undefinedLengthOnNonSqImplicit(
  buffer: Buffer,
  offset: number,
  vr: VR,
): DicomParseError {
  return at("UNDEFINED_LENGTH_ON_NON_SQ_IMPLICIT", buffer, offset, { vr });
}

/**
 * `INVALID_FILE_META` for a Value Length reaching past the end of the bytes
 * being read. Raised by both the Explicit and the Implicit element loops.
 *
 * @remarks
 * **🛑 THE TAG AND THE DECLARED LENGTH ARE BOUND OUT OF THIS SIGNATURE AND MUST
 * NOT COME BACK.** This is the highest-yield of the four measured leaks, because
 * it printed *both*: on `"MR BRAIN SMITHSON "` under Explicit VR LE at
 * under-declare delta `-14` the message read
 * `Element 41524E49 declared length=1330858068`, which is `"RAIN"` followed by
 * `"THSO"` - eight consecutive bytes of the payload, in two fields, each
 * reversible with a single typed read. Identical remedy and reasoning to
 * `nonzeroReservedBytes`, `itemCrossesSequenceEnd` and `duplicateTagInDataSet`.
 *
 * **🛑 AND SO IS THE COUNT OF BYTES LEFT IN THE BUFFER, WHICH THIS MESSAGE
 * PRINTED THROUGH `0.0.14`.** It was `buffer.length - cursor.position`, and both
 * loops raise this fatal inside a defined-length Sequence Item as well as at the
 * root. Inside one the buffer *is* the Item's slice, so the count is the Item's
 * own 32-bit declared length less a `cursor.position` the message publishes as
 * `byteOffset` plus the header just read. Measured on `"MR BRAIN SMITHSON "`
 * with a planted Item Length of `21320` (`"HS\0\0"`): `21312` first in the Item,
 * `21288` behind one 24-byte element, `21272` behind one 40-byte element - **a
 * variable shift**, which is why the bound is the signature and not a filter.
 *
 * @example
 * ```ts
 * throw elementLengthExceedsBuffer(buffer, headerStart);
 * ```
 */
export function elementLengthExceedsBuffer(buffer: Buffer, offset: number): DicomParseError {
  return at("ELEMENT_LENGTH_EXCEEDS_BUFFER", buffer, offset);
}

/**
 * `INVALID_FILE_META` for a tag inside a sequence that is neither Item nor
 * Sequence Delimitation Item.
 *
 * @remarks
 * **The tag is bound out of this signature.** The ordinary way this fires is a
 * value being read as an item stream, so its four tag bytes are document
 * content: measured at `524D4220`, `"MR B"`.
 *
 * @example
 * ```ts
 * throw unexpectedTagInsideSequence(buffer, itemHeaderStart);
 * ```
 */
export function unexpectedTagInsideSequence(buffer: Buffer, offset: number): DicomParseError {
  return at("UNEXPECTED_TAG_INSIDE_SEQUENCE", buffer, offset);
}

/**
 * `INVALID_FILE_META` for an encapsulated Pixel Data fragment whose declared
 * length reaches past the buffer.
 *
 * @example
 * ```ts
 * throw encapsulatedFragmentExceedsBuffer(buffer, itemHeaderStart);
 * ```
 */
export function encapsulatedFragmentExceedsBuffer(buffer: Buffer, offset: number): DicomParseError {
  return at("ENCAPSULATED_FRAGMENT_EXCEEDS_BUFFER", buffer, offset);
}

/**
 * `INVALID_FILE_META` for an Item whose declared length reaches past the buffer.
 *
 * @remarks
 * **The Item's declared length is bound out of this signature**, matching
 * `itemCrossesSequenceEnd`, which paid a blocker for the same slot. Measured:
 * `Item length=1109414477`, `"MR B"`.
 *
 * @example
 * ```ts
 * throw itemLengthExceedsBuffer(buffer, itemHeaderStart);
 * ```
 */
export function itemLengthExceedsBuffer(buffer: Buffer, offset: number): DicomParseError {
  return at("ITEM_LENGTH_EXCEEDS_BUFFER", buffer, offset);
}

/**
 * `INVALID_FILE_META` for a sequence nested past `NESTING_DEPTH_LIMIT`.
 *
 * @remarks
 * `limit` is this library's own bound and not PS3.5's, which sets none. Never
 * describe a conformant file that exceeds it as mis-encoded.
 *
 * @example
 * ```ts
 * throw sqNestingDepthExceeded(buffer, valueStart, 64);
 * ```
 */
export function sqNestingDepthExceeded(
  buffer: Buffer,
  offset: number,
  limit: number,
): DicomParseError {
  return at("SQ_NESTING_DEPTH_EXCEEDED", buffer, offset, { n: limit });
}

/**
 * `INVALID_FILE_META` for a Deflated payload that inflates past the cap.
 *
 * @example
 * ```ts
 * throw inflatedPayloadExceedsCap(buffer, datasetStart, 268435456);
 * ```
 */
export function inflatedPayloadExceedsCap(
  buffer: Buffer,
  offset: number,
  cap: number,
): DicomParseError {
  return at("INFLATED_PAYLOAD_EXCEEDS_CAP", buffer, offset, { n: cap });
}

/**
 * `INVALID_FILE_META` for a Deflated payload zlib refused.
 *
 * @remarks
 * `code` is zlib's `err.code`, and it is rendered only when it names one of the
 * nine entries in `zlib.codes`. zlib's `err.message` is never forwarded at all.
 *
 * @example
 * ```ts
 * throw inflateFailed(buffer, datasetStart, "Z_DATA_ERROR");
 * ```
 */
export function inflateFailed(
  buffer: Buffer,
  offset: number,
  code: string | undefined,
): DicomParseError {
  return at("INFLATE_FAILED", buffer, offset, ...(code !== undefined ? [{ zlib: code }] : []));
}

/**
 * The registry, for the tests that prove every thrown message is one of its
 * entries with structural tokens filled in.
 *
 * @internal
 */
export { FATAL_MESSAGES, ZLIB_CODES, SUPPORTED_TRANSFER_SYNTAXES };
