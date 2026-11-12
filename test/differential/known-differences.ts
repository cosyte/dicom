/**
 * Every place our reading of the differential corpus and dcmjs's part, each with its reason and
 * the clause of the standard that settles it.
 *
 * The differential test fails on a difference this list does not name, and on an entry that no
 * longer occurs in every document it lists, so the list is exactly where the two readers part
 * today. Where the standard is with dcmjs, the entry says the defect is ours: it stays listed only
 * until the fix lands, and the fix removes it.
 *
 * Citations are to the parts vendored under `vendor/nema/` (PS3.5 and PS3.6) where the clause is
 * there, and name PS3.3 and PS3.10 otherwise, which are not vendored here.
 *
 * @module
 */

import type { DifferenceKind } from "./_compare.js";

/** One known difference. */
export interface KnownDifference {
  /** A short name for the failure message. */
  readonly id: string;
  readonly kind: DifferenceKind;
  /** The corpus documents it occurs in; it must occur in every one. */
  readonly documents: readonly string[];
  /**
   * The paths it occurs at, as `_compare.ts` writes them; `[*]` stands for any Item index, `""`
   * is the whole document, and `*` alone is any path.
   */
  readonly paths: readonly string[];
  /** Why the two readers differ here, and which of them the standard is with. */
  readonly reason: string;
  /** The clause that settles it. */
  readonly citation: string;
}

const RICH_EXPLICIT = ["seed/rich-explicit-le", "seed/rich-explicit-be", "seed/rich-deflated-le"];

const ISO_2022 = [
  "seed/charset-iso2022-jp",
  "seed/charset-iso2022-kr",
  "charset/ISO 2022 IR 58",
  "charset/ISO 2022 IR 159",
];

