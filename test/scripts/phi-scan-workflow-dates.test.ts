/**
 * The ISO date rule against the dates a GitHub Actions workflow carries beside a shared-workflow pin.
 *
 * A caller pins a shared workflow by commit and names its release in a comment on the same line:
 * `uses: <owner>/<repo>/<path>@<sha> # workflows-<date>-<12 hex>`. The pre-push hook hands every
 * outgoing path to this scanner, so that date would red every push that moves a pin. The scanner
 * passes exactly two shapes, in files under `.github/workflows/` only:
 *
 *   - a date inside a `workflows-YYYY-MM-DD-<12 hex>` release name;
 *   - a date in a comment on a `uses:` line, or on a comment-only line directly above or below one.
 *
 * Every case here gives each date its own value, so the hit list says which shapes were passed and
 * which were caught, and the same bytes are scanned outside `.github/workflows/` as the control.
 *
 * 🛑 EVERY VALUE IS ASSEMBLED AT RUNTIME, for the reason `test/helpers/phi-scan-violators.ts` gives:
 * this file is under `test/`, so the gate scans it, and a spelled-out date run in it reds the suite.
 * Every date is synthetic.
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { runRepoScript } from "../helpers/run-script.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** An ISO date from its parts, so no date run is spelled out in this file. */
function iso(year: number, month: number, day: number): string {
  return [String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

/** A twelve-hex abbreviated commit, as a release name ends with. Synthetic. */
const HEX12 = "c0ffee" + "0b5e55";
/** The full forty-hex commit a `uses:` line pins. Synthetic. */
const SHA40 = HEX12 + "d".repeat(28);

/** A release name for `date`. */
function release(date: string): string {
  return `workflows-${date}-${HEX12}`;
}

// One distinct synthetic date per shape. Every year is inside the scanner's 120-year window.
const PASS_RELEASE_ON_USES = iso(2026, 1, 3);
const PASS_RELEASE_IN_STEP_USES = iso(2026, 1, 4);
const PASS_PLAIN_COMMENT_ON_USES = iso(2026, 1, 5);
const PASS_COMMENT_ABOVE_USES = iso(2026, 1, 6);
const PASS_COMMENT_BELOW_USES = iso(2026, 1, 7);
const PASS_QUOTED_USES_COMMENT = iso(2026, 1, 8);

const HIT_RUN_INLINE = iso(1981, 2, 3);
const HIT_RUN_BLOCK = iso(1981, 2, 4);
const HIT_RUN_BLOCK_COMMENT_BESIDE_USES = iso(1981, 2, 5);
const HIT_ENV = iso(1981, 2, 6);
const HIT_WITH = iso(1981, 2, 7);
const HIT_PLAIN_COMMENT = iso(1981, 2, 8);
const HIT_COMMENT_ONE_LINE_AWAY = iso(1981, 2, 9);
const HIT_USES_VALUE = iso(1981, 2, 10);
const HIT_TRAILING_COMMENT_ON_WITH = iso(1981, 2, 11);
const HIT_SHORT_RELEASE = iso(1981, 2, 12);
const HIT_UPPER_RELEASE = iso(1981, 2, 13);
const HIT_USES_JUNK_COMMENT = iso(1981, 2, 16);
const HIT_LONG_RELEASE = iso(1981, 2, 14);
const HIT_NAME = iso(1981, 2, 15);

/** Every date a workflow page must pass. */
const PASSED = [
  PASS_RELEASE_ON_USES,
  PASS_RELEASE_IN_STEP_USES,
  PASS_PLAIN_COMMENT_ON_USES,
  PASS_COMMENT_ABOVE_USES,
  PASS_COMMENT_BELOW_USES,
  PASS_QUOTED_USES_COMMENT,
];

/** Every date a workflow page must still report. */
const CAUGHT = [
  HIT_RUN_INLINE,
  HIT_RUN_BLOCK,
  HIT_RUN_BLOCK_COMMENT_BESIDE_USES,
  HIT_ENV,
  HIT_WITH,
  HIT_PLAIN_COMMENT,
  HIT_COMMENT_ONE_LINE_AWAY,
  HIT_USES_VALUE,
  HIT_TRAILING_COMMENT_ON_WITH,
  HIT_SHORT_RELEASE,
  HIT_UPPER_RELEASE,
  HIT_USES_JUNK_COMMENT,
  HIT_LONG_RELEASE,
  HIT_NAME,
];

/** A workflow carrying every shape once, joined with `eol`. */
function workflow(eol: string): string {
  return [
    `# ${HIT_PLAIN_COMMENT} is a plain comment, nowhere near a uses line`,
    `name: ci ${HIT_NAME}`,
    "on: push",
    "jobs:",
    "  shared:",
    `    uses: example/shared/.github/workflows/ci.yml@${SHA40} # ${release(PASS_RELEASE_ON_USES)}`,
    "  other:",
    `    # ${PASS_COMMENT_ABOVE_USES} pinned the release below`,
    `    uses: example/shared/.github/workflows/b.yml@${SHA40} # cut ${PASS_PLAIN_COMMENT_ON_USES}`,
    `    # ${PASS_COMMENT_BELOW_USES} pinned the release above`,
    "",
    `    # ${HIT_COMMENT_ONE_LINE_AWAY} one blank line away is not beside`,
    "  quoted:",
    `    uses: "example/shared/.github/workflows/c.yml@${SHA40}" # ${PASS_QUOTED_USES_COMMENT}`,
    "  steps:",
    "    runs-on: ubuntu-latest",
    "    env:",
    `      SINCE: ${HIT_ENV}`,
    "    steps:",
    `      - uses: example/action@${SHA40} # ${release(PASS_RELEASE_IN_STEP_USES)}`,
    "        with:",
    `          since: ${HIT_WITH}`,
    `          until: none # ${HIT_TRAILING_COMMENT_ON_WITH}`,
    `      - uses: example/action@${HIT_USES_VALUE}`,
    `      - run: echo ${HIT_RUN_INLINE}`,
    "      - name: block",
    "        run: |",
    `          echo ${HIT_RUN_BLOCK}`,
    "          uses: not a key inside a script",
    `          # ${HIT_RUN_BLOCK_COMMENT_BESIDE_USES} a shell comment ending the script`,
    `      - uses: example/action@${SHA40}`,
    `      - uses: example/action@${SHA40} junk # ${HIT_USES_JUNK_COMMENT}`,
    `      - run: echo workflows-${HIT_SHORT_RELEASE}-${HEX12.slice(1)}`,
    `      - run: echo workflows-${HIT_UPPER_RELEASE}-${HEX12.toUpperCase()}`,
    `      - run: echo workflows-${HIT_LONG_RELEASE}-${HEX12}0`,
    "",
  ].join(eol);
}

const roots: string[] = [];

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** Write `content` at each relative path in a fresh root and scan those paths. */
function scan(files: Record<string, string>): { code: number; stdout: string; stderr: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dicom-phi-scan-workflow-")));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "phi-allow-list.txt"),
    join(root, "scripts", "phi-allow-list.txt"),
  );
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return runRepoScript("phi-scan.ts", ["--max-hit-lines", "0", ...Object.keys(files)], {
    cwd: root,
  });
}

/** The hit values reported under `path`, from the scanner's stderr. */
function hitsFor(stderr: string, path: string): string[] {
  const out: string[] = [];
  let current: string | null = null;
  for (const line of stderr.split("\n")) {
    const value = /^ {2}tag=\S+ vr=\S+ offset=\d+ value=("(?:[^"\\]|\\.)*")/.exec(line);
    if (value?.[1] !== undefined) {
      if (current === path) out.push(JSON.parse(value[1]) as string);
      continue;
    }
    const heading = /^\[phi-scan\] HIT: (.+)$/.exec(line);
    current = heading?.[1] ?? null;
  }
  return out;
}

