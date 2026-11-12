/**
 * `fallbackCharacterSet`: the character set a caller names for text whose Data Set declares none.
 *
 * PS3.5 section 6.1.2.1 makes the default repertoire ISO-IR 6 when `(0008,0005)` Specific
 * Character Set is absent or empty, so a Latin-1 letter there is a byte the set does not define
 * and reads as U+FFFD. Many real files write Latin-1 names without declaring `ISO_IR 100`; with
 * the option the reader and `toDicomJson` read those bytes by the named set's table instead,
 * leave the default as it is without it, and never change a byte that is written back out.
 *
 * Every name and identifier here is synthetic.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  DICOM_JSON_ERROR_CODES,
  DicomJsonError,
  DicomParseError,
  FALLBACK_CHARACTER_SETS,
  parseDicom,
  readDicomHeader,
  serializeDicom,
  toDicomJson,
  type Dataset,
  type Element,
  type ParseOptions,
} from "../../../src/index.js";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../../helpers/build-dicom.js";

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";
const UNDECODABLE = "DICOM_CHARSET_BYTES_UNDECODABLE";
const ASSUMED = "DICOM_CHARSET_ASSUMED";

/** A synthetic Latin-1 name with a letter ISO-IR 6 leaves out, `0xC9`. */
const NAME = "DOE^JOSÉE";
const NAME_BYTES = Buffer.from(`${NAME} `, "latin1");
/** A synthetic Latin-1 comment, padded to an even length. */
const COMMENT = "Fictive note: cafés";
const COMMENT_BYTES = Buffer.from(`${COMMENT} `, "latin1");

function cs(term: string): BuildDicomElement {
  return {
    tag: "00080005",
    vr: "CS",
    value: Buffer.from(term.length % 2 === 0 ? term : `${term} `, "latin1"),
  };
}

const PATIENT_NAME: BuildDicomElement = { tag: "00100010", vr: "PN", value: NAME_BYTES };
const PATIENT_ID: BuildDicomElement = {
  tag: "00100020",
  vr: "LO",
  value: Buffer.from("SYN-0001", "latin1"),
};
const COMMENTS: BuildDicomElement = { tag: "00104000", vr: "LT", value: COMMENT_BYTES };

function file(
  elements: readonly (BuildDicomElement | BuildDicomSqElement)[],
  ts = TS_EXPLICIT_LE,
): Buffer {
  return buildDicom({ transferSyntax: ts, elements });
}

function nameOf(ds: Dataset): string | undefined {
  const v = ds.get("00100010")?.value;
  const name = v?.kind === "personName" ? v.values[0]?.alphabetic : undefined;
  return name === undefined ? undefined : `${name.familyName}^${name.givenName}`;
}

function commentOf(ds: Dataset): string | undefined {
  const v = ds.get("00104000")?.value;
  return v?.kind === "text" ? v.value : undefined;
}

function valueWarnings(el: Element | undefined): readonly string[] {
  const value = el?.value as { warnings?: readonly { code: string }[] } | undefined;
  return (value?.warnings ?? []).map((w) => w.code);
}

function codes(ds: Dataset): readonly string[] {
  return ds.warnings.map((w) => w.code);
}

const LATIN1: ParseOptions = { fallbackCharacterSet: "ISO_IR 100" };

