/**
 * Shape grid for an **unrecognized Explicit VR**
 * (`DICOM-UNRECOGNIZED-VR-SHORT-FORM`).
 *
 * ## Why this file exists rather than a paragraph
 *
 * PS3.5 2026c section 6.2 says every VR defined in a future edition "shall be of
 * the same Data Element Structure as defined in [section 7.1.2] with reserved
 * bytes after the VR and a 32-bit unsigned integer VL". This parser read every
 * VR outside its own 34-entry set **short-form**, so the length came from the
 * two bytes section 6.2 reserves and the value spanned the wrong bytes.
 *
 * Three refuter passes on `#55` each wrote a one-sentence summary of what a
 * conformant future-VR file does under that reader, and **all three were
 * wrong**, because the answer is not one sentence: it depends on the value
 * length, on what follows the element, and on whether the element is last. So
 * this script measures named shapes and prints them. **Do not replace it with a
 * summary; add a shape.**
 *
 * It is a **measurement harness, not a test**, and is not wired into CI. The
 * invariants it exists to protect are pinned as real assertions in
 * `test/integration/unrecognized-vr-structure.test.ts`; what cannot be pinned
 * there is the comparison against a *different tree*, which is the point here.
 *
 * ## Running it
 *
 * ```
 * cp scripts/measure-unrecognized-vr.ts /tmp/harness.ts
 * npx tsx scripts/measure-unrecognized-vr.ts /tmp/new.json
 * git stash push -u && git checkout <base> -- src/ && cp /tmp/harness.ts scripts/measure-unrecognized-vr.ts
 * npx tsx scripts/measure-unrecognized-vr.ts /tmp/base.json
 * git checkout HEAD -- src/ scripts/measure-unrecognized-vr.ts && git stash pop
 * npx tsx scripts/measure-unrecognized-vr.ts --diff /tmp/base.json /tmp/new.json
 * ```
 *
 * **`tsx`, not `node`, and that is not a preference.** This script imports
 * `../src/index.js`, and Node's ESM resolver will not rewrite that `.js`
 * specifier onto the `.ts` file: under `node`, with or without
 * `--experimental-strip-types`, it exits 1 with `ERR_MODULE_NOT_FOUND` before
 * reading a byte. `test/helpers/run-script.ts` records the same fact for
 * `scripts/generate-annex-e.ts`. A first draft of this header prescribed `node`
 * and could not be run as written.
 *
 * **`git stash` alone is not the base tree and a first draft of this comment said
 * it was.** On a committed slice the tree is already clean, so `stash` is a
 * no-op and `base.json` comes out equal to `new.json` - "changed 0", which reads
 * like a passing control and is nothing of the kind. The harness has to be
 * carried across the checkout too, or the base run uses the committed version of
 * this file and sweeps a different shape list.
 *
 * `--diff` prints one line per shape with the base reading and the new one, so
 * every claim about a shape is re-derivable with a single command.
 *
 * ## The controls, which are not optional
 *
 * Every shape is swept for three VRs, not one: the synthetic future VR
 * {@link FUTURE_VR}, a **known long-form** VR (`UN`) and a **known short-form**
 * VR (`LO`). The two known VRs are what make a moved row mean something - a
 * change on them would be this slice breaking the 34 VRs it does not govern,
 * and a change on {@link FUTURE_VR} alone is the rule doing exactly what it
 * claims. `LO` written with a 12-byte header is a *lie about a known VR* and
 * must keep reading short-form on both trees.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";

import { deidentify, parseDicom, serializeDicom } from "../src/index.js";
import { buildDicom } from "../test/helpers/build-dicom.js";

const EXPLICIT_LE = "1.2.840.10008.1.2.1";
const EXPLICIT_BE = "1.2.840.10008.1.2.2";

/** Explicit VR only: under Implicit VR LE there is no VR on the wire to be unrecognized. */
const SYNTAXES = [EXPLICIT_LE, EXPLICIT_BE] as const;

