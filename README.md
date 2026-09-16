<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark" src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/dicom

> Pull the metadata out of a real-world, vendor-quirky DICOM Part 10 file in one line, without reading the standard.

[![npm version](https://img.shields.io/npm/v/@cosyte/dicom.svg)](https://www.npmjs.com/package/@cosyte/dicom)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/dicom/ci.yml?branch=main&label=CI)](https://github.com/cosyte/dicom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

DICOM Part 10 parser + utility library for Node.js and TypeScript: metadata-first, vendor-quirky-tolerant, dual ESM/CJS.

**Contents**

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [PHI and safety](#phi-and-safety)
- [API](#api)
- [Compatibility](#compatibility)
- [Cookbook](#cookbook)
- [Known limitations & non-goals](#known-limitations--non-goals)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Trademarks](#trademarks)
- [License](#license)

## Why this exists

The toolkits a Node service reaches for today, what each one costs, and what this reads instead: [`documentation/readme-why-this-exists.md`](./documentation/readme-why-this-exists.md).

## Status

**Version `0.1.0`. The public API is settled and safe to depend on.** The parser entry, the four safety-critical views, the structural tag accessors, the lazy typed value decode across all 34 VRs, the spec-clean serializer, the source/vendor profile system and metadata-level `deidentify()` are all shipped, and their signatures are what the next release still carries. Zero runtime dependencies today.

**What is still moving, or is not covered at all.** Pixel data is not decoded in any transfer syntax and a pixel-compressed object does not parse at all, deferred to `@cosyte/dicom-pixel`; DIMSE and DICOMweb are non-goals here and belong to `@cosyte/dicom-net` and `@cosyte/dicomweb`; and the de-identifier's open PHI residuals are measured and disclosed rather than closed. Read [Known limitations & non-goals](#known-limitations--non-goals) before you point this at real data. Mis-reading a patient identifier, an image's signedness, or a rescale slope can cause real clinical harm.

## Install

```bash
# pnpm (recommended). Also works with: npm install @cosyte/dicom  |  yarn add @cosyte/dicom
pnpm add @cosyte/dicom
```

- **Node engine floor: `>=22`.** `engines.node` is `>=22.0.0`, and CI runs the 22 and 24 matrix.
- **Module format: dual ESM and CJS**, with per-condition type declarations, so `import` and `require` both resolve against the type that matches them.
- **Strict TypeScript** (`noUncheckedIndexedAccess`, no `any`), with JSDoc and an `@example` on every public export feeding your editor's IntelliSense.

## Usage

Useful output after install and parse. No DICOM spec knowledge required.

```ts
import { readFile } from "node:fs/promises";
import { parseDicom } from "@cosyte/dicom";

const ds = parseDicom(await readFile("study.dcm"));

ds.patient.id; // "MRN-42": NOT globally unique on its own, pair it with ds.patient.issuerOfId
ds.study.instanceUid; // "1.2.840.…": the global study anchor
ds.series.modality; // "CT"
ds.image.rows; // 512
ds.image.rescaleSlope; // number | undefined: undefined means "absent", never 1
ds.warnings.map((w) => w.code); // ["DICOM_MISSING_PREAMBLE"]: what the parser tolerated
```

The structural route, and emitting bytes back out:

```ts
import { Dictionary, deidentify, parseDicom, serializeDicom } from "@cosyte/dicom";

const ds = parseDicom(buf);

ds.get("00100010")?.value; // { kind: "personName", values: [ … ] }: structured PN, never flattened
Dictionary.byKeyword("Modality")?.tag; // "00080060"

const { dataset, report } = deidentify(ds);
const safe = serializeDicom(dataset); // Buffer: spec-clean Part 10, same transfer syntax, no transcode
report.attributes.length; // count of attributes acted on (each carries tag/keyword/action, no values)
```

That's the pitch: no config, no schema upload, no spec lookup. The parser accepts vendor-quirky input by default (it tolerates a missing preamble, a wrong File Meta group length, odd-length values, and the dozen-or-so deviations real scanners emit) and records each as a stable warning code rather than failing. You reach for typed value decode, safety-critical views, profiles, or the serializer when you want them.

## PHI and safety

DICOM headers carry patient identity directly: name, identifier, dates, accession number, institution, and free-text descriptions that people type names into. What this library does and does not do with that data, stated so you can audit it rather than assume it:

- **Logging: nothing.** There is no logger to configure and no `console` call in library code. Warning and error messages are looked up in a frozen registry by their code, and the factories take a position and structural constants only, so a document value has no string parameter to travel through. The exceptions are named on the types rather than left to be discovered: `DicomParseError.snippet` is 16 raw source bytes as hex, and `DeidentifyReport` carries `uidMap`, `removedPrivateTags`, `unauditableSequences[].tag` and `contextPath` composed from source bytes. Treat all of those as PHI and redact them at your own boundary.
- **Retention: nothing.** `parseDicom` returns a `Dataset` over the buffer you handed it. There is no cache, no module-level store and no history between calls; typed value decode is lazy and memoised on the element itself, so it lives and dies with the dataset you dropped.
- **Writing to disk: nothing.** The library performs no filesystem and no network I/O at runtime. `serializeDicom` returns bytes and leaves the write to you, and the data dictionary is generated at build time from the official Part 6 source and compiled in, so nothing is read from disk either.
- **What you still own.** Reading the file, writing and transporting the output, redacting whatever you log, and the retention policy over both. `deidentify()` hands you a fresh dataset plus an audit report; it does not decide where either one goes.

**A de-identified output from this package is metadata-de-identified only.** `deidentify()` applies the PS3.15 Annex E Basic Profile plus the nine metadata Options to the header, and the input dataset is never mutated. It does not touch pixels: when a file carries burned-in annotation this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning rather than a false sense of safety, and pixel cleaning is deferred to `@cosyte/dicom-pixel`. **The open PHI residuals are measured and disclosed, and none of them is an all-clear:** read [Known limitations & non-goals](#known-limitations--non-goals) in full before you share an output, and treat `DeidentifyReport` as the channel that tells you what a run actually did, because an emptied audit is not a performed one.

## API

Everything ships from one entry point, and the reference for it is [`documentation/readme-api.md`](./documentation/readme-api.md): features, the 90-second DICOM primer, access patterns, typed values and error handling.

### Access patterns

Named views, structural access by tag, lazy typed values: [`documentation/readme-api.md`](./documentation/readme-api.md#access-patterns).

#### Dates and times

The one conversion surface over `DA`, `TM` and `DT`, its key set and `toDate`'s zone rule: [`documentation/readme-api.md`](./documentation/readme-api.md#dates-and-times). The cross-package example stays here, because it is the only place this package writes another parser's call shape down.

Because the three names are identical across every `@cosyte/*` parser, a file importing two of them has to alias or namespace-import:

```ts
import { parseDateTime, toISO as dicomToISO } from "@cosyte/dicom";
import { parseDtm, toISO as hl7ToISO } from "@cosyte/hl7";

dicomToISO(parseDateTime("20240115133015").value); // "2024-01-15T13:30:15"
hl7ToISO(parseDtm("20240115133015")); // the same string, from an HL7 v2 DTM
```

The asymmetric `.value` is not a slip: what is shared across the packages is the three conversion names and their return shapes, never the decoders' own return shapes. `parseDateTime` here answers `{ value, nonstandardOffset }`, so the value comes out of the `.value` field, while `@cosyte/hl7`'s `parseDtm` answers its parts directly and is passed straight in. Read each package's decoder signature; then the conversion is the same call everywhere.

### Error Handling

The five typed errors, and what is bound out of their messages: [`documentation/readme-api.md`](./documentation/readme-api.md#error-handling).

## Compatibility

The edition this reads, the syntaxes it supports, the deviations it tolerates and the profile system: [`documentation/readme-compatibility.md`](./documentation/readme-compatibility.md).

### Supported transfer syntaxes

Four, and every other UID is refused rather than half-read: [`documentation/readme-compatibility.md`](./documentation/readme-compatibility.md#supported-transfer-syntaxes).

### Real-World Tolerance

The four tiers, what a warning message may carry, and the two codes that report a LOSS: [`documentation/readme-compatibility.md`](./documentation/readme-compatibility.md#real-world-tolerance).

### Profiles

What a profile may do to a parse, the five built-ins, and `defineProfile()`: [`documentation/readme-compatibility.md`](./documentation/readme-compatibility.md#profiles).

## Cookbook

Recipes for the jobs a metadata parser is actually asked to do, each attribute citing the PS3 clause it reads: [`documentation/readme-cookbook.md`](./documentation/readme-cookbook.md).

### De-identify before sharing

The call, the fields of its report and the nine Options: [`documentation/readme-cookbook.md`](./documentation/readme-cookbook.md#de-identify-before-sharing). What the de-identified object declares about its own dates stays here, because a recipient acts on it and never re-derives it.

**The de-identified object says what this run did to its dates, so a recipient does not have to guess.** `deidentify()` writes `(0028,0303) Longitudinal Temporal Information Modified`, and it has exactly two states here: **`REMOVED`** when no Retain Longitudinal Temporal Information Option was active, which is the default, and **`UNMODIFIED`** when `RetainLongitudinalTemporal` was. PS3.15 2026c §E.2 requires the first ("The Attribute Longitudinal Temporal Information Modified (0028,0303) shall be added to the Data Set with a Value of `REMOVED` if none of the Retain Longitudinal Temporal Information Options is applied") and §E.3.6 the second, for the Full Dates branch. Without it, a recipient reading dates cannot tell real ones from scrubbed ones, and guessing wrong hurts in both directions: treating real dates as scrubbed under-protects the patient, and treating scrubbed dates as real corrupts a longitudinal analysis.

```ts
const removed = deidentify(parseDicom(buf)).dataset;
removed.get("00280303")?.value; // { kind: "strings", values: ["REMOVED"] }

const kept = deidentify(parseDicom(buf), { retain: ["RetainLongitudinalTemporal"] }).dataset;
kept.get("00280303")?.value; // { kind: "strings", values: ["UNMODIFIED"] }
```

**It is REPLACED, not added to.** The attribute is `VM 1` and both clauses say the value "shall be added to the Data Set with a Value of" one named state, so a `(0028,0303)` the source file already carried is discarded rather than joined - the opposite of what `(0012,0063)` does with the same run's method text, and the asymmetry is the standard's. That is deliberate: two contradictory states in one single-valued attribute would leave a recipient reading a state no run produced. The value is not on `DeidentifyReport`; like `(0012,0062)`, it is a statement the object makes about itself.

## Known limitations & non-goals

The full list is in [`documentation/readme-known-limitations.md`](./documentation/readme-known-limitations.md). Two of its entries stay below, because a reader who gets no further than this file still has to meet them.

`@cosyte/dicom` is metadata-first by design. Even at v1-complete, do **not** rely on it for:

- **`RetainSafePrivate` REMOVES a private value this run did not enumerate, and the over-redaction is the point rather than a corner case.** PS3.15 2026c §E.3.10 retains Private Attributes "known by the de-identifier to be safe from identity leakage" and requires that "all other Private Attributes shall be removed **or processed in the element-specific manner recommended by Deidentification Action (0008,0307), if present within Private Data Element Characteristics Sequence (0008,0300)**"; this library does not implement `(0008,0307)`, so removal is the branch available to it. A value nothing enumerated is not known to be safe, so it goes. **Enumeration means one of exactly three things**: the run **walked the value as Data Elements** and put each of them through the action table (a private `SQ` whose items the parser materialized), the whole value **was matched as a member of your profile's private dictionary** (a Private Creator `(gggg,00EE)`), or the value is **zero-length** and so encodes no Data Set. **Decoding a value under the VR your profile declares for it is NOT enumeration, and neither is the embedded-attribute scanner's silence** - that scanner reads string carriers only and decodes tiles in the file's own encoding, so a nested Data Set written in another transfer syntax passes it untouched on a perfectly scannable `LO` carrier, measured. **So the retained class collapses to those three, and an ordinary vendor scalar under an ordinary string VR is removed.** If you carried opaque vendor values through `RetainSafePrivate` before, they are gone: getting them back needs a content test that separates a nested Data Set from a legitimate binary blob, which is the open product question and not a flag on this path. **Each removal is recorded per instance** - the tag plus the Data Set it lived in - in `report.unenumerablePrivateRemovals`, with `applied: "removed"` and `reason: "unenumerable"`, and named in `report.removedPrivateTags` as every removed private tag always has been. **That record is complete and never capped**, at any input size, because telling an unenumerable removal from an Annex E one is the guarantee the fail-safe's audit half rests on; the matching warnings stay bounded. **Two audit-contract changes to act on if you switch on either**: `report.unauditableSequences` no longer produces its retired `kept` outcome for a retained private value - its `applied` field was `"emptied" | "kept"` and is `"emptied"` alone now - so an entry there means content is not in your output, and `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE` changes meaning from "shipped unexamined" to "removed unexamined". The **code set** is unchanged - no code is added, removed or renamed - so narrowing on that name keeps compiling and has to be re-read rather than re-typed. Through `0.0.19` this class was kept verbatim and merely disclosed, under `(0012,0062) Patient Identity Removed = YES`, and the package said outright that this was a disclosure and not a fix.
- **`(0028,0303)` has a third state this library never produces, and the absence is the honest answer rather than a gap.** PS3.15 2026c §E.3.6 defines **two** mutually exclusive Retain Longitudinal Temporal Information Options - With Full Dates and With Modified Dates - and the second requires `(0028,0303) Longitudinal Temporal Information Modified` to say **`MODIFIED`**. `deidentify()` writes `REMOVED` and `UNMODIFIED` and **never produces it**, on any option set. Two reasons, and neither is an oversight: this package exposes **one** temporal option name, `RetainLongitudinalTemporal`, and it carries the **full-dates** column, so the modified-dates column is not resolvable at all; and §E.3.6 makes `MODIFIED` a claim that the object's dates were aggregated or transformed in a way that reduces re-identification while preserving longitudinal relationships, which is a **date transformation this metadata layer performs on nothing**. A `MODIFIED` written over untransformed dates would be a false safety declaration - a recipient acts on it and never re-derives it, which is the worst direction this attribute can fail in - so it is not written. **If you shift dates yourself after the call, `(0028,0303)` will say `UNMODIFIED` and that is now wrong for your object**: set it yourself, and describe the manner of modification in your Conformance Statement as §E.3.6 requires. **And the declaration is the top-level Data Set's own.** `(0028,0303)` is not in Table E.1-1, so a copy the sender nested inside a Sequence Item is retained by omission like every other unlisted attribute and still says whatever that sender wrote; read the Data Set's `(0028,0303)`, never a nested one.

## Roadmap

v1 is metadata-feature-complete. Future companion packages (separate repos, demand-sequenced):

- **`@cosyte/dicom-pixel`**: pixel decode/decompression, frame extraction, burned-in-annotation cleaning.
- **`@cosyte/dicom-net`**: DIMSE network services.
- **`@cosyte/dicomweb`**: QIDO / WADO / STOW REST clients.

## Contributing

Vendor-quirk fixtures (synthetic or properly de-identified), profile improvements, and dictionary corrections are all welcome. The more real-world edge cases the test suite covers, the more robust the parser gets. See `CONTRIBUTING.md` if present, or open an issue.

A contribution has to clear the same gates CI runs: `pnpm lint`, `pnpm typecheck`, `pnpm test` (per-directory coverage floors included), `pnpm run format:check`, `pnpm run check:no-emdash`, and `pnpm phi-scan`. Never open a PR carrying real patient data: every fixture in this repository is synthetic and built in a `.ts` source file, and the PHI scanner reads this README too.

## Trademarks

GE, Siemens, and Philips are trademarks of their respective owners. cosyte is not affiliated with, endorsed by, or
sponsored by any of them. The names identify the vendors whose private dictionaries the built-in profiles resolve. See [TRADEMARKS.md](./TRADEMARKS.md).

## License

[MIT](./LICENSE) © Cosyte. SPDX identifier `MIT`; the copyright holder is Cosyte.

_Built by [Cosyte](https://cosyte.com)._
