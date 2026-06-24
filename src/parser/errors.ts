/**
 * Fatal error taxonomy for the `@cosyte/dicom` parser pipeline.
 *
 * Phase 2 core-parser context:
 *   - D-09 — `FATAL_CODES` is a frozen `as const` registry with EXACTLY
 *     four codes; anything less severe MUST be a Tier-2 warning.
 *   - D-10 — `DicomParseError` carries `code`, `byteOffset`, `snippet`
 *     (up to 16 source bytes, space-separated lowercase hex), and an
 *     optional `contextPath`. The thrown `Error.message` is formatted
 *     `[CODE] msg (offset=N)` with `… in path/segments` appended when
 *     `contextPath` is provided.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

/**
 * Stable string codes for every Tier-3 fatal the parser may throw.
 *
 * Locked at four codes per `PROJECT.md` "Fatal errors only for unrecoverable
 * structural corruption": anything less severe MUST be a Tier-2 warning
 * (see `./warnings.ts`). Consumers narrow on `err.code` to react to
 * specific structural failures.
 *
 * @example
 * ```ts
 * import { parseDicom, FATAL_CODES, DicomParseError } from "@cosyte/dicom";
 * try {
 *   parseDicom(Buffer.alloc(0));
 * } catch (err) {
 *   if (err instanceof DicomParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
 *     // handle empty input
 *   }
 * }
 * ```
 */
export const FATAL_CODES = {
  NOT_DICOM_PART_10: "NOT_DICOM_PART_10",
  INVALID_FILE_META: "INVALID_FILE_META",
  UNSUPPORTED_TRANSFER_SYNTAX: "UNSUPPORTED_TRANSFER_SYNTAX",
  EMPTY_INPUT: "EMPTY_INPUT",
} as const;

/**
 * Discriminant type for `DicomParseError.code`. Narrowing a caught error
 * by this code lets consumers write exhaustive `switch` blocks (enabled
 * by the `switch-exhaustiveness-check` lint rule) and guarantees a
 * typo-free comparison against the `FATAL_CODES` registry.
 *
 * @example
 * ```ts
 * import type { FatalCode } from "@cosyte/dicom";
 * function describe(code: FatalCode): string {
 *   switch (code) {
 *     case "EMPTY_INPUT":
 *       return "input was empty";
 *     case "NOT_DICOM_PART_10":
 *       return "input is not a DICOM Part 10 file";
 *     case "INVALID_FILE_META":
 *       return "File Meta group is missing or malformed";
 *     case "UNSUPPORTED_TRANSFER_SYNTAX":
 *       return "Transfer Syntax UID is not supported by v1";
 *   }
 * }
 * ```
 */
export type FatalCode = (typeof FATAL_CODES)[keyof typeof FATAL_CODES];

/**
 * Thrown by `parseDicom` when the input violates one of the four
 * unrecoverable Tier-3 structural rules — or, under `{ strict: true }`,
 * when any Tier-2 warning is escalated through the single `emit`
 * chokepoint (D-35). Carries byte-offset positional context plus a short
 * source snippet so consumers can log actionable errors.
 *
 * Message format: `[CODE] msg (offset=N)`, with `… in a/b/c` appended
 * when `contextPath` is provided.
 *
 * @remarks
 * Snippets may contain PHI when parsing real clinical files — redact at
 * the call site if required by your compliance posture. The library does
 * not redact snippets itself.
 *
 * @example
 * ```ts
 * import { parseDicom, DicomParseError } from "@cosyte/dicom";
 * try {
 *   parseDicom(buffer);
 * } catch (err) {
 *   if (err instanceof DicomParseError && err.code === "NOT_DICOM_PART_10") {
 *     // err.byteOffset, err.snippet, err.contextPath all available
 *   }
 * }
 * ```
 */
export class DicomParseError extends Error {
  public readonly code: FatalCode;
  public readonly byteOffset: number;
  public readonly snippet: string;
  public readonly contextPath: readonly string[] | undefined;

  /**
   * Construct a new `DicomParseError`. All fields except `contextPath` are
   * required so every thrower populates positional context per `TOL-02`.
   *
   * @internal
   */
  public constructor(
    code: FatalCode,
    message: string,
    byteOffset: number,
    snippet: string,
    contextPath?: readonly string[],
  ) {
    const formatted =
      `[${code}] ${message} (offset=${String(byteOffset)})` +
      (contextPath !== undefined && contextPath.length > 0 ? ` … in ${contextPath.join("/")}` : "");
    super(formatted);
    this.name = "DicomParseError";
    this.code = code;
    this.byteOffset = byteOffset;
    this.snippet = snippet;
    this.contextPath = contextPath;
  }
}

/**
 * Build a 16-byte hex snippet from `buffer` starting at `offset`. Returns
 * an empty string when the offset is out of range; otherwise returns up
 * to 16 bytes rendered as space-separated lowercase 2-char hex.
 *
 * Used by the strict-mode escalation chokepoint to attach a short source
 * snippet to every thrown `DicomParseError` (D-10, D-35).
 *
 * @example
 * ```ts
 * import { Buffer } from "node:buffer";
 * import { buildSnippet } from "@cosyte/dicom";
 * buildSnippet(Buffer.from([0x44, 0x49, 0x43, 0x4d]), 0);
 * // → "44 49 43 4d"
 * ```
 */
export function buildSnippet(buffer: Buffer, offset: number): string {
  if (offset < 0 || offset >= buffer.length) return "";
  const end = Math.min(offset + 16, buffer.length);
  const slice = buffer.subarray(offset, end);
  const parts: string[] = [];
  for (const b of slice) {
    parts.push(b.toString(16).padStart(2, "0"));
  }
  return parts.join(" ");
}
