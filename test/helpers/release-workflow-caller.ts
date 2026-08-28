/**
 * THE CALLER-SIDE PERMISSIONS PRECONDITION OF `.github/workflows/release.yml`, AS A PURE FUNCTION
 * OVER YAML TEXT.
 *
 * WHY THIS FILE EXISTS. `Release` is this package's only publish path: it delegates to
 * `cosyte/.github/.github/workflows/release.yml@main`, which is what publishes to npm with
 * provenance, derives the release body from the consumed changesets, and holds the job at this
 * repository's `release` environment for a human. That shared workflow declares `actions: read`, and
 * a called workflow's `GITHUB_TOKEN` can only be equal to or more restrictive than its caller's,
 * never elevated. So a calling job that pins `contents`/`id-token`/`pull-requests` and no `actions`
 * is granting `actions: none`, the request for `actions: read` is an ELEVATION, and GitHub refuses
 * the whole workflow at STARTUP: no job, no step, no log, no annotation. The run concludes
 * `startup_failure` with nothing in it to read. That is what every `Release` run in this repository
 * did from June until it was fixed in `84f68a4`, and nobody noticed, because there was nothing to
 * see.
 *
 * `actionlint`, which this repository's CI already runs through the shared `ci.yml`, does NOT catch
 * that class: the caller-versus-called permission relationship is a GitHub-side runtime rule about
 * two files in two repositories, not workflow syntax. Nothing else in this repository prevented the
 * regression. This guard is what does, in the suite the shared pipeline runs as a required check on
 * every push and pull request to `main`, so the next edit that drops the grant reds a pull request
 * instead of silently killing a release nobody watches.
 *
 * 🛑 IT IS A FUNCTION OVER TEXT, NOT A READER OF THE LIVE FILE, AND THAT IS THE WHOLE DESIGN. A
 * guard that only ever reads the file on disk reports "no violations found" on a repository whose
 * workflow was deleted or emptied, which is the exact defect this exists to stop. So every failing
 * shape is exercised against fixture strings, the live file goes through the SAME function, and the
 * absent / empty / unreadable input is a FAILURE that names the path rather than a quiet pass.
 *
 * FAIL CLOSED, ALWAYS. A `permissions:` value this reader cannot classify is reported, not assumed
 * benign; a workflow with no job delegating to the shared release workflow is reported, because a
 * vacuous guard over a retired caller is the same silence in a different place.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. The shared pipeline also requires this repository's `release`
 * environment to carry a required reviewer and a deployment branch policy limited to the default
 * branch. Those are repository SETTINGS, not files: nothing in this tree can read them, and the
 * shared workflow refuses at its own gate step, loudly and by name, when they are absent.
 */

import { readFileSync } from "node:fs";

/** The reusable workflow this repository's `Release` workflow delegates to, without its `@ref`. */
export const SHARED_RELEASE_WORKFLOW = "cosyte/.github/.github/workflows/release.yml";

/** The caller's path from the repository root. Every message this module produces names it. */
export const RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml";

/** One `GITHUB_TOKEN` scope the calling job has to grant, and the access it has to grant it at. */
export interface RequiredPermission {
  readonly scope: string;
  readonly access: "read" | "write";
}

/**
 * The four grants, read off the shared workflow's own `permissions:` block and its "THE CALLER-SIDE
 * PRECONDITION" header. `actions: read` is the one a caller has to grant FIRST: the other three
 * predate it, and adding it to the shared file without adding it here is what caused the startup
 * failures.
 */
export const REQUIRED_CALLER_PERMISSIONS: readonly RequiredPermission[] = [
  { scope: "actions", access: "read" },
  { scope: "contents", access: "write" },
  { scope: "id-token", access: "write" },
  { scope: "pull-requests", access: "write" },
];

/* ------------------------------------------------------------------------------------------------
 * A deliberately small YAML subset reader.
 *
 * It reads block mappings, block and flow sequences of scalars, and flow mappings of scalars, which
 * is everything a thin caller workflow is made of. It is NOT a YAML implementation and must not grow
 * into one: adding a dependency to parse this file is forbidden by the item that asked for the
 * guard, and every shape it cannot classify is reported as a failure rather than skipped.
 * ---------------------------------------------------------------------------------------------- */

type YamlNode = string | YamlNode[] | YamlMap;

interface YamlMap {
  readonly [key: string]: YamlNode;
}

