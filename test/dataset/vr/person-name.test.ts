import { describe, expect, it } from "vitest";

import { parsePersonName } from "../../../src/dataset/vr/person-name.js";

describe("parsePersonName (PN — PS3.5 §6.2.1.1)", () => {
  it("splits five ^-delimited components, filling trailing slots with ''", () => {
    const pn = parsePersonName("Doe^Jane^^Dr^");
    expect(pn.alphabetic).toEqual({
      familyName: "Doe",
      givenName: "Jane",
      middleName: "",
      namePrefix: "Dr",
      nameSuffix: "",
    });
    expect(pn.ideographic).toBeUndefined();
    expect(pn.phonetic).toBeUndefined();
  });

  it("a bare family name fills the remaining four components with ''", () => {
    const pn = parsePersonName("Doe");
    expect(pn.alphabetic).toEqual({
      familyName: "Doe",
      givenName: "",
      middleName: "",
      namePrefix: "",
      nameSuffix: "",
    });
  });

  it("splits the three =-delimited component groups", () => {
    const pn = parsePersonName("Yamada^Tarou=Yam^Tar=yamada^tarou");
    expect(pn.alphabetic.familyName).toBe("Yamada");
    expect(pn.ideographic?.familyName).toBe("Yam");
    expect(pn.phonetic?.givenName).toBe("tarou");
  });

  it("an empty value yields an all-empty alphabetic group", () => {
    const pn = parsePersonName("");
    expect(pn.alphabetic.familyName).toBe("");
    expect(pn.ideographic).toBeUndefined();
  });

  it("ignores extra components beyond the fifth", () => {
    const pn = parsePersonName("a^b^c^d^e^f");
    expect(pn.alphabetic.nameSuffix).toBe("e");
  });
});
