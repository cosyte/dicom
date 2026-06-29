import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import type { Tag } from "../dictionary/types.js";
import { Dataset } from "./dataset.js";
import { Element } from "./element.js";
import { Item } from "./item.js";

function makeElement(tag: Tag): Element {
  return new Element({
    tag,
    vr: "LO",
    vm: 1,
    length: 4,
    rawBytes: Buffer.from("data"),
    byteOffset: 0,
    littleEndian: true,
  });
}

function datasetWith(tags: readonly Tag[]): Dataset {
  const map = new Map<Tag, Element>();
  for (const t of tags) map.set(t, makeElement(t));
  return new Dataset({ warnings: [], elements: map });
}

describe("Dataset navigation API (D-42)", () => {
  it("get() resolves a tag case-insensitively", () => {
    const ds = datasetWith(["00100010"]);
    expect(ds.get("00100010")?.tag).toBe("00100010");
    expect(ds.get("00100010".toLowerCase())?.tag).toBe("00100010");
  });

  it("get() returns undefined for an absent tag", () => {
    expect(datasetWith(["00100010"]).get("7FE00010")).toBeUndefined();
  });

  it("has() reports presence case-insensitively", () => {
    const ds = datasetWith(["00080060"]);
    expect(ds.has("00080060")).toBe(true);
    expect(ds.has("00080060".toLowerCase())).toBe(true);
    expect(ds.has("00080018")).toBe(false);
  });

  it("elements() returns all elements in insertion order", () => {
    const ds = datasetWith(["00080060", "00100010", "00280010"]);
    expect(ds.elements().map((e) => e.tag)).toEqual(["00080060", "00100010", "00280010"]);
  });

  it("getAll() returns a 0- or 1-length array", () => {
    const ds = datasetWith(["00100010"]);
    expect(ds.getAll("00100010").map((e) => e.tag)).toEqual(["00100010"]);
    expect(ds.getAll("7FE00010")).toEqual([]);
  });

  it("Item inherits the navigation surface from Dataset", () => {
    const map = new Map<Tag, Element>([["00100010", makeElement("00100010")]]);
    const item = new Item({ index: 0, warnings: [], elements: map });
    expect(item.get("00100010")?.tag).toBe("00100010");
    expect(item.has("00100010")).toBe(true);
    expect(item.elements()).toHaveLength(1);
    expect(item.getAll("00100010")).toHaveLength(1);
    expect(item.index).toBe(0);
  });
});
