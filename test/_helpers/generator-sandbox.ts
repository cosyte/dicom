/**
 * A throwaway copy of the repository subset the generators read and write, so a
 * generator suite never mutates the working tree - internal test utility, not
 * exported from `src/index.ts`.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN REASONED. The two generator suites prove
 * their pins by mutation: they repoint `vendor/nema/<part>/SHA.txt` at a mutant
 * document, and one of them overwrites the bytes AT the pinned path, because
 * corrupting those bytes is the only way to reach the content re-hash. Vitest runs
 * test files in parallel, so for the few hundred milliseconds a mutation is live,
 * every other worker sees it. `test/docs/spec-citations.test.ts` re-hashes PS3.5,
 * PS3.6 and PS3.15 at MODULE LOAD, which makes it a concurrent reader of TWO of the
 * parts these suites mutate, `part05` and `part15`, and a reader that fails at
 * module load takes its whole file with it. Two, not all of them: see the trap
 * below on which part a live reader was actually exposed to.
 *
 * The window was measured on this repository rather than argued about. A probe
 * running the citation gate's `readPinned` in a loop over ALL FOUR vendored part
 * directories, against ten runs of the two generator suites, logged 1,542 read
 * cycles and saw the tree inconsistent in four distinct ways:
 *
 *   - `SHA.txt` holding `RESERVED` instead of a hash (the shape-check mutation),
 *   - `SHA.txt` naming a directory that does not exist yet, or no longer does,
 *   - the file at the pinned path not hashing to the pin (the content mutation),
 *   - and the worst one: **a pin that verifies against a document that is not the
 *     committed one.** A mutant is written into a directory named by its OWN hash,
 *     so re-hashing it SUCCEEDS. A reader's integrity check cannot see that at all;
 *     it resolves clauses against a mutated standard and reports green.
 *
 * 🛑 BE EXACT ABOUT WHICH PART A LIVE READER WAS ACTUALLY EXPOSED TO, because the
 * first version of this header was not. The probe read four part directories; the
 * citation gate reads THREE, and `VENDORED_PARTS` in
 * `test/docs/spec-citations.test.ts` names them: `part05`, `part06`, `part15`. So
 * the overlap between what that gate reads and what these two suites mutate is
 * `part05` and `part15` only. `part05-2004` is mutated by the repeating-groups
 * suite and opened by nothing else in the repository except the generator that
 * mutates it, so its share of the count evidences an inconsistent tree but not an
 * exposed reader; `part06` is the mirror error, re-hashed at module load by the
 * gate and mutated by nobody. "A concurrent reader of exactly those files" was
 * wrong in both directions and is not a phrasing to restore.
 *
 * 🛑 THE REMEDY IS NOT TO RELAX THE HASH PRECONDITION ON EITHER SIDE. The pin is the
 * integrity check on a vendored normative source, and the last of those four
 * observations is the integrity check itself being corrupted mid-run. Weakening a
 * reader to tolerate a writer would trade the guarantee for a green board. The
 * mutation is relocated instead, so there is nothing for a reader to observe.
 *
 * WHAT IS COPIED, AND WHY IT IS THE WHOLE SUBSET AND NOT THE VENDOR TREE ALONE.
 * Both generators resolve their own repository root from `import.meta.url`, so
 * relocating the DOCUMENT is not enough: the SCRIPT has to be relocated with it, and
 * then the script's own relative imports have to resolve, and its OUTPUT has to land
 * beside them rather than in `src/dictionary/generated/`. That last part matters
 * independently - the two generator suites also raced each OTHER through those two
 * artifacts, which is the flake `generate-repeating-groups.test.ts` disclosed and
 * declined to fix. Copying `scripts/`, `src/` and `vendor/` closes both, and neither
 * generator takes a new input: an output-path or vendor-root override would be an
 * argument on a script the byte-identical regen gate depends on, and that gate is
 * worth more than the convenience.
 *
 * The copy is taken once per test FILE, in a `beforeAll`, not once per mutation, so
 * a run pays for two of them. 🛑 DERIVE ITS COST, DO NOT READ A FIGURE OFF `du -sh`,
 * AND DO NOT WRITE ONE HERE: `du -sb scripts src vendor` is the answer in one
 * command, and no numeral for it survives in this repository, because the one that
 * used to sit on this line was wrong. It read "~5 MB", taken from `du -sh` on a
 * compressing filesystem, which reports blocks on disk rather than the bytes
 * `cpSync` copies and under-reported them by more than three times. Each sandbox
 * lives under `os.tmpdir()` in a `mkdtemp` directory, so two
 * suites - or two workers on one box - cannot collide, and a run killed mid-mutation
 * leaves a temp directory rather than a corrupted normative document in `git status`.
 */

import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The real repository, which a sandbox is copied FROM and is never written to. */
export const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * The directories a generator needs to run: its own source, the library code it
 * imports, and the vendored normative documents it reads. `vendor/` carries the
 * Innolitics mirror as well as the NEMA parts, and the Annex E generator reads both.
 */
const COPIED = ["scripts", "src", "vendor"] as const;

export interface Sandbox {
  /** Absolute path to the sandbox root; pass as `root` to `runRepoScript`. */
  readonly root: string;
  /** Remove the sandbox. Safe to call twice. */
  dispose(): void;
}

/**
 * Copy the generator-relevant subset of this repository into a fresh temp directory.
 *
 * @param label - Short tag woven into the directory name, so a leftover is traceable
 *   to the suite that made it.
 *
 * @example
 * ```ts
 * const sandbox = createGeneratorSandbox("annex-e");
 * const r = runRepoScript("generate-annex-e.ts", [], { root: sandbox.root, runner: "tsx" });
 * sandbox.dispose();
 * ```
 */
export function createGeneratorSandbox(label: string): Sandbox {
  const root = mkdtempSync(join(tmpdir(), `cosyte-dicom-${label}-`));
  for (const dir of COPIED) {
    cpSync(join(REPO_ROOT, dir), join(root, dir), { recursive: true });
  }
  // Node decides a `.ts` file's module system from the nearest `package.json`, and
  // both generators are ESM. This is deliberately NOT a copy of the real manifest:
  // the generators import nothing but node builtins and their own relative paths, so
  // a two-key file is the whole precondition, and copying the real one would couple
  // the sandbox to fields it does not use.
  writeFileSync(join(root, "package.json"), '{ "type": "module", "private": true }\n', "utf8");
  return {
    root,
    dispose() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
