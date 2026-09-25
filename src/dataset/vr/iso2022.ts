/**
 * ISO/IEC 2022 code-extension decoding for the charset-dependent text VRs
 * (`PN LO SH UC ST LT UT`), used when `(0008,0005)` Specific Character Set has
 * more than one Value. PS3.5 2026d section 6.1.2.3 makes a single Value mean
 * "no Code Extension techniques", so a single-valued set never reaches this
 * module, and neither does a set whose Value 1 is `ISO_IR 192`, `GB18030` or
 * `GBK` (section 6.1.2.4: those take no code extensions).
 *
 * The decoder is a G0/G1 state machine. G0 is read in GL (`0x21`-`0x7E`), G1 in
 * GR (`0xA0`-`0xFF`). Each escape sequence of PS3.3 2026d Tables C.12-3 and
 * C.12-4 designates one set into one code element, and nothing else moves the
 * state: PS3.5 2026d section 6.1.2.5.2 allows only those escape sequences and
 * no shift function.
 *
 * The Value 1 designations are active at every reset point (PS3.5 2026d section
 * 6.1.2.5.3): the start of the value, after a CR, LF or FF, after the `\` value
 * delimiter of a multi-valued VR, and after the `^` and `=` delimiters of `PN`.
 * A delimiter counts only when it is read as a single byte in GL, never as a
 * byte of a two-byte character.
 *
 * Fail-safe: bytes no designated set decodes read as U+FFFD and are never read
 * under another set, and three flags tell the caller what happened so it can
 * attach a warning. Zero runtime dependencies: every set decodes through a Node
 * full-ICU `TextDecoder` label, and a set whose label this runtime lacks reads
 * as U+FFFD.
 *
 * @module
 */

import type { Buffer } from "node:buffer";

/**
 * Which single GL bytes of a value are delimiters, and so reset points:
 * `personName` is `\`, `^` and `=`; `multiValued` (`LO SH UC`) is `\`; `text`
 * (`ST LT UT`, and `decodeText`) has none, so only CR, LF and FF reset it.
 *
 * @internal
 */
export type DelimiterClass = "personName" | "multiValued" | "text";

/**
 * The decoded string and what the decode had to tolerate. Each flag is set at
 * most once however often its condition recurs in the value.
 *
 * @internal
 */
export interface CodeExtensionDecode {
  readonly text: string;
  /** An escape sequence designated a set no Value of `(0008,0005)` declares. */
  readonly escapeUndeclared: boolean;
  /** Some bytes read as U+FFFD. */
  readonly bytesUndecodable: boolean;
  /** A line, value or `PN` component ended while G0 held a set other than Value 1's. */
  readonly extensionNotReset: boolean;
}

const ESC = 0x1b;
const LF = 0x0a;
const FF = 0x0c;
const CR = 0x0d;
const SPACE = 0x20;
const DEL = 0x7f;
const BACKSLASH = 0x5c;
const CARET = 0x5e;
const EQUALS = 0x3d;
const REPLACEMENT = String.fromCharCode(0xfffd);

/** Value 1 terms that take no code extensions (PS3.5 2026d section 6.1.2.4). */
const NO_CODE_EXTENSION_VALUE_1: ReadonlySet<string> = new Set(["ISO_IR 192", "GB18030", "GBK"]);

/** One escape sequence: the bytes after ESC, the set it designates, and into which element. */
interface EscapeSequence {
  readonly tail: readonly number[];
  /** ISO-IR registration number of the designated set. */
  readonly ir: number;
  readonly element: "G0" | "G1";
}

