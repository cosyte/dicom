/**
 * The budgets and the floor a pull request is held to. The Budgets workflow judges a reading of the
 * build against bench/budgets.json and bench/floor.json with `cosyte-bench gate`; these tests hold
 * the two files to what that judgement needs, without taking a reading:
 *
 * - every limit names a case the suite has, so no limit goes unjudged and no case is renamed out
 *   from under one (the gate exits 2 on a rule that matches no case, which would fail every pull
 *   request rather than catch a regression);
 * - every case has a peak budget at the standard's multiple (20 times one input for a dense shape, 3
 *   times for the CT shapes), or is listed below as a case still over it, with the gap AGENTS.md
 *   gives: a case we miss is written down, never given a looser budget;
 * - every case has an allocation and a throughput budget, and the import a time and a size budget;
 * - the floor is a recorded one: seven or more GitHub-hosted readings on the Node line the Budgets
 *   workflow reads on, keeping every case of the suite and the import.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BENCH_CONTRACT, readBudgets, readFloor, type BudgetRule } from "@cosyte/bench";
import { describe, expect, it } from "vitest";

import suite from "../../bench/dicom.bench.mjs";

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const budgets = readBudgets(readFileSync(root("bench/budgets.json"), "utf8"));
const floor = readFloor(readFileSync(root("bench/floor.json"), "utf8"));

/** The peak multiple each shape is held to: the CT shapes are almost all Pixel Data. */
const PEAK_MULTIPLE = { dense: 20, opaque: 3 } as const;
const isOpaque = (benchmark: string) => benchmark.endsWith(": CT");

/**
 * The cases still over their peak budget, with no peak budget until they meet it. Each is listed in
 * AGENTS.md, under Benchmarks, with its reading. Remove a case here, and add its rule to
 * bench/budgets.json, once it reads under the multiple.
 */
const STILL_OVER = [
  { benchmark: "parseDicom, then read tags: worklist item", size: "1 KiB" },
  { benchmark: "parseDicom, then read tags: SR, header only", size: "50 measurements, 26 KiB" },
  { benchmark: "parseDicom, then read tags: SR, header only", size: "1,000 measurements, 503 KiB" },
] as const;

const cases = suite.benchmarks.flatMap((b) =>
  b.sizes.map((s) => ({ benchmark: b.name, size: s.label })),
);
const name = (c: { benchmark: string; size: string }) => `${c.benchmark} @ ${c.size}`;
const matches = (rule: BudgetRule, c: { benchmark: string; size: string }) =>
  (rule.benchmark === undefined || rule.benchmark === c.benchmark) &&
  (rule.size === undefined || rule.size === c.size);
const rulesFor = (c: { benchmark: string; size: string }) =>
  budgets.rules.filter((rule) => matches(rule, c));

describe("bench/budgets.json", () => {
  it("names only benchmarks and sizes the suite has", () => {
    expect(suite.name).toBe("@cosyte/dicom");
    for (const rule of budgets.rules) {
      expect(
        cases.some((c) => matches(rule, c)),
        JSON.stringify(rule),
      ).toBe(true);
    }
  });

  it("holds every case to the standard's peak multiple, or lists it as still over", () => {
    const over = new Set(STILL_OVER.map(name));
    for (const c of cases) {
      const multiples = rulesFor(c).flatMap((rule) =>
        rule.peakMultiple === undefined ? [] : Object.values(rule.peakMultiple),
      );
      if (over.has(name(c))) {
        expect(multiples, `${name(c)} is listed as still over`).toEqual([]);
        continue;
      }
      expect(multiples.length, `${name(c)} has a peak budget`).toBeGreaterThan(0);
      const want = isOpaque(c.benchmark) ? PEAK_MULTIPLE.opaque : PEAK_MULTIPLE.dense;
      for (const m of multiples) expect(m, name(c)).toBe(want);
    }
  });

  it("lists every case still over its peak budget in AGENTS.md", () => {
    const agents = readFileSync(root("AGENTS.md"), "utf8");
    for (const c of STILL_OVER) expect(agents, name(c)).toContain(name(c));
  });

  it("holds every case to an allocation and a throughput budget", () => {
    for (const c of cases) {
      const rules = rulesFor(c);
      expect(
        rules.some((r) => r.allocBytesPerOp !== undefined),
        name(c),
      ).toBe(true);
      expect(
        rules.some((r) => r.minBytesPerSecond !== undefined),
        name(c),
      ).toBe(true);
    }
  });

  it("holds the import to a cold import time and a gzipped size", () => {
    expect(budgets.import?.maxColdImportMs).toBe(15);
    expect(budgets.import?.maxGzipBytes).toBeGreaterThan(0);
  });
});

describe("bench/floor.json", () => {
  it("is recorded from GitHub-hosted readings on the Node line the Budgets workflow reads on", () => {
    expect(floor.suite).toBe(suite.name);
    expect(floor.runnerClass).toMatch(/^github-actions-github-hosted-/);
    expect(floor.nodeMajor).toBe(22);
    expect(floor.readings).toBeGreaterThanOrEqual(BENCH_CONTRACT.FLOOR_MIN_READINGS);
    expect(readFileSync(root(".github/workflows/budgets.yml"), "utf8")).toContain(
      'node-version: "22"',
    );
  });

  it("keeps every case of the suite and the import", () => {
    expect(floor.cases.map(name).sort()).toEqual(cases.map(name).sort());
    expect(floor.import).not.toBeNull();
  });
});