interface SourceLine {
  readonly indent: number;
  readonly text: string;
}

const ENTRY_RE = /^([^:\s][^:]*):(?:\s+(.*))?$/u;
const ITEM_RE = /^-(?:\s+(.*))?$/u;

/** Drop a `#` comment, honouring quotes so a `#` inside a quoted scalar survives. */
function stripComment(raw: string): string {
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === undefined) break;
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/u.test(raw[i - 1] ?? ""))) return raw.slice(0, i);
  }
  return raw;
}

function significantLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  for (const raw of source.split(/\r?\n/u)) {
    const body = stripComment(raw);
    if (body.trim().length === 0) continue;
    lines.push({ indent: body.length - body.trimStart().length, text: body.trim() });
  }
  return lines;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (trimmed.length >= 2 && first === last && (first === '"' || first === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseBlock(
  lines: readonly SourceLine[],
  start: number,
  indent: number,
): { node: YamlNode; next: number } {
  const first = lines[start];
  if (first !== undefined && ITEM_RE.test(first.text)) return parseSequence(lines, start, indent);
  return parseMapping(lines, start, indent);
}

function parseMapping(
  lines: readonly SourceLine[],
  start: number,
  indent: number,
): { node: YamlMap; next: number } {
  const map: Record<string, YamlNode> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.indent < indent) break;
    if (line.indent > indent) {
      i += 1;
      continue;
    }
    const entry = ENTRY_RE.exec(line.text);
    if (entry === null) {
      // A document marker, or a sequence item belonging to a key handled below. Skipping rather
      // than stopping keeps one unreadable line from truncating the rest of the mapping.
      i += 1;
      continue;
    }
    const key = entry[1]?.trim() ?? "";
    const inline = entry[2]?.trim() ?? "";
    if (inline.length > 0) {
      map[key] = unquote(inline);
      i += 1;
      continue;
    }
    const next = lines[i + 1];
    const nested =
      next !== undefined &&
      (next.indent > indent || (next.indent === indent && ITEM_RE.test(next.text)));
    if (next !== undefined && nested) {
      const child = parseBlock(lines, i + 1, next.indent);
      map[key] = child.node;
      i = child.next;
      continue;
    }
    map[key] = "";
    i += 1;
  }
  return { node: map, next: i };
}

function parseSequence(
  lines: readonly SourceLine[],
  start: number,
  indent: number,
): { node: YamlNode[]; next: number } {
  const items: YamlNode[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.indent < indent) break;
    if (line.indent > indent) {
      i += 1;
      continue;
    }
    const item = ITEM_RE.exec(line.text);
    if (item === null) break;
    const body = item[1]?.trim() ?? "";
    const entry = ENTRY_RE.exec(body);
    if (entry !== null) {
      items.push({ [entry[1]?.trim() ?? ""]: unquote(entry[2]?.trim() ?? "") });
    } else if (body.length > 0) {
      items.push(unquote(body));
    }
    i += 1;
  }
  return { node: items, next: i };
}

/** Parse workflow text into the mapping subset this module reads. */
function parseWorkflow(source: string): YamlMap {
  const lines = significantLines(source);
  return parseMapping(lines, 0, lines[0]?.indent ?? 0).node;
}

function asMap(node: YamlNode | undefined): YamlMap | null {
  if (node === undefined || typeof node === "string" || Array.isArray(node)) return null;
  return node;
}

function asString(node: YamlNode | undefined): string | null {
  return typeof node === "string" ? node : null;
}

/** Read a scalar, a flow sequence (`[main]`) or a block sequence as a list of strings. */
function asStringList(node: YamlNode | undefined): string[] {
  if (node === undefined) return [];
  if (Array.isArray(node)) return node.filter((item): item is string => typeof item === "string");
  if (typeof node !== "string") return [];
  const trimmed = node.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((part) => unquote(part))
      .filter((part) => part.length > 0);
  }
  return trimmed.length > 0 ? [trimmed] : [];
}

/* ------------------------------------------------------------------------------------------------
 * The permission model.
 * ---------------------------------------------------------------------------------------------- */

type Access = "none" | "read" | "write";

const ACCESS_RANK: Readonly<Record<Access, number>> = { none: 0, read: 1, write: 2 };

function toAccess(value: string): Access | null {
  if (value === "none" || value === "read" || value === "write") return value;
  return null;
}

