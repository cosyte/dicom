---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/dicom` is a metadata-first DICOM Part 10 parser for Node.js/TypeScript. It ships dual
**ESM + CJS** builds with per-condition type declarations, so it works from either module system
without configuration, and it takes **zero runtime dependencies** — the byte-level and character-set
work is done in-house (the package budget allows up to three ADR-justified deps; none are currently
taken).

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. The command below is the shape it will
> take at first publish; until then, consume it from source or a workspace link.

## Prerequisites

- **Node.js >= 22.** The whole `@cosyte/*` suite targets ES2023 / Node 22+.
- A package manager — `pnpm`, `npm`, or `yarn`.
- **No runtime dependencies, no native build, no post-install script.** The data dictionary is
  generated from the official DICOM Part 6 source at build time and committed, so at runtime there is
  no network or filesystem lookup.

## Install

```bash
npm install @cosyte/dicom
```

## Smoke test

Confirm the package resolves and a real entry point is callable — parse the smallest synthetic Part
10 object and read a field back through a typed view:

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// Synthetic Part 10 object (base64) — a tiny CT header, invented MRN, fake UIDs. No real PHI.
const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);

const ds = parseDicom(buf);

ds.series.modality; // => "CT"
ds.patient.id; // => "MRN-42"
ds.warnings.length; // => 0
```

If that resolves and returns, the install is good — head to the [Quickstart](./quickstart).

## Module systems

`@cosyte/dicom` is `"type": "module"` and exposes both conditions, so both of these resolve to the
right build without extra configuration:

```ts
// ESM / TypeScript
import { parseDicom, serializeDicom, deidentify } from "@cosyte/dicom";
```

```js
// CommonJS
const { parseDicom, serializeDicom, deidentify } = require("@cosyte/dicom");
```

The single top-level entry point (`@cosyte/dicom`) publishes per-condition types (`.d.ts` for
`import`, `.d.cts` for `require`), gated by `attw` on every release. Editor IntelliSense matches the
build you actually load.

## PHI discipline

Every example in this documentation is built from a **synthetic** object — an invented patient,
obviously-fake UIDs and MRNs — encoded as a small base64 buffer so a snippet needs no file on disk.
Do the same in your own tests: a real DICOM object is PHI, and one committed to a repository is a
leak the moment it publishes. The parser helps: every warning and error message carries only
structural locators (attribute tag, byte offset, code) — never a patient name, an identifier, or
pixel content. See [Troubleshooting](./troubleshooting) for the redaction posture and the explicit
non-goals.
