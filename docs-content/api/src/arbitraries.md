# src/arbitraries

fast-check generators for DICOM Part 10, at `@cosyte/dicom/arbitraries`: well-formed Data Sets
and the bytes they encode to, files with one recoverable deviation, files the reader refuses,
truncated files and random bytes. We use them to test this library, and you can use them to test
code you build on it.

`fast-check` is an optional peer dependency: install it to use this entry point. The main entry
point, `@cosyte/dicom`, never loads it.

Every generated value is synthetic: random bytes, random text from a small alphabet, and one
plainly invented name, `SYNTHETIC^TEST`. Nothing in one comes from a patient.

## Example

```ts
import fc from "fast-check";
import { parseDicom } from "@cosyte/dicom";
import { encodeModel, wellFormedModel } from "@cosyte/dicom/arbitraries";

fc.assert(
  fc.property(wellFormedModel(), (model) => parseDicom(encodeModel(model)).warnings.length === 0),
);
```

## Interfaces

### DicomModel

A well-formed Data Set as a plain value two tests can compare: the transfer syntax it is
written in and its elements, keyed by tag, so the order they were generated in does not matter.

#### Properties

##### elements

> `readonly` **elements**: `Readonly`\<`Record`\<`string`, [`ModelElement`](#modelelement)\>\>

The elements, keyed by tag.

##### transferSyntax

> `readonly` **transferSyntax**: `string`

The Transfer Syntax UID the Data Set is written in.

***

### ModelElement

One element of a [DicomModel](#dicommodel): its tag, its VR, and its value bytes as lowercase hex.

#### Properties

##### tag

> `readonly` **tag**: `string`

The tag, eight uppercase hex digits, `"00100010"` for Patient's Name.

##### valueHex

> `readonly` **valueHex**: `string`

The value bytes as lowercase hex, even in length, as `Element.rawBytes` holds them.

##### vr

> `readonly` **vr**: `string`

The VR the data dictionary gives the tag, `"PN"` for Patient's Name.

## Functions

### animalPatientInput()

> **animalPatientInput**(): `Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

Files carrying the non-human patient attributes: Patient Species Description `(0010,2201)` and
Code Sequence `(0010,2202)`, Patient's Sex Neutered `(0010,2203)`, Patient Breed Description
`(0010,2292)` and Code Sequence `(0010,2293)`, Responsible Person `(0010,2297)`, its Role
`(0010,2298)` and Responsible Organization `(0010,2299)`. Each is present or not; a value may be
written in a VR it does not decode from, a neutered status may be outside `ALTERED` and
`UNALTERED`, and a code sequence may hold no item, two, or an item missing a part. Every file
reads with no fatal error, and its `patient` view never throws and reports what it could not
read on `patient.issues` with a code from `PATIENT_ISSUE_CODES`. Every value is invented.

#### Returns

`Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { parseDicom, PATIENT_ISSUE_CODES } from "@cosyte/dicom";
import { animalPatientInput } from "@cosyte/dicom/arbitraries";

const codes = new Set<string>(Object.values(PATIENT_ISSUE_CODES));
fc.assert(
  fc.property(animalPatientInput(), (bytes) =>
    (parseDicom(bytes).patient.issues ?? []).every((issue) => codes.has(issue.code)),
  ),
);
```

***

### arbitraryBytes()

> **arbitraryBytes**(): `Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

Random bytes, 0 to 512 of them, with no structure at all. Each length bound in this module is
drawn at fast-check's `"max"` size, so the whole range is reached, not only the short end.

#### Returns

`Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { arbitraryBytes } from "@cosyte/dicom/arbitraries";

fc.sample(arbitraryBytes(), 3).every((bytes) => bytes.length <= 512); // true
```

***

### dicomShapedGarbage()

> **dicomShapedGarbage**(): `Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

A preamble and the `DICM` prefix followed by up to 400 random bytes, so the reader gets past the
Part 10 check and reads garbage as File Meta and Data Set.

#### Returns

`Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { dicomShapedGarbage } from "@cosyte/dicom/arbitraries";

fc.sample(dicomShapedGarbage(), 1)[0]?.subarray(128, 132).toString(); // "DICM"
```

***

### encodeModel()

> **encodeModel**(`model`): `Buffer`

The Part 10 bytes of a model: a preamble, a File Meta group naming the model's transfer syntax,
and the elements in ascending tag order. The same model always encodes to the same bytes.

#### Parameters

##### model

[`DicomModel`](#dicommodel)

The model, usually from [wellFormedModel](#wellformedmodel).

#### Returns

`Buffer`

The file's bytes.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
import { encodeModel } from "@cosyte/dicom/arbitraries";

const bytes = encodeModel({ transferSyntax: "1.2.840.10008.1.2.1", elements: {} });
parseDicom(bytes).warnings.length; // 0
```

***

### fatalInput()

> **fatalInput**(): `Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

Input the reader refuses with a fatal `DicomParseError`, each with its code: no bytes
(`EMPTY_INPUT`), text that is not Part 10 (`NOT_DICOM_PART_10`), a File Meta group with no
Transfer Syntax UID (`INVALID_FILE_META`), and a transfer syntax the reader does not support
(`UNSUPPORTED_TRANSFER_SYNTAX`).

#### Returns

`Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { DicomParseError, parseDicom } from "@cosyte/dicom";
import { fatalInput } from "@cosyte/dicom/arbitraries";

fc.assert(
  fc.property(fatalInput(), (bytes) => {
    try {
      parseDicom(bytes);
      return false;
    } catch (error) {
      return error instanceof DicomParseError;
    }
  }),
);
```

***

### fuzzInput()

> **fuzzInput**(): `Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

What a fuzz run feeds the reader: random bytes, `DICM`-prefixed garbage and truncated files.

#### Returns

`Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { DicomParseError, parseDicom } from "@cosyte/dicom";
import { fuzzInput } from "@cosyte/dicom/arbitraries";

fc.assert(
  fc.property(fuzzInput(), (bytes) => {
    try {
      parseDicom(bytes);
    } catch (error) {
      if (!(error instanceof DicomParseError)) throw error;
    }
  }),
);
```

***

### recoverableInput()

> **recoverableInput**(): `Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

Everything a lenient reader is fed: mostly files with one recoverable deviation, then refused
input, truncated files and random bytes. Reading any of them either returns a `Dataset` whose
warnings carry registered codes, or throws a fatal `DicomParseError`, and nothing else.

#### Returns

`Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { DicomParseError, parseDicom } from "@cosyte/dicom";
import { recoverableInput } from "@cosyte/dicom/arbitraries";

fc.assert(
  fc.property(recoverableInput(), (bytes) => {
    try {
      parseDicom(bytes);
    } catch (error) {
      if (!(error instanceof DicomParseError)) throw error;
    }
  }),
);
```

***

### truncatedValidFile()

> **truncatedValidFile**(): `Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

A well-formed file cut at a random point: a Patient's Name, Rows, Modality and a sequence of
undefined length, under each of the four uncompressed transfer syntaxes, cut anywhere from no
bytes to the whole file. The shape a partial file on disk or a short read takes.

#### Returns

`Arbitrary`\<`Buffer`\<`ArrayBufferLike`\>\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { DicomParseError, parseDicom } from "@cosyte/dicom";
import { truncatedValidFile } from "@cosyte/dicom/arbitraries";

fc.assert(
  fc.property(truncatedValidFile(), (bytes) => {
    try {
      parseDicom(bytes);
    } catch (error) {
      if (!(error instanceof DicomParseError)) throw error;
    }
  }),
);
```

***

### wellFormedModel()

> **wellFormedModel**(): `Arbitrary`\<[`DicomModel`](#dicommodel)\>

Well-formed Data Sets of up to six elements: real tags with their dictionary VRs, text and
unsigned short values, in Implicit VR Little Endian, Explicit VR Little Endian or Deflated
Explicit VR Little Endian. Each one encodes ([encodeModel](#encodemodel)) to a file that reads back with
no warning and the same tags, VRs and value bytes.

#### Returns

`Arbitrary`\<[`DicomModel`](#dicommodel)\>

The generator.

#### Example

```ts
import fc from "fast-check";
import { parseDicom } from "@cosyte/dicom";
import { encodeModel, wellFormedModel } from "@cosyte/dicom/arbitraries";

fc.assert(
  fc.property(wellFormedModel(), (model) => parseDicom(encodeModel(model)).warnings.length === 0),
);
```