interface NormalisedPermissions {
  /** Access declared for a named scope. */
  readonly explicit: ReadonlyMap<string, Access>;
  /** What an UNLISTED scope gets. GitHub sets every unspecified key to `none` once any is set. */
  readonly fallback: Access;
  /** A value this reader refuses to classify, quoted back verbatim in the failure message. */
  readonly unreadable: string | null;
}

function parseFlowMapping(literal: string): Map<string, Access> | null {
  const body = literal.slice(1, -1).trim();
  const entries = new Map<string, Access>();
  if (body.length === 0) return entries;
  for (const pair of body.split(",")) {
    const at = pair.indexOf(":");
    if (at < 0) return null;
    const access = toAccess(unquote(pair.slice(at + 1)));
    if (access === null) return null;
    entries.set(unquote(pair.slice(0, at)), access);
  }
  return entries;
}

function normalisePermissions(node: YamlNode | undefined): NormalisedPermissions {
  const empty = new Map<string, Access>();
  const block = asMap(node);
  if (block !== null) {
    const explicit = new Map<string, Access>();
    for (const [scope, value] of Object.entries(block)) {
      const literal = asString(value);
      const access = literal === null ? null : toAccess(literal);
      if (access === null) {
        const shown = literal ?? "<not a scalar>";
        return { explicit, fallback: "none", unreadable: `${scope}: ${shown}` };
      }
      explicit.set(scope, access);
    }
    return { explicit, fallback: "none", unreadable: null };
  }

  // No block at all, or `permissions:` with nothing under it: nothing is granted explicitly, and
  // an empty declaration sets every scope to `none` rather than being unreadable.
  const literal = asString(node)?.trim() ?? "";
  if (literal.length === 0) return { explicit: empty, fallback: "none", unreadable: null };
  if (literal === "write-all") return { explicit: empty, fallback: "write", unreadable: null };
  if (literal === "read-all") return { explicit: empty, fallback: "read", unreadable: null };
  if (literal.startsWith("{") && literal.endsWith("}")) {
    const flow = parseFlowMapping(literal);
    if (flow === null) return { explicit: empty, fallback: "none", unreadable: literal };
    return { explicit: flow, fallback: "none", unreadable: null };
  }
  return { explicit: empty, fallback: "none", unreadable: literal };
}

function granted(permissions: NormalisedPermissions, scope: string): Access {
  return permissions.explicit.get(scope) ?? permissions.fallback;
}

function quoteList(items: readonly string[]): string {
  return items.map((item) => `\`${item}\``).join(", ");
}

/* ------------------------------------------------------------------------------------------------
 * The guard.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Read a workflow file. Absent, unreadable, a directory, a broken symlink: all `null`, which
 * `checkReleaseWorkflowCaller` reports as a FAILURE. The states are not distinguished here on
 * purpose, because the guard's answer to all of them is the same and a caller that could tell them
 * apart would be tempted to excuse one.
 */
