/**
 * Tests for scripts/generate-repeating-groups.ts.
 *
 * The property under test is the one this slice exists to create: **the PS3.5
 * repeating-group bound is read out of pinned normative documents, not
 * transcribed into the source tree.** A transcribed bound and a derived bound
 * look identical when they agree, which is exactly why agreeing is not evidence.
 * So every test below mutates a vendored document and asserts the run changes:
 * either it goes red, or the emitted bound moves with the document.
 *
 * The four mutations, and what each one would catch:
 *
 *   1. Move the overlay bound in the CURRENT edition's normative "shall"
 *      sentence only. The section now contradicts its own descriptive sentence,
 *      and the generator refuses rather than picking one.
 *   2. Move it in BOTH of the current edition's sentences. Self-consistent now,
 *      so the cross-check against PS3.5-2004 is the thing that has to catch it.
 *   3. Move the overlay bound in the 2004 edition instead. Same cross-check, from
 *      the other side, which is what proves the 2004 document is really read.
 *   4. Move the CURVE bound in the 2004 edition. Nothing contradicts it (the
 *      current edition retired curves and states no bound), so this one must not
 *      go red: the emitted artifact has to follow the document. That is the
 *      proof the curve half is derived rather than hard-coded, and in CI the
 *      byte-identical regen gate is what turns the drift red.
 *
 * Plus the delegation itself: the curve bound is only taken from a 2004 document
 * because the edition in force points at it, so removing that pointer must fail.
 *
 * Both generators write into src/dictionary/generated/. Every helper restores the
 * committed artifact and the pinned SHA in a `finally`. A run killed with SIGKILL
 * mid-mutation can still leave a repointed `SHA.txt` and a mutant directory
 * behind; all of it shows up in `git status`.
 *
 * TWO SHAPES OF RESIDUAL, and the second is worse, so state it separately. The
 * `withMutated*` helpers never touch the pinned file: they write a mutant into its
 * own SHA-named directory and repoint `SHA.txt`, so the worst case is a dangling
 * POINTER. The pin-content test below is different in kind: it writes over
 * `vendor/nema/part05/<sha>/part05.xml` and `.../04_05pu.pdf` themselves, because
 * corrupting the bytes at the pinned path is the only way to reach the content
 * re-hash. Its worst case is therefore a CORRUPTED NORMATIVE DOCUMENT on disk. That
 * is bounded three ways: the restore is in a `finally`, the restore is then proved
 * by re-hashing against the pin, and any escape is loud everywhere it matters
 * (`git status`, the next generator run, and the CI regen gate). Do not copy that
 * test's shape for anything that does not specifically need to defeat the re-hash.
 *
 * DISCLOSED RESIDUAL, because a known flake is worth more written down than found
 * twice. The curve-bound test below leaves `src/dictionary/generated/repeating-groups.ts`
 * holding `lowMax: 0x0e` for the few milliseconds between the generator writing it
 * and the `finally` restoring it. `generate-annex-e.test.ts` asserts that the Annex E
 * generator prints "over groups 5000-501E even (16)", a statistic it computes from
 * that same live file, and vitest runs test files in parallel. So the two CAN race,
 * and the loser is a red run rather than a wrong artifact: it fails closed, and the
 * committed output is restored either way. Not fixed here because the obvious fix is
 * an output-path override on the generator, which would add an input to a script the
 * byte-identical regen gate depends on, and that trade is worse than a rare, loud,
 * self-restoring flake. If it does start biting, prefer making the two files share a
 * worker over adding that override.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const GENERATOR = join(REPO_ROOT, "scripts", "generate-repeating-groups.ts");
const ARTIFACT = join(REPO_ROOT, "src", "dictionary", "generated", "repeating-groups.ts");

const PART05_ROOT = join(REPO_ROOT, "vendor", "nema", "part05");
const PART05_SHA_FILE = join(PART05_ROOT, "SHA.txt");
const PART05_2004_ROOT = join(REPO_ROOT, "vendor", "nema", "part05-2004");
const PART05_2004_SHA_FILE = join(PART05_2004_ROOT, "SHA.txt");

/** Spawning tsx, parsing 1 MB of DocBook and inflating a 546 KB PDF. */
const GENERATOR_TIMEOUT_MS = 120_000;

