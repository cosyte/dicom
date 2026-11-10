/**
 * The output-equivalence corpus, and the record of everything a caller can observe of one document.
 *
 * Shared by `output-equivalence.test.ts`, which recomputes each document's digest on head, and by
 * `capture-output-digests.ts`, which computes the same digests on a base tree and commits them. A
 * change meant to make the reader or the writer cheaper and to change nothing else is held to
 * those digests: every parsed element, value, warning, error and written byte.
 *
 * The documents are synthetic and built in code, as every fixture here is: the fuzz seed corpus
 * (`test/property/_seed-corpus.ts`), the bench's shapes (`bench/shapes.mjs`) at small sizes, a few
 * Data Sets written out of order so the writer's ordering pass moves spans, and a fixed set of
 * mutations of each seed, drawn from a seeded generator rather than from fast-check so the corpus
 * does not move when a dependency does. Deflated seeds are not mutated, and a Deflated write is
 * recorded inflated: compressed bytes are the runtime zlib's, and they differ between builds of
 * Node, so a digest over them would differ between machines.
 *
 * The record of one document runs the read under every option that changes it (lenient, strict,
 * `copyValues`, each built-in profile), and on the lenient read: every element of every Data Set
 * at every depth with its decoded value, the domain views and the DICOMDIR tree, the encapsulated
 * Pixel Data fragments, the write and a read of what was written, and `deidentify` with no option
 * and with every option, each with its report and its write. Any of them that throws is recorded
 * as its error. A Buffer longer than 64 bytes is recorded as its length and SHA-256.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import type * as Dicom from "../../src/index.js";
import { ctImage, enhancedCt, srDocument, worklistItem } from "../../bench/shapes.mjs";
import {
  buildDicom,
  type BuildDicomElement,
  type BuildDicomSqElement,
} from "../helpers/build-dicom.js";
import { applyMutations, type Mutation } from "../property/_mutate.js";
import { DICOM_TOKENS, SEED_CORPUS } from "../property/_seed-corpus.js";

/** The parts of the package the record reads: head's `src/index.ts`, or a base tree's. */
export type OutputApi = Pick<
  typeof Dicom,
  | "parseDicom"
  | "serializeDicom"
  | "deidentify"
  | "readPixelDataFragments"
  | "profiles"
  | "DEIDENTIFY_OPTIONS"
  | "Dataset"
  | "Element"
  | "Item"
>;

/** One document of the corpus. */
export interface CorpusDocument {
  readonly name: string;
  readonly bytes: Buffer;
}

const TS_IMPLICIT_LE = "1.2.840.10008.1.2";
const TS_EXPLICIT_LE = "1.2.840.10008.1.2.1";
const TS_EXPLICIT_BE = "1.2.840.10008.1.2.2";
const TS_DEFLATED_LE = "1.2.840.10008.1.2.1.99";
const TS_JPIP_DEFLATE = "1.2.840.10008.1.2.4.95";

/** Mutated variants of each seed. */
const MUTANTS_PER_SEED = 32;

/** The File Preamble and the `DICM` prefix (PS3.10). */
const PREAMBLE_AND_PREFIX = 132;

/** A Buffer longer than this is recorded by its length and SHA-256 rather than its bytes. */
const INLINE_BYTES = 64;

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

/** mulberry32: a small seeded generator, so the mutations are the same on every run and machine. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INTERESTING_BYTES = [0x00, 0x01, 0x20, 0x7f, 0x80, 0xff, 0x5c, 0x5e, 0x3d, 0x1b];
const INTERESTING_16 = [0, 1, 2, 4, 8, 0x7f, 0x80, 0xff, 0x100, 0x7fff, 0x8000, 0xfffe, 0xffff];
const INTERESTING_32 = [
  0, 1, 2, 4, 8, 12, 0xff, 0xffff, 0x10000, 0x7fffffff, 0xfffffffe, 0xffffffff,
];

/** One mutation, every field drawn from `next`. Positions are reduced modulo the length on apply. */
function randomMutation(next: () => number, seedCount: number): Mutation {
  const int = (n: number): number => Math.floor(next() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)] as T;
  const at = int(1 << 20);
  switch (int(10)) {
    case 0:
      return { kind: "flip", at, bit: int(8) };
    case 1:
      return { kind: "byte", at, value: next() < 0.5 ? pick(INTERESTING_BYTES) : int(256) };
    case 2: {
      const width = next() < 0.5 ? 2 : 4;
      const value = pick(width === 2 ? INTERESTING_16 : INTERESTING_32);
      return { kind: "word", at, width, value, bigEndian: next() < 0.5 };
    }
    case 3:
      return { kind: "token", at, token: int(DICOM_TOKENS.length), overwrite: next() < 0.5 };
    case 4:
      return { kind: "insert", at, bytes: Array.from({ length: 1 + int(16) }, () => int(256)) };
    case 5:
      return { kind: "delete", at, length: 1 + int(64) };
    case 6:
      return { kind: "clone", from: int(1 << 20), length: 1 + int(64), to: at };
    case 7:
      return { kind: "repeat", at, length: 1 + int(32), times: 1 + int(8) };
    case 8:
      return { kind: "splice", seed: int(seedCount), from: int(1 << 20), length: 1 + int(64), at };
    default:
      return { kind: "truncate", at };
  }
}