export const KNOWN_DIFFERENCES: readonly KnownDifference[] = [
  {
    id: "implicit-pixel-data-vr",
    kind: "vr",
    documents: ["seed/rich-implicit-le"],
    paths: ["7FE00010"],
    reason:
      "A defect on our side. In Implicit VR Little Endian we give native Pixel Data the first VR " +
      "its registry row lists, OB; the standard gives it OW in that transfer syntax, and dcmjs " +
      "reads OW. The value bytes agree.",
    citation:
      "PS3.5 section A.1: Pixel Data (7FE0,0010) has the Value Representation OW and shall be " +
      "encoded in Little Endian.",
  },
  {
    id: "dcmjs-no-ol-ov-sv",
    kind: "vr",
    documents: [...RICH_EXPLICIT, "seed/empty-values-explicit-le"],
    paths: ["00660040", "00720081", "00720082"],
    reason:
      "dcmjs reads a value written with the VR OL, OV or SV as UN. We read the VR as written. The " +
      "value bytes agree.",
    citation: "PS3.5 section 6.2, Table 6.2-1, which defines the VRs OL, OV and SV.",
  },
  {
    id: "dcmjs-implicit-dictionary",
    kind: "vr",
    documents: ["seed/rich-implicit-le"],
    paths: ["0014410B", "0014410C", "00660040", "00720081", "00720082"],
    reason:
      "In Implicit VR, dcmjs's dictionary has no row for (0014,410B) and (0014,410C) and reads " +
      "them as UN, gives (0066,0040) UL, and has no VR it reads for (0072,0081) and (0072,0082). " +
      "We read the VR the registry gives. The value bytes agree.",
    citation:
      "PS3.6 Table 6-1: (0014,410B) OF, (0014,410C) OD, (0066,0040) OL, (0072,0081) OV, " +
      "(0072,0082) SV.",
  },
  {
    id: "dcmjs-implicit-lut-data",
    kind: "vr",
    documents: ["seed/rich-implicit-le"],
    paths: ["00283000[*].00283006"],
    reason:
      "In Implicit VR, dcmjs reads LUT Data, whose registry row lists two VRs, as UN. We read the " +
      "first, US, which the standard allows. The value bytes agree.",
    citation:
      "PS3.5 section A.1: LUT Data (0028,3006) has the Value Representation US or OW and shall be " +
      "encoded in Little Endian.",
  },
  {
    id: "dcmjs-implicit-dicomdir-offsets",
    kind: "vr",
    documents: ["seed/dicomdir-implicit-le"],
    paths: ["00041200", "00041202", "00041220[*].00041400", "00041220[*].00041420"],
    reason:
      "In Implicit VR, dcmjs's dictionary marks the DICOMDIR offsets as pointers it has no VR for, " +
      "and reads them as UN. We read UL. The value bytes agree.",
    citation:
      "PS3.6 Table 6-1: (0004,1200), (0004,1202), (0004,1400) and (0004,1420) have the VR UL.",
  },
  {
    id: "dcmjs-empty-fixed-length-value",
    kind: "value",
    documents: ["seed/empty-values-explicit-le"],
    paths: ["00209165", "00280010"],
    reason:
      "dcmjs reads an empty AT or US value as the value 0. We read it as empty, which is what a " +
      "zero Value Length encodes.",
    citation:
      "PS3.5 section 7.4.3: a Type 2 Data Element whose Value is unknown can be encoded with zero " +
      "Value Length and no Value.",
  },
  {
    id: "dcmjs-no-code-extensions-refused",
    kind: "refused-by-dcmjs",
    documents: ISO_2022,
    paths: [""],
    reason:
      "dcmjs refuses a multi-valued Specific Character Set, the form that turns on ISO 2022 code " +
      "extensions. We decode it.",
    citation:
      "PS3.5 section 6.1.2.5: DICOM supports Code Extension techniques if Specific Character Set " +
      "(0008,0005) is multi-valued.",
  },
  {
    id: "dcmjs-no-code-extensions-text",
    kind: "value",
    documents: ISO_2022,
    paths: ["00100010", "00104000", "00081030", "00081032[*].00080104"],
    reason:
      "Read leniently, dcmjs decodes the whole value under the first term and keeps the escape " +
      "sequences as text. We switch character sets at each escape sequence and drop it.",
    citation:
      "PS3.5 section 6.1.2.5: DICOM supports Code Extension techniques if Specific Character Set " +
      "(0008,0005) is multi-valued.",
  },
  {
    id: "dcmjs-item-character-set",
    kind: "value",
    documents: [
      "charset/ISO_IR 110",
      "charset/ISO_IR 144",
      "charset/ISO_IR 127",
      "charset/ISO_IR 126",
      "charset/ISO_IR 138",
      "charset/ISO_IR 166",
      "charset/ISO_IR 13",
      "charset/GBK",
    ],
    paths: ["00081032[*].00080104"],
    reason:
      "dcmjs decodes the text of a sequence Item under its default character set, not the " +
      "enclosing Data Set's. We carry the enclosing Data Set's Specific Character Set into an Item " +
      "that has none of its own, so the two read the same bytes as different letters. The Latin " +
      "sets where both decoders map these bytes alike show no difference.",
    citation:
      "PS3.5 section 7.5.3: if Specific Character Set (0008,0005) is not explicitly included in an " +
      "encapsulated Data Set, then the Specific Character Set (0008,0005) Value of the " +
      "encapsulating Data Set applies.",
  },
  {
    id: "dcmjs-no-iso-ir-203",
    kind: "refused-by-dcmjs",
    documents: ["charset/ISO_IR 203"],
    paths: [""],
    reason:
      "dcmjs has no decoder for the Defined Term ISO_IR 203 (ISO 8859-15) and refuses the file. " +
      "Read leniently it keeps its default decoder, which maps these letters alike, so the text " +
      "agrees.",
    citation:
      "PS3.3 Table C.12-2, Defined Terms for Single-Byte Character Sets Without Code Extensions, " +
      "lists ISO_IR 203.",
  },
  {
    id: "dcmjs-jpip-deflate",
    kind: "only-in-cosyte",
    documents: ["seed/jpip-referenced-deflate"],
    paths: [
      "00080016",
      "00080018",
      "00080020",
      "00080060",
      "00100010",
      "00100020",
      "0020000D",
      "0020000E",
      "00280002",
      "00280004",
      "00280010",
      "00280011",
      "00280100",
      "00280101",
      "00280102",
      "00280103",
      "00287FE0",
    ],
    reason:
      "dcmjs inflates only the Deflated Explicit VR Little Endian syntax, so it reads the deflated " +
      "bytes of a JPIP Referenced Deflate Data Set as if they were elements, and finds none of " +
      "ours. We inflate it.",
    citation:
      "PS3.5 section A.7: the entire byte stream is then compressed using the Deflate algorithm " +
      "defined in Internet RFC 1951.",
  },
  {
    id: "dcmjs-jpip-deflate-garbage",
    kind: "only-in-dcmjs",
    documents: ["seed/jpip-referenced-deflate"],
    paths: ["*"],
    reason:
      "The element dcmjs makes of the compressed bytes of the same Data Set. Its tag is whatever " +
      "the first compressed bytes are, and those differ between builds of zlib, so any path is " +
      "accepted here.",
    citation:
      "PS3.5 section A.7: the entire byte stream is then compressed using the Deflate algorithm " +
      "defined in Internet RFC 1951.",
  },
  {
    id: "dcmjs-cp246-refused",
    kind: "refused-by-dcmjs",
    documents: ["seed/cp246-un-sequence"],
    paths: [""],
    reason:
      "A sequence written as UN with undefined length carries its Items in Implicit VR. dcmjs " +
      "reads the Value as encapsulated fragments and fails. We read it as a sequence.",
    citation:
      "PS3.5 section 6.2.2: in the case of Undefined Length Sequences, the Value shall remain in " +
      "Implicit VR form.",
  },
  {
    id: "dcmjs-cp246-dropped",
    kind: "only-in-cosyte",
    documents: ["seed/cp246-un-sequence"],
    paths: ["00091000"],
    reason: "Read leniently, dcmjs stops at the same sequence and leaves it out.",
    citation:
      "PS3.5 section 6.2.2: in the case of Undefined Length Sequences, the Value shall remain in " +
      "Implicit VR form.",
  },
  {
    id: "dcmjs-no-preamble",
    kind: "refused-by-dcmjs",
    documents: ["seed/first-use-ct-no-preamble"],
    paths: [""],
    reason:
      "A file that starts at the File Meta group, with no File Preamble and no DICM prefix. dcmjs " +
      "refuses it; our lenient reader reads it and warns.",
    citation:
      "PS3.10 section 7.1: the File Preamble and the DICM prefix precede the File Meta group.",
  },
  {
    id: "dcmjs-no-preamble-unreadable",
    kind: "unreadable-by-dcmjs",
    documents: ["seed/first-use-ct-no-preamble"],
    paths: [""],
    reason: "Read leniently, dcmjs refuses it all the same, so no element is compared.",
    citation:
      "PS3.10 section 7.1: the File Preamble and the DICM prefix precede the File Meta group.",
  },
  {
    id: "dcmjs-group-length-wrong",
    kind: "refused-by-dcmjs",
    documents: ["seed/group-length-wrong"],
    paths: [""],
    reason:
      "The File Meta Information Group Length is shorter than the group. dcmjs reads only as far " +
      "as the length says and fails. Our lenient reader reads the group to its end and warns.",
    citation:
      "PS3.10 section 7.1: File Meta Information Group Length (0002,0000) is the number of bytes " +
      "of the group that follow it.",
  },
  {
    id: "dcmjs-group-length-wrong-unreadable",
    kind: "unreadable-by-dcmjs",
    documents: ["seed/group-length-wrong"],
    paths: [""],
    reason:
      "Read leniently, dcmjs finds no Transfer Syntax UID in the part of the group it read and " +
      "fails, so no element is compared.",
    citation:
      "PS3.10 section 7.1: File Meta Information Group Length (0002,0000) is the number of bytes " +
      "of the group that follow it.",
  },
  {
    id: "dcmjs-group-length-omitted",
    kind: "refused-by-dcmjs",
    documents: ["seed/group-length-omitted"],
    paths: [""],
    reason:
      "The File Meta group has no Group Length. dcmjs refuses the file; read leniently it reads " +
      "the group to its end, as our lenient reader does, and the two then agree.",
    citation: "PS3.10 section 7.1: File Meta Information Group Length (0002,0000) is Type 1.",
  },
];
