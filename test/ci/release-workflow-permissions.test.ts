import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "vitest";

import {
  checkReleaseWorkflowCaller,
  pushBranches,
  readWorkflowSource,
  RELEASE_WORKFLOW_PATH,
  REQUIRED_CALLER_PERMISSIONS,
  sharedReleaseRefs,
  SHARED_RELEASE_WORKFLOW,
} from "../helpers/release-workflow-caller.js";

/**
 * THE GUARD OVER `.github/workflows/release.yml`'s CALLER-SIDE PERMISSIONS PRECONDITION.
 *
 * WHAT WENT WRONG, MEASURED RATHER THAN FEARED. `Release` concluded `startup_failure` on this
 * repository's default branch on every run from June until `84f68a4`, because the calling job
 * granted `contents`/`id-token`/`pull-requests` and no `actions`, while the shared workflow it
 * delegates to declares `actions: read`. A called workflow's `GITHUB_TOKEN` can only be equal to or
 * more restrictive than its caller's, so that request was an ELEVATION and GitHub refused the whole
 * workflow before any job ran. `startup_failure` prints nothing: no job, no log, no annotation. The
 * only publish path this package has was dead for months and nothing said so.
 *
 * The grant is back. Nothing PREVENTED it going missing, and that is what this file is. `actionlint`
 * (already run over this repository by the shared `ci.yml`) cannot catch the class: the
 * caller-versus-called permission rule is a GitHub-side runtime relationship between two files in
 * two repositories, not workflow syntax. This suite runs as a required check on every push and pull
 * request to `main`, so the next edit that drops a grant reds a pull request instead.
 *
 * 🛑 THE UNHAPPY PATHS ARE FIXTURE STRINGS, AND THE LIVE FILE GOES THROUGH THE SAME FUNCTION.
 * Nothing here mutates, moves or rewrites the repository's real workflow. A guard that could only
 * observe its failures by editing the real file would have to leave it edited to stay honest, and a
 * guard that only ever reads the live file reports "no violations found" the moment that file is
 * deleted or emptied. Both are the same defect, and `checkReleaseWorkflowCaller` refuses both by
 * being a pure function whose absent-input answer is a FAILURE that names the path.
 *
 * THE ANTI-VACUITY CONTROLS ARE PART OF THE POINT, not decoration. The real file is asserted CLEAN,
 * and the real file's own text with one line removed is asserted DIRTY; every "does not grant"
 * message is asserted to name the permissions that are missing AND to leave out the ones that are
 * present, so a message that simply listed all four every time would red here.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOW_ABSOLUTE = join(REPO_ROOT, ".github", "workflows", "release.yml");

const ALL_FOUR = ["actions: read", "contents: write", "id-token: write", "pull-requests: write"];

/**
 * A thin caller workflow shaped like this repository's real one. `permissions` is the job's block:
 * a list of `scope: access` lines, a raw scalar (`write-all`), or `null` for no block at all.
 */
function callerWorkflow(
  permissions: readonly string[] | string | null,
  overrides: { readonly uses?: string; readonly workflowLevel?: readonly string[] } = {},
): string {
  const uses = overrides.uses ?? `${SHARED_RELEASE_WORKFLOW}@main`;
  const workflowLevel =
    overrides.workflowLevel === undefined
      ? []
      : ["permissions:", ...overrides.workflowLevel.map((line) => `  ${line}`), ""];
  const job =
    permissions === null
      ? []
      : typeof permissions === "string"
        ? [`    permissions: ${permissions}`]
        : ["    permissions:", ...permissions.map((line) => `      ${line}`)];
  return [
    "name: Release",
    "",
    "on:",
    "  push:",
    "    branches: [main]",
    "",
    ...workflowLevel,
    "jobs:",
    "  release:",
    ...job,
    `    uses: ${uses}`,
    "    with:",
    '      package-name: "@cosyte/dicom"',
    "    secrets: inherit",
    "",
  ].join("\n");
}

/** The one message that enumerates what is missing. */
function missingMessage(violations: readonly string[]): string {
  const found = violations.filter((line) => line.includes("does not grant:"));
  expect(found).toHaveLength(1);
  return found[0] ?? "";
}

/** Every permission the fixtures can withhold, as the message spells it. */
const SPELLED = REQUIRED_CALLER_PERMISSIONS.map(
  (required) => `\`${required.scope}: ${required.access}\``,
);