const text = (s: string): Buffer => {
  const b = Buffer.from(s, "latin1");
  return b.length % 2 === 0 ? b : Buffer.concat([b, Buffer.from([0x20])]);
};

const codeItem = (value: string): { elements: BuildDicomElement[] } => ({
  elements: [
    { tag: "00080104", vr: "LO", value: text("Synthetic meaning") },
    { tag: "00080100", vr: "SH", value: text(value) },
    { tag: "00080102", vr: "SH", value: text("99SYNTH") },
  ],
});

/**
 * Data Sets the writer has to re-order: the root out of order, an Item out of order, a tag
 * repeated inside an Item, an odd-length value, a group length, and a private block, in each
 * native transfer syntax, with defined- and undefined-length sequences.
 */
function unordered(ts: string, undefinedLength: boolean): Buffer {
  const nested: BuildDicomSqElement = {
    tag: "0040A730",
    undefinedLength,
    items: [
      {
        undefinedLength,
        elements: [
          { tag: "0040A160", vr: "UT", value: text("Synthetic finding text") },
          { tag: "0040A040", vr: "CS", value: text("TEXT") },
          { tag: "0040A043", undefinedLength, items: [codeItem("SYN-2"), codeItem("SYN-1")] },
          { tag: "0040A010", vr: "CS", value: text("CONTAINS") },
        ],
      },
      {
        elements: [
          { tag: "0040A040", vr: "CS", value: text("CODE") },
          { tag: "0040A010", vr: "CS", value: text("HAS PROPERTIES") },
          { tag: "0040A010", vr: "CS", value: text("CONTAINS") },
        ],
      },
    ],
  };
  return buildDicom({
    transferSyntax: ts,
    elements: [
      { tag: "00100020", vr: "LO", value: text("SYN00000001") },
      { tag: "00100010", vr: "PN", value: text("SYNTHETIC^PATIENT") },
      { tag: "00080060", vr: "CS", value: text("SR") },
      { tag: "00080000", vr: "UL", value: Buffer.from([0x04, 0x00, 0x00, 0x00]) },
      { tag: "00080050", vr: "SH", value: Buffer.from("ACC", "latin1") },
      nested,
      { tag: "00090010", vr: "LO", value: text("SYNTHETIC VENDOR 1") },
      { tag: "00091001", vr: "LO", value: text("SYNTH PROTOCOL") },
      { tag: "00081032", items: [codeItem("SYN-CT-001")] },
      { tag: "00080005", vr: "CS", value: text("ISO_IR 100") },
    ],
  });
}

/** `true` for a document whose File Meta names a Deflated transfer syntax. */
function isDeflated(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 512).toString("latin1");
  return head.includes(TS_DEFLATED_LE) || head.includes(TS_JPIP_DEFLATE);
}

