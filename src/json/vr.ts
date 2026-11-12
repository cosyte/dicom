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
 * `true` for a Specific Character Set term both converters carry: the default repertoire (empty,
 * or `ISO_IR 6`), a single-byte `ISO_IR` set of PS3.3 Table C.12-2, or `ISO_IR 192`. Not an ISO
 * 2022 term, whose code extensions the converters do not carry, nor `GB18030` or `GBK`.
 *
 * @example
 * ```ts
 * isCarriedCharsetTerm("ISO_IR 100"); // true
 * isCarriedCharsetTerm("ISO 2022 IR 100"); // false
 * ```
 */
export function isCarriedCharsetTerm(term: unknown): boolean {
  return [
    "",
    "ISO_IR 6",
    "ISO_IR 100",
    "ISO_IR 101",
    "ISO_IR 109",
    "ISO_IR 110",
    "ISO_IR 144",
    "ISO_IR 127",
    "ISO_IR 126",
    "ISO_IR 138",
    "ISO_IR 148",
    "ISO_IR 203",
    "ISO_IR 13",
    "ISO_IR 166",
    "ISO_IR 192",
  ].includes(term as string);
}

/**
 * `true` for Specific Character Set terms both converters carry: one value at most, and that one
 * a term {@link isCarriedCharsetTerm} names.
 *
 * @example
 * ```ts
 * carriesCharset(["ISO_IR 192"]); // true
 * carriesCharset(["", "ISO 2022 IR 87"]); // false
 * ```
 */
export function carriesCharset(terms: readonly unknown[]): boolean {
  return terms.length <= 1 && terms.every(isCarriedCharsetTerm);
}

/**
 * `true` when `text` holds a C0 control character `vr` does not allow. PS3.5 section 6.2 allows
 * TAB, LF, FF and CR in `LT`, `ST` and `UT`, and no control character in any other string VR but
 * ESC, which only ISO 2022 code extensions use and the converters do not carry.
 *
 * @example
 * ```ts
 * hasForbiddenControl("A\r\nB", "LT"); // false
 * hasForbiddenControl("A\u001bB", "LO"); // true
 * ```
 */
export function hasForbiddenControl(text: string, vr: string): boolean {
  const formatted = vr === "LT" || vr === "ST" || vr === "UT";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x20) continue;
    if (!formatted || (c !== 0x09 && c !== 0x0a && c !== 0x0c && c !== 0x0d)) return true;
  }
  return false;
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
 * `true` for a binary VR whose bytes Explicit VR Big Endian swaps: we refuse one there as
 * `InlineBinary`, whose byte order PS3.18 Annex F leaves open.
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
 * `true` for a VR PS3.18 F.2.2 allows a `BulkDataURI` on: `DS`, `FL`, `FD`, `IS`, `LT`, `OB`, `OD`,
 * `OF`, `OL`, `OV`, `OW`, `SL`, `SS`, `ST`, `SV`, `UC`, `UL`, `UN`, `US`, `UT` and `UV`.
 * `InlineBinary` stays with the binary VRs ({@link isBinaryVr}).
 *
 * @example
 * ```ts
 * takesBulkDataUri("US"); // true
 * takesBulkDataUri("LO"); // false
 * ```
 */
export function takesBulkDataUri(vr: string): boolean {
  return (
    isBinaryVr(vr) ||
    ["DS", "FL", "FD", "IS", "LT", "SL", "SS", "ST", "SV", "UC", "UL", "US", "UT", "UV"].includes(
      vr,
    )
  );
}

/**
 * The width in bytes of one value of `vr` as bulk data, which Explicit VR Big Endian swaps, or 1
 * for a VR of bytes or text, which it does not.
 *
 * @example
 * ```ts
 * bulkDataWidth("OW"); // 2
 * bulkDataWidth("UV"); // 8
 * bulkDataWidth("OB"); // 1
 * ```
 */
export function bulkDataWidth(vr: string): 1 | 2 | 4 | 8 {
  if (vr === "OW" || vr === "US" || vr === "SS") return 2;
  if (["OF", "OL", "UL", "SL", "FL"].includes(vr)) return 4;
  if (["OD", "OV", "FD", "SV", "UV"].includes(vr)) return 8;
  return 1;
}

/**
 * `true` for the tag of a bulk value, which `toDicomJson` writes inline only when asked: Pixel Data
 * `(7FE0,0010)`, Float and Double Float Pixel Data `(7FE0,0008)` and `(7FE0,0009)`, Overlay Data
 * `(60xx,3000)` in the even groups `6000` to `601E`, Waveform Data `(5400,1010)`, Spectroscopy
 * Data `(5600,0020)` and Encapsulated Document `(0042,0011)`.
 *
 * @example
 * ```ts
 * isBulkTag("7FE00010"); // true
 * isBulkTag("00282000"); // false
 * ```
 */
export function isBulkTag(tag: string): boolean {
  if (["7FE00008", "7FE00009", "7FE00010", "54001010", "56000020", "00420011"].includes(tag)) {
    return true;
  }
  const group = parseInt(tag.slice(0, 4), 16);
  return tag.endsWith("3000") && group >= 0x6000 && group <= 0x601e && group % 2 === 0;
}

/**
 * The decimal value a number's text names, as its significant digits and the power of ten they
 * are scaled by, so that two texts of one value give the same key: `"12.50"` and `"1.25e1"` both
 * give `"125e-1"`. The sign is left out: a text and the double read from it never differ in sign.
 *
 * @example
 * ```ts
 * decimalKey("+0012.50"); // "125e-1"
 * ```
 */
export function decimalKey(text: string): string {
  const match = /^[+-]?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/u.exec(text) as RegExpExecArray;
  // `(\d*)` always takes part, so the whole part is a string, empty when the text has none.
  const whole = match[1] as string;
  const fraction = match[2] ?? "";
  const digits = (whole + fraction).replace(/^0+/u, "");
  if (digits === "") return "0";
  const significant = digits.replace(/0+$/u, "");
  const power = Number(match[3] ?? 0) - fraction.length + digits.length - significant.length;
  return `${significant}e${power}`;
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
