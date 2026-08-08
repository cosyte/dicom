/**
 * The Tier-3 fatal registry, as a registry.
 *
 * The PHI question - does a document byte reach an `err.message` - is asked in
 * `test/integration/fatal-diagnostic-surface.test.ts`, on a name-bearing
 * payload. This file asks the structural questions that make the answer there
 * mean something: is the registry total, are the two tables it duplicates from
 * elsewhere still in step, and does the one third-party string it renders still
 * come from a closed set.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import * as zlib from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  FATAL_CODES,
  OFFSET_FRAMES,
  buildSnippet,
  type ParseFrame,
} from "../../src/parser/errors.js";
import {
  FATAL_MESSAGES,
  SUPPORTED_TRANSFER_SYNTAXES,
  ZLIB_CODES,
  elementLengthExceedsBuffer,
  emptyInput,
  fileMetaGroupLengthOverruns,
  inflateFailed,
  inflatedPayloadExceedsCap,
  sqNestingDepthExceeded,
  undefinedLengthOnNonSqExplicit,
  unsupportedTransferSyntax,
} from "../../src/parser/fatals.js";
import { TRANSFER_SYNTAX_PARSERS } from "../../src/parser/transfer-syntax.js";
import type { VR } from "../../src/dictionary/types.js";
import {
  controlWithDefault,
  controlWithNoParameterList,
  controlWithRest,
  declaredParameters,
} from "../helpers/declared-parameters.js";

/** A root {@link ParseFrame} over `size` zero bytes, for the direct factory rows. */
function rootFrame(size: number): ParseFrame {
  return { buffer: Buffer.alloc(size), name: OFFSET_FRAMES.INPUT };
}