describe("the shared release workflow's caller-side precondition", () => {
  describe("this repository's real Release workflow (AC1, AC6)", () => {
    test("satisfies the precondition, read through the same function the fixtures use", () => {
      const source = readWorkflowSource(WORKFLOW_ABSOLUTE);
      expect(source).not.toBeNull();
      expect(checkReleaseWorkflowCaller(source)).toEqual([]);
    });

    test("is RETAINED: it triggers on a push to main and delegates to the shared workflow", () => {
      const source = readWorkflowSource(WORKFLOW_ABSOLUTE) ?? "";
      expect(pushBranches(source)).toContain("main");
      expect(sharedReleaseRefs(source)).toEqual(["main"]);
    });

    test("its calling job pins all four grants, by name", () => {
      const source = readWorkflowSource(WORKFLOW_ABSOLUTE) ?? "";
      for (const grant of ALL_FOUR) {
        expect(source).toContain(grant);
      }
    });

    /**
     * THE MUTATION CONTROL, and it runs on a COPY of the real text held in memory. Without it, the
     * assertion above proves only that the function returns an empty array, which a function that
     * checked nothing would also do.
     */
    test("goes red on its own text with the actions grant taken out", () => {
      const source = readWorkflowSource(WORKFLOW_ABSOLUTE) ?? "";
      const withoutActions = source
        .split("\n")
        .filter((line) => !/^\s*actions:\s*read\b/u.test(line))
        .join("\n");
      expect(withoutActions).not.toEqual(source);

      const violations = checkReleaseWorkflowCaller(withoutActions);
      expect(violations.length).toBeGreaterThan(0);
      expect(missingMessage(violations)).toContain("`actions: read`");
    });
  });

  describe("a calling job whose block omits actions: read (AC2)", () => {
    const violations = checkReleaseWorkflowCaller(
      callerWorkflow(["contents: write", "id-token: write", "pull-requests: write"]),
    );

    test("fails", () => {
      expect(violations.length).toBeGreaterThan(0);
    });

    test("names `actions: read`, and does not name the three grants that are present", () => {
      const message = missingMessage(violations);
      expect(message).toContain("`actions: read`");
      expect(message).not.toContain("`contents: write`");
      expect(message).not.toContain("`id-token: write`");
      expect(message).not.toContain("`pull-requests: write`");
    });

    test("states the equal-or-more-restrictive token rule and the silent startup refusal", () => {
      const joined = violations.join("\n");
      expect(joined).toContain("can only be equal to or more restrictive than its caller's");
      expect(joined).toContain("ELEVATION");
      expect(joined).toContain("refuses the whole workflow at startup");
      expect(joined).toContain("no job, no log and no annotation");
      expect(joined).toContain("startup_failure");
    });

    test("names the workflow the failure is about", () => {
      for (const message of violations) {
        expect(message).toContain(RELEASE_WORKFLOW_PATH);
      }
    });
  });

  describe("a calling job that omits one of the three write grants (AC3)", () => {
    for (const withheld of REQUIRED_CALLER_PERMISSIONS.filter(
      (required) => required.scope !== "actions",
    )) {
      const spelled = `\`${withheld.scope}: ${withheld.access}\``;

      test(`names ${spelled} when it is the one missing, and names no other`, () => {
        const violations = checkReleaseWorkflowCaller(
          callerWorkflow(ALL_FOUR.filter((line) => !line.startsWith(`${withheld.scope}:`))),
        );
        expect(violations.length).toBeGreaterThan(0);

        const message = missingMessage(violations);
        expect(message).toContain(spelled);
        for (const other of SPELLED.filter((entry) => entry !== spelled)) {
          expect(message).not.toContain(other);
        }
      });
    }

    test("names all three when all three are missing", () => {
      const violations = checkReleaseWorkflowCaller(callerWorkflow(["actions: read"]));
      const message = missingMessage(violations);
      expect(message).toContain("`contents: write`");
      expect(message).toContain("`id-token: write`");
      expect(message).toContain("`pull-requests: write`");
      expect(message).not.toContain("`actions: read`");
    });

    /** A grant present at the WRONG access is missing: `contents: read` cannot create a tag. */
    test("counts a write grant declared at read access as missing", () => {
      const violations = checkReleaseWorkflowCaller(
        callerWorkflow([
          "actions: read",
          "contents: read",
          "id-token: write",
          "pull-requests: write",
        ]),
      );
      expect(missingMessage(violations)).toContain("`contents: write`");
    });

    /** `permissions: read-all` reads every scope and writes none, so three of the four fail. */
    test("counts read-all as granting actions and nothing else this pipeline needs", () => {
      const message = missingMessage(checkReleaseWorkflowCaller(callerWorkflow("read-all")));
      expect(message).toContain("`contents: write`");
      expect(message).toContain("`id-token: write`");
      expect(message).toContain("`pull-requests: write`");
      expect(message).not.toContain("`actions: read`");
    });
  });

  describe("a calling job with no permissions block at all (AC4)", () => {
    const violations = checkReleaseWorkflowCaller(callerWorkflow(null));

    test("fails, because inheriting a restricted default is the same elevation", () => {
      expect(violations.length).toBeGreaterThan(0);
      const joined = violations.join("\n");
      expect(joined).toContain("declares no `permissions:` block of its own");
      expect(joined).toContain("repository default is the restricted one");
      expect(joined).toContain("the same elevation as pinning an incomplete block");
    });

    test("reports all four grants as missing, the actions explanation included", () => {
      const message = missingMessage(violations);
      for (const spelled of SPELLED) {
        expect(message).toContain(spelled);
      }
      expect(violations.join("\n")).toContain(
        "can only be equal to or more restrictive than its caller's",
      );
    });

    /**
     * A block hoisted to WORKFLOW level still fails here. That is a deliberate reading of AC4,
     * which makes the calling job's own missing block the failure: the shared workflow's "THE
     * CALLER-SIDE PRECONDITION" tells callers to grant `actions: read` on the calling job, and a
     * guard that accepted the grant from anywhere it might be inherited from would accept the
     * repository default too, which is the shape that failed silently for months.
     */
    test("still fails when the block was hoisted to workflow level", () => {
      const violations = checkReleaseWorkflowCaller(
        callerWorkflow(null, { workflowLevel: ALL_FOUR }),
      );
      expect(violations.join("\n")).toContain("declares no `permissions:` block of its own");
    });
  });

  describe("an absent, empty or unreadable workflow (AC5)", () => {
    test("absent or unreadable is a failure naming the path", () => {
      const violations = checkReleaseWorkflowCaller(null);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain(RELEASE_WORKFLOW_PATH);
      expect(violations[0]).toContain("absent, or could not be read");
      // The point of the criterion: a missing subject is a REPORTED violation, never an empty
      // result that a reader would take for a clean bill of health.
      expect(violations).not.toEqual([]);
    });

    for (const [label, empty] of [
      ["zero bytes", ""],
      ["only whitespace", "\n\n   \n\t\n"],
    ] as const) {
      test(`${label} is a failure naming the path`, () => {
        const violations = checkReleaseWorkflowCaller(empty);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain(RELEASE_WORKFLOW_PATH);
        expect(violations[0]).toContain("is empty");
      });
    }

    test("a path that does not exist reads as null, and fails naming the path", () => {
      const missing = join(tmpdir(), "cosyte-dicom-no-such-release-workflow.yml");
      expect(readWorkflowSource(missing)).toBeNull();
      expect(checkReleaseWorkflowCaller(readWorkflowSource(missing))[0]).toContain(
        RELEASE_WORKFLOW_PATH,
      );
    });

    /** A real unreadable path, not a simulated one: reading a directory throws `EISDIR`. */
    test("a path that cannot be read reads as null, and fails naming the path", () => {
      const directory = join(REPO_ROOT, ".github", "workflows");
      expect(readWorkflowSource(directory)).toBeNull();
      expect(checkReleaseWorkflowCaller(readWorkflowSource(directory))[0]).toContain(
        RELEASE_WORKFLOW_PATH,
      );
    });

    test("a workflow that no longer delegates to the shared pipeline is a failure", () => {
      const violations = checkReleaseWorkflowCaller(
        callerWorkflow(ALL_FOUR, { uses: "./.github/workflows/something-else.yml" }),
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain("no job delegating");
      expect(violations[0]).toContain(RELEASE_WORKFLOW_PATH);
    });

    test("a permissions value this guard cannot classify fails closed", () => {
      const violations = checkReleaseWorkflowCaller(callerWorkflow("inherit"));
      expect(violations.join("\n")).toContain("will not classify");
    });
  });

  describe("shapes that really do satisfy the precondition", () => {
    test("the four grants, block style", () => {
      expect(checkReleaseWorkflowCaller(callerWorkflow(ALL_FOUR))).toEqual([]);
    });

    test("the four grants, flow style", () => {
      const flow = `{ ${ALL_FOUR.join(", ")} }`;
      expect(checkReleaseWorkflowCaller(callerWorkflow(flow))).toEqual([]);
    });

    test("more than is required: actions at write", () => {
      const wider = ALL_FOUR.map((line) => (line === "actions: read" ? "actions: write" : line));
      expect(checkReleaseWorkflowCaller(callerWorkflow(wider))).toEqual([]);
    });

    test("write-all", () => {
      expect(checkReleaseWorkflowCaller(callerWorkflow("write-all"))).toEqual([]);
    });

    test("trailing comments on every grant, as the real file writes them", () => {
      const commented = ALL_FOUR.map((line) => `${line} # why this one is here`);
      expect(checkReleaseWorkflowCaller(callerWorkflow(commented))).toEqual([]);
    });

    test("a block-sequence push trigger is still read as main", () => {
      const source = callerWorkflow(ALL_FOUR).replace(
        "    branches: [main]",
        "    branches:\n      - main",
      );
      expect(pushBranches(source)).toEqual(["main"]);
      expect(checkReleaseWorkflowCaller(source)).toEqual([]);
    });
  });
});
