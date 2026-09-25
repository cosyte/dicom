/**
 * The four JPIP Referenced Transfer Syntaxes of PS3.5 2026c, in one leaf module
 * so the reader's dispatch table and `deidentify`'s refusal read the same list.
 *
 * PS3.5 2026c section A.6 (JPIP Referenced) and section A.11 (JPIP HTJ2K
 * Referenced) encode the whole Data Set as Explicit VR Little Endian; section
 * A.7 and section A.12 are the same Data Set compressed with the "Deflate"
 * algorithm of RFC 1951. None of the four carries Pixel Data: section A.6 says
 * Pixel Data "shall not be present, but rather integer Pixel Data shall be
 * referenced via Data Element (0028,7FE0) Pixel Data Provider URL".
 *
 * The UIDs are typed here and graded against the vendored PS3.5 by
 * `test/parser/transfer-syntax.test.ts`, which reads each of the four sections
 * out of the SHA-pinned DocBook by its `xml:id`.
 *
 * @module
 */

/**
 * Sections A.6 and A.11: the Data Set is Explicit VR Little Endian, read by the
 * Explicit VR LE reader.
 *
 * @internal
 */
export const JPIP_REFERENCED_EXPLICIT_LE_UIDS: readonly string[] = Object.freeze([
  "1.2.840.10008.1.2.4.94",
  "1.2.840.10008.1.2.4.204",
]);

/**
 * Sections A.7 and A.12: the section A.6 or A.11 Data Set, raw-deflated per
 * RFC 1951, read by the Deflated reader and so under its decompression cap.
 *
 * @internal
 */
export const JPIP_REFERENCED_DEFLATE_UIDS: readonly string[] = Object.freeze([
  "1.2.840.10008.1.2.4.95",
  "1.2.840.10008.1.2.4.205",
]);

/**
 * All four JPIP Referenced Transfer Syntax UIDs.
 *
 * @internal
 */
export const JPIP_REFERENCED_UIDS: readonly string[] = Object.freeze([
  ...JPIP_REFERENCED_EXPLICIT_LE_UIDS,
  ...JPIP_REFERENCED_DEFLATE_UIDS,
]);
