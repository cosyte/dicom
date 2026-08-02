/**
 * Differential grid for the Explicit VR sequence-item bound
 * (`DICOM-EXPLICIT-VR-UNBOUNDED-ITEM-READ`) and, since it swept an element's
 * **own** length field, for `DICOM-OVERDECLARE-SWALLOWS-INTO-VALUE`.
 *
 * ## Why this file is on `main`
 *
 * It was written on a branch that was refused and never merged, which meant the
 * only reproducible measurement of the biggest PHI defect in this package lived
 * somewhere nobody would find it. It lands here on its own merits: this repo's
 * standing instruction is "re-run the grid before changing this code", and until
 * the script is on `main` that instruction is unactionable. It is a
 * **measurement harness, not a test**, and is not wired into CI.
 *
 * What it measured on `244a372` (published `0.0.6`), and what the
 * `DICOM-OVERDECLARE-SWALLOWS-INTO-VALUE` remedy did to it:
 *
 * | | base `244a372` | after |
 * |---|---|---|
 * | cells that parse | 6,348 | 6,348 |
 * | cells leaking a source value through `deidentify()` | **2,127** | **1,155** |
 * | ...of those, Explicit VR LE + BE | 877 | **0** |
 * | ...of those, Implicit VR LE (`DICOM_SQ_NOT_DESCENDED`) | 1,250 | 1,155 |
 * | cells whose *parse* differs at all | - | **0** |
 *
 * The last row is the point of the slice: the remedy is at the de-identify
 * boundary and touches no parser file, so the reading, the warnings on both
 * channels, `{ strict: true }`, and which marker values survive are byte-
 * identical on all 76,293 cells. The residual 1,155 are the separate
 * `DICOM-DEIDENT-RAWBYTES-PASSTHROUGH` item - an undescended sequence kept as
 * opaque bytes - which this slice deliberately does not touch.
 *
 * `parseDefinedLengthSQInPlace` decides between two length fields that describe
 * the same bytes. A remedy there is a claim about **which field to trust**, and
 * trusting the wrong one desynchronizes the enclosing Data Set silently - so the
 * bar for changing it is not a fixture list. Seven hand-picked shapes missed the
 * field that mattered, and a grid that swept only the lenient posture missed
 * `{ strict: true }` entirely. This script is what "re-run the grid before
 * changing this code" refers to; without it that instruction is unactionable.
 *
 * It is a **measurement harness, not a test**, and it is not wired into CI. The
 * per-shape invariants it exists to protect are pinned as real assertions in
 * `test/integration/explicit-sq-item-bound.test.ts`; what cannot be pinned there
 * is the comparison against a *different tree*, which is the whole point here.
 *
 * ## The dimension that was missing, and why it hid a wrong patient identifier
 *
 * The first version of this grid swept the **two sequence-level length fields**
 * only - the `SQ`'s own and the `(FFFE,E000)` Item's. Three refuter passes ran
 * against it and none of them could see the defect that mattered, because that
 * defect does not live in either field. It lives in **which tags the clamped
 * bytes carry**: the enclosing Data Set stores elements in a `Map<Tag, Element>`,
 * so an element the clamp moves out of an item and into the enclosing Data Set
 * **replaces** one the Data Set already holds, last-wins and silently. With
 * `(0010,1002)` Other Patient IDs Sequence under-declaring by exactly its item's
 * trailing `(0010,0020)`, the root Patient ID read `MRN-99999` where the file
 * says `MRN-11111`.
 *
 * A grid whose fixtures only ever put non-colliding tags in an item cannot
 * express that, so it reported green. Two things were added here as a result,
 * and **neither is optional if you change this code**:
 *
 *  - **an element-level length dimension** (`elemDelta`), which lies about a leaf
 *    element's *own* declared length inside the item - the third length field,
 *    swept independently of the two above;
 *  - **the two hoist-collision shapes** (`collide-before`, `collide-after`),
 *    where the item's trailing element carries a tag the enclosing Data Set also
 *    carries, once on each side of the sequence.
 *
 * Every cell also records `seen`: which of the fixture's marker values survive
 * **anywhere** in the parsed object, root or item. That is what makes "nothing is
 * dropped from the object" a measurement rather than a belief - a value present
 * on one tree and absent on the other is a drop, whatever the tree shape.
 *
 * ## Running it
 *
 * Emit a snapshot from the working tree, then from the pre-slice parser, then
 * diff the two:
 *
 * ```
 * tsx scripts/measure-sq-bound-grid.ts /tmp/new.json
 * git checkout <base> -- src/
 * tsx scripts/measure-sq-bound-grid.ts /tmp/base.json
 * git checkout HEAD -- src/
 * tsx scripts/measure-sq-bound-grid.ts --diff /tmp/base.json /tmp/new.json
 * ```
 *
 * `<base>` is whatever commit you are claiming a difference against - `244a372`
 * for the numbers in the table above, `76cb5e9` for the sequence-bound slice
 * this file was written for. A cell is
 * "changed" when its whole JSON record differs, which covers the element tree,
 * the warning codes on both channels, the fatal class, the `DeidentifyReport`,
 * the de-identified bytes and the surviving marker values.
 *
 * The `--diff` mode prints every number this slice's artifacts state, so each one
 * is re-derivable with a single command rather than carried forward. An earlier
 * grid's figures were **not** reproducible, because its script was never
 * committed.
 *
 * ## What a reading of the diff has to establish
 *
 * The counts are less important than their signs, and these are the findings that
 * refused earlier drafts:
 *
 *  - **0 new lenient fatals.** A bound that converts a file the parser reads
 *    today into a whole-object `INVALID_FILE_META` is the `#49` fail-safe-degrade
 *    trap. A bounded undefined-length-item branch was measured at 64 such files.
 *  - **0 PHI regressions and 0 reports that lose an attribute.** A source value
 *    appearing in de-identified output, or an attribute vanishing from the
 *    report, is the harm this whole slice exists to close.
 *  - **0 cells that lose a marker value** (`lostValue`). This is the widened
 *    grid's own gate, and the one the original grid could not express.
 *  - **0 cells where the root `(0010,0020)` changes value** (`rootIdChanged`). A
 *    confidently wrong patient identifier is worse than the mis-structure this
 *    slice set out to fix, and worse than base's fail-safe refusal.
 *  - **New strict fatals only on cells whose lenient reading actually changed.**
 *    A warning raised for a reading that is then discarded costs a
 *    `{ strict: true }` caller the object over bytes the parser read exactly as
 *    before.
 *  - **0 Implicit VR LE cells changed.** That path is the control; this slice is
 *    Explicit-VR-only.
 *
 * ## The one mismatch that is NOT this slice's
 *
 * `onWarning` disagrees with `ds.warnings` on a handful of **Implicit VR LE**
 * cells, identically on both trees. That is the pre-existing D-03 ordering
 * residual `#50` disclosed: `tryParseDefinedLengthSQ` pops a refused descent's
 * warnings off `ctx.warnings`, but `makeEmitter` already handed them to
 * `onWarning`. Do not read it as introduced here, and do not claim the two
 * channels agree everywhere - they agree on every Explicit VR cell, which is the
 * claim this slice can actually support.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";

import { deidentify, parseDicom, serializeDicom } from "../src/index.js";
import { buildDicom } from "../test/helpers/build-dicom.js";

const IMPLICIT_LE = "1.2.840.10008.1.2";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** Explicit VR LE and BE are the paths that read a defined-length SQ in place; Implicit LE is the control. */
const SYNTAXES = [EXPLICIT_LE, EXPLICIT_BE, IMPLICIT_LE] as const;