/**
 * A two-byte VR outside the 34 PS3.5 2026c defines - i.e. exactly what section
 * 6.2 is written about. Synthetic; no edition of DICOM defines it.
 */
const FUTURE_VR = "ZZ";

/** Synthetic, deliberately fake. */
const ROOT_NAME = "SMITHSON^MARY";
/** `(0010,0020)` Patient ID, the element that follows the carrier. `Z` in Table E.1-1. */
const TRAILING_TAG = "00100020";
const TRAILING_VALUE = "ID-000123";
/** The carrier's own value, when it has one. */
const CARRIER_VALUE = "ABCD";

/** Every value the fixtures write, so "nothing was dropped" is a measurement. */
const MARKERS = [ROOT_NAME, TRAILING_VALUE, CARRIER_VALUE];
/** A source value in de-identified output is a leak, not a structural nit. */
const PHI_STRINGS = [ROOT_NAME, TRAILING_VALUE];

/**
 * The carrier tag. `(0009,0001)` is an **odd** group, so no Table E.1-1 row and
 * no PS3.6 entry answers for it: the on-wire VR is the only thing that decides
 * how it reads, which is what this grid is about. Private-by-default removal
 * means `deidentify()` drops it either way, so the columns that move are the
 * parse ones.
 */
const CARRIER_TAG = 0x0009_0001;

type Form = "long" | "short";

interface Shape {
  readonly label: string;
  readonly form: Form;
  /** Declared Value Length written into the header. `undefined` = use the payload length. */
  readonly declared?: number;
  /** The carrier's value bytes. */
  readonly payload: Buffer;
  /** The two bytes after the VR in the long form. Section 7.1.2 requires `0x00 0x00`. */
  readonly reserved?: readonly [number, number];
  /** When true the carrier is the last thing in the file - nothing follows it. */
  readonly last?: boolean;
  /**
   * When true the payload is replaced by bytes that themselves read as a
   * complete short-form Data Element in the fixture's endianness - see
   * {@link tilingPayload}.
   */
  readonly tiles?: boolean;
  /** As {@link tiles}, but the manufactured element's VR is itself unrecognized. */
  readonly tilesFutureVr?: boolean;
}

/**
 * A conformant future-VR payload whose own first bytes read as a Data Element:
 * a short-form VR, a 16-bit length of 4, and a four-byte value.
 *
 * This is the shape that killed the fourth one-sentence summary of "what a
 * conformant future-VR file used to do". With the old short-form reader the
 * carrier took length 0 from the two bytes section 7.1.2 reserves, resumed
 * inside the 32-bit VL field, read *that* as a tag, and then found a complete
 * element here - so the file parsed, **with no warning on either channel**, into
 * a tree that is not what the sender wrote. Not a refusal, and not a summary:
 * a shape.
 */
function tilingPayload(littleEndian: boolean): Buffer {
  return Buffer.concat([Buffer.from("SH", "ascii"), u16(4, littleEndian), ABCD]);
}

/**
 * The same idea one turn further, and the row that refuted the *third* attempt
 * to explain the old reader in a sentence.
 *
 * The manufactured element's own VR is itself unrecognized (`QQ`), so on the old
 * short-form reader it took an 8-byte header and carried **eight real bytes of
 * the conformant carrier's value** - which `deidentify()`'s unrecognized-VR rule
 * then reached and emptied. That refutes "the rule saw nothing in the value
 * either way" as flatly as `tilingPayload` refutes "the file did not parse", and
 * it is why there is no sentence: **add a shape.**
 */
function tilingFutureVrPayload(littleEndian: boolean): Buffer {
  return Buffer.concat([
    Buffer.from("QQ", "ascii"),
    u16(8, littleEndian),
    Buffer.from("NOTE-XYZ", "ascii"),
  ]);
}