/** Every escape sequence PS3.3 2026d Tables C.12-3 and C.12-4 carry, once each. */
const ESCAPE_SEQUENCES: readonly EscapeSequence[] = [
  { tail: [0x28, 0x42], ir: 6, element: "G0" },
  { tail: [0x2d, 0x41], ir: 100, element: "G1" },
  { tail: [0x2d, 0x42], ir: 101, element: "G1" },
  { tail: [0x2d, 0x43], ir: 109, element: "G1" },
  { tail: [0x2d, 0x44], ir: 110, element: "G1" },
  { tail: [0x2d, 0x4c], ir: 144, element: "G1" },
  { tail: [0x2d, 0x47], ir: 127, element: "G1" },
  { tail: [0x2d, 0x46], ir: 126, element: "G1" },
  { tail: [0x2d, 0x48], ir: 138, element: "G1" },
  { tail: [0x2d, 0x4d], ir: 148, element: "G1" },
  { tail: [0x2d, 0x62], ir: 203, element: "G1" },
  { tail: [0x2d, 0x54], ir: 166, element: "G1" },
  { tail: [0x29, 0x49], ir: 13, element: "G1" },
  { tail: [0x28, 0x4a], ir: 14, element: "G0" },
  { tail: [0x24, 0x42], ir: 87, element: "G0" },
  { tail: [0x24, 0x28, 0x44], ir: 159, element: "G0" },
  { tail: [0x24, 0x29, 0x43], ir: 149, element: "G1" },
  { tail: [0x24, 0x29, 0x41], ir: 58, element: "G1" },
];

/** A defined term's table row: the sets it declares and, for Table C.12-3, its Value 1 state. */
interface TermRow {
  readonly declares: readonly number[];
  readonly initial?: { readonly g0: number; readonly g1: number | undefined };
}

/** The Table C.12-3 single-byte rows whose G1 set sits beside ISO-IR 6 in G0. */
const SINGLE_BYTE_G1_ROWS: readonly number[] = [
  100, 101, 109, 110, 144, 127, 126, 138, 148, 203, 166,
];

/**
 * Table C.12-3 and C.12-4 rows by defined term. A C.12-3 term's single-byte
 * twin (`ISO_IR 100` for `ISO 2022 IR 100`) is the same row; a C.12-4 term has
 * no twin and no Value 1 state, because the table makes it Value 2 to n.
 */
const TERM_ROWS: ReadonlyMap<string, TermRow> = (() => {
  const rows = new Map<string, TermRow>();
  const addBoth = (ir: number, row: TermRow): void => {
    rows.set(`ISO 2022 IR ${String(ir)}`, row);
    rows.set(`ISO_IR ${String(ir)}`, row);
  };
  addBoth(6, { declares: [6], initial: { g0: 6, g1: undefined } });
  for (const ir of SINGLE_BYTE_G1_ROWS) {
    addBoth(ir, { declares: [6, ir], initial: { g0: 6, g1: ir } });
  }
  addBoth(13, { declares: [14, 13], initial: { g0: 14, g1: 13 } });
  for (const ir of [87, 159, 149, 58]) rows.set(`ISO 2022 IR ${String(ir)}`, { declares: [ir] });
  return rows;
})();

/**
 * The `TextDecoder` label for each single-byte G1 set: the label its
 * single-valued twin decodes under, so a byte reads the same with or without
 * code extensions.
 */
const SINGLE_BYTE_LABELS: ReadonlyMap<number, string> = new Map([
  [100, "latin1"],
  [101, "iso-8859-2"],
  [109, "iso-8859-3"],
  [110, "iso-8859-4"],
  [144, "iso-8859-5"],
  [127, "iso-8859-6"],
  [126, "iso-8859-7"],
  [138, "iso-8859-8"],
  [148, "iso-8859-9"],
  [203, "iso-8859-15"],
  [166, "windows-874"],
  [13, "shift_jis"],
]);

/** ISO-IR 13 is a 94-character set, so `0xA0` and `0xFF` are outside it; the rest have 96. */
const NINETY_FOUR_CHARACTER_G1: ReadonlySet<number> = new Set([13]);

/** A 94x94 set: its decoder label, any byte its decoder needs first, and the cells it assigns. */
interface DoubleByteSet {
  readonly label: string;
  readonly prefix: readonly number[];
  /** Whether the set assigns a character at this 1-based row and cell. */
  readonly assigned: (row: number, cell: number) => boolean;
}