/** Synthetic, deliberately fake. */
const ROOT_NAME = "ROOT^PATIENT";

/** `(0008,1115)` is `SQ` in PS3.6, carries no Table E.1-1 row, so `deidentify()` recurses into it. */
const CARRIER = "00081115" as const;

/**
 * `(0010,1002)` Other Patient IDs Sequence: `SQ`, and the carrier for the two
 * collision shapes. Its tag sorts **after** `(0010,0020)`, which is what puts a
 * colliding root Patient ID on the *already parsed* side of the sequence - the
 * arrangement a conformant, ascending-tag-order file produces.
 */
const COLLIDE_CARRIER = "00101002" as const;

/** `(0010,0020)` Patient ID, the root element an over-declaring item swallows. `Z` in Table E.1-1. */
const TRAILING = "00100020" as const;
const TRAILING_VALUE = "ID-000123";

/** The two Patient ID values in the collision shapes; confusing them is the blocker. */
const ROOT_ID = "MRN-11111";
const ITEM_ID = "MRN-99999";

const ITEM_TAG = "00080008" as const;
const ITEM_VALUE = "ORIGINAL";
const SECOND_TAG = "00080060" as const;
const SECOND_VALUE = "CT";

/** A source value reaching de-identified output is a PHI regression, not a structural nit. */
const PHI_STRINGS = [ROOT_NAME, TRAILING_VALUE, ROOT_ID, ITEM_ID];