describe("a Latin-1 name with no Specific Character Set", () => {
  const buf = file([PATIENT_NAME, PATIENT_ID, COMMENTS]);

  it("reads as U+FFFD with the undecodable warning by default, ISO-IR 6 as PS3.5 6.1.2.1 says", () => {
    const ds = parseDicom(buf);
    expect(nameOf(ds)).toBe("DOE^JOS�E");
    expect(valueWarnings(ds.get("00100010"))).toEqual([UNDECODABLE]);
    expect(codes(ds)).not.toContain(ASSUMED);
  });

  it("reads by the ISO 8859-1 table with fallbackCharacterSet ISO_IR 100, with no undecodable warning", () => {
    const ds = parseDicom(buf, LATIN1);
    expect(nameOf(ds)).toBe(NAME);
    expect(commentOf(ds)).toBe(COMMENT);
    expect(valueWarnings(ds.get("00100010"))).toEqual([]);
    expect(valueWarnings(ds.get("00104000"))).toEqual([]);
  });

  it("raises one informational warning, at the first text element, naming its tag and no text", () => {
    const ds = parseDicom(buf, LATIN1);
    const assumed = ds.warnings.filter((w) => w.code === ASSUMED);
    expect(assumed).toHaveLength(1);
    const [w] = assumed as [(typeof ds.warnings)[number]];
    expect(w.message).toContain("(00100010)");
    expect(w.message).toContain("fallbackCharacterSet");
    for (const fragment of ["DOE", "JOS", "Fictive", "caf", "SYN-0001", "ISO_IR 100"]) {
      expect(w.message).not.toContain(fragment);
    }
    // The PN header follows the 132-byte preamble and the File Meta group.
    expect(ds.get("00100010")?.byteOffset).toBe(w.position.byteOffset);
  });

  it("still reads by the set's table where the set leaves a byte out: 0x80 is C1", () => {
    const ds = parseDicom(
      file([{ tag: "00104000", vr: "LT", value: Buffer.from([0x41, 0x80]) }]),
      LATIN1,
    );
    expect(commentOf(ds)).toBe("A�");
    expect(valueWarnings(ds.get("00104000"))).toEqual([UNDECODABLE]);
  });

  it("raises it for each VR whose text (0008,0005) governs, and for no other", () => {
    const value = Buffer.from("SYNTH1", "latin1");
    for (const vr of ["SH", "LO", "UC", "ST", "LT", "UT", "PN"] as const) {
      const ds = parseDicom(file([{ tag: "00104000", vr, value }]), LATIN1);
      expect(
        codes(ds).filter((c) => c === ASSUMED),
        vr,
      ).toEqual([ASSUMED]);
    }
    for (const vr of ["CS", "AE", "UI", "UR", "UN", "OB", "DA"] as const) {
      const ds = parseDicom(file([{ tag: "00104000", vr, value }]), LATIN1);
      expect(
        codes(ds).filter((c) => c === ASSUMED),
        vr,
      ).toEqual([]);
    }
  });

  it("raises no informational warning when nothing is read under the assumption", () => {
    const ds = parseDicom(file([{ tag: "00080060", vr: "CS", value: Buffer.from("OT") }]), LATIN1);
    expect(codes(ds)).toEqual([]);
  });

  it("names the set in Element.specificCharacterSet, and every other set in the list decodes too", () => {
    expect(parseDicom(buf, LATIN1).get("00100010")?.specificCharacterSet).toEqual(["ISO_IR 100"]);
    const greek = parseDicom(
      file([{ tag: "00104000", vr: "LT", value: Buffer.from([0xc1, 0xe2]) }]),
      { fallbackCharacterSet: "ISO_IR 126" },
    );
    expect(commentOf(greek)).toBe("Αβ");
    const utf8 = parseDicom(
      file([{ tag: "00104000", vr: "LT", value: Buffer.from("Ωé", "utf-8") }]),
      { fallbackCharacterSet: "ISO_IR 192" },
    );
    expect(commentOf(utf8)).toBe("Ωé");
  });

  it("is never escalated: under strict the parse still returns, with the warning", () => {
    const ds = parseDicom(buf, { ...LATIN1, strict: true });
    expect(codes(ds)).toEqual([ASSUMED]);
  });

  it("goes to onWarning", () => {
    const heard: string[] = [];
    parseDicom(buf, { ...LATIN1, onWarning: (w) => heard.push(w.code) });
    expect(heard).toEqual([ASSUMED]);
  });
});