const ABCD = Buffer.from(CARRIER_VALUE, "ascii");

/**
 * Longer conformant payloads, and they are the shapes that make the point.
 *
 * A refuter pass found them: with a large enough Value Length, the old
 * short-form read produced a **zero-length carrier plus a plausible-looking
 * extra element manufactured out of the payload**, warning-free, instead of a
 * refusal. So "a conformant future-VR file did not parse" was itself a wrong
 * one-sentence summary - the fourth. It is not restated anywhere; the table this
 * script prints is the answer. **Add a shape rather than writing a sentence.**
 */
const PAYLOAD_8 = Buffer.from("ABCDEFGH", "ascii");
const PAYLOAD_12 = Buffer.from("ABCDEFGHIJKL", "ascii");
const PAYLOAD_16 = Buffer.from("ABCDEFGHIJKLMNOP", "ascii");

const SHAPES: readonly Shape[] = [
  // Conformant to section 6.2: 12-byte header, 32-bit VL.
  { label: "long-len0", form: "long", payload: Buffer.alloc(0) },
  { label: "long-len4", form: "long", payload: ABCD },
  { label: "long-len8", form: "long", payload: PAYLOAD_8 },
  { label: "long-len12", form: "long", payload: PAYLOAD_12 },
  { label: "long-len16", form: "long", payload: PAYLOAD_16 },
  { label: "long-len12-last", form: "long", payload: PAYLOAD_12, last: true },
  // Conformant, and the one that refutes any single-sentence account of the old
  // reader: see `tilingPayload`.
  { label: "long-payload-tiles", form: "long", payload: Buffer.alloc(0), tiles: true },
  {
    label: "long-payload-tiles-future-vr",
    form: "long",
    payload: Buffer.alloc(0),
    tilesFutureVr: true,
  },
  { label: "long-len4-last", form: "long", payload: ABCD, last: true },
  { label: "long-len0-last", form: "long", payload: Buffer.alloc(0), last: true },
  // Conformant header, non-zero reserved bytes - section 7.1.2 says they shall be zero.
  { label: "long-reserved-nonzero", form: "long", payload: ABCD, reserved: [0x01, 0x02] },
  // The VL that no reading can satisfy: longer than the file.
  { label: "long-overrun", form: "long", payload: ABCD, declared: 0x0010_0000 },
  // Section 6.2: a future VR "may or may not permit Undefined Length".
  { label: "long-undefined-length", form: "long", payload: ABCD, declared: 0xffff_ffff },
  // What a sender that ignores section 6.2 writes: an 8-byte header.
  { label: "short-len0", form: "short", payload: Buffer.alloc(0) },
  { label: "short-len4", form: "short", payload: ABCD },
  { label: "short-len4-last", form: "short", payload: ABCD, last: true },
];

/** The three VRs every shape is swept for; see the module doc on why the controls matter. */
const CARRIER_VRS = [FUTURE_VR, "UN", "LO"] as const;

function u16(n: number, littleEndian: boolean): Buffer {
  const b = Buffer.alloc(2);
  if (littleEndian) b.writeUInt16LE(n, 0);
  else b.writeUInt16BE(n, 0);
  return b;
}

function u32(n: number, littleEndian: boolean): Buffer {
  const b = Buffer.alloc(4);
  if (littleEndian) b.writeUInt32LE(n, 0);
  else b.writeUInt32BE(n, 0);
  return b;
}

/** The carrier element's on-wire bytes, hand-assembled because no VR type admits `ZZ`. */
function carrierBytes(shape: Shape, vr: string, littleEndian: boolean): Buffer {
  const payload =
    shape.tiles === true
      ? tilingPayload(littleEndian)
      : shape.tilesFutureVr === true
        ? tilingFutureVrPayload(littleEndian)
        : shape.payload;
  const declared = shape.declared ?? payload.length;
  const head = Buffer.concat([
    u16(CARRIER_TAG >>> 16, littleEndian),
    u16(CARRIER_TAG & 0xffff, littleEndian),
    Buffer.from(vr, "ascii"),
  ]);
  if (shape.form === "long") {
    const reserved = Buffer.from(shape.reserved ?? [0x00, 0x00]);
    return Buffer.concat([head, reserved, u32(declared, littleEndian), payload]);
  }
  return Buffer.concat([head, u16(declared & 0xffff, littleEndian), payload]);
}

