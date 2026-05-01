/**
 * Tests for `resolveImplicitVR`, `resolvePrivateCreator`,
 * `registerPrivateCreator`, and `matchRepeatingGroup` — Phase 2 plan 02-03
 * task 1.
 *
 * Covers CONTEXT.md D-21 (5-case fallback), D-33 (private-creator stack),
 * D-34 (Element.privateCreator population), and PITFALLS §7.1
 * (block-reservation / off-by-0x1000 trap).
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
  matchRepeatingGroup,
  registerPrivateCreator,
  resolveImplicitVR,
  resolvePrivateCreator,
} from "./element-header.js";
import type { ParseContext } from "./types.js";
import type { DicomParseWarning } from "./warnings.js";
import { WARNING_CODES } from "./warnings.js";

function makeCtx(): ParseContext {
  return {
    buffer: Buffer.alloc(0),
    strict: false,
    stripPreamble: "tolerate",
    warnings: [],
    creators: new Map(),
    encodingContextStack: ["Root"],
    nestingDepth: 0,
    copyValues: false,
  };
}

function makeEmit(warnings: DicomParseWarning[]): (w: DicomParseWarning) => void {
  return (w) => warnings.push(w);
}

describe("resolveImplicitVR — D-21 case 1: standard tag with single VR", () => {
  it("returns PN for (0010,0010) PatientName", () => {
    const ctx = makeCtx();
    const captured: DicomParseWarning[] = [];
    const vr = resolveImplicitVR("00100010", ctx, makeEmit(captured), { byteOffset: 0 });
    expect(vr).toBe("PN");
    expect(captured).toHaveLength(0);
  });
});

describe("resolveImplicitVR — D-21 case 2: standard tag with multi-VR (first array entry)", () => {
  it("returns US for (0028,0106) SmallestImagePixelValue (declared US/SS)", () => {
    const ctx = makeCtx();
    const captured: DicomParseWarning[] = [];
    const vr = resolveImplicitVR("00280106", ctx, makeEmit(captured), { byteOffset: 0 });
    expect(vr).toBe("US");
    expect(captured).toHaveLength(0);
  });
});

describe("resolveImplicitVR — D-21 case 3: repeating-group family", () => {
  it("returns OB (first array entry) for concrete (50A0,3000) matching (50xx,3000) Curve Data family", () => {
    const ctx = makeCtx();
    const captured: DicomParseWarning[] = [];
    const vr = resolveImplicitVR("50A03000", ctx, makeEmit(captured), { byteOffset: 0 });
    // Curve Data family entry is `vr: ["OB", "OW"]`; first VR is OB.
    expect(vr).toBe("OB");
    expect(captured).toHaveLength(0);
  });
});

describe("resolveImplicitVR — D-21 case 4a: private tag, no creator registered", () => {
  it("returns UN; emits BOTH DICOM_PRIVATE_TAG_NO_CREATOR and DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR", () => {
    const ctx = makeCtx();
    const captured: DicomParseWarning[] = [];
    const vr = resolveImplicitVR("00191000", ctx, makeEmit(captured), { byteOffset: 100 });
    expect(vr).toBe("UN");
    const codes = captured.map((w) => w.code);
    expect(codes).toContain(WARNING_CODES.DICOM_PRIVATE_TAG_NO_CREATOR);
    expect(codes).toContain(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR);
    expect(captured).toHaveLength(2);
  });
});

describe("resolveImplicitVR — D-21 case 4b: private creator slot itself", () => {
  it("returns LO with NO warnings for (0019,0010) (the creator declaration slot)", () => {
    const ctx = makeCtx();
    const captured: DicomParseWarning[] = [];
    const vr = resolveImplicitVR("00190010", ctx, makeEmit(captured), { byteOffset: 0 });
    expect(vr).toBe("LO");
    expect(captured).toHaveLength(0);
  });
});

describe("resolveImplicitVR — D-21 case 4c: private tag WITH creator registered", () => {
  it("returns UN and emits ONLY DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR (no NO_CREATOR)", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00190010", Buffer.from("ACME", "ascii"), ctx);
    const captured: DicomParseWarning[] = [];
    const vr = resolveImplicitVR("00191000", ctx, makeEmit(captured), { byteOffset: 100 });
    expect(vr).toBe("UN");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.code).toBe(WARNING_CODES.DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR);
  });
});

describe("resolveImplicitVR — D-21 case 5: unknown standard tag", () => {
  it("returns UN silently with no warnings", () => {
    const ctx = makeCtx();
    const captured: DicomParseWarning[] = [];
    // (FFFE,FFFE) is even-group + not in dict + not a repeating-group family.
    // But FFFE is reserved for delimiter markers — pick a safer unknown tag.
    // Use (0008,FFFE) — even-group, not in dict (we hope).
    const vr = resolveImplicitVR("0008FFFE", ctx, makeEmit(captured), { byteOffset: 0 });
    expect(vr).toBe("UN");
    expect(captured).toHaveLength(0);
  });
});

describe("resolvePrivateCreator — block-reservation rule (PITFALLS §7.1)", () => {
  it("creator at (0019,0010) covers block (0019,1000)..(0019,10FF) only — off-by-0x1000 trap", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00190010", Buffer.from("ACME", "ascii"), ctx);

    // In-block: blockId 0x10 → resolves to ACME.
    expect(resolvePrivateCreator("00191000", ctx)).toBe("ACME");
    expect(resolvePrivateCreator("00191050", ctx)).toBe("ACME");
    expect(resolvePrivateCreator("001910FF", ctx)).toBe("ACME");

    // Off-by-0x100: (0019,1100) has blockId 0x11, no creator at (0019,0011) → undefined.
    expect(resolvePrivateCreator("00191100", ctx)).toBeUndefined();

    // Off-by-0x1000: (0019,2000) has blockId 0x20, no creator at (0019,0020) → undefined.
    expect(resolvePrivateCreator("00192000", ctx)).toBeUndefined();
  });

  it("returns undefined for non-private (even-group) tags", () => {
    const ctx = makeCtx();
    expect(resolvePrivateCreator("00100010", ctx)).toBeUndefined();
  });

  it("returns undefined for private creator slot itself (0019,0010..00FF)", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00190010", Buffer.from("ACME", "ascii"), ctx);
    // The slot itself is below 0x1000, so resolvePrivateCreator returns undefined.
    expect(resolvePrivateCreator("00190010", ctx)).toBeUndefined();
    expect(resolvePrivateCreator("00190050", ctx)).toBeUndefined();
  });
});

describe("registerPrivateCreator — trims trailing space/NUL padding", () => {
  it("trims trailing space from creator string ('ACME ' → 'ACME')", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00190010", Buffer.from("ACME ", "ascii"), ctx);
    expect(resolvePrivateCreator("00191000", ctx)).toBe("ACME");
  });

  it("trims trailing NUL from creator string ('ACME\\0' → 'ACME')", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00190010", Buffer.from([0x41, 0x43, 0x4d, 0x45, 0x00]), ctx);
    expect(resolvePrivateCreator("00191000", ctx)).toBe("ACME");
  });

  it("ignores even-group (non-private) tags", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00100010", Buffer.from("ACME", "ascii"), ctx);
    expect(ctx.creators.size).toBe(0);
  });

  it("ignores private elements outside (gggg,0010..00FF) creator slots", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00191000", Buffer.from("ACME", "ascii"), ctx);
    expect(ctx.creators.size).toBe(0);
  });

  it("ignores empty creator strings (all padding)", () => {
    const ctx = makeCtx();
    registerPrivateCreator("00190010", Buffer.from([0x20, 0x20]), ctx);
    expect(ctx.creators.size).toBe(0);
  });
});

describe("matchRepeatingGroup — pattern matching against family entries", () => {
  it("matches (50A0,3000) against (50xx,3000) Curve Data family", () => {
    const fam = matchRepeatingGroup("50A03000");
    expect(fam).toBeDefined();
    expect(fam?.keyword).toBe("CurveData");
  });

  it("matches (6000,0010) against (60xx,0010) Overlay Rows family", () => {
    const fam = matchRepeatingGroup("60000010");
    expect(fam).toBeDefined();
    expect(fam?.keyword).toBe("OverlayRows");
  });

  it("does not match concrete tags that have no family pattern", () => {
    expect(matchRepeatingGroup("00100010")).toBeUndefined();
    expect(matchRepeatingGroup("0020000D")).toBeUndefined();
  });
});
