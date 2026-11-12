import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  flowList,
  readWorkflowSource,
  sharedWorkflowCalls,
  SHARED_RELEASE_WORKFLOW,
} from "../helpers/release-workflow-caller.js";

/**
 * What `ci.yml` and `release.yml` ask of the shared pipeline, read from the files themselves.
 *
 * `ci.yml` runs `verify` on Linux, Windows and macOS, each on the shared default Node lines (22, 24
 * and 26, so Node 22 stays while `engines` says `>=22`), and the `test` script under Bun. A path,
 * a line ending or a spawn that works on one system can fail on another, and a reader may run the
 * package under Bun.
 *
 * `release.yml` calls the same shared commit `ci.yml` does, whose release gates run before
 * anything publishes: the latest weekly mutation result read (on for every caller, so its inputs
 * stay unset here, since any value would only loosen it), the benchmarks and the scaling gate, and
 * the package checks on the packed tarball; provenance and an SBOM are on for every caller.
 *
 * Each rule is checked on the real files and, as a control, on a copy with the rule broken.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const SHARED_CI_WORKFLOW = "cosyte/.github/.github/workflows/ci.yml";
const SYSTEMS = ["ubuntu-latest", "windows-latest", "macos-latest"];

function read(name: string): string {
  const source = readWorkflowSource(join(ROOT, ".github", "workflows", name));
  expect(source, name).not.toBeNull();
  return source ?? "";
}

/** The rule on `ci.yml`: one shared call, every system, Bun on, the Node lines left at default. */
function ciViolations(source: string): string[] {
  const calls = sharedWorkflowCalls(source, SHARED_CI_WORKFLOW);
  if (calls.length !== 1) return [`ci.yml calls the shared ci.yml ${calls.length} times, not once`];
  const inputs = calls[0]?.inputs ?? {};
  const violations: string[] = [];
  const os = flowList(inputs["os"]);
  for (const system of SYSTEMS) {
    if (!os.includes(system)) violations.push(`os leaves out ${system}`);
  }
  if (inputs["run-bun"] !== "true") violations.push("run-bun is not on");
  if (inputs["node-versions"] !== undefined) {
    violations.push("node-versions is set: the shared default keeps Node 22, 24 and 26");
  }
  return violations;
}

/** The rule on `release.yml`: the commit `ci.yml` names, and the gates this package turns on. */
function releaseViolations(source: string, ciRef: string): string[] {
  const calls = sharedWorkflowCalls(source, SHARED_RELEASE_WORKFLOW);
  if (calls.length !== 1) return [`release.yml calls the shared release ${calls.length} times`];
  const call = calls[0];
  const inputs = call?.inputs ?? {};
  const violations: string[] = [];
  if (call?.ref !== ciRef) violations.push(`release.yml pins ${call?.ref}, ci.yml pins ${ciRef}`);
  if (inputs["run-package-checks"] !== "true") violations.push("run-package-checks is not on");
  if (inputs["run-benchmarks"] !== "true") violations.push("run-benchmarks is not on");
  if (!flowList(inputs["bench-suites"]).includes("bench/dicom.bench.mjs")) {
    violations.push("bench-suites does not name bench/dicom.bench.mjs");
  }
  for (const loosening of ["mutation-workflow", "mutation-max-age-days"]) {
    if (inputs[loosening] !== undefined) violations.push(`${loosening} is set`);
  }
  return violations;
}

const CI = read("ci.yml");
const RELEASE = read("release.yml");
const CI_REF = sharedWorkflowCalls(CI, SHARED_CI_WORKFLOW)[0]?.ref ?? "";

describe("ci.yml runs on every system and under Bun", () => {
  test("the real file keeps the rule", () => {
    expect(ciViolations(CI)).toEqual([]);
  });

  test("the control: windows taken out of os goes red", () => {
    const broken = CI.replace(/"windows-latest",\s*/u, "");
    expect(broken).not.toEqual(CI);
    expect(ciViolations(broken)).toEqual(["os leaves out windows-latest"]);
  });

  test("the control: run-bun taken out goes red", () => {
    const broken = CI.replace(/^\s*run-bun: true\n/mu, "");
    expect(broken).not.toEqual(CI);
    expect(ciViolations(broken)).toEqual(["run-bun is not on"]);
  });

  test("the control: a node-versions list that drops 22 goes red", () => {
    const broken = CI.replace(
      /^(\s*)run-bun: true$/mu,
      `$1run-bun: true\n$1node-versions: '["24"]'`,
    );
    expect(ciViolations(broken)).toEqual([
      "node-versions is set: the shared default keeps Node 22, 24 and 26",
    ]);
  });
});

describe("release.yml runs the release gates", () => {
  test("ci.yml names one published commit", () => {
    expect(CI_REF).toMatch(/^[0-9a-f]{40}$/u);
  });

  test("the real file keeps the rule", () => {
    expect(releaseViolations(RELEASE, CI_REF)).toEqual([]);
  });

  test("the control: an older shared commit goes red", () => {
    const old = "c0db8d8e5927269820de4401b3b5ad6141854b76";
    const broken = RELEASE.replace(`@${CI_REF}`, `@${old}`);
    expect(broken).not.toEqual(RELEASE);
    expect(releaseViolations(broken, CI_REF)).toEqual([
      `release.yml pins ${old}, ci.yml pins ${CI_REF}`,
    ]);
  });

  test("the control: the package checks or benchmarks turned off go red", () => {
    const broken = RELEASE.replace("run-package-checks: true", "run-package-checks: false").replace(
      "run-benchmarks: true",
      "run-benchmarks: false",
    );
    expect(releaseViolations(broken, CI_REF)).toEqual([
      "run-package-checks is not on",
      "run-benchmarks is not on",
    ]);
  });

  test("the control: a loosened mutation gate goes red", () => {
    const broken = RELEASE.replace(
      /^(\s*)run-package-checks: true$/mu,
      "$1run-package-checks: true\n$1mutation-max-age-days: 30",
    );
    expect(releaseViolations(broken, CI_REF)).toEqual(["mutation-max-age-days is set"]);
  });
});
