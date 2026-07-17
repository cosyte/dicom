---
id: cookbook
title: Cookbook
sidebar_position: 2
---

# Cookbook

Task-oriented recipes for the DICOM jobs you actually get handed. Each one is: here's the problem,
here's the code, here's what you get back. Every symbol below is a real `@cosyte/dicom` export — no
pseudo-API. All sample objects are **synthetic** (an invented patient, fake UIDs), encoded as base64
so a recipe needs no file on disk; never paste a real DICOM object into a doc or a test.

Read [Getting started](./intro) first for the parse model; the recipes here assume you can already
get a parsed `Dataset`.

---

## 1. Re-serialize a parsed object to spec-clean bytes

**The problem:** you parsed an object — perhaps a quirky one — and need Part 10 bytes back out for
storage or forwarding, with a guarantee that nothing was silently lost.

`serializeDicom(ds)` writes a `Dataset` back to a Part 10 `Buffer`: preamble + `DICM`, File Meta
always Explicit VR LE with a recomputed group length, and the dataset body **in the source transfer
syntax — no transcode**. It obeys the conservative half of Postel's Law: even-length padding,
correct headers, byte-for-byte sequence and encapsulated-pixel-data passthrough. Serializing is a
fixed point.

```ts runnable
import { parseDicom, serializeDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);
const out = serializeDicom(ds);

Buffer.isBuffer(out); // => true

// Re-parsing the bytes yields the same data...
parseDicom(out).patient.name?.alphabetic?.familyName; // => "Doe"

// ...and re-serializing is byte-identical (a fixed point).
serializeDicom(parseDicom(out)).equals(out); // => true
```

Only the typed `FileMeta` fields round-trip through the model; the rest of File Meta is recomputed
spec-clean on emit.

---

## 2. De-identify before sharing

**The problem:** you need to strip identifying metadata before an object leaves your control, and you
need a record of what was done — without mutating the original.

`deidentify(ds)` applies the PS3.15 Annex E **Basic Application Level Confidentiality Profile** —
replacing, emptying, or removing every attribute the standard lists as identifying — and returns a
fresh `Dataset` plus a **value-free** `DeidentifyReport`. It is a **pure function**: your input
dataset is never mutated.

```ts runnable
import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);
const { dataset, report } = deidentify(ds);

// The original is untouched; the identifying fields are gone from the copy.
ds.patient.id; // => "MRN-42"
dataset.patient.id; // => undefined

// Patient's Name is emptied (Annex E action "Z"), not left in place.
dataset.get("00100010")?.value.kind; // => "empty"

// UIDs are remapped to deterministic 2.25 replacements that stay consistent across files.
dataset.study.instanceUid?.startsWith("2.25."); // => true

// The report lists what was acted on — value-free, safe to log.
report.attributes.length > 0; // => true
report.warnings.length; // => 0

// The de-identified copy serializes to bytes you can share.
Buffer.isBuffer(serializeDicom(dataset)); // => true
```

This is **metadata-level** de-identification. Pixel data is out of scope: when an object carries
burned-in annotation this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`
warning on the report rather than a false sense of safety — pixel cleaning is deferred to
`@cosyte/dicom-pixel`. Opt into any of the nine metadata-affecting Annex E Options (e.g. `RetainUIDs`,
`RetainLongitudinalTemporal`, `CleanDescriptors`) via `deidentify(ds, { retain: [...] })`.

---

## 3. Read raw pixel data without decoding it

**The problem:** you need the pixel bytes (to hand to an imaging pipeline, to hash, to forward) but
`@cosyte/dicom` deliberately does not decode them.

Pixel Data `(7FE0,0010)` decodes to a `{ kind: "binary", bytes }` value — the raw `Buffer`, exactly
as stored. You read the geometry from the [`image` view](./spec-notes-safety) and the bytes from the
element; interpreting them is your pipeline's job.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// Synthetic 2x2, 16-bit object with a tiny raw Pixel Data element.
const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xACgAEABVUwIAAgAoABEAVVMCAAIAKAAAAVVTAgAQAOB/EABPQgAACAAAAAEAAgADAAQA",
  "base64",
);

const ds = parseDicom(buf);

ds.image.rows; // => 2
ds.image.columns; // => 2

const pixels = ds.get("7FE00010")?.value; // Pixel Data
pixels?.kind; // => "binary"
const byteLength = pixels?.kind === "binary" ? pixels.bytes.length : undefined;
byteLength; // => 8

ds.warnings.length; // => 0
```

The bytes are never windowed, rescaled, or color-transformed here — that is
[out of scope](./troubleshooting). For encapsulated (compressed) transfer syntaxes the value exposes
the raw fragments, still undecoded.

---

## 4. Triage warnings — the lenient, never-throw contract

**The problem:** you want to log or triage every tolerated deviation without your pipeline throwing on
a vendor quirk.

Every recoverable deviation collects on `ds.warnings` with a stable code and a byte offset; only the
four fatal conditions throw. The messages are PHI-free by construction, so the whole array is safe to
log.

```ts runnable
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

// Synthetic object with the preamble omitted — a tolerated quirk.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);

const ds = parseDicom(buf);

// The object parsed; the deviation is recorded, not hidden.
ds.series.modality; // => "CT"
ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE); // => true

// Every warning carries a stable code and a byte offset — safe to log, no PHI.
ds.warnings.every((w) => typeof w.code === "string"); // => true
```

**Escalate when you want strictness.** A [source profile](./spec-notes-profiles) can promote chosen
warning codes to a thrown `DicomParseError` — a spec-conformance gate for a trusted sender — or
suppress benign, high-volume codes for a known-quirky source.