/**
 * Every distinct value the fixtures write. A value present in the parsed object
 * on one tree and absent on the other is a **drop**, no matter which Data Set it
 * ended up in - which is the only way to check "nothing is dropped" without
 * hand-writing an expectation per shape.
 */
const MARKERS = [ROOT_NAME, TRAILING_VALUE, ROOT_ID, ITEM_ID, ITEM_VALUE, SECOND_VALUE];

function ascii(s: string): Buffer {
  return Buffer.from(s.length % 2 === 0 ? s : `${s} `, "ascii");
}

/**
 * Both sequence-level length fields are swept over the same deltas,
 * independently, so every combination of "the item lies", "the sequence lies",
 * "both lie" and "neither lies" is covered. `18` is the on-wire size of the
 * trailing `(0010,0020)` and is the silent cell: over-declaring by *exactly* that
 * swallows the element without a fatal. Every other overrun desynchronizes
 * loudly, which is precisely why a fixture that over-declares past the end of the
 * buffer is green against the defect.
 */
const DELTAS = [
  -24, -20, -18, -16, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 16, 18, 20, 24,
];

/**
 * The **third** length field: a leaf element's own declared length, inside the
 * item. Coarser than {@link DELTAS} only to keep the cell count affordable; it
 * has to be swept at all because the two sequence-level fields cannot express a
 * disagreement that begins inside an item, and that is the blind spot three
 * refuter passes shared.
 */
const ELEMENT_DELTAS = [-8, -4, -2, 0, 2, 4, 18];

type Shape =
  | "one-item"
  | "two-item"
  | "two-element-item"
  | "undef-item-with-delim"
  | "undef-item-no-delim"
  | "nested-sq"
  | "empty-item"
  | "collide-before"
  | "collide-after";

const SHAPES: readonly Shape[] = [
  "one-item",
  "two-item",
  "two-element-item",
  "undef-item-with-delim",
  "undef-item-no-delim",
  "nested-sq",
  "empty-item",
  "collide-before",
  "collide-after",
];

type Elements = Parameters<typeof buildDicom>[0]["elements"];

function itemsFor(shape: Shape, itemDelta: number, elemDelta: number): Elements {
  const leaf = {
    tag: ITEM_TAG,
    vr: "CS" as const,
    value: ascii(ITEM_VALUE),
    declaredLengthDelta: elemDelta,
  };
  const second = { tag: SECOND_TAG, vr: "CS" as const, value: ascii(SECOND_VALUE) };
  /** The item's own Patient ID: the element whose hoist would replace the root's. */
  const itemId = { tag: TRAILING, vr: "LO" as const, value: ascii(ITEM_ID) };
  switch (shape) {
    case "one-item":
      return [{ declaredLengthDelta: itemDelta, elements: [leaf] }] as never;
    case "two-item":
      return [
        { declaredLengthDelta: itemDelta, elements: [leaf] },
        { elements: [second] },
      ] as never;
    // The disclosed-ambiguity shape: an item with a TRAILING element, so a
    // sequence under-declaring by exactly that element's on-wire size admits two
    // complete readings.
    case "two-element-item":
      return [{ declaredLengthDelta: itemDelta, elements: [leaf, second] }] as never;
    case "undef-item-with-delim":
      return [{ undefinedLength: true, elements: [leaf] }] as never;
    // Not bounded, deliberately - a disclosed residual, pinned so it stays visible.
    case "undef-item-no-delim":
      return [{ undefinedLength: true, omitItemDelim: true, elements: [leaf] }] as never;
    case "nested-sq":
      return [
        {
          declaredLengthDelta: itemDelta,
          elements: [{ tag: CARRIER, items: [{ elements: [leaf] }] }],
        },
      ] as never;
    // A clamp that erases an item outright is self-consistent and must still be refused.
    case "empty-item":
      return [{ declaredLengthDelta: itemDelta, elements: [] }, { elements: [leaf] }] as never;
    // Both collision shapes: the item's trailing element carries the SAME tag as
    // a root element, so hoisting it into the enclosing Data Set is a `Map` write
    // over an occupied key. `collide-before` is the blocker (the root's value is
    // replaced by the item's); `collide-after` is the mirror (the hoisted element
    // is replaced by the root's, and vanishes from the object).
    case "collide-before":
    case "collide-after":
      return [{ declaredLengthDelta: itemDelta, elements: [leaf, itemId] }] as never;
  }
}

