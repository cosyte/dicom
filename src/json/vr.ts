/**
 * How each VR is carried in the DICOM JSON Model (PS3.18 Annex F), as both converters read it.
 *
 * @module
 */

/** String VRs whose value may hold several values split by a backslash. */
export const MULTI_STRING_VRS: ReadonlySet<string> = new Set([
  "AE",
  "AS",
  "CS",
  "DA",
  "DT",
  "LO",
  "SH",
  "TM",
  "UC",
  "UI",
]);

/** String VRs that hold one value, in which a backslash is a character. */
export const SINGLE_STRING_VRS: ReadonlySet<string> = new Set(["LT", "ST", "UT", "UR"]);

/**
 * The VRs whose text is read through `(0008,0005)` Specific Character Set; every other string VR
 * is in the Default Repertoire.
 */
export const CHARSET_VRS: ReadonlySet<string> = new Set(["SH", "LO", "UC", "ST", "LT", "UT", "PN"]);

/** Binary number VRs written as JSON numbers, with the width of one value in bytes. */
export const NUMBER_WIDTH: Readonly<Record<string, 2 | 4 | 8>> = {
  US: 2,
  SS: 2,
  UL: 4,
  SL: 4,
  FL: 4,
  FD: 8,
};

/** VRs written as `InlineBinary` or `BulkDataURI`, never `Value`. */
export const BINARY_VRS: ReadonlySet<string> = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "UN"]);

/** Binary VRs whose bytes Explicit VR Big Endian swaps, which we refuse there. */
export const SWAPPED_BINARY_VRS: ReadonlySet<string> = new Set(["OD", "OF", "OL", "OV", "OW"]);

/** A DS value as PS3.5 section 6.2 gives it, leading and trailing spaces removed. */
export const DECIMAL_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

/** An IS value as PS3.5 section 6.2 gives it, leading and trailing spaces removed. */
export const INTEGER_STRING = /^[+-]?\d+$/u;
