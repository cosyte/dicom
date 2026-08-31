/**
 * The locked public export surface of the package root entry.
 *
 * `warning-codes.snapshot.test.ts` beside this file locks the two CODE registries, which is one
 * slice of the public contract. This locks the other one: the set of NAMES `@cosyte/dicom` exports
 * from `.`, which is what an installer can import at all. An export added, removed or renamed
 * without `public-exports.snapshot.txt` moving in the same change reds this test and the failure
 * names the export, so a surface change cannot reach a published tarball as a silent side effect of
 * a slice about something else.
 *
 * IT WALKS THE BARREL THROUGH THE COMPILER, NOT THE BUILT MODULE. A runtime `import * as ns` sees
 * value exports only, and this package's surface is mostly types: `DeidentifyReport`,
 * `UnauditableSequenceFinding` and `ImageView` carry more of the safety contract than any function
 * here does, and a type removed is exactly as breaking as a function removed. `getExportsOfModule`
 * answers both in one set, and a `export * as Dictionary` namespace counts as the one name it binds.
 *
 * NAMES ONLY, DELIBERATELY. No value is read into the snapshot and no type text is rendered into it.
 * The members of `WARNING_CODES` are somebody else's gate, a type's shape is the typechecker's, and
 * a file that recorded values would make every unrelated edit to a registry look like a public
 * surface change. The cost of that choice is stated rather than hidden: a name that changes from a
 * type export to a value export, or the reverse, keeps the same name and this gate stays green. That
 * is the boundary of what it claims.
 *
 * THE MUTATION CONTROL IS NOT OPTIONAL. A comparator that answered "identical" for every input would
 * read green forever, so the second test compiles a fixture in memory, compares it against a
 * deliberately stale list, and requires the comparator to separate the added names from the removed
 * one and to name all three. This repository has shipped a type-asserting smoke test that asserted
 * nothing; a gate with no red path is that again.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const ENTRY = join(REPO_ROOT, "src", "index.ts");
const SNAPSHOT_PATH = join(import.meta.dirname, "public-exports.snapshot.txt");

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
  strict: true,
};

/**
 * Code-unit ascending, which is the one order that is the same on every machine.
 *
 * `Array.prototype.sort` with no comparator is already code-unit, but it is spelled out here because
 * `localeCompare` is the habit in this repository's other barrel walk and it is ICU-dependent: it
 * orders `VERSION` against `ValueErrorCode` differently under different data, which would make the
 * committed file disagree with itself across machines.
 */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Every name `entry` exports, values and types alike, in {@link byCodeUnit} order. */
function exportedNames(program: ts.Program, entry: string): string[] {
  const source = program.getSourceFile(entry);
  if (source === undefined) throw new Error(`could not load ${entry}`);
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) throw new Error(`${entry} exports nothing`);
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((exported) => exported.getName())
    .sort(byCodeUnit);
}

/** The committed list, with its comment header and blank lines dropped. */
function readSnapshot(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * One line per differing export, each NAMING it.
 *
 * A rename shows up as both an addition and a removal, which is the honest reading: nothing on
 * either side records that the two are the same export under a new name.
 */
function drift(actual: readonly string[], snapshot: readonly string[]): string[] {
  const committed = new Set(snapshot);
  const live = new Set(actual);
  return [
    ...actual
      .filter((name) => !committed.has(name))
      .map((name) => `exported but not in the snapshot: ${name}`),
    ...snapshot
      .filter((name) => !live.has(name))
      .map((name) => `in the snapshot but no longer exported: ${name}`),
  ];
}

describe("dicom public API: the root entry's export surface is locked", () => {
  test("the export set matches the committed snapshot", () => {
    const program = ts.createProgram([ENTRY], COMPILER_OPTIONS);
    const actual = exportedNames(program, ENTRY);

    const snapshot = readSnapshot(SNAPSHOT_PATH);

    // FIRST, AND DELIBERATELY SO: this is the assertion that NAMES the export that differs, and an
    // added, removed or renamed export has to red on this one rather than on the length below it.
    // Both would red, and whichever runs first is the message the developer who broke it reads: one
    // of them names the export, the other reports two numbers that differ by one and identifies
    // nothing. Every assertion below is a supplement to this line and must stay below it.
    expect(drift(actual, snapshot)).toStrictEqual([]);

    // The size check is the committed file itself, never a literal sitting under it. A hard-coded
    // floor cannot be maintained against a surface that moves every phase, so it drifts downward in
    // meaning until it would clear a walk that resolved a fraction of the barrel. It also carries
    // one property `drift` cannot see, because `drift` compares SETS: a name committed twice makes
    // the file disagree with the surface it claims to pin while every set difference stays empty.
    //
    // What it does NOT close, stated rather than implied: a walk that shrinks and a snapshot
    // regenerated out of that same shrunken walk move together, so no assertion in this file can
    // separate them. The committed diff is the control there, which is why the surface is a file.
    expect(actual.length).toBe(snapshot.length);

    // The sets agreeing is the contract; this pins the committed file to the canonical order too, so
    // the next reviewer reads a diff of what changed rather than a reshuffle.
    expect(snapshot).toStrictEqual([...snapshot].sort(byCodeUnit));
    // Building a program over the whole barrel costs seconds on a loaded box, and the work is
    // inherently a compile; the default budget is not enough under a full suite run.
  }, 120_000);

  test("a drifted export is detected and named (the gate can go red)", () => {
    const fixture = join(REPO_ROOT, "__public-exports-control__.ts");
    const source = ts.createSourceFile(
      fixture,
      [
        "export const kept = 1;",
        "export const addedValue = 2;",
        "export interface AddedType {",
        "  readonly a: number;",
        "}",
      ].join("\n"),
      ts.ScriptTarget.ES2023,
      true,
    );

    const host = ts.createCompilerHost(COMPILER_OPTIONS);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, ...rest) =>
      name === fixture ? source : getSourceFile(name, ...rest);
    host.fileExists = (name) => name === fixture;
    host.readFile = (name) => (name === fixture ? source.getFullText() : undefined);

    const program = ts.createProgram([fixture], COMPILER_OPTIONS, host);
    const actual = exportedNames(program, fixture);

    // A type export and a value export both reach the set, which is the property the real test
    // rests on and the one a runtime `import * as` walk would lose.
    expect(actual).toStrictEqual(["AddedType", "addedValue", "kept"]);

    const stale = ["kept", "removedName"];
    expect(drift(actual, stale)).toStrictEqual([
      "exported but not in the snapshot: AddedType",
      "exported but not in the snapshot: addedValue",
      "in the snapshot but no longer exported: removedName",
    ]);

    // And it is silent when they agree, so the red path above is a real signal rather than a
    // comparator that reports drift for every input.
    expect(drift(actual, actual)).toStrictEqual([]);
  }, 30_000);
});