export function readWorkflowSource(absolutePath: string): string | null {
  try {
    return readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Grade a caller workflow's TEXT against the shared release workflow's caller-side precondition.
 *
 * Returns one message per violation, in a stable order, and an EMPTY array only when a job really
 * does delegate to the shared release workflow and really does pin all four grants on itself.
 *
 * @param source The workflow's bytes as text, or `null` when it is absent or could not be read.
 * @param path The path to name in every message. Defaults to the caller's real path.
 */
export function checkReleaseWorkflowCaller(
  source: string | null,
  path: string = RELEASE_WORKFLOW_PATH,
): string[] {
  if (source === null) {
    return [
      `\`${path}\` is absent, or could not be read. The caller-side permissions precondition of ` +
        `${SHARED_RELEASE_WORKFLOW} cannot be satisfied by a workflow that is not there, so this ` +
        `is a failure rather than "no violations found": a guard that reports success once its ` +
        `subject is gone passes on an empty repository, which is the defect it exists to stop.`,
    ];
  }
  if (source.trim().length === 0) {
    return [
      `\`${path}\` is empty. An empty caller publishes nothing and grants nothing, so this is a ` +
        `failure rather than "no violations found": a guard that reports success once its subject ` +
        `has been emptied passes on an empty repository, which is the defect it exists to stop.`,
    ];
  }

  const workflow = parseWorkflow(source);
  const jobs = asMap(workflow["jobs"]);
  const calling = Object.entries(jobs ?? {}).filter(([, job]) => {
    const uses = asString(asMap(job)?.["uses"]);
    return uses !== null && uses.startsWith(`${SHARED_RELEASE_WORKFLOW}@`);
  });

  if (calling.length === 0) {
    return [
      `\`${path}\` has no job delegating to \`${SHARED_RELEASE_WORKFLOW}@<ref>\`. That workflow is ` +
        `this package's only publish path and is RETAINED rather than retired, so a caller with no ` +
        `such job is a failure here and never something this guard passes vacuously.`,
    ];
  }

  const violations: string[] = [];
  for (const [name, job] of calling) {
    const own = asMap(job)?.["permissions"];
    if (own === undefined) {
      violations.push(
        `\`${path}\`: the calling job \`${name}\` declares no \`permissions:\` block of its own, ` +
          `so its \`GITHUB_TOKEN\` is whatever it inherits. Where the repository default is the ` +
          `restricted one (just read access for the \`contents\` and \`packages\` permissions), ` +
          `inheriting it is the same elevation as pinning an incomplete block, and it fails the ` +
          `same silent way. ${SHARED_RELEASE_WORKFLOW} tells callers to pin the grants on the ` +
          `calling job, so this guard requires them there rather than somewhere they might reach ` +
          `it from.`,
      );
    }

    const permissions = normalisePermissions(own);
    if (permissions.unreadable !== null) {
      violations.push(
        `\`${path}\`: the \`permissions:\` block on the calling job \`${name}\` carries a value ` +
          `this guard will not classify (\`${permissions.unreadable}\`). It fails closed rather ` +
          `than assuming the grant is there, because assuming it is what produced a silent ` +
          `\`startup_failure\` on every release for months.`,
      );
      continue;
    }

    const missing = REQUIRED_CALLER_PERMISSIONS.filter(
      (required) =>
        ACCESS_RANK[granted(permissions, required.scope)] < ACCESS_RANK[required.access],
    );
    if (missing.length === 0) continue;

    violations.push(
      `\`${path}\`: the calling job \`${name}\` does not grant: ` +
        `${quoteList(missing.map((required) => `${required.scope}: ${required.access}`))}. ` +
        `${SHARED_RELEASE_WORKFLOW} requires every one of them from its caller.`,
    );

    if (missing.some((required) => required.scope === "actions")) {
      violations.push(
        `\`${path}\`: \`actions: read\` is the grant that has to be on the calling job BEFORE the ` +
          `shared workflow is adopted, and it is the one this repository lost. A called ` +
          `workflow's \`GITHUB_TOKEN\` can only be equal to or more restrictive than its ` +
          `caller's, never elevated, so a calling job that pins ` +
          `\`contents\`/\`id-token\`/\`pull-requests\` and no \`actions\` is granting ` +
          `\`actions: none\`. ${SHARED_RELEASE_WORKFLOW} declares \`actions: read\`, which ` +
          `against that token is an ELEVATION, and GitHub refuses the whole workflow at startup: ` +
          `the run concludes \`startup_failure\` with no job, no log and no annotation, so ` +
          `nothing prints the refusal and nobody sees it. That is what every \`Release\` run here ` +
          `did from June until it was fixed.`,
      );
    }
  }
  return violations;
}

/**
 * The branches a workflow's `on: push:` trigger names, empty when it has no push trigger. A test
 * uses it to pin that the caller is still wired to the default branch, which is what makes the
 * delegation above a release path rather than dead YAML.
 */
export function pushBranches(source: string): string[] {
  const on = asMap(parseWorkflow(source)["on"]);
  const push = asMap(on?.["push"]);
  return asStringList(push?.["branches"]);
}

/**
 * The `@ref` of every job delegating to the shared release workflow, so a test can pin `@main`
 * without re-implementing the search above.
 */
export function sharedReleaseRefs(source: string): string[] {
  const jobs = asMap(parseWorkflow(source)["jobs"]) ?? {};
  const prefix = `${SHARED_RELEASE_WORKFLOW}@`;
  const refs: string[] = [];
  for (const job of Object.values(jobs)) {
    const uses = asString(asMap(job)?.["uses"]);
    if (uses !== null && uses.startsWith(prefix)) refs.push(uses.slice(prefix.length));
  }
  return refs;
}