describe("phi-scan: a shared-workflow pin's date in .github/workflows", () => {
  for (const [label, eol] of [
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ] as const) {
    it(`passes the two pin shapes and reports every other date (${label})`, () => {
      const path = ".github/workflows/ci.yml";
      const r = scan({ [path]: workflow(eol) });
      expect(r.code, `stderr: ${r.stderr}`).toBe(1);
      const hits = hitsFor(r.stderr, path);
      expect(hits.length, `stderr: ${r.stderr}`).toBeGreaterThan(0);
      for (const date of PASSED) expect(hits, `passed ${date}`).not.toContain(date);
      for (const date of CAUGHT) expect(hits, `caught ${date}`).toContain(date);
      expect(hits).toHaveLength(CAUGHT.length);
    });
  }

  it("a file of nothing but pins scans clean", () => {
    const content = [
      "jobs:",
      `  # ${PASS_COMMENT_ABOVE_USES}`,
      `  a:`,
      `    uses: example/shared/.github/workflows/a.yml@${SHA40} # ${release(PASS_RELEASE_ON_USES)}`,
      "",
    ].join("\n");
    // `# date` above `a:` is not beside a uses line, so this is the control that the clean file
    // below is clean because of the pins and not because the scanner stopped reading.
    const control = scan({ ".github/workflows/a.yml": content });
    expect(control.code, `stderr: ${control.stderr}`).toBe(1);
    expect(control.stderr).toContain(PASS_COMMENT_ABOVE_USES);
    expect(control.stderr).not.toContain(PASS_RELEASE_ON_USES);

    const clean = scan({
      ".github/workflows/a.yml": content.replace(`  # ${PASS_COMMENT_ABOVE_USES}\n`, ""),
    });
    expect(clean.code, `stderr: ${clean.stderr}`).toBe(0);
  });

  it("is a nested workflow directory's too, and nothing outside it", () => {
    const content = workflow("\n");
    const inside = ".github/workflows/nested/ci.yml";
    const outside = [
      "ci/workflows/ci.yml",
      ".github/ci.yml",
      "workflows/ci.yml",
      "docs/.github/workflows/ci.yml",
    ];
    const files: Record<string, string> = { [inside]: content };
    for (const p of outside) files[p] = content;
    const r = scan(files);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    const nested = hitsFor(r.stderr, inside);
    for (const date of PASSED) expect(nested).not.toContain(date);
    expect(nested).toHaveLength(CAUGHT.length);
    for (const p of outside) {
      const hits = hitsFor(r.stderr, p);
      for (const date of [...PASSED, ...CAUGHT]) expect(hits, `${p} ${date}`).toContain(date);
    }
  });
});