/** `(0010,0020)` as a complete Explicit-VR Data Element in `ts`. */
function trailingBytes(littleEndian: boolean): Buffer {
  const value = Buffer.from(`${TRAILING_VALUE} `, "ascii");
  return Buffer.concat([
    u16(0x0010, littleEndian),
    u16(0x0020, littleEndian),
    Buffer.from("LO", "ascii"),
    u16(value.length, littleEndian),
    value,
  ]);
}

function fixture(ts: string, shape: Shape, vr: string): Buffer {
  const littleEndian = ts === EXPLICIT_LE;
  const tail = shape.last === true ? Buffer.alloc(0) : trailingBytes(littleEndian);
  return buildDicom({
    transferSyntax: ts,
    mediaStorageSOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
    mediaStorageSOPInstanceUID: "1.2.826.0.1.3680043.10.1338.1",
    elements: [
      { tag: "00100010", vr: "PN", value: Buffer.from(`${ROOT_NAME} `, "ascii") },
    ] as never,
    trailingBytes: Buffer.concat([carrierBytes(shape, vr, littleEndian), tail]),
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

/** Every marker value present anywhere in the parsed object. */
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
  const joined = hay.join(" ");
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
    out["patientId"] =
      (ds as unknown as { get(t: string): { rawBytes: Buffer } | undefined })
        .get(TRAILING_TAG)
        ?.rawBytes.toString("latin1")
        .trimEnd() ?? null;
    try {
      const { dataset, report } = deidentify(ds) as unknown as {
        dataset: unknown;
        report: { attributes: readonly { tag: string; action: string }[] };
      };
      out["report"] = report.attributes.map((a) => `${a.tag}:${a.action}`);
      const bytes = serializeDicom(dataset as never).toString("latin1");
      out["phiLeak"] = PHI_STRINGS.filter((p) => bytes.includes(p));
      out["deidSeen"] = MARKERS.filter((m) => bytes.includes(m));
    } catch (err) {
      out["deidErr"] = codeOf(err);
    }
    // Round-trip stability: serialize what was parsed, re-parse it, compare the
    // element trees. Byte equality is the wrong test - `serializeDicom` mints
    // File Meta the fixture never wrote - but a **tree** that does not survive a
    // write/read cycle is the reader and the writer disagreeing about the header
    // form, which is exactly what a one-sided fix produces.
    try {
      const written = serializeDicom(ds);
      const reread = parseDicom(written);
      out["roundTrip"] =
        JSON.stringify(treeOf(reread)) === JSON.stringify(treeOf(ds)) ? "stable" : "unstable";
    } catch (err) {
      out["roundTrip"] = `error:${codeOf(err)}`;
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

function sweep(): Snapshot {
  const results: Snapshot = {};
  for (const ts of SYNTAXES) {
    for (const vr of CARRIER_VRS) {
      for (const shape of SHAPES) {
        results[`${ts}|${vr}|${shape.label}`] = cell(fixture(ts, shape, vr));
      }
    }
  }
  return results;
}

/** One printable line per cell: how it read, and what came out. */
function summarize(c: Record<string, unknown>): string {
  if (c["lenient"] !== "ok") return `${String(c["lenient"])} strict=${String(c["strict"])}`;
  const tree = (c["tree"] as readonly Record<string, unknown>[]).map(
    (e) => `${String(e["tag"])}/${String(e["vr"])}/${String(e["len"])}`,
  );
  return [
    `ok [${tree.join(" ")}]`,
    `warn=${(c["warn"] as string[]).join(",") || "-"}`,
    `pid=${String(c["patientId"])}`,
    `seen=${(c["seen"] as string[]).join(",") || "-"}`,
    `leak=${(c["phiLeak"] as string[]).join(",") || "-"}`,
    `rt=${String(c["roundTrip"])}`,
    `strict=${String(c["strict"])}`,
  ].join(" ");
}

function diff(basePath: string, newPath: string): void {
  const base = JSON.parse(readFileSync(basePath, "utf8")) as Snapshot;
  const next = JSON.parse(readFileSync(newPath, "utf8")) as Snapshot;
  let changed = 0;
  let newFatal = 0;
  let recovered = 0;
  let lostMarker = 0;
  let pidRecovered = 0;
  let pidLost = 0;
  let leakBase = 0;
  let leakNext = 0;
  let rtBase = 0;
  let rtNext = 0;
  for (const k of Object.keys(base)) {
    const b = base[k];
    const n = next[k];
    if (b === undefined || n === undefined) continue;
    const same = JSON.stringify(b) === JSON.stringify(n);
    if (!same) changed++;
    if (b["lenient"] === "ok" && String(n["lenient"]).startsWith("fatal")) newFatal++;
    if (String(b["lenient"]).startsWith("fatal") && n["lenient"] === "ok") recovered++;
    const bSeen = new Set((b["seen"] as string[] | undefined) ?? []);
    const nSeen = new Set((n["seen"] as string[] | undefined) ?? []);
    if ([...bSeen].some((v) => !nSeen.has(v))) lostMarker++;
    // Only meaningful where both trees parsed: a fatal cell carries no
    // `patientId` key at all, and reading `undefined` as "absent" would score a
    // recovery as nothing. `newFatals` / `recovered` already count those.
    if (b["lenient"] === "ok" && n["lenient"] === "ok") {
      const bp = b["patientId"] ?? null;
      const np = n["patientId"] ?? null;
      if (bp === null && typeof np === "string") pidRecovered++;
      if (typeof bp === "string" && np === null) pidLost++;
    }
    if (((b["phiLeak"] as string[] | undefined) ?? []).length > 0) leakBase++;
    if (((n["phiLeak"] as string[] | undefined) ?? []).length > 0) leakNext++;
    if (b["roundTrip"] === "stable") rtBase++;
    if (n["roundTrip"] === "stable") rtNext++;
    process.stdout.write(`${same ? "  =" : "  *"} ${k}\n`);
    process.stdout.write(`      base: ${summarize(b)}\n`);
    if (!same) process.stdout.write(`      new : ${summarize(n)}\n`);
  }
  const say = (label: string, v: number): void => {
    process.stdout.write(`${label.padEnd(44)}${String(v)}\n`);
  };
  say("cells compared", Object.keys(base).length);
  say("changed", changed);
  say("NEW fatals (a file that parsed, now does not)", newFatal);
  say("recovered (fatal on base, parses now)", recovered);
  say("LOST a marker value", lostMarker);
  say("(0010,0020) recovered", pidRecovered);
  say("(0010,0020) lost", pidLost);
  say("LEAKING a source value: base", leakBase);
  say("LEAKING a source value: new", leakNext);
  say("round-trip stable (of cells that parse): base", rtBase);
  say("round-trip stable (of cells that parse): new", rtNext);
}

if (process.argv[2] === "--diff") {
  diff(process.argv[3] ?? "base.json", process.argv[4] ?? "new.json");
} else {
  const results = sweep();
  writeFileSync(process.argv[2] ?? "unrecognized-vr.json", JSON.stringify(results));
  process.stdout.write(`cells=${String(Object.keys(results).length)}\n`);
  for (const [k, c] of Object.entries(results)) {
    process.stdout.write(`  ${k}\n      ${summarize(c)}\n`);
  }
}