function rootElements(
  shape: Shape,
  sqDelta: number,
  itemDelta: number,
  elemDelta: number,
): Elements {
  const name = { tag: "00100010", vr: "PN" as const, value: ascii(ROOT_NAME) };
  const rootId = { tag: TRAILING, vr: "LO" as const, value: ascii(ROOT_ID) };
  const trailing = { tag: TRAILING, vr: "LO" as const, value: ascii(TRAILING_VALUE) };
  const items = itemsFor(shape, itemDelta, elemDelta);

  if (shape === "collide-before") {
    // Ascending tag order, which is what a conformant sender writes: the root
    // Patient ID is already in the enclosing Data Set's map by the time
    // `(0010,1002)` is descended.
    return [name, rootId, { tag: COLLIDE_CARRIER, declaredLengthDelta: sqDelta, items }] as never;
  }
  if (shape === "collide-after") {
    // The mirror: the root's copy is read AFTER the sequence, so a hoisted
    // element is written first and then overwritten.
    return [name, { tag: CARRIER, declaredLengthDelta: sqDelta, items }, rootId] as never;
  }
  return [name, { tag: CARRIER, declaredLengthDelta: sqDelta, items }, trailing] as never;
}

function fixture(
  ts: string,
  shape: Shape,
  itemDelta: number,
  sqDelta: number,
  elemDelta: number,
): Buffer {
  return buildDicom({
    transferSyntax: ts,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: rootElements(shape, sqDelta, itemDelta, elemDelta),
  });
}

interface Treeish {
  elements(): readonly unknown[];
}

/** Canonical, comparable shape of a parsed Data Set, including nested items. */
function treeOf(ds: Treeish): unknown {
  return (ds.elements() as readonly Record<string, unknown>[]).map((el) => ({
    tag: el["tag"],
    vr: el["vr"],
    len: el["length"],
    raw: (el["rawBytes"] as Buffer | undefined)?.toString("hex"),
    items: (el["items"] as readonly Treeish[] | undefined)?.map((it) => treeOf(it)),
  }));
}

/** Every marker value present anywhere in the parsed object, root or nested. */
function markersIn(ds: Treeish): string[] {
  const hay: string[] = [];
  const walk = (t: Treeish): void => {
    for (const el of t.elements() as readonly Record<string, unknown>[]) {
      const raw = el["rawBytes"] as Buffer | undefined;
      if (raw !== undefined) hay.push(raw.toString("latin1"));
      for (const it of (el["items"] as readonly Treeish[] | undefined) ?? []) walk(it);
    }
  };
  walk(ds);
  const joined = hay.join(" ");
  return MARKERS.filter((m) => joined.includes(m));
}

function codeOf(err: unknown): string {
  return (err as { code?: string }).code ?? (err as Error).name;
}

function cell(buf: Buffer): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const streamed: string[] = [];

  try {
    const ds = parseDicom(buf, { onWarning: (w: { code: string }) => streamed.push(w.code) });
    out["lenient"] = "ok";
    out["tree"] = treeOf(ds);
    out["warn"] = ds.warnings.map((w) => w.code);
    out["streamed"] = streamed;
    out["seen"] = markersIn(ds);
    // The root Patient ID, read straight off the enclosing Data Set. This is the
    // field the blocker got wrong, so it is recorded on its own rather than left
    // to be inferred from the tree.
    out["rootId"] =
      (ds as unknown as { get(t: string): { rawBytes: Buffer } | undefined })
        .get(TRAILING)
        ?.rawBytes.toString("latin1")
        .trimEnd() ?? null;
    try {
      const { dataset, report } = deidentify(ds) as unknown as {
        dataset: unknown;
        report: { attributes: readonly { tag: string; action: string; contextPath?: string }[] };
      };
      out["report"] = report.attributes.map((a) => `${a.tag}:${a.action}:${a.contextPath ?? ""}`);
      const bytes = serializeDicom(dataset as never).toString("latin1");
      out["phiLeak"] = PHI_STRINGS.filter((p) => bytes.includes(p));
    } catch (err) {
      out["deidErr"] = codeOf(err);
    }
  } catch (err) {
    out["lenient"] = `fatal:${codeOf(err)}`;
  }

  try {
    parseDicom(buf, { strict: true });
    out["strict"] = "ok";
  } catch (err) {
    out["strict"] = `fatal:${codeOf(err)}`;
  }

  return out;
}

