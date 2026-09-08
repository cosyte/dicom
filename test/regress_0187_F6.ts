import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseDateTime, toISO } from "../src/index.js";

/**
 * Refuter probe for S0187-consistent-date-conversion-surface-1 (impl gate,
 * loop 2), finding F6, adopted from the umbrella verdict folder.
 *
 * NOT a shipped vitest test: this repo's vitest `include` is
 * `test/[*][*]/[*].test.ts` and a `regress_*` artifact carries a single-dot
 * extension, so the two patterns cannot both be satisfied. It runs as a script
 * instead, the same shape `test/regress_0058_F1.ts` takes:
 *
 *   pnpm exec tsx test/regress_0187_F6.ts
 *
 * Exit 0 = every probe held. A FAIL line names the probe that did not, and its
 * assertion message.
 *
 * WHAT IS BEING PINNED. `README.md` carries the worked cross-package aliasing
 * example the conversion surface owes, because the three names are identical in
 * every `@cosyte/*` parser and a file reading two of them has to alias. The
 * shipped example's `@cosyte/hl7` line read
 *
 *   hl7ToISO(parseDtm("20240115133015").value); // the same string, ...
 *
 * and `.value` is THIS package's decoder wrapper, carried across by mistake:
 * `@cosyte/hl7`'s `parseDtm` answers its parts directly. Measured in an hl7
 * checkout at 60bdef660a864493680bf76e8d358a4d5387ce3e:
 *
 *   Object.prototype.hasOwnProperty.call(parseDtm("20240115133015"), "value")
 *     -> false
 *   toISO(parseDtm("20240115133015").value) -> undefined
 *   toISO(parseDtm("20240115133015"))       -> "2024-01-15T13:30:15"
 *
 * So the line answered `undefined` under a comment claiming "the same string",
 * and under `tsc` it is `Property 'value' does not exist on type 'DtmParts'`.
 *
 * The assertion is over the README TEXT rather than over both packages, because
 * `@cosyte/hl7` is not a dependency here and this package takes none: no
 * `parseDtm(...)` call inside the aliasing fence may read `.value` off its
 * result. The live gate on the same property is
 * `test/conversion-surface.test.ts`, under "the README's cross-package aliasing
 * example is worked, not decorative"; this file is the reproduction the verdict
 * attached, kept beside the code it constrains.
 */

const README = join(import.meta.dirname, "..", "README.md");

/** Every fenced ```ts block in the README, in document order. */
function fences(markdown: string): string[] {
  const out: string[] = [];
  let open = false;
  let buffer: string[] = [];
  for (const line of markdown.split("\n")) {
    if (!open && /^```ts\s*$/u.test(line)) {
      open = true;
      buffer = [];
      continue;
    }
    if (open && /^```\s*$/u.test(line)) {
      open = false;
      out.push(buffer.join("\n"));
      continue;
    }
    if (open) buffer.push(line);
  }
  return out;
}

const results: string[] = [];
function probe(name: string, fn: () => void): void {
  try {
    fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}\n      ${(err as Error).message.split("\n").join("\n      ")}`);
  }
}

const aliasing = fences(readFileSync(README, "utf8")).filter((fence) =>
  fence.includes("@cosyte/hl7"),
);

// ---------------------------------------------------------------------------
// P1. The example exists at all: a README with no cross-package fence owes the
//     criterion nothing to be wrong about, and would pass P2 vacuously.
// ---------------------------------------------------------------------------
probe("the README carries a cross-package aliasing example naming @cosyte/hl7", () => {
  assert.ok(
    aliasing.length > 0,
    "no ```ts fence in the README imports from @cosyte/hl7, so the worked " +
      "import-aliasing example is not present at all",
  );
});

// ---------------------------------------------------------------------------
// P2. F6 itself: hl7's decoder result is passed straight in.
// ---------------------------------------------------------------------------
probe("no hl7 call in that example reads a .value wrapper off parseDtm", () => {
  for (const fence of aliasing) {
    const offending = fence
      .split("\n")
      .filter((line) => /parseDtm\([^)]*\)\s*\.\s*value/u.test(line));
    assert.deepEqual(
      offending,
      [],
      "`@cosyte/hl7`'s parseDtm returns its parts directly and has no `.value` " +
        "wrapper, so this line evaluates to hl7's toISO(undefined) === undefined, " +
        "not the string its comment claims, and does not compile under tsc:\n  " +
        offending.join("\n  "),
    );
  }
});

// ---------------------------------------------------------------------------
// P3. The other half, which a blanket ".value is wrong" edit would break: THIS
//     package's decoders really do wrap, so the dicom line's `.value` is right
//     and the asymmetry in the fence is the fact the example teaches.
// ---------------------------------------------------------------------------
probe("this package's own line keeps the .value its decoders really return", () => {
  const decoded = parseDateTime("20240115133015");
  assert.ok(
    Object.prototype.hasOwnProperty.call(decoded, "value"),
    "parseDateTime here answers { value, nonstandardOffset }",
  );
  assert.equal(toISO(decoded.value), "2024-01-15T13:30:15");
  assert.ok(
    aliasing.some((fence) => /parseDateTime\([^)]*\)\s*\.\s*value/u.test(fence)),
    "the dicom line in the aliasing fence still reads .value off parseDateTime",
  );
});

for (const line of results) console.log(line);
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