/**
 * GB 2312's rows 2, 6 and 8 are partly assigned, and the `gb18030` index fills
 * the gaps with GBK's additions; its unassigned rows the index maps to the
 * Private Use Area, which {@link isCharacter} refuses.
 */
function gb2312Assigned(row: number, cell: number): boolean {
  if (row === 2) {
    return (cell >= 17 && cell <= 66) || (cell >= 69 && cell <= 78) || (cell >= 81 && cell <= 92);
  }
  if (row === 6) return (cell >= 1 && cell <= 24) || (cell >= 33 && cell <= 56);
  if (row === 8) return (cell >= 1 && cell <= 26) || (cell >= 37 && cell <= 73);
  return true;
}

/**
 * The four 94x94 sets. The WHATWG indexes behind these labels are vendor
 * supersets, so each set is bounded to the rows and cells its own standard
 * assigns: JIS X 0208 has no row 9 to 15 or 85 to 94 (the `euc-jp` index puts
 * NEC and IBM extensions there), JIS X 0212 ends at row 77, and GB 2312's
 * partial rows are cut by {@link gb2312Assigned}. KS X 1001's unassigned cells
 * decode to U+FFFD or the Private Use Area already.
 */
const DOUBLE_BYTE_SETS: ReadonlyMap<number, DoubleByteSet> = new Map<number, DoubleByteSet>([
  [
    87,
    {
      label: "euc-jp",
      prefix: [],
      assigned: (row) => (row >= 1 && row <= 8) || (row >= 16 && row <= 84),
    },
  ],
  [159, { label: "euc-jp", prefix: [0x8f], assigned: (row) => row <= 77 }],
  [149, { label: "euc-kr", prefix: [], assigned: () => true }],
  [58, { label: "gb18030", prefix: [], assigned: gb2312Assigned }],
]);

type Decoder = InstanceType<typeof TextDecoder>;

const decoders = new Map<string, Decoder | undefined>();

/** A cached, non-fatal decoder for `label`, or `undefined` when this runtime has none. */
function decoderFor(label: string): Decoder | undefined {
  if (!decoders.has(label)) {
    let decoder: Decoder | undefined;
    try {
      decoder = new TextDecoder(label, { fatal: false });
    } catch {
      decoder = undefined;
    }
    decoders.set(label, decoder);
  }
  return decoders.get(label);
}

/**
 * `true` when `text` is exactly one character a set can legitimately yield:
 * not U+FFFD, not in the Private Use Area (where the `euc-kr` and `gb18030`
 * indexes put user-defined cells), and not ASCII, so a decoded character can
 * never be mistaken for a delimiter.
 */
function isCharacter(text: string): boolean {
  const cp = text.codePointAt(0);
  if (cp === undefined || String.fromCodePoint(cp).length !== text.length) return false;
  return cp >= 0x80 && cp !== 0xfffd && !(cp >= 0xe000 && cp <= 0xf8ff);
}

const singleByteTables = new Map<number, readonly (string | undefined)[]>();

/** The character a GR byte encodes in single-byte G1 set `ir`, or `undefined`. */
function singleByteCharacter(ir: number, byte: number): string | undefined {
  let table = singleByteTables.get(ir);
  if (table === undefined) {
    const label = SINGLE_BYTE_LABELS.get(ir);
    const decoder = label === undefined ? undefined : decoderFor(label);
    const built: (string | undefined)[] = [];
    for (let b = 0xa0; b <= 0xff; b += 1) {
      const outside = NINETY_FOUR_CHARACTER_G1.has(ir) && (b === 0xa0 || b === 0xff);
      const text = decoder === undefined || outside ? "" : decoder.decode(Uint8Array.of(b));
      built.push(isCharacter(text) ? text : undefined);
    }
    table = built;
    singleByteTables.set(ir, table);
  }
  return table[byte - 0xa0];
}