type Snapshot = Record<string, Record<string, unknown>>;

function sweep(): { results: Snapshot; built: number; unbuildable: number } {
  const results: Snapshot = {};
  let built = 0;
  let unbuildable = 0;

  for (const ts of SYNTAXES) {
    for (const shape of SHAPES) {
      for (const itemDelta of DELTAS) {
        for (const sqDelta of DELTAS) {
          for (const elemDelta of ELEMENT_DELTAS) {
            let buf: Buffer;
            try {
              buf = fixture(ts, shape, itemDelta, sqDelta, elemDelta);
            } catch {
              // A delta more negative than the body is long has no encoding.
              // Skipped identically on both trees, so it cannot bias the diff.
              unbuildable++;
              continue;
            }
            results[`${ts}|${shape}|${itemDelta}|${sqDelta}|${elemDelta}`] = cell(buf);
            built++;
          }
        }
      }
    }
  }
  return { results, built, unbuildable };
}

/**
 * `tag:action` for each reported attribute, positionally suffixed so a tag
 * reported twice on base and once here still counts as a loss.
 */
function pairs(report: unknown): string[] {
  const seen = new Map<string, number>();
  return (Array.isArray(report) ? (report as string[]) : []).map((entry) => {
    const key = entry.split(":").slice(0, 2).join(":");
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${key}#${String(n)}`;
  });
}

/** Set difference as a count; `a` minus `b`, by value. */
function lost(a: unknown, b: unknown): number {
  const bs = new Set(Array.isArray(b) ? (b as string[]) : []);
  return (Array.isArray(a) ? (a as string[]) : []).filter((v) => !bs.has(v)).length;
}

