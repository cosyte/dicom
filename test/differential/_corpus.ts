/**
 * The documents the dcmjs differential reads: the fuzz seed corpus, and one small document for each
 * Specific Character Set term we decode that no seed already carries.
 *
 * Every document is synthetic and built in code, as every fixture here is. The seeds
 * (`test/property/_seed-corpus.ts`) cover Implicit VR Little Endian, Explicit VR Little and Big
 * Endian, Deflated, encapsulated Pixel Data, sequences nested several deep, private blocks, a
 * DICOMDIR, CP-246 and the recoverable deviations the lenient reader warns on. The documents below
 * add the character sets: a Person Name, a Long String, a Long Text and a Long String inside a
 * sequence Item in each, every name plainly fake.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { buildDicom } from "../helpers/build-dicom.js";
import { SEED_CORPUS } from "../property/_seed-corpus.js";

/** One document of the corpus. */
export interface DifferentialDocument {
  readonly name: string;
  readonly bytes: Buffer;
}

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

const ESC = 0x1b;

/** ASCII text and raw bytes, joined, padded to even length with a space. */
function raw(...parts: (string | readonly number[])[]): Buffer {
  const bytes = Buffer.concat(
    parts.map((part) =>
      typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part),
    ),
  );
  return bytes.length % 2 === 0 ? bytes : Buffer.concat([bytes, Buffer.from([0x20])]);
}

/** A document whose Specific Character Set is `term`, with `letters` encoded in it. */
function charsetDocument(term: string, letters: readonly number[]): Buffer {
  return buildDicom({
    transferSyntax: TS_EXPLICIT_LE,
    elements: [
      { tag: "00080005", vr: "CS", value: raw(term) },
      { tag: "00081030", vr: "LO", value: raw("Synthetic study ", letters) },
      {
        tag: "00081032",
        items: [
          {
            elements: [
              { tag: "00080100", vr: "SH", value: raw("SYN-1") },
              { tag: "00080102", vr: "SH", value: raw("99SYNTH") },
              { tag: "00080104", vr: "LO", value: raw("Synthetic code ", letters) },
            ],
          },
        ],
      },
      { tag: "00100010", vr: "PN", value: raw("Synthetic^", letters) },
      { tag: "00104000", vr: "LT", value: raw("Synthetic note ", letters) },
    ],
  });
}

/** Lower-case Latin vowels with an acute accent, in each ISO 8859 Latin part that has them. */
const LATIN_ACUTE = [0xe1, 0xe9, 0xed, 0xf3, 0xfa];

/** The terms no seed carries, each with letters its repertoire defines. */
const CHARSET_DOCUMENTS: readonly DifferentialDocument[] = [
  { name: "charset/ISO_IR 101", bytes: charsetDocument("ISO_IR 101", LATIN_ACUTE) },
  { name: "charset/ISO_IR 109", bytes: charsetDocument("ISO_IR 109", LATIN_ACUTE) },
  { name: "charset/ISO_IR 110", bytes: charsetDocument("ISO_IR 110", LATIN_ACUTE) },
  { name: "charset/ISO_IR 148", bytes: charsetDocument("ISO_IR 148", LATIN_ACUTE) },
  { name: "charset/ISO_IR 203", bytes: charsetDocument("ISO_IR 203", LATIN_ACUTE) },
  // Cyrillic, Arabic, Greek, Hebrew and Thai letters in ISO 8859-5, -6, -7, -8 and TIS 620.
  { name: "charset/ISO_IR 144", bytes: charsetDocument("ISO_IR 144", [0xb8, 0xd2, 0xd0, 0xdd]) },
  { name: "charset/ISO_IR 127", bytes: charsetDocument("ISO_IR 127", [0xc3, 0xc8, 0xca]) },
  { name: "charset/ISO_IR 126", bytes: charsetDocument("ISO_IR 126", [0xc1, 0xc2, 0xc3]) },
  { name: "charset/ISO_IR 138", bytes: charsetDocument("ISO_IR 138", [0xe0, 0xe1, 0xe2]) },
  { name: "charset/ISO_IR 166", bytes: charsetDocument("ISO_IR 166", [0xa1, 0xa2, 0xa3]) },
  // Half-width katakana in JIS X 0201.
  { name: "charset/ISO_IR 13", bytes: charsetDocument("ISO_IR 13", [0xb1, 0xb2, 0xb3]) },
  { name: "charset/GBK", bytes: charsetDocument("GBK", [0xd5, 0xc5]) },
  // Bytes a set leaves undefined, or reads otherwise than a WHATWG decoder of the same name: a C1
  // byte under ISO_IR 100, a Latin-1 letter in the default repertoire, YEN SIGN and OVERLINE in
  // JIS X 0201, and the euro sign ISO 8859-7:2003 added after ISO-IR 126 was registered.
  { name: "charset/ISO_IR 100 C1", bytes: charsetDocument("ISO_IR 100", [0xe9, 0x80, 0x92]) },
  { name: "charset/default high byte", bytes: charsetDocument("", [0xe9]) },
  {
    name: "charset/ISO_IR 13 5C 7E",
    bytes: charsetDocument("ISO_IR 13", [0xb1, 0x7e, 0x5c, 0xb2]),
  },
  { name: "charset/ISO_IR 126 A4", bytes: charsetDocument("ISO_IR 126", [0xc1, 0xa4]) },
  // GB 2312 in G1 by its escape sequence, then JIS X 0212 in G0 by its own.
  {
    name: "charset/ISO 2022 IR 58",
    bytes: charsetDocument("\\ISO 2022 IR 58", [ESC, 0x24, 0x29, 0x41, 0xd5, 0xc5]),
  },
  {
    name: "charset/ISO 2022 IR 159",
    bytes: charsetDocument("\\ISO 2022 IR 87\\ISO 2022 IR 159", [
      ESC,
      0x24,
      0x28,
      0x44,
      0x30,
      0x21,
      ESC,
      0x28,
      0x42,
    ]),
  },
];

/** The corpus, in a fixed order, every document named once. */
export function differentialCorpus(): readonly DifferentialDocument[] {
  return [
    ...SEED_CORPUS.map((seed) => ({ name: `seed/${seed.name}`, bytes: seed.bytes })),
    ...CHARSET_DOCUMENTS,
  ];
}