describe("the Tier-3 fatal registry", () => {
  it("names only the four locked Tier-3 codes", () => {
    // D-09 locks the taxonomy at four. A key is not a code - several keys share
    // `INVALID_FILE_META` - so this asserts the mapping stays inside the lock
    // rather than asserting a one-to-one relation that was never intended.
    const codes = new Set(Object.values(FATAL_MESSAGES).map((entry) => entry.code));
    for (const code of codes) {
      expect(Object.values(FATAL_CODES)).toContain(code);
    }
    expect(codes.size).toBe(4);
  });

  it("has no entry carrying a tag slot", () => {
    // The whole design. `FatalTokens` has no `tag` field, so a `{tag}` in a
    // template could only ever render literally - and a reviewer reading one
    // would reasonably assume it was filled in. Neither is acceptable.
    for (const [key, entry] of Object.entries(FATAL_MESSAGES)) {
      expect(entry.message, `${key} carries a {tag} slot`).not.toContain("{tag}");
    }
  });

  it("Function.prototype.length is blind to a defaulted parameter, and declaredParameters is not", () => {
    // 🛑 THE PIN BELOW USED TO BE `fn.length`, AND `fn.length` STOPS AT THE
    // FIRST DEFAULTED OR REST PARAMETER. So a factory that had grown exactly
    // the slot the pin exists to refuse - `(frame, offset, remaining = 0)` -
    // would still have read `2` and the pin would still have been green. This
    // row is the positive that makes the clean results in the next one mean
    // something: the reader really does see a parameter `length` cannot.
    expect(controlWithDefault.length).toBe(2);
    expect(declaredParameters(controlWithDefault)).toStrictEqual(["a", "b", "c = 0"]);
    expect(controlWithRest.length).toBe(1);
    expect(declaredParameters(controlWithRest)).toStrictEqual(["a", "...more"]);
    // And it fails loudly rather than returning an empty list, because an empty
    // list would read as "this function takes no parameters" - a clean result
    // that is a gap.
    expect(() => declaredParameters(controlWithNoParameterList)).toThrow(/no parameter list/u);
  });

  it("has no factory taking a count of the bytes remaining in the frame", () => {
    // The ninth instance of `DICOM-DIAGNOSTIC-PHI-RESIDUALS`, asserted where it
    // is actually bound: the two factories that used to take one. `{n}` still
    // exists, and the two entries that keep it are the two whose number nobody
    // on the wire chose - `NESTING_DEPTH_LIMIT` and the caller's inflate cap -
    // so this asserts the DECLARED PARAMETER LIST rather than searching the
    // message. A call site cannot pass what a signature does not accept, which
    // is the property that survives a future refactor of the prose.
    //
    // The lists are asserted WHOLE rather than by count, so a third parameter
    // is refused whatever it is called and whatever default it carries.
    expect(declaredParameters(elementLengthExceedsBuffer)).toStrictEqual(["frame", "offset"]);
    expect(declaredParameters(fileMetaGroupLengthOverruns)).toStrictEqual(["frame", "offset"]);
    // ...and the two that legitimately keep a number still take it, so the rows
    // above are a measured bound rather than a blanket one.
    expect(declaredParameters(sqNestingDepthExceeded)).toStrictEqual(["frame", "offset", "limit"]);
    expect(declaredParameters(inflatedPayloadExceedsCap)).toStrictEqual(["frame", "offset", "cap"]);
    for (const key of [
      "ELEMENT_LENGTH_EXCEEDS_BUFFER",
      "FILE_META_GROUP_LENGTH_OVERRUNS",
    ] as const) {
      expect(FATAL_MESSAGES[key].message, `${key} still carries an {n} slot`).not.toContain("{n}");
    }
  });

  it("takes a frame OBJECT, so no factory can cut bytes from one frame and label another", () => {
    // The tenth instance. Every factory's first parameter is the `ParseFrame`
    // pair, never a bare `Buffer` beside a frame name, because two parameters
    // are two chances to disagree - and the disagreement is silent: a snippet
    // cut from the Item's slice and an offset labelled `"input"` both look
    // right on their own.
    for (const factory of [
      elementLengthExceedsBuffer,
      fileMetaGroupLengthOverruns,
      sqNestingDepthExceeded,
      inflatedPayloadExceedsCap,
      undefinedLengthOnNonSqExplicit,
      unsupportedTransferSyntax,
      inflateFailed,
    ]) {
      expect(declaredParameters(factory)[0], factory.name).toBe("frame");
    }
    // And the pair really does travel: the published frame is the one whose
    // bytes the snippet came from.
    const slice: ParseFrame = {
      buffer: Buffer.from("MRN-11111 PATIENT", "latin1"),
      name: OFFSET_FRAMES.VALUE_SLICE,
    };
    const err = elementLengthExceedsBuffer(slice, 0);
    expect(err.offsetFrame).toBe(OFFSET_FRAMES.VALUE_SLICE);
    expect(err.snippet).toBe(buildSnippet(slice.buffer, 0));
  });

  it("leaves no unsubstituted slot behind after a build", () => {
    // Every factory renders through the same `build`, and `build` substitutes a
    // fixed set. A template with a typo'd slot would ship the braces verbatim.
    const rendered = [
      emptyInput(),
      elementLengthExceedsBuffer(rootFrame(32), 0),
      undefinedLengthOnNonSqExplicit(rootFrame(32), 0, "OB"),
      inflateFailed(rootFrame(32), 0, "Z_DATA_ERROR"),
      unsupportedTransferSyntax(rootFrame(32), 0, "1.2.840.10008.1.2.4.50"),
    ];
    for (const err of rendered) {
      expect(err.message).not.toMatch(/\{[a-z0-9]+\}/u);
    }
  });

  it("SUPPORTED_TRANSFER_SYNTAXES still lists exactly the dispatch table", () => {
    // `fatals.ts` cannot import `transfer-syntax.ts` - the per-TS parsers import
    // `fatals.ts`, so the edge would close a cycle. The literal is therefore a
    // copy, and this is what keeps a copy honest.
    expect(SUPPORTED_TRANSFER_SYNTAXES).toBe(Object.keys(TRANSFER_SYNTAX_PARSERS).join(", "));
  });

  it("ZLIB_CODES is exactly the name direction of Node's own zlib.codes", () => {
    // Same reasoning: written out so the module pulls in no runtime import. A
    // Node release that adds a code reds here rather than silently widening what
    // an `err.message` may print.
    // `@types/node` 22 does not declare `zlib.codes`, though Node has exported
    // it for as long as `zlib` has existed. The cast asserts only that it is a
    // record, which is the whole of what this test reads.
    const zlibCodes = (zlib as unknown as { readonly codes: Readonly<Record<string, unknown>> })
      .codes;
    // The table is bidirectional (name to number AND number to name), so the
    // numeric direction is filtered out.
    const fromNode = Object.keys(zlibCodes).filter((k) => Number.isNaN(Number(k)));
    expect([...ZLIB_CODES].sort()).toStrictEqual(fromNode.sort());
  });

  it("renders a zlib code only when it names one", () => {
    expect(inflateFailed(rootFrame(0), 0, "Z_DATA_ERROR").message).toContain("Z_DATA_ERROR");
    // The negative direction is the one that matters: a code outside the table
    // is refused whole rather than echoed.
    expect(inflateFailed(rootFrame(0), 0, "SMIT").message).toContain("<withheld>");
    expect(inflateFailed(rootFrame(0), 0, "SMIT").message).not.toContain("SMIT");
    expect(inflateFailed(rootFrame(0), 0, undefined).message).toContain("<withheld>");
  });

  it("renders a VR only when it names one of the 34", () => {
    const buf = rootFrame(0);
    expect(undefinedLengthOnNonSqExplicit(buf, 0, "OB").message).toContain("VR=OB");
    // Two bytes of a surname that are not a VR: refused, not echoed.
    expect(undefinedLengthOnNonSqExplicit(buf, 0, "Sm" as VR).message).toContain("<withheld>");
    expect(undefinedLengthOnNonSqExplicit(buf, 0, "Sm" as VR).message).not.toContain("Sm");
  });

  it("names a Transfer Syntax from PS3.6 and never echoes the UID", () => {
    const buf = rootFrame(0);
    // A UID PS3.6 publishes a name for: the name reads, the UID does not.
    const known = unsupportedTransferSyntax(buf, 0, "1.2.840.10008.1.2.4.50");
    expect(known.message).toMatch(/^\[UNSUPPORTED_TRANSFER_SYNTAX\] Transfer Syntax /u);
    expect(known.message).not.toContain("1.2.840.10008.1.2.4.50");
    // A UID it does not: a fixed phrase, and still no echo. The probe is a
    // syntactically valid UID carrying a marker, because a malformed one might
    // have been rejected before this branch.
    const unknown = unsupportedTransferSyntax(buf, 0, "1.2.826.0.1.3680043.9.7281.6.6.6");
    expect(unknown.message).toContain("The Transfer Syntax UID");
    expect(unknown.message).not.toContain("3680043");
  });
});
