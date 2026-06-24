---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/dicom

Read a real-world, vendor-quirky DICOM Part 10 file and pull metadata fields out in one line —
without having read the DICOM standard. `@cosyte/dicom` is a metadata-first TypeScript parser for
Node.js: a lenient reader, an immutable dataset with dot-path access, a generated data dictionary,
and stable warning codes for the deviations real scanners produce.

It is **metadata-first by design**. Pixel data is exposed as a raw `Buffer` (and, for encapsulated
transfer syntaxes, its fragments) but is **not decoded** — that, along with DIMSE networking and
DICOMweb, is left to future companion packages.

## Install

```bash
npm install @cosyte/dicom
```

## Read a file

```ts
import { readFile } from "node:fs/promises";
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(await readFile("study.dcm"));

ds.get("PatientName"); // "Doe^Jane"
ds.get("(0010,0010)"); // same element, by tag
ds.get("StudyDate"); // "20240115"
ds.pixelData; // raw Buffer — not decoded
ds.warnings; // stable, byte-offset tolerance warnings
```

Elements are reachable by keyword or by `(group,element)` tag through the same `get` path.

## Lenient by default

The parser is **lenient by default** — the quirks real scanners emit (odd-length values, missing
padding, off-spec VRs) become warnings carrying a stable code and the byte offset where they
occurred, not failures. Only four unrecoverable structural conditions throw. When you re-serialize,
the writer always emits spec-clean Part 10 — correct File Meta group length, even-length values,
proper padding (Postel's Law).

## Next

- Read the **API reference** for every export, generated from source.
- See the data dictionary coverage and the full list of warning codes.