function runGenerator(): { code: number; stdout: string; stderr: string } {
  const tsxBin = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsxBin, [GENERATOR], { cwd: REPO_ROOT, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function pinnedShaOf(shaFile: string): string {
  return readFileSync(shaFile, "utf8").trim().split(/\s+/)[0] ?? "";
}

/** Slice `<section ... xml:id="sect_7.6"> ... </section>`, the same way the generator does. */
function section76(xml: string): string {
  const at = xml.indexOf('xml:id="sect_7.6"');
  expect(at, "part05.xml must carry a section 7.6").toBeGreaterThan(-1);
  const open = xml.lastIndexOf("<section", at);
  const close = xml.indexOf("</section>", at) + "</section>".length;
  return xml.slice(open, close);
}

/**
 * Run the generator against a **mutated** PS3.5 DocBook, then put everything back.
 *
 * The pin is re-hashed by the generator, so a mutant cannot simply be written
 * over the pinned file: it is committed to its own SHA-named directory with
 * `SHA.txt` pointed at it, and both are removed afterwards.
 */
function withMutatedPart05<T>(
  mutate: (xml: string) => string,
  fn: (r: { code: number; stdout: string; stderr: string }) => T,
): T {
  const originalSha = readFileSync(PART05_SHA_FILE, "utf8");
  const originalArtifact = readFileSync(ARTIFACT, "utf8");
  const pinned = pinnedShaOf(PART05_SHA_FILE);
  const xml = readFileSync(join(PART05_ROOT, pinned, "part05.xml"), "utf8");

  const mutated = mutate(xml);
  expect(mutated, "the mutation must actually change the document").not.toBe(xml);
  const mutantSha = createHash("sha256").update(Buffer.from(mutated, "utf8")).digest("hex");
  const mutantDir = join(PART05_ROOT, mutantSha);
  try {
    mkdirSync(mutantDir, { recursive: true });
    writeFileSync(join(mutantDir, "part05.xml"), mutated, "utf8");
    writeFileSync(PART05_SHA_FILE, `${mutantSha}\n`, "utf8");
    return fn(runGenerator());
  } finally {
    writeFileSync(PART05_SHA_FILE, originalSha, "utf8");
    rmSync(mutantDir, { recursive: true, force: true });
    writeFileSync(ARTIFACT, originalArtifact, "utf8");
  }
}

/**
 * Rewrite one literal string inside the 2004 PDF's compressed content streams.
 *
 * PS3.5-2004 predates NEMA's DocBook sources and exists only as a PDF, so a
 * mutation has to go through Flate. This finds the content stream carrying
 * `needle`, inflates it, substitutes, and re-deflates in place. The result has a
 * stale `/Length` and stale xref offsets, which is fine and deliberate: the
 * generator's reader locates streams by scanning and lets zlib find the end of
 * the deflate data, so it depends on neither. This is a test harness, not a PDF
 * writer.
 */
function mutatePdfBytes(buf: Buffer, needle: string, replacement: string): Buffer {
  const latin = buf.toString("latin1");
  const marker = /(?<![A-Za-z])stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const endAt = latin.indexOf("endstream", start);
    if (endAt < 0) continue;
    let inflated: Buffer;
    try {
      inflated = inflateSync(buf.subarray(start, endAt));
    } catch {
      continue;
    }
    const text = inflated.toString("latin1");
    if (!text.includes(needle)) continue;
    const rewritten = text.split(needle).join(replacement);
    return Buffer.concat([
      buf.subarray(0, start),
      deflateSync(Buffer.from(rewritten, "latin1")),
      buf.subarray(endAt),
    ]);
  }
  throw new Error(`no content stream carries ${needle}`);
}

function withMutatedPart052004<T>(
  needle: string,
  replacement: string,
  fn: (r: { code: number; stdout: string; stderr: string }) => T,
): T {
  const originalSha = readFileSync(PART05_2004_SHA_FILE, "utf8");
  const originalArtifact = readFileSync(ARTIFACT, "utf8");
  const pinned = pinnedShaOf(PART05_2004_SHA_FILE);
  const pdf = readFileSync(join(PART05_2004_ROOT, pinned, "04_05pu.pdf"));

  const mutated = mutatePdfBytes(pdf, needle, replacement);
  expect(mutated.equals(pdf), "the mutation must actually change the document").toBe(false);
  const mutantSha = createHash("sha256").update(mutated).digest("hex");
  const mutantDir = join(PART05_2004_ROOT, mutantSha);
  try {
    mkdirSync(mutantDir, { recursive: true });
    writeFileSync(join(mutantDir, "04_05pu.pdf"), mutated);
    writeFileSync(PART05_2004_SHA_FILE, `${mutantSha}\n`, "utf8");
    return fn(runGenerator());
  } finally {
    writeFileSync(PART05_2004_SHA_FILE, originalSha, "utf8");
    rmSync(mutantDir, { recursive: true, force: true });
    writeFileSync(ARTIFACT, originalArtifact, "utf8");
  }
}

describe("generate-repeating-groups", () => {
  // One happy-path invocation, asserted from many angles: the run is
  // deterministic, so re-spawning it per assertion buys nothing.
  let happy: { code: number; stdout: string; stderr: string };
  let artifactBefore: string;
  let artifactAfter: string;

  beforeAll(() => {
    artifactBefore = readFileSync(ARTIFACT, "utf8");
    happy = runGenerator();
    artifactAfter = readFileSync(ARTIFACT, "utf8");
  }, GENERATOR_TIMEOUT_MS);

  it("regenerates the committed artifact byte for byte", () => {
    expect(happy.stderr, happy.stderr).toBe("");
    expect(happy.code).toBe(0);
    expect(artifactAfter).toBe(artifactBefore);
  });

  it("names the PS3.5 edition it read rather than asserting one", () => {
    expect(happy.stdout).toMatch(/PS3\.5 edition: \d{4}[a-z]? \(sha256 [0-9a-f]{12}\)/);
  });

  it("prints both bounds, their source edition, and the group count each covers", () => {
    expect(happy.stdout).toContain("50xx [Curves (retired)] 5000-501E even (16 groups)");
    expect(happy.stdout).toContain("60xx [Overlay Planes] 6000-601E even (16 groups)");
    expect(happy.stdout).toContain("2 repeating-group masks covering 32 concrete group numbers");
    // Which document supplied which half is the asymmetry this slice closed.
    expect(happy.stdout).toMatch(/50xx \[Curves \(retired\)\].*from PS3\.5-2004 section 7\.6/);
    expect(happy.stdout).toMatch(/60xx \[Overlay Planes\].*from PS3\.5 2026c section 7\.6/);
  });

  it("prints the cross-check between the two editions", () => {
    expect(happy.stdout).toContain(
      "cross-check OK: both editions bound the overlay groups to 6000-601E",
    );
  });

  it("prints the odd-group exclusion that makes (6001,4000) a non-match", () => {
    expect(happy.stdout).toContain(
      "odd groups excluded by section 7.6 Note: 6001-601F (no repeating semantics)",
    );
  });

  it("emits the bound with the verbatim sentence it was read from", () => {
    expect(artifactAfter).toContain(
      'Repeating Groups shall only be allowed in the even numbered Groups 6000-601E."',
    );
    expect(artifactAfter).toContain(
      "Repeating Groups shall only be allowed in the even Groups (6000-601E,eeee) and even Groups (5000-501E,eeee) cases.",
    );
    expect(artifactAfter).toContain(
      '"60": Object.freeze({ prefix: 0x60, lowMin: 0x00, lowMax: 0x1e, label: "Overlay Planes" })',
    );
    expect(artifactAfter).toContain(
      '"50": Object.freeze({ prefix: 0x50, lowMin: 0x00, lowMax: 0x1e, label: "Curves (retired)" })',
    );
  });

  it(
    "refuses when the current edition's normative sentence contradicts its descriptive one",
    () => {
      withMutatedPart05(
        (xml) => {
          const sec = section76(xml);
          const moved = sec.replace(
            "allowed in the even numbered Groups 6000-601E.",
            "allowed in the even numbered Groups 6000-605E.",
          );
          expect(moved, "the shall-sentence must have moved").not.toBe(sec);
          return xml.replace(sec, moved);
        },
        (r) => {
          expect(r.code).not.toBe(0);
          expect(r.stderr).toContain("contradicts itself");
        },
      );
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses when the current edition's overlay bound disagrees with PS3.5-2004",
    () => {
      // Self-consistent within section 7.6 this time, so the section-level guard
      // above cannot see it. Only reading the other pinned document catches it,
      // which is what makes this a real cross-check rather than a restatement.
      withMutatedPart05(
        (xml) => {
          const sec = section76(xml);
          const moved = sec.split("6000-601E").join("6000-605E");
          expect(moved, "both sentences must have moved").not.toBe(sec);
          return xml.replace(sec, moved);
        },
        (r) => {
          expect(r.code).not.toBe(0);
          expect(r.stderr).toContain("the two pinned editions disagree");
          expect(r.stderr).toContain("6000-605E");
          expect(r.stderr).toContain("6000-601E");
        },
      );
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses when PS3.5-2004's overlay bound disagrees with the current edition",
    () => {
      // The same cross-check from the other side. Without this, a generator that
      // read the current edition and merely pretended to read the PDF would pass
      // every other test here.
      withMutatedPart052004("6000-601E", "6000-605E", (r) => {
        expect(r.code).not.toBe(0);
        expect(r.stderr).toContain("the two pinned editions disagree");
        expect(r.stderr).toContain("6000-605E");
      });
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "follows PS3.5-2004 when the curve bound moves, rather than emitting a hard-coded 501E",
    () => {
      // The curve half has no second opinion: the current edition retired curves
      // and states no bound, so nothing can contradict this and the run must NOT
      // go red. The emitted artifact moving is the whole proof that the bound is
      // read from the document. In CI the byte-identical regen gate is what turns
      // that drift red.
      withMutatedPart052004("501E,eeee", "500E,eeee", (r) => {
        expect(r.stderr, r.stderr).toBe("");
        expect(r.code).toBe(0);
        const emitted = readFileSync(ARTIFACT, "utf8");
        expect(emitted).toContain(
          '"50": Object.freeze({ prefix: 0x50, lowMin: 0x00, lowMax: 0x0e, label: "Curves (retired)" })',
        );
        // Eight groups now, not sixteen. Printed, so a re-pin that moved this
        // bound would show it in the run that moved it.
        expect(r.stdout).toContain("50xx [Curves (retired)] 5000-500E even (8 groups)");
        // The overlay half is untouched: a mutation must not smear.
        expect(emitted).toContain('lowMax: 0x1e, label: "Overlay Planes"');
      });
      // ...and the committed artifact is back to the pinned documents' answer.
      expect(readFileSync(ARTIFACT, "utf8")).toContain(
        '"50": Object.freeze({ prefix: 0x50, lowMin: 0x00, lowMax: 0x1e, label: "Curves (retired)" })',
      );
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses when the current edition stops delegating the curve bound to PS3.5-2004",
    () => {
      // The 2004 bound is only usable because the edition in force names that
      // exact document. Take the pointer away and continuing to read a 22-year-old
      // PDF is no longer justified, so the generator must stop rather than coast.
      withMutatedPart05(
        (xml) => {
          const sec = section76(xml);
          const moved = sec.replace(
            "http://medical.nema.org/MEDICAL/Dicom/2004/printed/04_05pu.pdf",
            "http://medical.nema.org/MEDICAL/Dicom/2004/printed/04_05pu-moved.pdf",
          );
          expect(moved, "the delegation link must have moved").not.toBe(sec);
          return xml.replace(sec, moved);
        },
        (r) => {
          expect(r.code).not.toBe(0);
          expect(r.stderr).toContain("does not link");
          expect(r.stderr).toContain("the delegation is unproven");
        },
      );
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses to generate when a vendored document is not the pinned bytes",
    () => {
      for (const shaFile of [PART05_SHA_FILE, PART05_2004_SHA_FILE]) {
        const original = readFileSync(shaFile, "utf8");
        const before = readFileSync(ARTIFACT, "utf8");
        try {
          // A well-formed SHA-256 that no file on disk hashes to: the shape check
          // passes and the content check is the one that has to catch it.
          writeFileSync(shaFile, `${"0".repeat(64)}\n`, "utf8");
          const r = runGenerator();
          expect(r.code, shaFile).not.toBe(0);
          expect(r.stderr, shaFile).toMatch(/cannot read|pin mismatch/);
        } finally {
          writeFileSync(shaFile, original, "utf8");
        }
        // Nothing was emitted from an unverified input.
        expect(readFileSync(ARTIFACT, "utf8"), shaFile).toBe(before);
      }
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses when the file AT the pinned path is not the pinned bytes",
    () => {
      // Distinct from the test above, and the distinction is the whole point.
      // Pointing SHA.txt at a hash nothing hashes to kills the run at readFileSync
      // ("cannot read"), so the CONTENT re-hash never executes and deleting it
      // leaves that test green. Verified: with the `actual !== sha` block removed,
      // every other test in this file still passes. Here SHA.txt is untouched and
      // the file opens fine, so only the re-hash can catch the swap. "Re-hashed
      // before use" is claimed in the changeset, CHANGELOG, CLAUDE.md,
      // vendor/nema/README.md and the generated header; this is the test that
      // makes the claim falsifiable.
      for (const [root, filename, shaFile] of [
        [PART05_ROOT, "part05.xml", PART05_SHA_FILE],
        [PART05_2004_ROOT, "04_05pu.pdf", PART05_2004_SHA_FILE],
      ] as const) {
        const pinned = pinnedShaOf(shaFile);
        const path = join(root, pinned, filename);
        const original = readFileSync(path);
        const before = readFileSync(ARTIFACT, "utf8");
        try {
          // Same length, one byte different: nothing about the path or the pin
          // changes, only the content.
          const swapped = Buffer.from(original);
          const last = swapped.length - 1;
          swapped[last] = (swapped[last] ?? 0) ^ 0xff;
          // Every other mutator here asserts the mutation landed; these must too.
          // On an empty buffer `swapped[-1] ^= 0xff` is a silent no-op and the test
          // would pass by proving nothing.
          expect(swapped.equals(original), "the mutation must change the document").toBe(false);
          writeFileSync(path, swapped);
          const r = runGenerator();
          expect(r.code, path).not.toBe(0);
          expect(r.stderr, path).toContain("pin mismatch");
        } finally {
          writeFileSync(path, original);
        }
        // This test writes over the NORMATIVE DOCUMENT itself, not a pointer, so a
        // short or failed restore leaves a corrupted standard on disk. Prove the
        // restore rather than assume it: re-hash and compare to the pin.
        expect(createHash("sha256").update(readFileSync(path)).digest("hex"), path).toBe(pinned);
        // Nothing was emitted from an input that failed its own precondition.
        expect(readFileSync(ARTIFACT, "utf8"), path).toBe(before);
      }
    },
    GENERATOR_TIMEOUT_MS,
  );

  it(
    "refuses a SHA.txt that is not a 64-char hex SHA-256",
    () => {
      for (const shaFile of [PART05_SHA_FILE, PART05_2004_SHA_FILE]) {
        const original = readFileSync(shaFile, "utf8");
        try {
          writeFileSync(shaFile, "RESERVED\n", "utf8");
          const r = runGenerator();
          expect(r.code, shaFile).not.toBe(0);
          expect(r.stderr, shaFile).toContain("64-char hex SHA-256");
        } finally {
          writeFileSync(shaFile, original, "utf8");
        }
      }
    },
    GENERATOR_TIMEOUT_MS,
  );
});
