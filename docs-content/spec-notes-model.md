---
id: spec-notes-model
title: The object model
sidebar_label: The object model
sidebar_position: 1
---

# The object model: Part 10 framing, File Meta, dataset

A DICOM Part 10 object on disk is a **128-byte preamble**, the `DICM` magic, a **File Meta
Information** group (always Explicit VR Little Endian) that names the transfer syntax, and then the
**dataset**: a flat, ordered list of data elements encoded in that transfer syntax. `parseDicom`
frames all of it into one immutable `Dataset`.

## What a data element is

Every element is a `(group,element)` **tag**, a **VR** (Value Representation: the two-letter type
code), a length, and a value. `@cosyte/dicom` keys elements by the 8-character uppercase hex tag
(e.g. `"00100010"` for Patient's Name). The parser supports the four v1 transfer syntaxes: Implicit
VR LE, Explicit VR LE, Explicit VR BE, and Deflated Explicit VR LE. In Implicit VR the on-wire VR is
absent and is resolved from the dictionary; in Explicit VR the on-wire VR is honored and a
disagreement with the dictionary is flagged (`DICOM_VR_MISMATCH`), never silently overridden.

## Reaching elements

`ds.get(tag)` returns the `Element` at a tag (or `undefined`); `ds.has(tag)` tests presence;
`ds.getAll(tag)` is the always-array complement of `get`, and because a `Dataset` holds at most one
element per tag it returns 0 or 1. All three take the **tag** form. `get`
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
committed, so lookups are in-memory and deterministic: no runtime network or filesystem access.
`Dictionary.lookup` accepts either a tag or a keyword; `byKeyword` is keyword-only; `uid` resolves a
UID (e.g. a transfer syntax) to its human-readable name. Unknown input returns `undefined`. The
dictionary never throws.

The element registry, 5,309 tags, comes from **NEMA's PS3.6 2026c DocBook**, the normative
publication of the standard, rather than from a third-party mirror of it. That is what the `name`,
`keyword`, `vr`, `vm`, and `retired` fields on an entry are: the values PS3.6 prints for that tag, in
the edition named above. `retired` in particular is worth reading rather than ignoring, in both
directions. `(0010,2160)` `EthnicGroup` is retired and its replacements `EthnicGroupCodeSequence`
and `EthnicGroups` are what current instances carry; `(3004,0012)` `DoseValue` is **not** retired,
whatever an older dictionary may tell you. A retired entry stays resolvable, because files in the
wild outlive the editions that defined them; you are told what the tag is and that it is no longer
current.

```ts runnable
import { Dictionary } from "@cosyte/dicom";

// Retired in PS3.6 2025a, and still resolvable so an older study can be read.
Dictionary.lookup("00102160")?.keyword; // => "EthnicGroup"
Dictionary.lookup("00102160")?.retired; // => true

// Its replacements, which current instances carry.
Dictionary.byKeyword("EthnicGroupCodeSequence")?.tag; // => "00102161"
Dictionary.byKeyword("EthnicGroups")?.vm; // => "1-n"

// PS3.6 still defines this one. The RET marker belongs to (3004,0010).
Dictionary.lookup("30040012")?.keyword; // => "DoseValue"
Dictionary.lookup("30040012")?.retired; // => false
Dictionary.lookup("30040010")?.retired; // => true
```

UID names come from the same edition, out of **PS3.6 Annex A**: Table A-1 (UID Values) and Table A-2
(Well-known Frames of Reference). That is every UID the registry publishes, transfer syntaxes, SOP
and Meta SOP Classes, well-known SOP Instances, coding schemes and the rest, current and retired
alike, rather than a hand-picked subset. Two things are deliberately not PS3.6's spelling, and both
are conveniences rather than corrections:

- **Retirement is the `retired` boolean, not a suffix in the name.** PS3.6 marks a retired UID by
  appending `(Retired)` to its UID Name; here that moves into a field you can branch on, and the
  name stays a name.
- **Four transfer syntaxes keep the short form every toolkit prints.** PS3.6 gives them a trailing
  `: Default Transfer Syntax for ...` clause recording which storage class defaults to them, so you
  get `Implicit VR Little Endian` rather than
  `Implicit VR Little Endian: Default Transfer Syntax for DICOM`. The other four hundred odd names
  are the normative text, unchanged.

Two rows are absent on purpose: PS3.6 retired them and withdrew their names in the same edition, so
there is no name to return and `uid` reports them as unknown rather than answering with an empty
string.

```ts runnable
import { Dictionary } from "@cosyte/dicom";

// A transfer syntax the current edition defines.
Dictionary.uid("1.2.840.10008.1.2.4.203")?.name; // => "High-Throughput JPEG 2000 Image Compression"
Dictionary.uid("1.2.840.10008.1.2.4.203")?.type; // => "TransferSyntax"

// The short form, not PS3.6's longer name.
Dictionary.uid("1.2.840.10008.1.2")?.name; // => "Implicit VR Little Endian"

// Retirement is a field, and the name is left alone.
Dictionary.uid("1.2.840.10008.1.2.2")?.name; // => "Explicit VR Big Endian"
Dictionary.uid("1.2.840.10008.1.2.2")?.retired; // => true
```

## Immutability

A `Dataset` is immutable at the model boundary: `warnings` is frozen, and the element map is not
exposed for mutation. Edits go through explicit methods (`setElement`, `addElement`, `removeElement`,
and the sequence-item equivalents), each returning results rather than mutating shared parser output.
This is the same discipline the serializer relies on. See [Re-serializing](./cookbook).

## Where values come from

`ds.get(tag)` gives you the raw `Element`; its `.value` decodes the bytes into a typed
[`DicomValue`](./spec-notes-values). For the safety-critical attributes there is a shorter, typed
path (the [`patient` / `study` / `series` / `image` views](./spec-notes-safety)) which is what the
[Quickstart](./quickstart) uses.