const pairCaches = new Map<number, Map<number, string | undefined>>();

/** The character a byte pair encodes in 94x94 set `ir`, or `undefined`. */
function pairCharacter(
  set: DoubleByteSet,
  ir: number,
  first: number,
  second: number,
): string | undefined {
  const row = (first & 0x7f) - 0x20;
  const cell = (second & 0x7f) - 0x20;
  if (!set.assigned(row, cell)) return undefined;
  let cache = pairCaches.get(ir);
  if (cache === undefined) {
    cache = new Map();
    pairCaches.set(ir, cache);
  }
  const key = row * 0x100 + cell;
  if (!cache.has(key)) {
    const decoder = decoderFor(set.label);
    const text =
      decoder === undefined
        ? ""
        : decoder.decode(Uint8Array.of(...set.prefix, first | 0x80, second | 0x80));
    cache.set(key, isCharacter(text) ? text : undefined);
  }
  return cache.get(key);
}

/** The byte at `index`, or `-1` past the end (which matches no byte class). */
function at(bytes: Buffer, index: number): number {
  return bytes[index] ?? -1;
}

/** The Table C.12-3/C.12-4 escape sequence starting at `index` (an ESC), if any. */
function matchEscape(bytes: Buffer, index: number): EscapeSequence | undefined {
  return ESCAPE_SEQUENCES.find((sequence) =>
    sequence.tail.every((byte, k) => at(bytes, index + 1 + k) === byte),
  );
}

function isLineBreak(byte: number): boolean {
  return byte === CR || byte === LF || byte === FF;
}

/** Where the run after an unrecognized ESC ends: the next recognized sequence, CR, LF, FF or the end. */
function endOfUnrecognizedRun(bytes: Buffer, from: number): number {
  let index = from;
  while (index < bytes.length) {
    const byte = at(bytes, index);
    if (isLineBreak(byte) || (byte === ESC && matchEscape(bytes, index) !== undefined)) break;
    index += 1;
  }
  return index;
}

function isDelimiter(byte: number, delimiters: DelimiterClass): boolean {
  if (delimiters === "personName") return byte === BACKSLASH || byte === CARET || byte === EQUALS;
  if (delimiters === "multiValued") return byte === BACKSLASH;
  return false;
}

function isGl(byte: number): boolean {
  return byte >= 0x21 && byte <= 0x7e;
}

function isGr94(byte: number): boolean {
  return byte >= 0xa1 && byte <= 0xfe;
}

/**
 * `true` when `terms` asks for ISO 2022 code extensions: more than one Value,
 * with a Value 1 that is not `ISO_IR 192`, `GB18030` or `GBK`. Every other term
 * list decodes exactly as it did before this decoder existed.
 *
 * @internal
 */
export function usesCodeExtensions(
  terms: readonly string[] | undefined,
): terms is readonly string[] {
  return terms !== undefined && terms.length > 1 && !NO_CODE_EXTENSION_VALUE_1.has(terms[0] ?? "");
}

/**
 * Decode one text value under a multi-valued `(0008,0005)` with ISO 2022 code
 * extensions. Never throws; bytes no designated set decodes read as U+FFFD.
 *
 * Value 1 sets the initial designations (PS3.5 2026d section 6.1.2.5.4): empty,
 * unknown, or a Table C.12-4 term gives G0 ISO-IR 6 and no G1; a Table C.12-3
 * term gives G0 ISO-IR 6 and its set in G1, except `ISO 2022 IR 13`, which
 * gives G0 ISO-IR 14 and G1 ISO-IR 13. A set is declared when a Value's table
 * row carries its escape sequence, and an empty Value 1 declares ISO-IR 6.
 *
 * ISO-IR 14's `0x5C` and `0x7E` stay U+005C and U+007E: `0x5C` is also the
 * value delimiter, and a consumer splits on `\`.
 *
 * @internal
 */