/** The corpus, in a fixed order, every document named once. */
export function outputCorpus(): readonly CorpusDocument[] {
  const docs: CorpusDocument[] = [];
  for (const seed of SEED_CORPUS) docs.push({ name: `seed/${seed.name}`, bytes: seed.bytes });
  for (let i = 0; i < 3; i++)
    docs.push({ name: `bench/worklist-${String(i)}`, bytes: worklistItem(i) });
  docs.push({ name: "bench/ct-slice", bytes: ctImage(0) });
  docs.push({ name: "bench/enhanced-ct-2", bytes: enhancedCt(0, 2) });
  docs.push({ name: "bench/sr-1", bytes: srDocument(0, 1) });
  docs.push({ name: "bench/sr-12", bytes: srDocument(1, 12) });
  for (const [label, ts] of [
    ["implicit-le", TS_IMPLICIT_LE],
    ["explicit-le", TS_EXPLICIT_LE],
    ["explicit-be", TS_EXPLICIT_BE],
    ["deflated-le", TS_DEFLATED_LE],
  ] as const) {
    docs.push({ name: `unordered/${label}/defined`, bytes: unordered(ts, false) });
    docs.push({ name: `unordered/${label}/undefined`, bytes: unordered(ts, true) });
  }
  // A Deflated seed is the output of this runtime's zlib, which is not the same bytes on every
  // build of Node, so neither it nor its bytes are mutated: its mutants would read differently
  // on different machines. It is still in the corpus above, read and written whole.
  const mutable = SEED_CORPUS.filter((seed) => !isDeflated(seed.bytes));
  const seeds = mutable.map((seed) => seed.bytes);
  const next = generator(0x5eed);
  for (const seed of mutable) {
    for (let k = 0; k < MUTANTS_PER_SEED; k++) {
      const count = 1 + Math.floor(next() * 4);
      const mutations = Array.from({ length: count }, () => randomMutation(next, seeds.length));
      // Three in four keep the File Preamble and the DICM prefix, so the edits land in the File
      // Meta group and the Data Set rather than in bytes the reader skips or refuses on sight.
      const kept = k % 4 === 3 ? 0 : Math.min(PREAMBLE_AND_PREFIX, seed.bytes.length);
      const body = applyMutations(seed.bytes.subarray(kept), mutations, seeds, DICOM_TOKENS);
      docs.push({
        name: `mutant/${seed.name}/${String(k)}`,
        bytes: Buffer.concat([seed.bytes.subarray(0, kept), body]),
      });
    }
  }
  return docs;
}

// ---------------------------------------------------------------------------
// The record of one document
// ---------------------------------------------------------------------------

type Plain = null | boolean | number | string | readonly Plain[] | { readonly [k: string]: Plain };

/** Walks a value into plain JSON-able data, recording what a caller could tell apart. */
class Recorder {
  private readonly seen = new Map<object, number>();

  public constructor(private readonly api: OutputApi) {}

  public bytes(b: Uint8Array): Plain {
    const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
    if (buf.length <= INLINE_BYTES) return { bytes: buf.toString("hex") };
    return { length: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
  }

  public error(err: unknown): Plain {
    if (!(err instanceof Error)) return { thrown: this.plain(err) };
    const own: Record<string, Plain> = {};
    for (const key of Object.keys(err)) {
      own[key] = this.plain((err as unknown as Record<string, unknown>)[key]);
    }
    return { error: err.constructor.name, name: err.name, message: err.message, own };
  }

  public attempt(fn: () => unknown): Plain {
    try {
      return { ok: this.plain(fn()) };
    } catch (err) {
      return this.error(err);
    }
  }

  public element(el: Dicom.Element): Plain {
    return {
      tag: el.tag,
      vr: el.vr,
      vm: el.vm,
      length: el.length,
      rawBytes: this.bytes(el.rawBytes),
      byteOffset: el.byteOffset,
      privateCreator: this.plain(el.privateCreator),
      cp246Promoted: this.plain(el.cp246Promoted),
      littleEndian: el.littleEndian,
      specificCharacterSet: this.plain(el.specificCharacterSet),
      items: this.plain(el.items),
      value: this.attempt(() => el.value),
      valueAgain: this.attempt(() => el.value === el.value),
    };
  }

  public dataset(ds: Dicom.Dataset, root: boolean): Plain {
    const out: Record<string, Plain> = {
      class: ds.constructor.name,
      fileMeta: this.plain(ds.fileMeta),
      warnings: this.plain(ds.warnings),
      elements: ds.elements().map((el) => this.element(el)),
      has: ds.elements().map((el) => ds.has(el.tag.toLowerCase())),
    };
    if (ds instanceof this.api.Item) {
      out["index"] = ds.index;
      out["fileOffset"] = this.plain(ds.fileOffset);
    }
    if (root) {
      out["patient"] = this.attempt(() => ds.patient);
      out["study"] = this.attempt(() => ds.study);
      out["series"] = this.attempt(() => ds.series);
      out["image"] = this.attempt(() => ds.image);
      out["directory"] = this.attempt(() => ds.directory);
      out["fragments"] = this.attempt(() => this.api.readPixelDataFragments(ds));
    }
    return out;
  }

  public plain(value: unknown): Plain {
    if (value === null) return null;
    if (value === undefined) return { undefined: true };
    if (typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number") {
      return Number.isFinite(value) && !Object.is(value, -0) ? value : { number: String(value) };
    }
    if (typeof value === "bigint") return { bigint: value.toString() };
    if (typeof value === "function") return { function: value.name };
    if (typeof value !== "object") return { other: typeof value };
    if (value instanceof Uint8Array) return this.bytes(value);
    if (value instanceof Date)
      return { date: Number.isNaN(value.getTime()) ? "invalid" : value.toISOString() };
    if (value instanceof Error) return this.error(value);
    const id = this.seen.get(value);
    if (id !== undefined) return { ref: id };
    this.seen.set(value, this.seen.size);
    if (value instanceof this.api.Element) return this.element(value);
    if (value instanceof this.api.Dataset) return this.dataset(value, false);
    if (Array.isArray(value)) return value.map((v: unknown) => this.plain(v));
    if (value instanceof Map) {
      return { map: [...value.entries()].map(([k, v]) => [this.plain(k), this.plain(v)]) };
    }
    if (value instanceof Set) return { set: [...value.values()].map((v) => this.plain(v)) };
    const out: Record<string, Plain> = {};
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      out["#class"] = (value as { constructor?: { name?: string } }).constructor?.name ?? "?";
    }
    out["#frozen"] = Object.isFrozen(value);
    for (const key of Object.keys(value)) {
      out[key] = this.plain((value as Record<string, unknown>)[key]);
    }
    return out;
  }
}