describe("when the fallback applies", () => {
  it("an empty (0008,0005) is the default repertoire too, so the fallback applies", () => {
    const ds = parseDicom(file([cs(""), PATIENT_NAME]), LATIN1);
    expect(nameOf(ds)).toBe(NAME);
    expect(codes(ds)).toEqual([ASSUMED]);
  });

  it("a declared set is read as declared, with no informational warning", () => {
    const ds = parseDicom(file([cs("ISO_IR 6"), PATIENT_NAME]), LATIN1);
    expect(nameOf(ds)).toBe("DOE^JOS�E");
    expect(codes(ds)).toEqual([]);
    const utf8 = parseDicom(
      file([
        cs("ISO_IR 192"),
        { tag: "00100010", vr: "PN", value: Buffer.from("DOE^ZOË", "utf-8") },
      ]),
      LATIN1,
    );
    expect(nameOf(utf8)).toBe("DOE^ZOË");
  });

  it("an unknown term is not replaced unless fallbackCharacterSetForUnknown says so", () => {
    const buf = file([cs("ISO_IR 9999"), PATIENT_NAME]);
    const kept = parseDicom(buf, LATIN1);
    expect(nameOf(kept)).toBe("DOE^JOS�E");
    expect(codes(kept)).toEqual(["DICOM_UNSUPPORTED_CHARSET"]);
    const replaced = parseDicom(buf, { ...LATIN1, fallbackCharacterSetForUnknown: true });
    expect(nameOf(replaced)).toBe(NAME);
    expect(codes(replaced)).toEqual(["DICOM_UNSUPPORTED_CHARSET", ASSUMED]);
    const off = parseDicom(buf, { ...LATIN1, fallbackCharacterSetForUnknown: false });
    expect(nameOf(off)).toBe("DOE^JOS�E");
  });

  it("an unknown term among known ones is replaced only when asked", () => {
    const buf = file([
      cs("ISO_IR 126\\ISO_IR 9999"),
      { tag: "00104000", vr: "LT", value: Buffer.from([0xc9, 0x20]) },
    ]);
    expect(commentOf(parseDicom(buf, LATIN1))).toBe("Ι");
    expect(commentOf(parseDicom(buf, { ...LATIN1, fallbackCharacterSetForUnknown: true }))).toBe(
      "É",
    );
  });

  it("a Sequence Item inherits the fallback, and an Item's own empty (0008,0005) takes it", () => {
    const ds = parseDicom(
      file([
        cs("ISO_IR 192"),
        {
          tag: "00081115",
          items: [{ elements: [cs(""), COMMENTS] }, { elements: [COMMENTS] }],
        },
      ]),
      LATIN1,
    );
    const items = ds.get("00081115")?.items ?? [];
    expect(commentOf(items[0] as Dataset)).toBe(COMMENT);
    // The second Item inherits the root's ISO_IR 192, under which 0xE9 is no UTF-8.
    expect(commentOf(items[1] as Dataset)).toBe("Fictive note: caf�s");
    expect(codes(ds)).toEqual([ASSUMED]);
  });

  it("an Item with no (0008,0005) under a root with none reads under the fallback", () => {
    const ds = parseDicom(
      file([{ tag: "00081115", items: [{ elements: [COMMENTS] }] }, PATIENT_NAME]),
      LATIN1,
    );
    const items = ds.get("00081115")?.items ?? [];
    expect(commentOf(items[0] as Dataset)).toBe(COMMENT);
    expect(nameOf(ds)).toBe(NAME);
    expect(codes(ds)).toEqual([ASSUMED]);
  });

  it("Implicit VR Little Endian and Deflated Explicit VR Little Endian read the same", () => {
    for (const ts of [TS_IMPLICIT_LE, TS_DEFLATED_LE]) {
      const ds = parseDicom(file([PATIENT_NAME, COMMENTS], ts), LATIN1);
      expect(nameOf(ds), ts).toBe(NAME);
      expect(codes(ds), ts).toEqual([ASSUMED]);
    }
  });

  it("a Sequence the reader gave up on takes its warning with it, and the next text element raises it", () => {
    // Under Implicit VR the Sequence over-declares by the 8-byte header of an empty LO that
    // follows it, so its descent meets that tag where an Item should be, fails, and is rolled
    // back: the PN inside was read and is gone again.
    const ds = parseDicom(
      file(
        [
          {
            tag: "00081115",
            items: [{ elements: [PATIENT_NAME] }],
            declaredLengthDelta: 8,
          },
          { tag: "00100020", vr: "LO", value: Buffer.alloc(0) },
          COMMENTS,
        ],
        TS_IMPLICIT_LE,
      ),
      LATIN1,
    );
    expect(codes(ds)).toEqual(["DICOM_SQ_NOT_DESCENDED", ASSUMED]);
    const assumed = ds.warnings[1];
    expect(assumed?.message).toContain("(00104000)");
    expect(commentOf(ds)).toBe(COMMENT);
  });

  it("a UN the reader could not read as a Sequence takes its warning with it too", () => {
    // An undefined-length UN inside an Item: the CP-246 descent reads a PN in its first Item, then
    // meets an element in the second whose length runs past the end, fails, and is rolled back.
    const pn = Buffer.concat([
      Buffer.from([0x10, 0x00, 0x10, 0x00, NAME_BYTES.length, 0, 0, 0]),
      NAME_BYTES,
    ]);
    const overrun = Buffer.from([0x10, 0x00, 0x20, 0x00, 0x00, 0x00, 0xff, 0x00]);
    const ds = parseDicom(
      file([
        {
          tag: "00081115",
          items: [
            {
              elements: [
                {
                  tag: "0040A730",
                  items: [],
                  undefinedLength: true,
                  encapsulatedPixelData: true,
                  explicitVr: "UN",
                  encapsulatedFragments: [pn, overrun],
                },
              ],
            },
          ],
        },
        COMMENTS,
      ]),
      LATIN1,
    );
    const assumed = ds.warnings.filter((w) => w.code === ASSUMED);
    expect(assumed).toHaveLength(1);
    expect(assumed[0]?.message).toContain("(00104000)");
  });

  it("readDicomHeader takes the option too", async () => {
    const bytes = file([PATIENT_NAME]);
    const ds = await readDicomHeader(
      (async function* () {
        yield await Promise.resolve(new Uint8Array(bytes));
      })(),
      LATIN1,
    );
    expect(nameOf(ds)).toBe(NAME);
    expect(codes(ds)).toContain(ASSUMED);
  });
});