function diff(basePath: string, newPath: string): void {
  const base = JSON.parse(readFileSync(basePath, "utf8")) as Snapshot;
  const next = JSON.parse(readFileSync(newPath, "utf8")) as Snapshot;
  const keys = Object.keys(base);

  let changed = 0;
  let recoveredFatal = 0;
  let newLenientFatal = 0;
  let fatalBoth = 0;
  let structural = 0;
  let implicitChanged = 0;
  let lostValue = 0;
  let rootIdChanged = 0;
  let rootIdRecovered = 0;
  let rootIdLost = 0;
  let phiRegression = 0;
  let reportLostAttr = 0;
  let newStrictFatal = 0;
  let newStrictFatalUnchangedLenient = 0;
  let onWarningMismatchExplicit = 0;
  let onWarningMismatchImplicit = 0;
  let onWarningMismatchExplicitBase = 0;
  let onWarningMismatchImplicitBase = 0;
  let gainedValue = 0;
  const lostValueKeys: string[] = [];
  const rootIdKeys: string[] = [];
  const strictUnchangedKeys: string[] = [];

  for (const k of keys) {
    const b = base[k];
    const n = next[k];
    if (b === undefined || n === undefined) continue;
    const isImplicit = k.startsWith(`${IMPLICIT_LE}|`);
    const bl = JSON.stringify({ ...b, strict: undefined });
    const nl = JSON.stringify({ ...n, strict: undefined });
    const lenientSame = bl === nl;

    if (JSON.stringify(b) !== JSON.stringify(n)) {
      changed++;
      if (isImplicit) implicitChanged++;
    }
    if (String(b["lenient"]).startsWith("fatal") && n["lenient"] === "ok") recoveredFatal++;
    if (b["lenient"] === "ok" && String(n["lenient"]).startsWith("fatal")) newLenientFatal++;
    if (String(b["lenient"]).startsWith("fatal") && String(n["lenient"]).startsWith("fatal")) {
      fatalBoth++;
    }
    if (b["lenient"] === "ok" && n["lenient"] === "ok" && !lenientSame) structural++;

    if (lost(b["seen"], n["seen"]) > 0) {
      lostValue++;
      lostValueKeys.push(k);
    }
    if (b["lenient"] === "ok" && n["lenient"] === "ok" && b["rootId"] !== n["rootId"]) {
      // Three different events wear the same shape, and only one of them is a
      // defect. `null -> value` is the slice's own fix: base let the item swallow
      // the root Patient ID, so the root had none. `value -> null` loses it.
      // `value -> DIFFERENT value` is the blocker - a confidently wrong patient
      // identifier, which is worse than either.
      if (b["rootId"] === null) rootIdRecovered++;
      else if (n["rootId"] === null) rootIdLost++;
      else {
        rootIdChanged++;
        rootIdKeys.push(k);
      }
    }
    if (lost(n["phiLeak"], b["phiLeak"]) > 0) phiRegression++;
    // Compare the report on `tag:action` only. The `contextPath` moving from
    // `00081115[0]` to the root is the fix, not a loss; a tag DISAPPEARING, or
    // appearing fewer times, is. Counting the formatted triple would have read
    // every fix as a regression.
    if (lost(pairs(b["report"]), pairs(n["report"])) > 0) reportLostAttr++;

    if (b["strict"] === "ok" && String(n["strict"]).startsWith("fatal")) {
      newStrictFatal++;
      if (lenientSame) {
        newStrictFatalUnchangedLenient++;
        strictUnchangedKeys.push(k);
      }
    }
    if (n["lenient"] === "ok" && JSON.stringify(n["warn"]) !== JSON.stringify(n["streamed"])) {
      if (isImplicit) onWarningMismatchImplicit++;
      else onWarningMismatchExplicit++;
    }
    if (b["lenient"] === "ok" && JSON.stringify(b["warn"]) !== JSON.stringify(b["streamed"])) {
      if (isImplicit) onWarningMismatchImplicitBase++;
      else onWarningMismatchExplicitBase++;
    }
    if (lost(n["seen"], b["seen"]) > 0) gainedValue++;
  }

  const say = (label: string, v: number): void => {
    process.stdout.write(`${label.padEnd(46)}${String(v)}\n`);
  };
  say("cells compared", keys.length);
  say("changed", changed);
  say("  of which Implicit VR LE (control, want 0)", implicitChanged);
  say("recovered: fatal on base, parses now", recoveredFatal);
  say("NEW lenient fatals (want 0)", newLenientFatal);
  say("fatal on both trees", fatalBoth);
  say("structural (parses both, reading differs)", structural);
  say("LOST a marker value (want 0)", lostValue);
  say("root (0010,0020) WRONG VALUE (want 0)", rootIdChanged);
  say("root (0010,0020) recovered by the bound", rootIdRecovered);
  say("root (0010,0020) lost (want 0)", rootIdLost);
  say("GAINED a marker value (re-read bytes)", gainedValue);
  say("PHI regressions (want 0)", phiRegression);
  say("reports that lose an attribute (want 0)", reportLostAttr);
  say("new strict fatals", newStrictFatal);
  say("  ...on an UNCHANGED lenient reading (want 0)", newStrictFatalUnchangedLenient);
  say("onWarning != ds.warnings, Explicit VR (want 0)", onWarningMismatchExplicit);
  say("onWarning != ds.warnings, Implicit VR LE", onWarningMismatchImplicit);
  say("  same on base, Explicit VR", onWarningMismatchExplicitBase);
  say("  same on base, Implicit VR LE", onWarningMismatchImplicitBase);

  for (const [label, ks] of [
    ["lost-value", lostValueKeys],
    ["root-id-changed", rootIdKeys],
    ["strict-on-unchanged", strictUnchangedKeys],
  ] as const) {
    for (const k of ks.slice(0, 8)) process.stdout.write(`  ${label}: ${k}\n`);
    if (ks.length > 8) process.stdout.write(`  ${label}: ...and ${String(ks.length - 8)} more\n`);
  }
}

if (process.argv[2] === "--diff") {
  diff(process.argv[3] ?? "base.json", process.argv[4] ?? "new.json");
} else {
  const { results, built, unbuildable } = sweep();
  writeFileSync(process.argv[2] ?? "grid.json", JSON.stringify(results));
  process.stdout.write(`cells=${String(built)} unbuildable=${String(unbuildable)}\n`);
}
