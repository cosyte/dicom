/**
 * A synthetic image read from Implicit VR Little Endian and written again under Explicit VR Little
 * Endian and Explicit VR Big Endian, each element with the VR the reader gave it, keeps every
 * pixel, overlay, waveform and lookup table value.
 *
 * The transcode is the one any writer does: a value whose VR is a run of 16-bit words (OW, US, SS)
 * is byte-swapped for Big Endian, and an OB value is not. So the VR the reader gives an attribute
 * Implicit VR does not convey decides whether the value survives. The values are read back the
 * way PS3.5 lays them out: a 16-bit sample is a word in the transfer syntax's byte order; an 8-bit
 * sample is a byte of an OB value, or the low then the high byte of an OW word (section 8.1.1);
 * an overlay bit counts from the least significant bit of each byte or word (section 8.1.2).
 *
 * The images are drawn at 8 and 16 bits allocated, signed and unsigned, with a lookup table long
 * enough at times that an Explicit VR US cannot carry it. Every value is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Dataset } from "../../src/dataset/dataset.js";
import type { Element } from "../../src/dataset/element.js";
import type { Tag } from "../../src/dictionary/types.js";
import { parseDicom } from "../../src/parser/index.js";
import {
  type BuildDicomElement,
  type BuildDicomSqElement,
  buildDicom,
} from "../helpers/build-dicom.js";
import { checkProperty } from "../helpers/property.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";

type Built = BuildDicomElement | BuildDicomSqElement;

/** One synthetic image and the waveform and lookup tables beside it. */
interface Image {
  readonly bits: 8 | 16;
  readonly signed: boolean;
  readonly rows: number;
  readonly columns: number;
  readonly pixels: readonly number[];
  readonly overlay: readonly boolean[];
  readonly waveformBits: 8 | 16;
  readonly waveform: readonly number[];
  readonly channelMin: number;
  readonly channelMax: number;
  readonly palette: readonly number[];
  readonly lut: readonly number[];
}

const imageArb: fc.Arbitrary<Image> = fc
  .record({
    bits: fc.constantFrom<8 | 16>(8, 16),
    signed: fc.boolean(),
    rows: fc.integer({ min: 1, max: 9 }),
    columns: fc.integer({ min: 1, max: 9 }),
    waveformBits: fc.constantFrom<8 | 16>(8, 16),
    waveformLength: fc.integer({ min: 1, max: 40 }),
    paletteLength: fc.integer({ min: 1, max: 16 }),
    // Past 32,767 entries the table is longer than the 16-bit length of an Explicit VR US.
    lutLength: fc.oneof(fc.integer({ min: 1, max: 64 }), fc.integer({ min: 32768, max: 40000 })),
    seed: fc.integer(),
  })
  .chain((shape) => {
    const sample = shape.bits === 8 ? 0xff : 0xffff;
    const waveformSample = shape.waveformBits === 8 ? 0xff : 0xffff;
    const count = shape.rows * shape.columns;
    return fc.record({
      bits: fc.constant(shape.bits),
      signed: fc.constant(shape.signed),
      rows: fc.constant(shape.rows),
      columns: fc.constant(shape.columns),
      pixels: fc.array(fc.integer({ min: 0, max: sample }), { minLength: count, maxLength: count }),
      overlay: fc.array(fc.boolean(), { minLength: count, maxLength: count }),
      waveformBits: fc.constant(shape.waveformBits),
      waveform: fc.array(fc.integer({ min: 0, max: waveformSample }), {
        minLength: shape.waveformLength,
        maxLength: shape.waveformLength,
      }),
      channelMin: fc.integer({ min: 0, max: waveformSample }),
      channelMax: fc.integer({ min: 0, max: waveformSample }),
      palette: fc.array(fc.integer({ min: 0, max: 0xffff }), {
        minLength: shape.paletteLength,
        maxLength: shape.paletteLength,
      }),
      lut: fc.constant(lutOf(shape.lutLength, shape.seed)),
    });
  });