describe("writing back out", () => {
  it("writes the original bytes, and adds no Specific Character Set", () => {
    const buf = file([PATIENT_NAME, PATIENT_ID, COMMENTS]);
    const plain = serializeDicom(parseDicom(buf));
    const assumed = serializeDicom(parseDicom(buf, LATIN1));
    expect(assumed.equals(plain)).toBe(true);
    const back = parseDicom(assumed);
    expect(back.has("00080005")).toBe(false);
    expect(Buffer.from(back.get("00100010")?.rawBytes ?? []).equals(NAME_BYTES)).toBe(true);
  });

  it("keeps an empty (0008,0005) empty", () => {
    const buf = file([cs(""), PATIENT_NAME]);
    const out = serializeDicom(parseDicom(buf, LATIN1));
    expect(out.equals(serializeDicom(parseDicom(buf)))).toBe(true);
    expect(Buffer.from(parseDicom(out).get("00080005")?.rawBytes ?? [1]).length).toBe(0);
  });
});

describe("toDicomJson", () => {
  const buf = file([PATIENT_NAME, COMMENTS]);

  it("refuses the undeclared Latin-1 name by default", () => {
    expect(() => toDicomJson(parseDicom(buf))).toThrow(
      expect.objectContaining({ code: DICOM_JSON_ERROR_CODES.MALFORMED_VALUE }),
    );
  });

  it("converts it with fallbackCharacterSet, and adds no (0008,0005)", () => {
    const json = toDicomJson(parseDicom(buf), LATIN1);
    expect(json["00100010"]).toEqual({ vr: "PN", Value: [{ Alphabetic: NAME }] });
    expect(json["00104000"]).toEqual({ vr: "LT", Value: [COMMENT] });
    expect(json["00080005"]).toBeUndefined();
  });

  it("converts a Data Set the reader read under the fallback with no option of its own", () => {
    const json = toDicomJson(parseDicom(buf, LATIN1));
    expect(json["00100010"]).toEqual({ vr: "PN", Value: [{ Alphabetic: NAME }] });
  });

  it("takes an empty (0008,0005), and an unknown one only when asked", () => {
    const empty = toDicomJson(parseDicom(file([cs(""), PATIENT_NAME])), LATIN1);
    expect(empty["00100010"]).toEqual({ vr: "PN", Value: [{ Alphabetic: NAME }] });
    const unknown = parseDicom(file([cs("ISO_IR 9999"), PATIENT_NAME]));
    expect(() => toDicomJson(unknown, LATIN1)).toThrow(
      expect.objectContaining({ code: DICOM_JSON_ERROR_CODES.UNSUPPORTED_CHARACTER_SET }),
    );
    const json = toDicomJson(unknown, { ...LATIN1, fallbackCharacterSetForUnknown: true });
    expect(json["00100010"]).toEqual({ vr: "PN", Value: [{ Alphabetic: NAME }] });
    expect(json["00080005"]).toEqual({ vr: "CS", Value: ["ISO_IR 9999"] });
  });

  it("leaves a declared set alone, in an Item too", () => {
    const ds = parseDicom(
      file([cs("ISO_IR 6"), { tag: "00081115", items: [{ elements: [cs(""), COMMENTS] }] }]),
    );
    const json = toDicomJson(ds, LATIN1);
    const item = (json["00081115"]?.Value as Record<string, { Value?: unknown[] }>[])[0];
    expect(item?.["00104000"]?.Value).toEqual([COMMENT]);
    expect(() => toDicomJson(parseDicom(file([cs("ISO_IR 6"), COMMENTS])), LATIN1)).toThrow(
      expect.objectContaining({ code: DICOM_JSON_ERROR_CODES.MALFORMED_VALUE }),
    );
  });
});

