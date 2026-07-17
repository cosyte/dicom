import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { beforeAll } from "vitest";

import { docSnippetSuite } from "@cosyte/vitest-config/snippets";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` is extracted,
 * compiled, and executed, and its inline `// =>` assertions are checked — so a documented example
 * can never silently drift from the shipped code (the documentation analog of the parser conformance
 * runners). Blocks tagged ` ```ts runnable throws ` must throw; plain ` ```ts ` blocks are
 * illustrative and are not executed.
 *
 * `@cosyte/dicom` ships a single top-level entry, so every snippet imports `@cosyte/dicom` and
 * resolves against the **built** ESM artifact — exactly what an installer loads, not the source tree.
 * Every DICOM object in the docs is synthetic: a small base64-encoded Part 10 buffer built from an
 * invented patient and fake UIDs, so a snippet needs no `.dcm` file on disk and no real PHI ever
 * touches this suite. The runnable blocks stay on the deterministic, in-process parser / serializer /
 * de-identifier (`parseDicom`, `serializeDicom`, `deidentify`); nothing here opens a socket.
 *
 * The shared CI gate runs `test` before `build`, so we provision `dist/` on demand here rather than
 * assuming order.
 */
const root = join(import.meta.dirname, "..");

/** Map the published entry point to its built ESM artifact. */
const ENTRY = join(root, "dist", "index.mjs");

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 180_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve: (specifier) => (specifier === "@cosyte/dicom" ? ENTRY : undefined),
});