/** A lookup table of `length` entries drawn from `seed`, built directly so a long one is cheap. */
function lutOf(length: number, seed: number): number[] {
  const out = new Array<number>(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    out[i] = state >>> 16;
  }
  return out;
}

/** `samples` as Little Endian bytes at `bits` per sample, padded to an even length. */
function packed(samples: readonly number[], bits: 8 | 16): Buffer {
  if (bits === 16) {
    const buf = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => buf.writeUInt16LE(s, i * 2));
    return buf;
  }
  const buf = Buffer.alloc(samples.length + (samples.length % 2));
  samples.forEach((s, i) => buf.writeUInt8(s, i));
  return buf;
}

/** Overlay bits packed from the least significant bit of each byte (PS3.5 section 8.1.2). */
function packedBits(bits: readonly boolean[]): Buffer {
  const bytes = Math.ceil(bits.length / 8);
  const buf = Buffer.alloc(bytes + (bytes % 2));
  bits.forEach((on, i) => {
    if (on) buf[i >> 3] = (buf[i >> 3] ?? 0) | (1 << (i & 7));
  });
  return buf;
}

function u16(...values: number[]): Buffer {
  return packed(values, 16);
}

function leaf(tag: Tag, value: Buffer): BuildDicomElement {
  // Implicit VR writes no VR; the builder only needs one.
  return { tag, vr: "UN", value };
}

/** The image as an Implicit VR Little Endian file. */
function implicitFile(image: Image): Buffer {
  const pixelMin = image.signed ? toSigned(Math.min(...image.pixels), image.bits) : 0;
  const elements: Built[] = [
    leaf("00280002", u16(1)),
    leaf("00280010", u16(image.rows)),
    leaf("00280011", u16(image.columns)),
    leaf("00280100", u16(image.bits)),
    leaf("00280101", u16(image.bits)),
    leaf("00280102", u16(image.bits - 1)),
    leaf("00280103", u16(image.signed ? 1 : 0)),
    leaf("00280106", u16(pixelMin & 0xffff)),
    leaf("00281201", u16(...image.palette)),
    leaf("00281202", u16(...image.palette)),
    leaf("00281203", u16(...image.palette)),
    {
      tag: "00283000",
      items: [
        {
          elements: [
            leaf("00283002", u16(image.lut.length & 0xffff, 0, 16)),
            leaf("00283006", u16(...image.lut)),
          ],
        },
      ],
    },
    {
      tag: "54000100",
      items: [
        {
          elements: [
            {
              tag: "003A0200",
              items: [
                {
                  elements: [
                    leaf("54000110", packed([image.channelMin], image.waveformBits)),
                    leaf("54000112", packed([image.channelMax], image.waveformBits)),
                  ],
                },
              ],
            },
            leaf("54001004", u16(image.waveformBits)),
            leaf("54001010", packed(image.waveform, image.waveformBits)),
          ],
        },
      ],
    },
    leaf("60000010", u16(image.rows)),
    leaf("60000011", u16(image.columns)),
    leaf("60000100", u16(1)),
    leaf("60000102", u16(0)),
    leaf("60003000", packedBits(image.overlay)),
    leaf("7FE00010", packed(image.pixels, image.bits)),
  ];
  return buildDicom({ transferSyntax: TS_IMPLICIT_LE, elements });
}

/**
 * The Data Set as builder elements under its read VRs. An Implicit VR value is Little Endian, which
 * is what the builder takes; it swaps each value its VR makes a run of numbers for Big Endian.
 */
function asWritten(ds: Dataset): Built[] {
  return ds.elements().map((element): Built => {
    if (element.vr === "SQ") {
      return {
        tag: element.tag,
        items: (element.items ?? []).map((item) => ({ elements: asWritten(item) })),
      };
    }
    return { tag: element.tag, vr: element.vr, value: element.rawBytes };
  });
}

