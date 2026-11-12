/**
 * How each VR is carried in the DICOM JSON Model (PS3.18 Annex F), as both converters read it.
 *
 * Each table is a function rather than a module constant, so that it is built where it is read.
 *
 * @module
 */

/**
 * `true` for a string VR whose value may hold several values split by a backslash.
 *
 * @example
 * ```ts
 * isMultiStringVr("CS"); // true
 * ```
 */
export function isMultiStringVr(vr: string): boolean {
  return ["AE", "AS", "CS", "DA", "DT", "LO", "SH", "TM", "UC", "UI"].includes(vr);
}

/**
 * `true` for a string VR that holds one value, in which a backslash is a character.
 *
 * @example
 * ```ts
 * isSingleStringVr("LT"); // true
 * ```
 */
export function isSingleStringVr(vr: string): boolean {
  return ["LT", "ST", "UT", "UR"].includes(vr);
}

/**
 * `true` for a VR whose text is read through `(0008,0005)` Specific Character Set; every other
 * string VR is in the Default Repertoire.
 *
 * @example
 * ```ts
 * isCharsetVr("PN"); // true
 * ```
 */
export function isCharsetVr(vr: string): boolean {
  return ["SH", "LO", "UC", "ST", "LT", "UT", "PN"].includes(vr);
}

/**
 * The width in bytes of one value of a binary number VR written as a JSON number, or `undefined`
 * for any other VR.
 *
 * @example
 * ```ts
 * numberWidth("US"); // 2
 * ```
 */
export function numberWidth(vr: string): 2 | 4 | 8 | undefined {
  if (vr === "US" || vr === "SS") return 2;
  if (vr === "UL" || vr === "SL" || vr === "FL") return 4;
  if (vr === "FD") return 8;
  return undefined;
}

/**
 * `true` for a VR written as `InlineBinary` or `BulkDataURI`, never `Value`.
 *
 * @example
 * ```ts
 * isBinaryVr("OB"); // true
 * ```
 */
export function isBinaryVr(vr: string): boolean {
  return vr === "OB" || vr === "UN" || isSwappedBinaryVr(vr);
}

/**
 * `true` for a binary VR whose bytes Explicit VR Big Endian swaps, which we refuse there.
 *
 * @example
 * ```ts
 * isSwappedBinaryVr("OW"); // true
 * ```
 */
export function isSwappedBinaryVr(vr: string): boolean {
  return ["OD", "OF", "OL", "OV", "OW"].includes(vr);
}

/**
 * `true` for a DS value as PS3.5 section 6.2 gives it, leading and trailing spaces removed.
 *
 * @example
 * ```ts
 * isDecimalString("-1.5e3"); // true
 * ```
 */
export function isDecimalString(text: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(text);
}

/**
 * `true` for an IS value as PS3.5 section 6.2 gives it, leading and trailing spaces removed.
 *
 * @example
 * ```ts
 * isIntegerString("+42"); // true
 * ```
 */
export function isIntegerString(text: string): boolean {
  return /^[+-]?\d+$/u.test(text);
}
