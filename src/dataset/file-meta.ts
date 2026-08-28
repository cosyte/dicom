/**
 * Phase 2 structural `FileMeta` view-object shape.
 *
 * Per `02-CONTEXT.md` D-04 + D-17 + FM-02: a plain interface (not a class)
 * since Phase 2 has no methods. Only `transferSyntaxUID` is required;
 * the rest are populated by `parseFileMeta` (plan 02-02) when present
 * but never enforced (Phase 7's `validate()` enforces FM Type-1 fields
 * per D-19). Phase 3 may promote to a class if helpers are added.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

import type { Tag, VR } from "../dictionary/types.js";

/**
 * A non-modeled `(0002,xxxx)` File Meta element, preserved verbatim so the
 * serializer can re-emit an exotic File Meta group byte-for-byte.
 *
 * The typed {@link FileMeta} fields cover the common Type-1/Type-3 elements;
 * anything else a source file carried - e.g. `(0002,0017)`/`(0002,0018)`
 * Sending/Receiving AE Title, `(0002,0100)` Private Information Creator UID,
 * `(0002,0102)` Private Information - is captured here as raw bytes (the
 * on-wire value, even-length per PS3.5 §6.2) rather than dropped. `value` is a
 * defensive copy, so the view never aliases the parsed input buffer.
 *
 * 🛑 **THE ROUND TRIP IS PARSE-THEN-SERIALIZE ONLY. `deidentify()` DROPS EVERY
 * ELEMENT THIS TYPE DESCRIBES**, and the exact examples above are why: a Sending
 * AE Title and a Private Information pair are the identity information PS3.15
 * §E.1.1 names. See {@link FileMeta.extraElements} for the whole carve-out.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * // Anything the typed FileMeta fields do not model, in ascending tag order.
 * for (const raw of ds.fileMeta?.extraElements ?? []) {
 *   raw.tag; // e.g. "00020017" Sending Application Entity Title
 *   raw.vr; // the VR the source wrote (File Meta is always Explicit VR LE)
 *   raw.value.length; // even, per PS3.5 2026c section 7.1.1
 * }
 * ```
 *
 * `(0002,0016)` Source Application Entity Title is deliberately NOT the example: it is one of the
 * typed fields, so it never reaches this array.
 */
export interface FileMetaRawElement {
  /** 8-char uppercase hex tag, e.g. `"00020100"`. */
  readonly tag: Tag;
  /** The element's Value Representation as read under Explicit VR LE. */
  readonly vr: VR;
  /** The raw on-wire value bytes (even-length), copied out of the input. */
  readonly value: Buffer;
}

/**
 * The Part-10 File Meta Information group, projected as a typed view
 * over `(0002,xxxx)` elements parsed during the File Meta pre-pass.
 *
 * Only `transferSyntaxUID` is required because it is the dispatch input
 * for the four v1 transfer-syntax parsers; everything else is optional
 * because real-world clinical files routinely omit one or more
 * Type-1 elements. Phase 7's `validate()` adds opinion-bearing checks
 * for those missing elements.
 *
 * @example
 * ```ts
 * import { parseDicom } from "@cosyte/dicom";
 * const ds = parseDicom(buf);
 * if (ds.fileMeta !== undefined) {
 *   const ts = ds.fileMeta.transferSyntaxUID; // always present when fileMeta is defined
 * }
 * ```
 */
export interface FileMeta {
  readonly transferSyntaxUID: string;
  readonly mediaStorageSOPClassUID?: string;
  readonly mediaStorageSOPInstanceUID?: string;
  readonly fileMetaInformationVersion?: Buffer;
  readonly implementationClassUID?: string;
  readonly implementationVersionName?: string;
  readonly sourceApplicationEntityTitle?: string;
  /**
   * Any `(0002,xxxx)` elements the source carried that the typed fields above
   * do not model, preserved in tag order so a round-trip re-emits the File Meta
   * group byte-for-byte. Omitted when the group held only modeled elements.
   *
   * ## 🛑 The byte-for-byte round trip does NOT hold for `deidentify()` output
   *
   * That promise is about **parse then serialize**, and it is scoped to it
   * deliberately rather than by omission. `deidentify()` rebuilds this group to
   * describe the de-identifying application instead of the source (PS3.15
   * §E.1.1: the File Meta Information "shall be replaced with a description of
   * the de-identifying application", because otherwise "identity information may
   * leak through unmodified File Meta Information ... includ[ing] information
   * regarding Application Entity Titles, Presentation Addresses, implementation
   * information, and private information"). So on the de-identify path this
   * array is **dropped in full** - not filtered, not sampled - and
   * `sourceApplicationEntityTitle` goes with it, while
   * `implementationClassUID` and `implementationVersionName` are replaced with
   * this library's own.
   *
   * The elements that survive are the ones that identify the **object** rather
   * than its sender: `fileMetaInformationVersion`, `mediaStorageSOPClassUID`,
   * `transferSyntaxUID`, and `mediaStorageSOPInstanceUID` (remapped unless
   * `RetainUIDs` is active). What was dropped is counted on the report
   * `deidentify()` returns, so a caller learns the fidelity loss from the run
   * rather than by diffing the bytes.
   *
   * A caller that needs the source group verbatim must read it off the
   * **parsed** dataset; it is not recoverable from de-identified output, and it
   * is not meant to be.
   */
  readonly extraElements?: readonly FileMetaRawElement[];
}
