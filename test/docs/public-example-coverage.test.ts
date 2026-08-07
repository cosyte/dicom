import { join } from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

/**
 * The `@example` coverage gate.
 *
 * `CLAUDE.md` has required "JSDoc (with `@example`) on every public export" since Phase 1, and the
 * roadmap finalizes that rule in Phase 8. Until now it was a convention, which means it held exactly
 * as long as whoever added the next export remembered it. This test makes it a gate.
 *
 * IT WALKS THE PUBLIC BARREL, NOT `src/`. The bar is about what an installer sees in their editor,
 * so the set under test is the export set of `src/index.ts` resolved through the compiler: an alias
 * is followed to the symbol it names, and a `export * as Dictionary` namespace counts as one export
 * whose own module JSDoc has to carry the example.
 *
 * A TYPE COUNTS. An interface or a type alias shows the same hover card as a function does, and the
 * types are where a consumer of this package spends most of their reading (`DeidentifyReport` and
 * `ImageView` carry more of the safety contract than any function here does).
 *
 * THE MUTATION CONTROL IS NOT OPTIONAL. A coverage checker that silently answered "yes" for every
 * symbol would read green forever, so the second test compiles a two-export fixture in memory and
 * requires the detector to separate the documented export from the undocumented one. This repository
 * has shipped a type-asserting smoke test that asserted nothing; a gate with no red path is that
 * again.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const ENTRY = join(REPO_ROOT, "src", "index.ts");

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
  strict: true,
};

/**
 * Does any JSDoc block attached to any declaration of `symbol` carry an `@example` tag?
 *
 * A namespace export (`export * as Dictionary from ...`) resolves to a MODULE symbol whose only
 * declaration is the source file itself, and a file's own `@module` block is a leading comment
 * rather than a JSDoc node hanging off a declaration. Both routes are checked, because reading only
 * the second reported this package's one namespace export as undocumented while its module doc
 * carried the example.
 */
function hasExample(symbol: ts.Symbol, checker: ts.TypeChecker): boolean {
  if (symbol.getJsDocTags(checker).some((t) => t.name === "example")) return true;
  for (const decl of symbol.getDeclarations() ?? []) {
    if (ts.isSourceFile(decl)) {
      const text = decl.getFullText();
      for (const range of ts.getLeadingCommentRanges(text, 0) ?? []) {
        if (text.slice(range.pos, range.end).includes("@example")) return true;
      }
      continue;
    }
    for (const doc of ts.getJSDocCommentsAndTags(decl)) {
      if (doc.getFullText().includes("@example")) return true;
    }
  }
  return false;
}

/** The export set of `entry`, with each alias resolved to the symbol it actually names. */
function publicExports(entry: string): { name: string; documented: boolean }[] {
  const program = ts.createProgram([entry], COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (source === undefined) throw new Error(`could not load ${entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) throw new Error(`${entry} exports nothing`);
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((exported) => {
      const target =
        (exported.flags & ts.SymbolFlags.Alias) !== 0
          ? checker.getAliasedSymbol(exported)
          : exported;
      return { name: exported.getName(), documented: hasExample(target, checker) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe("public API @example coverage", () => {
  test("every public export carries an @example", () => {
    const exports_ = publicExports(ENTRY);

    // Not a claim about the size of the surface, which moves every phase: a floor that proves the
    // compiler resolved the barrel at all, so a zero-export read cannot pass as full coverage.
    expect(exports_.length).toBeGreaterThan(20);

    const missing = exports_.filter((e) => !e.documented).map((e) => e.name);
    expect(missing).toStrictEqual([]);
    // Building a program over the whole barrel costs seconds on a loaded box; the default 10s
    // budget failed under a full `verify.sh` run and the work is inherently a compile.
  }, 120_000);

  test("an export with no @example is detected (the gate can go red)", () => {
    const fixture = join(REPO_ROOT, "__example-coverage-control__.ts");
    const source = ts.createSourceFile(
      fixture,
      [
        "/**",
        " * Documented.",
        " *",
        " * @example",
        " * ```ts",
        " * documented();",
        " * ```",
        " */",
        "export function documented(): void {}",
        "",
        "/** Undocumented: prose only, no example. */",
        "export function undocumented(): void {}",
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
    const checker = program.getTypeChecker();
    const compiled = program.getSourceFile(fixture);
    expect(compiled).toBeDefined();
    const moduleSymbol = compiled === undefined ? undefined : checker.getSymbolAtLocation(compiled);
    expect(moduleSymbol).toBeDefined();
    const found =
      moduleSymbol === undefined
        ? []
        : checker
            .getExportsOfModule(moduleSymbol)
            .map((s) => `${s.getName()}:${String(hasExample(s, checker))}`)
            .sort();

    expect(found).toStrictEqual(["documented:true", "undocumented:false"]);
  }, 30_000);
});