export function decodeWithCodeExtensions(
  bytes: Buffer,
  terms: readonly string[],
  delimiters: DelimiterClass,
): CodeExtensionDecode {
  const declared = new Set<number>();
  for (const term of terms) for (const ir of TERM_ROWS.get(term)?.declares ?? []) declared.add(ir);
  if (terms[0] === "") declared.add(6);
  const initial = TERM_ROWS.get(terms[0] ?? "")?.initial ?? { g0: 6, g1: undefined };

  let g0 = initial.g0;
  let g1 = initial.g1;
  let escapeUndeclared = false;
  let bytesUndecodable = false;
  let extensionNotReset = false;
  const out: string[] = [];

  const reset = (): void => {
    if (g0 !== initial.g0) extensionNotReset = true;
    g0 = initial.g0;
    g1 = initial.g1;
  };
  const replace = (): void => {
    out.push(REPLACEMENT);
    bytesUndecodable = true;
  };

  let i = 0;
  while (i < bytes.length) {
    const byte = at(bytes, i);

    if (byte === ESC) {
      const sequence = matchEscape(bytes, i);
      if (sequence === undefined) {
        replace();
        i = endOfUnrecognizedRun(bytes, i + 1);
        continue;
      }
      if (!declared.has(sequence.ir)) escapeUndeclared = true;
      if (sequence.element === "G0") g0 = sequence.ir;
      else g1 = sequence.ir;
      i += 1 + sequence.tail.length;
      continue;
    }

    if (isLineBreak(byte)) {
      out.push(String.fromCharCode(byte));
      reset();
      i += 1;
      continue;
    }

    if (byte >= 0x80) {
      // GR is G1's; a C1 byte (0x80-0x9F) belongs to no set in either table.
      const doubleG1 = g1 === undefined ? undefined : DOUBLE_BYTE_SETS.get(g1);
      if (g1 === undefined || byte < 0xa0) {
        replace();
        i += 1;
      } else if (doubleG1 !== undefined) {
        const next = at(bytes, i + 1);
        if (isGr94(byte) && isGr94(next)) {
          const text = pairCharacter(doubleG1, g1, byte, next);
          if (text === undefined) replace();
          else out.push(text);
          i += 2;
        } else {
          replace();
          i += 1;
        }
      } else {
        const text = singleByteCharacter(g1, byte);
        if (text === undefined) replace();
        else out.push(text);
        i += 1;
      }
      continue;
    }

    if (!isGl(byte)) {
      // Other controls, SPACE and DEL are in no 94-character set, so they read
      // as themselves whatever G0 holds.
      out.push(String.fromCharCode(byte));
      i += 1;
      continue;
    }

    const doubleG0 = DOUBLE_BYTE_SETS.get(g0);
    if (doubleG0 !== undefined) {
      const next = at(bytes, i + 1);
      if (isGl(next)) {
        const text = pairCharacter(doubleG0, g0, byte, next);
        if (text === undefined) replace();
        else out.push(text);
        i += 2;
      } else if (isDelimiter(byte, delimiters)) {
        // A lone delimiter byte at a character boundary, with nothing after it
        // that could complete a two-byte character, can only be the delimiter.
        out.push(String.fromCharCode(byte));
        reset();
        i += 1;
      } else {
        replace();
        i += 1;
      }
      continue;
    }

    // ISO-IR 6 or ISO-IR 14 in G0: GL bytes read as ASCII.
    if (isDelimiter(byte, delimiters)) {
      out.push(String.fromCharCode(byte));
      reset();
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end < bytes.length) {
      const b = at(bytes, end);
      if (b < SPACE || b >= DEL || isDelimiter(b, delimiters)) break;
      end += 1;
    }
    out.push(bytes.toString("latin1", i, end));
    i = end;
  }
  if (g0 !== initial.g0) extensionNotReset = true;

  return { text: out.join(""), escapeUndeclared, bytesUndecodable, extensionNotReset };
}
