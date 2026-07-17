---
id: spec-notes-model
title: The object model
sidebar_label: The object model
sidebar_position: 1
---

# The object model — Part 10 framing, File Meta, dataset

A DICOM Part 10 object on disk is a **128-byte preamble**, the `DICM` magic, a **File Meta
Information** group (always Explicit VR Little Endian) that names the transfer syntax, and then the
**dataset** — a flat, ordered list of data elements encoded in that transfer syntax. `parseDicom`
frames all of it into one immutable `Dataset`.

## What a data element is

Every element is a `(group,element)` **tag**, a **VR** (Value Representation — the two-letter type
code), a length, and a value. `@cosyte/dicom` keys elements by the 8-character uppercase hex tag
(e.g. `"00100010"` for Patient's Name). The parser supports the four v1 transfer syntaxes: Implicit
VR LE, Explicit VR LE, Explicit VR BE, and Deflated Explicit VR LE. In Implicit VR the on-wire VR is
absent and is resolved from the dictionary; in Explicit VR the on-wire VR is honored and a
disagreement with the dictionary is flagged (`DICOM_VR_MISMATCH`), never silently overridden.

## Reaching elements

`ds.get(tag)` returns the `Element` at a tag (or `undefined`); `ds.has(tag)` tests presence;
`ds.getAll(tag)` returns every element at a repeating tag. All three take the **tag** form — `get`
does **not** take a keyword. Resolve a keyword to its tag through the generated dictionary:

```ts runnable
import { parseDicom, Dictionary } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

const ds = parseDicom(buf);

// File Meta names the transfer syntax the dataset was encoded in.
ds.fileMeta?.transferSyntaxUID; // => "1.2.840.10008.1.2.1"

// Elements are keyed by (group,element) tag, case-insensitively.
// This synthetic object carries no Pixel Data, so that tag is absent.
ds.has("00100010"); // => true
ds.has("7FE00010"); // => false

// A keyword resolves to its tag through the dictionary; `get` then takes the tag.
Dictionary.byKeyword("PatientName")?.tag; // => "00100010"
Dictionary.lookup("00080060")?.keyword; // => "Modality"
```

## The generated data dictionary

The `Dictionary` namespace is generated at build time from the official DICOM Part 6 source and
committed, so lookups are in-memory and deterministic — no runtime network or filesystem access.
`Dictionary.lookup` accepts either a tag or a keyword; `byKeyword` is keyword-only; `uid` resolves a
UID (e.g. a transfer syntax) to its human-readable name. Unknown input returns `undefined` — the
dictionary never throws.

## Immutability

A `Dataset` is immutable at the model boundary: `warnings` is frozen, and the element map is not
exposed for mutation. Edits go through explicit methods (`setElement`, `addElement`, `removeElement`,
and the sequence-item equivalents), each returning results rather than mutating shared parser output.
This is the same discipline the serializer relies on — see [Re-serializing](./cookbook).

## Where values come from

`ds.get(tag)` gives you the raw `Element`; its `.value` decodes the bytes into a typed
[`DicomValue`](./spec-notes-values). For the safety-critical attributes there is a shorter, typed
path — the [`patient` / `study` / `series` / `image` views](./spec-notes-safety) — which is what the
[Quickstart](./quickstart) uses.
