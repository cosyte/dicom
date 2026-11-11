/**
 * The Clean Descriptors Option empties each coded list it cleans.
 *
 * PS3.15 2026d Table E.1-1 gives nine Sequences a `C` in the Clean Descriptors column: the five
 * diagnosis code lists, the reason for visit and reason for the requested procedure, the request
 * attributes and the prescription notes. Their Items carry a Code Value and a free-text Code Meaning
 * `(0008,0104)`, and neither has a row of its own, so walking the Items kept both and the report
 * still said `cleaned`. A `C` the Option resolves on a Sequence is now the same conservative blank it
 * is on any other attribute: the Sequence stays, with no Items, and the report says `cleaned`.
 *
 * Everything here is **synthetic**: fixtures are built in memory by `build-dicom`, and every code,
 * scheme and meaning is an invented placeholder. No real patient data is used.
 *
 * @module
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { deidentify, parseDicom, serializeDicom } from "../../src/index.js";
import type { Tag } from "../../src/dictionary/types.js";
import { buildDicom } from "../helpers/build-dicom.js";

const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";

/** Even-pad a text value (space) so the fixture builder gets a legal length. */
function pad(s: string): Buffer {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
}

const CODE_VALUE = "SYNTH-CODE-77";
const CODE_SCHEME = "99SYNTH";
const CODE_MEANING = "FAKE FINDING FOR DOE^JANE";

const LISTS: readonly (readonly [Tag, string])[] = [
  ["00081084", "Admitting Diagnoses Code Sequence"],
  ["00081301", "Principal Diagnosis Code Sequence"],
  ["00081302", "Primary Diagnosis Code Sequence"],
  ["00081303", "Secondary Diagnoses Code Sequence"],
  ["00081304", "Histological Diagnoses Code Sequence"],
  ["00321067", "Reason for Visit Code Sequence"],
  ["00400275", "Request Attributes Sequence"],
  ["0040100A", "Reason for Requested Procedure Code Sequence"],
  ["30100081", "Prescription Notes Sequence"],
];

function codedList(tag: Tag): ReturnType<typeof parseDicom> {
  return parseDicom(
    buildDicom({
      transferSyntax: TS_EXPLICIT_LE,
      elements: [
        {
          tag,
          items: [
            {
              elements: [
                { tag: "00080100", vr: "SH", value: pad(CODE_VALUE) },
                { tag: "00080102", vr: "SH", value: pad(CODE_SCHEME) },
                { tag: "00080104", vr: "LO", value: pad(CODE_MEANING) },
              ],
            },
          ],
        },
      ],
    }),
  );
}

describe("CleanDescriptors on a coded list", () => {
  for (const [tag, name] of LISTS) {
    it(`empties ${name} and reports it cleaned`, () => {
      const input = codedList(tag);
      // The control: the payload is there to remove.
      expect(input.get(tag)?.items?.[0]?.get("00080104")).toBeDefined();

      const { dataset, report } = deidentify(input, { retain: ["CleanDescriptors"] });

      expect(dataset.has(tag)).toBe(true);
      expect(dataset.get(tag)?.items).toEqual([]);
      const audit = report.attributes.filter((a) => a.tag === tag);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: "C", applied: "cleaned" });
      // Nothing inside the list is audited, because nothing inside it is kept.
      expect(report.attributes.some((a) => a.contextPath !== undefined)).toBe(false);

      const out = serializeDicom(dataset).toString("latin1");
      expect(out).not.toContain(CODE_MEANING);
      expect(out).not.toContain("DOE^JANE");
      expect(out).not.toContain(CODE_VALUE);
      expect(out).not.toContain(CODE_SCHEME);
      expect(parseDicom(serializeDicom(dataset)).get(tag)?.items).toEqual([]);
    });
  }

  it("leaves no Item of any list under the Basic Profile alone", () => {
    for (const [tag] of LISTS) {
      const { dataset } = deidentify(codedList(tag));
      expect(dataset.get(tag)?.items ?? []).toEqual([]);
    }
  });
});
