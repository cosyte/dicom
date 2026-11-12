/**
 * The VR an attribute takes under Implicit VR Little Endian when its PS3.6 registry row lists more
 * than one.
 *
 * Implicit VR carries no VR on the wire, so the reader names one. Taking the first VR a row lists
 * is right for no "OB or OW" attribute PS3.5 rules on: PS3.5 2026d section A.1 says that in this
 * transfer syntax "Pixel Data (7FE0,0010) has the Value Representation OW", "Overlay Data
 * (60xx,3000) has the Value Representation OW" and "Waveform Data (5400,1010) shall have Value
 * Representation OW". The bytes are the same whichever is named, but the VR is what a writer
 * byte-swaps by: a value read as OB and written as Big Endian keeps its Little Endian bytes, so
 * every 16-bit sample in it comes out reversed.
 *
 * The rules, each from the pinned PS3.5:
 *
 *   - **OW** for Pixel Data, Overlay Data and Waveform Data (section A.1). Section 8.1.2 adds that
 *     "the VR of OB may not be used for Overlay Data when using the Default Transfer Syntax", and
 *     section 8.3 that Channel Minimum Value (5400,0110), Channel Maximum Value (5400,0112) and
 *     Waveform Padding Value (5400,100A) "shall be encoded with the same VR as Waveform Data".
 *     Dark Current Counts (0014,3050) and Air Counts (0014,3070) are "OB or OW" with no rule in
 *     PS3.5; they read as OW too, the one of the two a writer cannot corrupt: an OW value of
 *     8-bit data swapped for Big Endian is swapped back by the reader, while an OB value of
 *     16-bit data is never swapped at all.
 *   - **US or OW** for LUT Data (0028,3006), which section A.1 says "has the Value Representation
 *     US or OW": US while the value fits, and OW when it is longer than 65,534 bytes, since section
 *     A.2 notes that "an Explicit VR of US or SS cannot be used to encode a table of 2^16 entries,
 *     since the Value Length is restricted to 16 bits". The retired Gray Lookup Table Data
 *     (0028,1200) follows the same rule.
 *   - **US or SS** by Pixel Representation (0028,0103) for the attributes that hold a pixel sample
 *     value. Section 8.1.1 makes a Pixel Sample "a binary 2's complement integer or an unsigned
 *     integer, as specified by the Data Element Pixel Representation (0028,0103)", and names
 *     Smallest Image Pixel Value (0028,0106) and Largest Image Pixel Value (0028,0107) as the
 *     minimum and maximum such values. They read as SS when the Pixel Representation in force is 1,
 *     and as US otherwise, including when none has been read yet.
 *   - **The first listed VR** for the rest. The lookup table descriptors stay US: section A.1 says
 *     that for them "the first and third Values are always interpreted as unsigned, regardless of
 *     the Value Representation", and as SS a table of 32,768 entries or more would read as a
 *     negative count. The retired Curve Data (50xx,3000), Audio Sample Data (50xx,200C) and
 *     Variable Pixel Data (7Fxx,0010) keep their first listed VR as well.
 *
 * @module
 */

import type { DictionaryEntry, VR } from "../dictionary/types.js";

/** The "OB or OW" attributes read as OW under Implicit VR, by registry keyword. */
const OW_UNDER_IMPLICIT: ReadonlySet<string> = new Set([
  "PixelData",
  "OverlayData",
  "WaveformData",
  "ChannelMinimumValue",
  "ChannelMaximumValue",
  "WaveformPaddingValue",
  "DarkCurrentCounts",
  "AirCounts",
]);

/** The "US or OW" lookup table data, read as OW only when an Explicit VR US cannot carry it. */
const US_OR_OW_TABLES: ReadonlySet<string> = new Set(["LUTData", "GrayLookupTableData"]);

/** The "US or SS" attributes that hold a pixel sample value, signed as Pixel Representation says. */
const PIXEL_SAMPLE_VALUES: ReadonlySet<string> = new Set([
  "ZeroVelocityPixelValue",
  "MappedPixelValue",
  "PerimeterValue",
  "SmallestValidPixelValue",
  "LargestValidPixelValue",
  "SmallestImagePixelValue",
  "LargestImagePixelValue",
  "SmallestPixelValueInSeries",
  "LargestPixelValueInSeries",
  "SmallestImagePixelValueInPlane",
  "LargestImagePixelValueInPlane",
  "PixelPaddingValue",
  "PixelPaddingRangeLimit",
  "RealWorldValueLastValueMapped",
  "RealWorldValueFirstValueMapped",
  "HistogramFirstBinValue",
  "HistogramLastBinValue",
]);

/** The longest value the 16-bit Value Length of an Explicit VR US can declare (PS3.5 section 7.1.2). */
const MAX_US_LENGTH = 0xfffe;

/** Pixel Representation's value for 2's complement samples. */
const SIGNED = 1;

/**
 * The VR an element of `entry` takes under Implicit VR Little Endian, for a registry row that lists
 * more than one, or `undefined` when no rule applies and the row's first VR stands. See the module
 * doc for the rules and the clauses that give them.
 *
 * @param entry - The element's registry row, concrete or repeating-group.
 * @param length - The element's declared Value Length.
 * @param pixelRepresentation - The Pixel Representation (0028,0103) in force for the Data Set the
 *   element is in, or `undefined` when none has been read.
 * @returns The VR the rule picks, which the row lists, or `undefined`.
 * @internal
 */
export function implicitMultiVr(
  entry: DictionaryEntry,
  length: number,
  pixelRepresentation: number | undefined,
): VR | undefined {
  const keyword = entry.keyword;
  if (OW_UNDER_IMPLICIT.has(keyword)) return "OW";
  if (US_OR_OW_TABLES.has(keyword)) return length > MAX_US_LENGTH ? "OW" : "US";
  if (PIXEL_SAMPLE_VALUES.has(keyword)) return pixelRepresentation === SIGNED ? "SS" : "US";
  return undefined;
}