/** The options the read is recorded under, each by a stable name. */
function readOptions(api: OutputApi): readonly (readonly [string, Dicom.ParseOptions])[] {
  const out: (readonly [string, Dicom.ParseOptions])[] = [
    ["lenient", {}],
    ["strict", { strict: true }],
    ["copyValues", { copyValues: true }],
  ];
  for (const name of Object.keys(api.profiles).sort()) {
    const profile = (api.profiles as Record<string, Dicom.Profile>)[name];
    if (profile !== undefined) out.push([`profile:${name}`, { profile }]);
  }
  return out;
}

/**
 * What `serializeDicom` writes, with a Deflated body inflated again: the bytes zlib compresses are
 * the writer's, the compressed ones are the runtime's, and those differ between builds of Node.
 * The writer always writes the File Meta group length, so the body starts after it.
 */
function writtenBytes(api: OutputApi, ds: Dicom.Dataset): Buffer {
  const out = api.serializeDicom(ds);
  if (ds.fileMeta?.transferSyntaxUID !== TS_DEFLATED_LE) return out;
  const bodyStart = 144 + out.readUInt32LE(140);
  return Buffer.concat([out.subarray(0, bodyStart), inflateRawSync(out.subarray(bodyStart))]);
}

/** Everything a caller can observe of one document, as plain data. */
export function recordOf(api: OutputApi, doc: CorpusDocument): Plain {
  const record: Record<string, Plain> = {};
  let lenient: Dicom.Dataset | undefined;
  for (const [name, options] of readOptions(api)) {
    const r = new Recorder(api);
    try {
      const callbacks: string[] = [];
      const ds = api.parseDicom(doc.bytes, {
        ...options,
        onWarning: (w) => callbacks.push(w.code),
      });
      if (name === "lenient") lenient = ds;
      record[`read:${name}`] = { dataset: r.dataset(ds, name === "lenient"), callbacks };
    } catch (err) {
      record[`read:${name}`] = r.error(err);
    }
  }
  const ds = lenient;
  if (ds === undefined) return record;

  const r = new Recorder(api);
  const written = r.attempt(() => writtenBytes(api, ds));
  record["write"] = written;
  try {
    const out = api.serializeDicom(ds);
    record["reread"] = new Recorder(api).dataset(api.parseDicom(out), false);
  } catch (err) {
    record["reread"] = new Recorder(api).error(err);
  }
  for (const [name, retain] of [
    ["none", []],
    [
      "every",
      api.DEIDENTIFY_OPTIONS.filter((o) => o !== "RetainLongitudinalTemporalModifiedDates"),
    ],
  ] as const) {
    const d = new Recorder(api);
    try {
      const result = api.deidentify(ds, { retain });
      record[`deidentify:${name}`] = {
        dataset: d.dataset(result.dataset, false),
        report: d.plain(result.report),
        write: d.attempt(() => writtenBytes(api, result.dataset)),
      };
    } catch (err) {
      record[`deidentify:${name}`] = d.error(err);
    }
  }
  return record;
}

/** The SHA-256 of a record's canonical JSON. */
export function digestOf(record: Plain): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}
