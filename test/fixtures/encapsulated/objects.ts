import { Buffer } from "node:buffer";

import {
  buildDicom,
  encodeBuiltElement,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../../helpers/build-dicom.js";

/**
 * Synthetic encapsulated Pixel Data objects for the PS3.5 2026c section A.4 tests, and synthetic
 * JPIP Referenced objects for the sections A.6, A.7, A.11 and A.12 tests, built the way every
 * fixture in this repository is built: from a `.ts` spec, which `pnpm phi-scan` reads as part of
 * the `test/` corpus. Every value is fabricated: the patient is the declared-synthetic `DOE^JANE`,
 * the identifier `MRN-42` is invented, the study date is the placeholder 1900-01-01, every UID sits
 * under the `1.2.826.0.1.3680043.8.498` example root, every fragment is a fixed fill byte rather
 * than an encoded image, so no fixture here is a codestream of any kind, and every Pixel Data
 * Provider URL is an invented path on the loopback address `127.0.0.1`, which names no real image
 * server.
 *
 * The CONFORMANT encapsulated fixture is the section A.4 shape: an Explicit VR Little Endian Data
 * Set carrying the identity, geometry and modality elements, then top-level `(7FE0,0010)` `OB` of
 * undefined length holding a zero-length Basic Offset Table Item, one or more even-length fragment
 * Items, and a zero-length Sequence Delimitation Item. Its EXPLICIT-LE TWIN is the byte-identical
 * Data Set with `(0002,0010)` set to Explicit VR Little Endian instead.
 *
 * The CONFORMANT JPIP fixture is the section A.6 shape: the same identity, geometry and modality
 * elements, then Pixel Data Provider URL `(0028,7FE0)` `UR`, and no Pixel Data at all. Under the
 * two Deflate syntaxes (sections A.7 and A.12) that same Explicit VR LE Data Set is raw-deflated
 * after the uncompressed File Meta.
 */
const ascii = (text: string): Buffer => Buffer.from(text, "ascii");
const us = (n: number): Buffer => Buffer.from([n & 0xff, (n >> 8) & 0xff]);

export const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
export const PATIENT_NAME = "DOE^JANE";
export const PATIENT_ID = "MRN-42";
export const STUDY_INSTANCE_UID = "1.2.826.0.1.3680043.8.498.2.1";
export const SERIES_INSTANCE_UID = "1.2.826.0.1.3680043.8.498.2.2";
export const MODALITY = "CT";
export const ROWS = 64;
export const COLUMNS = 64;
export const BITS_ALLOCATED = 8;
export const PHOTOMETRIC_INTERPRETATION = "MONOCHROME2";

/** The one fragment the default conformant fixture carries: a fixed fill, 16 bytes. */
export const DEFAULT_FRAGMENT: Buffer = Buffer.alloc(16, 0xa5);

/** Options for {@link encapsulatedObject}. */
export interface EncapsulatedObjectOptions {
  /** `(0002,0010)`. The Data Set is written as Explicit VR Little Endian whatever it is. */
  readonly transferSyntax: string;
  /**
   * The Item Values of `(7FE0,0010)`, the Basic Offset Table first. Defaults to an empty Basic
   * Offset Table and {@link DEFAULT_FRAGMENT}.
   */
  readonly items?: readonly Buffer[];
  /** `(0028,0301)` Burned In Annotation. Omitted by default. */
  readonly burnedInAnnotation?: "YES" | "NO";
  /** Malformed-fixture knob: omit the Sequence Delimitation Item after the last Item. */
  readonly omitSequenceDelim?: boolean;
  /** Malformed-fixture knob: add `delta` to the length written into Item `index`'s header. */
  readonly fragmentDeclaredLengthDelta?: { readonly index: number; readonly delta: number };
  /** Bytes appended after the last element, inside the Pixel Data Item stream when it is open. */
  readonly trailingBytes?: Buffer;
  /**
   * Replace the encapsulated `(7FE0,0010)` with these elements (or none) instead. Pass
   * {@link pixelData}'s element among them to keep the fragment stream beside another element,
   * such as an Icon Image Sequence or Float Pixel Data.
   */
  readonly pixelDataElements?: readonly (BuildDicomElement | BuildDicomSqElement)[];
}

/** The identity, geometry and modality elements, in ascending tag order. */
function identityElements(burnedInAnnotation?: "YES" | "NO"): BuildDicomElement[] {
  return [
    { tag: "00080016", vr: "UI", value: ascii("1.2.840.10008.5.1.4.1.1.2\0") },
    { tag: "00080018", vr: "UI", value: ascii("1.2.826.0.1.3680043.8.498.211\0") },
    { tag: "00080020", vr: "DA", value: ascii("19000101") },
    { tag: "00080060", vr: "CS", value: ascii(MODALITY) },
    { tag: "00100010", vr: "PN", value: ascii(PATIENT_NAME) },
    { tag: "00100020", vr: "LO", value: ascii(PATIENT_ID) },
    { tag: "0020000D", vr: "UI", value: ascii(`${STUDY_INSTANCE_UID}\0`) },
    { tag: "0020000E", vr: "UI", value: ascii(`${SERIES_INSTANCE_UID}\0`) },
    { tag: "00280002", vr: "US", value: us(1) },
    { tag: "00280004", vr: "CS", value: ascii(`${PHOTOMETRIC_INTERPRETATION} `) },
    { tag: "00280010", vr: "US", value: us(ROWS) },
    { tag: "00280011", vr: "US", value: us(COLUMNS) },
    { tag: "00280100", vr: "US", value: us(BITS_ALLOCATED) },
    { tag: "00280101", vr: "US", value: us(8) },
    { tag: "00280102", vr: "US", value: us(7) },
    { tag: "00280103", vr: "US", value: us(0) },
    // CS pads to even length with a trailing SPACE: "YES " and "NO".
    ...(burnedInAnnotation === undefined
      ? []
      : [
          {
            tag: "00280301",
            vr: "CS" as const,
            value: ascii(burnedInAnnotation === "YES" ? "YES " : "NO"),
          },
        ]),
  ];
}

/** The top-level encapsulated `(7FE0,0010)` element for {@link encapsulatedObject}. */
export function pixelData(opts: EncapsulatedObjectOptions): BuildDicomSqElement {
  return {
    tag: "7FE00010",
    undefinedLength: true,
    encapsulatedPixelData: true,
    encapsulatedFragments: opts.items ?? [Buffer.alloc(0), DEFAULT_FRAGMENT],
    items: [],
    ...(opts.omitSequenceDelim === true ? { omitSequenceDelim: true } : {}),
    ...(opts.fragmentDeclaredLengthDelta !== undefined
      ? { fragmentDeclaredLengthDelta: opts.fragmentDeclaredLengthDelta }
      : {}),
  };
}

/** Build an encapsulated object; with no malformed-fixture knob set, the conformant fixture. */
export function encapsulatedObject(opts: EncapsulatedObjectOptions): Buffer {
  const pixels = opts.pixelDataElements ?? [pixelData(opts)];
  return buildDicom({
    transferSyntax: opts.transferSyntax,
    elements: [...identityElements(opts.burnedInAnnotation), ...pixels],
    ...(opts.trailingBytes !== undefined ? { trailingBytes: opts.trailingBytes } : {}),
  });
}

/** The same object as {@link encapsulatedObject}, with `(0002,0010)` set to Explicit VR LE. */
export function explicitLeTwin(opts: EncapsulatedObjectOptions): Buffer {
  return encapsulatedObject({ ...opts, transferSyntax: TS_EXPLICIT_LE });
}

/** Pixel Data Provider URL, `(0028,7FE0)`, VR `UR`. */
export const PIXEL_DATA_PROVIDER_URL_TAG = "00287FE0";

/**
 * A synthetic Pixel Data Provider URL on `origin`: a path, a query string carrying `?`, `&` and
 * `=`, and a `%`-escape.
 */
export function providerUrl(origin = "http://127.0.0.1:9"): string {
  return `${origin}/jpip/provider-canary/frame%2F1?target=series-canary&fsiz=64,64&type=jpp-stream`;
}

/**
 * The default URL a JPIP fixture carries, on the discard port of the loopback address. Its length
 * is odd, so its Value Field carries one byte of `UR` padding.
 */
export const DEFAULT_PROVIDER_URL = providerUrl();

/**
 * The Value Field a fixture writes for `url` under `UR`: the ASCII text, padded to even length with
 * one trailing SPACE, which PS3.5 2026c Table 6.2-1 says is to be ignored.
 */
export function urValueField(url: string): Buffer {
  const text = ascii(url);
  return text.length % 2 === 0 ? text : Buffer.concat([text, ascii(" ")]);
}

/** Options for {@link jpipObject}. */
export interface JpipObjectOptions {
  /** `(0002,0010)`. The Data Set is Explicit VR Little Endian, deflated for the Deflate pair. */
  readonly transferSyntax: string;
  /** The `(0028,7FE0)` text. Defaults to {@link DEFAULT_PROVIDER_URL}. */
  readonly url?: string;
  /** Omit `(0028,7FE0)` altogether. */
  readonly omitUrl?: boolean;
  /**
   * Add a top-level native Pixel Data `(7FE0,0010)` `OB`, one fill byte per pixel, which section
   * A.6 says shall not be present.
   */
  readonly withPixelData?: boolean;
}

/** The elements that follow the identity group in a JPIP fixture: the URL and any Pixel Data. */
function jpipTrailingElements(
  opts: Omit<JpipObjectOptions, "transferSyntax">,
): BuildDicomElement[] {
  return [
    ...(opts.omitUrl === true
      ? []
      : [
          {
            tag: PIXEL_DATA_PROVIDER_URL_TAG,
            vr: "UR" as const,
            value: urValueField(opts.url ?? DEFAULT_PROVIDER_URL),
          },
        ]),
    ...(opts.withPixelData === true
      ? [{ tag: "7FE00010", vr: "OB" as const, value: Buffer.alloc(ROWS * COLUMNS, 0x5a) }]
      : []),
  ];
}

/** Build a JPIP Referenced object; with no knob set, the conformant section A.6 fixture. */
export function jpipObject(opts: JpipObjectOptions): Buffer {
  return encapsulatedObject({
    transferSyntax: opts.transferSyntax,
    pixelDataElements: jpipTrailingElements(opts),
  });
}

/** The same object as {@link jpipObject}, with `(0002,0010)` set to Explicit VR LE. */
export function jpipExplicitLeTwin(opts: JpipObjectOptions): Buffer {
  return jpipObject({ ...opts, transferSyntax: TS_EXPLICIT_LE });
}

/**
 * The Explicit VR Little Endian Data Set bytes of {@link jpipObject}: what follows File Meta under
 * sections A.6 and A.11, and what sections A.7 and A.12 raw-deflate.
 */
export function jpipDataSet(opts: Omit<JpipObjectOptions, "transferSyntax">): Buffer {
  const elements = [...identityElements(), ...jpipTrailingElements(opts)];
  return Buffer.concat(elements.map((el) => encodeBuiltElement(el, TS_EXPLICIT_LE)));
}

/**
 * A JPIP object whose Data Set bytes after File Meta are `dataSetBytes`, exactly: for the Deflate
 * pair's malformed-stream fixtures.
 */
export function jpipObjectWithDataSetBytes(transferSyntax: string, dataSetBytes: Buffer): Buffer {
  return buildDicom({ transferSyntax, elements: [], dataSetBytes });
}