/** The value as 16-bit words in the transfer syntax's byte order, whatever its VR. */
function words(element: Element): number[] {
  const bytes = element.rawBytes;
  const out: number[] = [];
  for (let at = 0; at + 1 < bytes.length; at += 2) {
    out.push(element.littleEndian ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at));
  }
  return out;
}

/** The value's samples at `bits` each (PS3.5 section 8.1.1). */
function samples(element: Element, bits: 8 | 16): number[] {
  if (bits === 16) return words(element);
  if (element.vr === "OB") return [...element.rawBytes];
  return words(element).flatMap((w) => [w & 0xff, w >> 8]);
}

/** The overlay's bits, from the least significant bit of each byte or word (section 8.1.2). */
function overlayBits(element: Element): boolean[] {
  const units = element.vr === "OB" ? [...element.rawBytes] : words(element);
  const width = element.vr === "OB" ? 8 : 16;
  return units.flatMap((u) => Array.from({ length: width }, (_, i) => ((u >> i) & 1) === 1));
}

function toSigned(value: number, bits: 8 | 16): number {
  const top = 1 << (bits - 1);
  return value >= top ? value - 2 * top : value;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

/** Every value the image carries, read back from `ds` in whatever transfer syntax it was written. */
function valuesOf(ds: Dataset, image: Image): Record<string, unknown> {
  const count = image.rows * image.columns;
  const lutItem = required(ds.get("00283000")?.items?.[0], "Modality LUT Sequence Item");
  const waveform = required(ds.get("54000100")?.items?.[0], "Waveform Sequence Item");
  const channel = required(waveform.get("003A0200")?.items?.[0], "Channel Definition Item");
  const smallest = ds.get("00280106")?.value;
  return {
    pixels: samples(required(ds.get("7FE00010"), "Pixel Data"), image.bits).slice(0, count),
    overlay: overlayBits(required(ds.get("60003000"), "Overlay Data")).slice(0, count),
    waveform: samples(
      required(waveform.get("54001010"), "Waveform Data"),
      image.waveformBits,
    ).slice(0, image.waveform.length),
    channelMin: samples(
      required(channel.get("54000110"), "Channel Minimum"),
      image.waveformBits,
    )[0],
    channelMax: samples(
      required(channel.get("54000112"), "Channel Maximum"),
      image.waveformBits,
    )[0],
    red: words(required(ds.get("00281201"), "Red Palette Data")),
    green: words(required(ds.get("00281202"), "Green Palette Data")),
    blue: words(required(ds.get("00281203"), "Blue Palette Data")),
    lut: words(required(lutItem.get("00283006"), "LUT Data")),
    smallest: smallest?.kind === "numbers" ? smallest.values : smallest,
  };
}

/** What the image's values are, as `valuesOf` reads them. */
function expectedValues(image: Image): Record<string, unknown> {
  const smallest = image.signed ? toSigned(Math.min(...image.pixels), image.bits) : 0;
  return {
    pixels: [...image.pixels],
    overlay: [...image.overlay],
    waveform: [...image.waveform],
    channelMin: image.channelMin,
    channelMax: image.channelMax,
    red: [...image.palette],
    green: [...image.palette],
    blue: [...image.palette],
    lut: [...image.lut],
    smallest: [smallest],
  };
}

describe("multi-VR attributes keep their values from Implicit VR LE to Explicit VR", () => {
  it.each([
    ["Explicit VR Little Endian", TS_EXPLICIT_LE],
    ["Explicit VR Big Endian", TS_EXPLICIT_BE],
  ])("to %s, every pixel, overlay, waveform and lookup table value", (label, ts) => {
    checkProperty(
      `multi-VR transcode to ${label}`,
      fc.property(imageArb, (image) => {
        const read = parseDicom(implicitFile(image));
        expect(valuesOf(read, image)).toEqual(expectedValues(image));
        const written = parseDicom(buildDicom({ transferSyntax: ts, elements: asWritten(read) }));
        expect(valuesOf(written, image)).toEqual(expectedValues(image));
      }),
    );
  });
});