describe("an invalid option is refused with a coded error", () => {
  const buf = file([PATIENT_NAME]);
  const invalid: readonly Record<string, unknown>[] = [
    { fallbackCharacterSet: "ISO_IR 9999" },
    { fallbackCharacterSet: "" },
    { fallbackCharacterSet: "ISO 2022 IR 100" },
    { fallbackCharacterSet: "GB18030" },
    { fallbackCharacterSet: "iso_ir 100" },
    { fallbackCharacterSet: 100 },
    { fallbackCharacterSet: ["ISO_IR 100"] },
    { fallbackCharacterSet: "ISO_IR 100", fallbackCharacterSetForUnknown: "yes" },
    { fallbackCharacterSetForUnknown: true },
  ];

  it("parseDicom throws a TypeError whose code is DICOM_INVALID_OPTION, echoing no value", () => {
    for (const options of invalid) {
      let thrown: unknown;
      try {
        parseDicom(buf, options as ParseOptions);
      } catch (err) {
        thrown = err;
      }
      expect(thrown, JSON.stringify(options)).toBeInstanceOf(TypeError);
      expect(thrown).not.toBeInstanceOf(DicomParseError);
      expect((thrown as { code?: string }).code).toBe("DICOM_INVALID_OPTION");
      expect((thrown as Error).message).not.toContain("9999");
    }
  });

  it("toDicomJson throws INVALID_OPTION", () => {
    const ds = parseDicom(buf);
    for (const options of invalid) {
      let thrown: unknown;
      try {
        toDicomJson(ds, options);
      } catch (err) {
        thrown = err;
      }
      expect(thrown, JSON.stringify(options)).toBeInstanceOf(DicomJsonError);
      expect((thrown as DicomJsonError).code).toBe(DICOM_JSON_ERROR_CODES.INVALID_OPTION);
      expect((thrown as DicomJsonError).tag).toBe("<withheld>");
    }
  });

  it("an omitted option, or undefined, is no option", () => {
    expect(
      nameOf(parseDicom(buf, { fallbackCharacterSet: undefined } as unknown as ParseOptions)),
    ).toBe("DOE^JOS�E");
  });

  it("every term in FALLBACK_CHARACTER_SETS is accepted, and only those", () => {
    expect(FALLBACK_CHARACTER_SETS).toEqual([
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
    ]);
    expect(Object.isFrozen(FALLBACK_CHARACTER_SETS)).toBe(true);
    for (const term of FALLBACK_CHARACTER_SETS) {
      expect(() => parseDicom(buf, { fallbackCharacterSet: term })).not.toThrow();
      const ascii = parseDicom(file([PATIENT_ID]));
      expect(toDicomJson(ascii, { fallbackCharacterSet: term })["00100020"]).toEqual({
        vr: "LO",
        Value: ["SYN-0001"],
      });
    }
  });
});
