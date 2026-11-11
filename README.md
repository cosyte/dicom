<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="The Cosyte logo on its own white ground: the icon beside the word Cosyte." src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/dicom

> Pull the metadata out of a real-world, vendor-quirky DICOM Part 10 file in one line, without reading the standard.

[![npm version](https://img.shields.io/npm/v/@cosyte/dicom.svg)](https://www.npmjs.com/package/@cosyte/dicom)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/dicom/ci.yml?branch=main&label=CI)](https://github.com/cosyte/dicom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cosyte/dicom/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

DICOM Part 10 parser + utility library for Node.js and TypeScript: metadata-first, vendor-quirky-tolerant, dual ESM/CJS.

**Contents**

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [PHI and safety](#phi-and-safety)
- [API](#api)
- [Documentation](#documentation)
- [Support](#support)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

Most software that touches medical imaging needs a handful of header fields and nothing else: who the patient is, which study and series an instance belongs to, and how the pixels are to be interpreted if anything downstream ever renders them. Getting those fields out today means reaching for a toolkit built around a pixel pipeline you are not going to use (GDCM in C++, dcm4che on the JVM, dcm2niix in C), shelling out to it from your Node service, or writing a strict reader that then rejects the vendor-quirky files real scanners and patient CDs actually emit. `@cosyte/dicom` is the metadata half on its own: **metadata-first** TypeScript that reads the headers (patient, study, series, image, codes, UIDs) leniently and fast, records every deviation it tolerated as a stable warning code, exposes pixel data as raw bytes, and **never decodes pixels**. Not decoding pixels is what keeps it a library you can depend on rather than a toolchain you have to adopt, and it is why the boundary in [Scope and non-goals](https://docs.cosyte.com/dicom/non-goals) is a deliverable here rather than a footnote; it is a sibling to [`@cosyte/hl7`](https://github.com/cosyte/hl7), on the same engineering bar.

## Status

**The 0.1 line. The public API is settled and safe to depend on.** The parser entry, the four safety-critical views, the structural tag accessors, the lazy typed value decode across all 34 VRs, the spec-clean serializer, the source/vendor profile system, and metadata-level `deidentify()` are all shipped, and their signatures are what the next release still carries. Zero runtime dependencies today.

**What is still moving, or is not covered at all.** Pixel data is not decoded in any transfer syntax, and that is out of scope for this package: a compressed object under a PS3.5 2026c section A.4 syntax parses, its fragments come back as raw bytes, and `serializeDicom` writes them back untouched, refusing with `INVALID_ENCAPSULATED_PIXEL_DATA` a fragment stream section A.4 does not allow rather than repairing it; DIMSE and DICOMweb are non-goals here; and the de-identifier's open PHI residuals are measured and disclosed rather than closed. Read the [known limitations](https://docs.cosyte.com/dicom/limitations) and [scope and non-goals](https://docs.cosyte.com/dicom/non-goals) before you point this at real data. Misreading a patient identifier, an image's signedness, or a rescale slope can cause real clinical harm.

## Install

```bash
# pnpm (recommended). Also works with: npm install @cosyte/dicom  |  yarn add @cosyte/dicom
pnpm add @cosyte/dicom
```

- **Node.js 22 or later, tested on 22, 24, and 26.** `engines.node` is `>=22.0.0`.
- **Module format: dual ESM and CJS**, with per-condition type declarations, so `import` and `require` both resolve against the type that matches them.
- **Strict TypeScript** (`noUncheckedIndexedAccess`, no `any`), with JSDoc and an `@example` on every public export feeding your editor's IntelliSense.

## Usage

Useful output after install and parse. No DICOM spec knowledge required.

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// A synthetic CT object, saved without its 128-byte preamble: an invented patient and example-root
// UIDs, no real PHI. In your integration these are the bytes of the file you read.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);
const ds = parseDicom(buf);

console.log("patient", ds.patient.id, "issuer", ds.patient.issuerOfId);
console.log("study", ds.study.instanceUid);
console.log("series", ds.series.modality, "image", ds.image.rows, "x", ds.image.columns);
console.log("rescale slope", ds.image.rescaleSlope, "intercept", ds.image.rescaleIntercept);
console.log("tolerated", ds.warnings.length, ds.warnings[0]?.code);

// The values printed above, which the test suite asserts on every run.
// NOT globally unique on its own: pair it with ds.patient.issuerOfId.
ds.patient.id; // => "MRN-42"
// The global study anchor.
ds.study.instanceUid; // => "1.2.826.0.1.3680043.8.498.1.1"
ds.series.modality; // => "CT"
ds.image.rows; // => 512
// number | undefined: undefined means "absent", never a substituted 1.
ds.image.rescaleSlope; // => 1
// What the parser tolerated, as stable codes.
ds.warnings.map((w) => w.code); // => ["DICOM_MISSING_PREAMBLE"]
```

It prints:

```text
patient MRN-42 issuer SAMPLE-HOSP
study 1.2.826.0.1.3680043.8.498.1.1
series CT image 512 x 512
rescale slope 1 intercept -1024
tolerated 1 DICOM_MISSING_PREAMBLE
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

That is the pitch: no config, no schema upload, no spec lookup. The parser accepts vendor-quirky input by default (it tolerates a missing preamble, a wrong File Meta group length, odd-length values, and the dozen or so deviations real scanners emit) and records each as a stable warning code rather than failing. You reach for typed value decode, safety-critical views, profiles, or the serializer when you want them.

## PHI and safety

DICOM headers carry patient identity directly: name, identifier, dates, accession number, institution, and free-text descriptions that people type names into. What this library does and does not do with that data, stated so you can audit it rather than assume it:

- **Logging: nothing.** There is no logger to configure and no `console` call in library code. Warning and error messages are looked up in a frozen registry by their code, and the factories take a position and structural constants only, so a document value has no string parameter to travel through. The exceptions are named on the types rather than left to be discovered: `DicomParseError.snippet` is 16 raw source bytes as hex, and `DeidentifyReport` carries `uidMap`, `removedPrivateTags`, `unauditableSequences[].tag`, and `contextPath` composed from source bytes. Treat all of those as PHI and redact them at your own boundary.
- **Retention: nothing.** `parseDicom` returns a `Dataset` over the buffer you handed it. There is no cache, no module-level store and no history between calls; typed value decode is lazy and memoized on the element itself, so it lives and dies with the dataset you dropped.
- **Writing to disk: nothing.** The library performs no filesystem and no network I/O at runtime. `serializeDicom` returns bytes and leaves the write to you, and the data dictionary is generated at build time from the official Part 6 source and compiled in, so nothing is read from disk either.
- **What you still own.** Reading the file, writing and transporting the output, redacting whatever you log, and the retention policy over both. `deidentify()` hands you a fresh dataset plus an audit report; it does not decide where either one goes.

**A de-identified output from this package is metadata-de-identified only.** `deidentify()` applies the PS3.15 Annex E Basic Profile plus the metadata-affecting Options to the header, and the input dataset is never mutated. It does not touch pixels: when a file carries burned-in annotation this layer cannot remove, you get a `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` warning rather than a false sense of safety, and pixel cleaning is out of scope for this package. **The open PHI residuals are measured and disclosed, and none of them is an all-clear:** read the [known limitations](https://docs.cosyte.com/dicom/limitations) and [scope and non-goals](https://docs.cosyte.com/dicom/non-goals) in full before you share an output, and treat `DeidentifyReport` as the channel that tells you what a run actually did, because an emptied audit is not a performed one.

## API

Everything is exported from the single top-level entry point, `@cosyte/dicom`. The full reference lives on [docs.cosyte.com/dicom](https://docs.cosyte.com/dicom) and in your editor: every public export carries JSDoc with an `@example`, gated in CI.

- **One-line metadata extraction**: `ds.patient`, `ds.study`, `ds.series`, `ds.image`: typed, fail-safe views over the safety-critical attributes. No `(group,element)` tags to memorize.
- **Two access patterns**: named views, or structural `ds.get("00100010")` by 8-character `(group,element)` tag (resolve a keyword to its tag with `Dictionary.byKeyword`), plus `ds.elements()` to walk everything.
- **Compressed objects read, pixels untouched**: every PS3.5 2026c section A.4 encapsulation syntax (JPEG, JPEG-LS, JPEG 2000, HTJ2K, RLE, and the rest) parses under Explicit VR LE rules, and `readPixelDataFragments(ds)` hands back the Basic Offset Table and every fragment as raw bytes. Pixels are never decoded. `serializeDicom` writes those syntaxes back, fragments byte for byte, and refuses with `INVALID_ENCAPSULATED_PIXEL_DATA` a top-level Pixel Data section A.4 does not allow.
- **Lazy typed value decode**: `element.value` decodes raw bytes into a discriminated `DicomValue` across all 34 VRs (numbers, `bigint`s, person names, dates/times, sequences, raw `binary`), honoring `(0008,0005)` Specific Character Set through nested items.
- **Real-world tolerance, Postel's Law**: a lenient reader emits stable warning codes for what it tolerated; only 4 truly structural conditions are fatal. (The count used to be quoted here and had drifted: it read `25` against a `WARNING_CODES` of `28`. The locked snapshot in `test/property/__snapshots__/warning-codes.snapshot.test.ts.snap` is the pin, and it is measured on every run rather than narrated here.)
- **Source/vendor profile system**: `defineProfile()` + 5 built-ins (`ge`, `siemens`, `philips`, `strict`, `lenient`) that only ever _tighten or annotate_ a parse, resolving vendor private tags by the file's live Private Creator string, never a wrong decode.
- **Metadata-level de-identification**: `deidentify()` applies the PS3.15 Annex E Basic Profile + the metadata-affecting Options, returning a fresh dataset and an audit report built from static tables, with two fields that carry source bytes and are named as such on the type: `report.uidMap` (source UIDs) and `report.removedPrivateTags`.
- **Spec-clean serializer**: `serializeDicom(ds)` round-trips a dataset back to Part 10 bytes in its source transfer syntax (no transcode; the four native syntaxes and every PS3.5 2026c section A.4 encapsulation syntax, whose top-level Pixel Data is written as an `OB` fragment stream with its Items byte for byte, or refused with `INVALID_ENCAPSULATED_PIXEL_DATA` when section A.4 does not allow it), with correct File Meta group length, even-length padding, every Data Set it can walk (the root and each Sequence Item, at every depth up to `NESTING_DEPTH_LIMIT`) emitted in ascending tag order with Items kept in order and no value changed, and lossless File Meta: non-modeled `(0002,xxxx)` elements are preserved and re-emitted in tag order. Not ordered: a tag repeated inside an Item (both copies kept), a Sequence that cannot be walked, is nested past the bound or whose parsed `items` do not match its bytes, and any `UN`-carried Sequence. Written last whatever its tag: an element whose own bytes do not show where a reader ends it, such as an undefined-length `UN` the parser could not read as a Sequence.
- **DICOMDIR record tree**: `ds.directory` walks a DICOMDIR's Directory Records (patient, study, series, image) by their `(0004,1200)`, `(0004,1400)`, and `(0004,1420)` offsets, and `serializeDicom` writes every record offset as the byte offset of the record it named, de-identified output included. The limits sit with it: Referenced File IDs are kept verbatim, the two File-set clauses of PS3.15 §E.1.1 are not discharged, and a DICOMDIR carrying an offset that names no record, or a Deflated one with records, is refused on write (see the [known limitations](https://docs.cosyte.com/dicom/limitations)).
- **Strict TypeScript, dual ESM and CJS, Node.js 22 or later**: `noUncheckedIndexedAccess`, no `any`, JSDoc + `@example` on every public export feeding your editor's IntelliSense. Zero runtime dependencies today.

## Documentation

The full reference is on [docs.cosyte.com/dicom](https://docs.cosyte.com/dicom):

- [Installation](https://docs.cosyte.com/dicom/installation) and the [quickstart](https://docs.cosyte.com/dicom/quickstart).
- Core concepts: the [object model](https://docs.cosyte.com/dicom/spec-notes-model), [access patterns](https://docs.cosyte.com/dicom/access-patterns), [tolerance and the warning model](https://docs.cosyte.com/dicom/spec-notes-tolerance), [error handling](https://docs.cosyte.com/dicom/error-handling), [typed values](https://docs.cosyte.com/dicom/spec-notes-values), [safety-critical views](https://docs.cosyte.com/dicom/spec-notes-safety), [source profiles](https://docs.cosyte.com/dicom/spec-notes-profiles), and [compatibility](https://docs.cosyte.com/dicom/compatibility), with the supported transfer syntaxes.
- Guides: [recipes](https://docs.cosyte.com/dicom/recipes), the [cookbook](https://docs.cosyte.com/dicom/cookbook), [serialization](https://docs.cosyte.com/dicom/serialization), and [metadata de-identification](https://docs.cosyte.com/dicom/deidentification).
- [Troubleshooting](https://docs.cosyte.com/dicom/troubleshooting), the [known limitations](https://docs.cosyte.com/dicom/limitations), and [scope and non-goals](https://docs.cosyte.com/dicom/non-goals). Read the last two before you point this at real data.
- [`CHANGELOG.md`](https://github.com/cosyte/dicom/blob/main/CHANGELOG.md): every release.

## Support

Questions, bug reports, and quirks from the scanners and archives you work with go in [GitHub issues](https://github.com/cosyte/dicom/issues). Use synthetic data only, never a real patient's. Need a DICOM integration built, or hosted and run for you? See our [integration services](https://cosyte.com/integration-services).

## Security

Report a vulnerability privately, never in a public issue, and with no real patient data in it. Our [security policy](https://github.com/cosyte/dicom/security/policy) says how.

## Contributing

Vendor-quirk fixtures (synthetic or properly de-identified), profile improvements, and dictionary corrections are all welcome. The more real-world edge cases the test suite covers, the more robust the parser gets. Read our [contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md), or open an issue.

A contribution has to clear the same gates CI runs: `pnpm lint`, `pnpm typecheck`, `pnpm test` (per-directory coverage floors included), `pnpm run format:check`, `pnpm run check:no-emdash`, and `pnpm phi-scan`. Never open a PR carrying real patient data: every fixture in this repository is synthetic and built in a `.ts` source file, and the PHI scanner reads this README too.

Every pull request is also held to our performance budgets and to the floor `main` measured, by the `budgets` job; [AGENTS.md](https://github.com/cosyte/dicom/blob/main/AGENTS.md#budgets-and-the-floor) says how. The floor holds the gzipped bytes the package loads exactly, so a pull request that adds code on purpose fails that job on its size. It records the floor again, with the new size, by one command a maintainer runs on its branch, `gh workflow run bench-floor.yml --ref <branch> -f size=true`, then copies the `bench-floor` artifact that run keeps to `bench/floor.json`. The job still reports the larger size, as a floor raised over `main`'s, and the pull request says why the size grew.

## License

[MIT](https://github.com/cosyte/dicom/blob/main/LICENSE), copyright Cosyte LLC. SPDX identifier `MIT`.

GE, Siemens, and Philips are trademarks of their respective owners. Cosyte is not affiliated with, endorsed by, or sponsored by any of them: the names identify the vendors whose private dictionaries the built-in profiles resolve. See [TRADEMARKS.md](https://github.com/cosyte/dicom/blob/main/TRADEMARKS.md).

_Built by [Cosyte](https://cosyte.com)._
