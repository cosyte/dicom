---
id: property-testing
title: Property testing with our generators
sidebar_label: Property testing
sidebar_position: 15.5
description: The fast-check generators at @cosyte/dicom/arbitraries, what each one draws, and how to use them to test code built on the parser.
---

# Property testing with our generators

`@cosyte/dicom/arbitraries` exports the [fast-check](https://fast-check.dev/) generators we test
this library with: well-formed Data Sets and the Part 10 bytes they encode to, files with one
recoverable deviation, input the reader refuses, truncated files, and random bytes. Use them to
test code you build on the parser, such as a router that reads a few tags, a cache keyed on UIDs,
or a pipeline that must never crash on a bad file.

`fast-check` is an optional peer dependency: install it beside the package to use this entry point.
The main entry point, `@cosyte/dicom`, never loads it.

```sh
npm install --save-dev fast-check
```

Every generated value is synthetic: random bytes, random text from a small alphabet, and one plainly
invented name, `SYNTHETIC^TEST`. Nothing in one comes from a patient.

## A first property

A well-formed model encodes to a file that reads back with no warning:

```ts runnable
import fc from "fast-check";
import { parseDicom } from "@cosyte/dicom";
import { encodeModel, wellFormedModel } from "@cosyte/dicom/arbitraries";

const run = fc.check(
  fc.property(wellFormedModel(), (model) => parseDicom(encodeModel(model)).warnings.length === 0),
  { seed: 42, numRuns: 50 },
);
run.failed; // => false
```

## The generators

| Generator              | What it draws                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wellFormedModel()`    | A `DicomModel`: up to six elements with the VR the data dictionary gives each tag, in Implicit VR Little Endian, Explicit VR Little Endian or Deflated Explicit VR Little Endian, never Explicit VR Big Endian. |
| `encodeModel(model)`   | Not a generator: the Part 10 bytes of a model, its elements in ascending tag order. The same model always encodes to the same bytes.                                                                              |
| `recoverableInput()`   | Mostly files with one deviation the reader recovers from with a warning (no preamble, a File Meta group length that is wrong or missing, an odd-length value, an empty sequence item, and more), with the rest below. |
| `fatalInput()`         | Input the reader refuses with a fatal `DicomParseError`, one shape for each of `EMPTY_INPUT`, `NOT_DICOM_PART_10`, `INVALID_FILE_META` and `UNSUPPORTED_TRANSFER_SYNTAX`.                                          |
| `truncatedValidFile()` | A well-formed file under one of the four uncompressed transfer syntaxes, cut at any byte from none to all.                                                                                                        |
| `arbitraryBytes()`     | 0 to 512 random bytes.                                                                                                                                                                                              |
| `dicomShapedGarbage()` | A zero preamble and `DICM` followed by up to 400 random bytes, so the reader gets past the Part 10 check and reads garbage.                                                                                       |
| `fuzzInput()`          | Random bytes, `DICM`-prefixed garbage and truncated files, mixed.                                                                                                                                                   |

A `DicomModel` is a plain value: `transferSyntax` and `elements`, keyed by tag, each a
`ModelElement` with `tag`, `vr` and `valueHex`, the value bytes as lowercase hex.

## The lenient contract as a property

Reading anything `recoverableInput()` draws either returns a `Dataset` or throws a
`DicomParseError` with a fatal code, and nothing else:

```ts runnable
import fc from "fast-check";
import { DicomParseError, FATAL_CODES, parseDicom } from "@cosyte/dicom";
import { recoverableInput } from "@cosyte/dicom/arbitraries";

const fatal = new Set<string>(Object.values(FATAL_CODES));
const run = fc.check(
  fc.property(recoverableInput(), (bytes) => {
    try {
      parseDicom(bytes);
    } catch (error) {
      return error instanceof DicomParseError && fatal.has(error.code);
    }
    return true;
  }),
  { seed: 7, numRuns: 200 },
);
run.failed; // => false
```

## How we run our own properties

Our round-trip, lenient and immutability properties run 100 cases on every pull request and 10,000
each night. `COSYTE_PROPERTY_RUNS` sets the depth of a run, and each property prints its seed
before it runs; setting `COSYTE_PROPERTY_SEED`, and `COSYTE_PROPERTY_PATH` from a failure's report,
replays a failing case already shrunk.
