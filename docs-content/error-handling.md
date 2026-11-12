---
id: error-handling
title: Error handling
sidebar_label: Error handling
sidebar_position: 17
description: The six typed errors the package throws, what each one carries, and when a warning becomes a throw.
---

# Error handling

Every error the library throws is one of the typed classes below, each exported from the package barrel. Warnings are data rather than throws unless you ask otherwise: a profile's `escalate` list promotes only the codes it names.

## `DicomParseError`

Thrown by `parseDicom` on a Tier-3 fatal code, and on an escalated warning ([below](#when-a-warning-becomes-a-throw)). Carries the byte position, the **frame** that position is counted in, a registry-composed message, and a 16-byte hex `snippet` of the source. A code can stand for several structural reasons, and `INVALID_FILE_META` stands for most of them: a File Meta group that cannot be read, and a Data Set after it that is cut short or malformed, such as an element or Item whose declared length reaches past the end of the bytes. The message says which reason; nothing else on the error names it. **The message is looked up in a frozen registry and its factories take no tag, no wire-length parameter and no count of the bytes left in the buffer**, so none of them can be interpolated. The reason is not that such a fatal fires only on a lying length field: it fires on an honestly truncated file too, where nothing is fabricated and the transport simply lost bytes. Measured on a spec-clean object cut short by two bytes, `parseDicom` throws `INVALID_FILE_META` for an element whose Value Length reaches past the end of the input, with every declared length in the file honest. The bound covers both because the withheld numbers are four bytes a sender wrote either way, and because on the desynchronized reading those four bytes are somebody's name: an under-declaring `ST` carrier holding `"MR BRAIN SMITHSON "` once rendered `declared length=1330858068`, which is `"THSO"`.

`err.byteOffset` locates the element, and **`err.offsetFrame` says which coordinate system that number is counted in** (`OFFSET_FRAMES`: `"input"`, `"inflated-dataset"`, `"value-slice"`). Only in `"input"` is it an index into the buffer you passed in. A defined-length Sequence Item is parsed from a slice, so an offset raised inside one counts from that Item, and the same file reports `0`, `24`, or `40` for the same defect depending on where in the Item it sits. **Where a slice begins is deliberately not published**, because the distance between two frames is a declared Value Length off the wire. The frame is in the `Error.message` suffix too, which now reads `(offset=N frame=F)`, so a string match on that suffix stops matching. `err.code` is unchanged. `DicomParseWarning.position` still carries no frame beyond its `deflated` flag, and `Element.byteOffset` carries none at all: both are pre-existing and neither is closed here. On every fatal but one the snippet is raw input, cut in the frame that offset is counted in: treat it as PHI and redact it at your own boundary. The exception is `UNSUPPORTED_TRANSFER_SYNTAX`, where the slot carries PS3.6's own name for the unsupported UID (`"SMPTE ST 2110-20 Uncompressed Progressive Active Video"`) when the registry publishes one, and 16 raw bytes only when it does not. That is deliberate, it predates the frame, and it is named here rather than left to a universal that would be false on the first code an object under a refused syntax reaches.

```ts runnable
import { parseDicom, DicomParseError, FATAL_CODES } from "@cosyte/dicom";

let caught: string | undefined;
try {
  parseDicom(Buffer.alloc(0));
} catch (err) {
  if (err instanceof DicomParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
    caught = err.code;
  }
}
caught; // => "EMPTY_INPUT"
```

## When a warning becomes a throw

A Tier-2 warning is escalated to a throw in two ways: `{ strict: true }` escalates every warning, and a profile's `escalate` list escalates the codes it names (`profiles.strict` names a set of them). **An escalated warning is thrown as a `DicomParseError` whose `code` is the warning's own code**, such as `DICOM_MISSING_PREAMBLE`, not a member of `FATAL_CODES`. Its `message` is the warning's registry message, and `byteOffset`, `offsetFrame` and `snippet` locate the warning the same way they locate a fatal. The warning is not also added to `ds.warnings`, and `onWarning` does not fire for it.

`DICOM_PARSE_STOPPED_BEFORE_TAG` and `DICOM_CHARSET_ASSUMED` are the exceptions and are never escalated. `DICOM_PARSE_STOPPED_BEFORE_TAG` says a parse given `stopBeforeTag` stopped where it was asked to, and `DICOM_CHARSET_ASSUMED` says a parse given `fallbackCharacterSet` read text under that set. Neither reports a fault in the file, so `{ strict: true }` and a profile's `escalate` list both leave them warnings.

So `err.code` is typed `FatalCode | WarningCode`, not `FatalCode` alone. Test for the fatal codes you handle and treat any other `code` as an escalated warning: `err.code in FATAL_CODES` tells the two apart, and a `switch` over `err.code` needs a `default` branch. Do not list every warning code instead: the warning registry grows between releases, so that union is open (see [Compatibility](./compatibility.md#exports-that-grow-between-releases)).

```ts runnable
import { parseDicom, DicomParseError, FATAL_CODES } from "@cosyte/dicom";

// Synthetic object with the preamble omitted: a tolerated quirk, escalated here.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);

let code: string | undefined;
let fatal: boolean | undefined;
try {
  parseDicom(buf, { strict: true });
} catch (err) {
  if (err instanceof DicomParseError) {
    code = err.code;
    fatal = err.code in FATAL_CODES;
  }
}
code; // => "DICOM_MISSING_PREAMBLE"
fatal; // => false
```

## `DicomValueError`

Thrown only by `image.frame(i)`: `FRAME_INDEX_OUT_OF_RANGE` for an index outside `[0, numberOfFrames)`, or `MISSING_REQUIRED_FUNCTIONAL_GROUP` when an enhanced object lacks a required geometry macro in both the Per-Frame and Shared groups. Value decode (`element.value`) never throws. It warns and returns `null`/typed-absent instead.

## `DicomSerializeError`

Thrown by `serializeDicom` for `MISSING_TRANSFER_SYNTAX` (the dataset names no transfer syntax to write in), `UNSUPPORTED_TRANSFER_SYNTAX`, or `INVALID_ENCAPSULATED_PIXEL_DATA` (a PS3.5 2026c section A.4 object whose top-level Pixel Data is absent, native, beside Float or Double Float Pixel Data, or a fragment stream section A.4 does not allow: undelimited, an odd or undefined Item Length, or an empty fragment), `DIRECTORY_OFFSET_UNRESOLVED` (a DICOMDIR offset the writer cannot tie to a Directory Record the dataset holds, refused rather than written stale or as zero) `DIRECTORY_OFFSET_DEFLATED` (a Deflated DICOMDIR carrying a non-zero record offset), or `VALUE_TOO_LONG_FOR_VR` (a Private Creator or File Meta value past 65,534 bytes in a VR with a 16-bit length, which PS3.5 forbids writing as `UN`). The message is a fixed string.

## `DicomJsonError`

Thrown by `toDicomJson` and `fromDicomJson` when a value cannot cross between Part 10 and the DICOM JSON Model without being changed or guessed at: `UNSUPPORTED_VR`, `UNSUPPORTED_ELEMENT`, `UNSUPPORTED_BYTE_ORDER`, `UNREPRESENTABLE_NUMBER`, `MALFORMED_VALUE`, `INVALID_JSON`, `BULK_DATA_UNRESOLVED`, `BULK_DATA_URI_REQUIRED`, `UNSUPPORTED_CHARACTER_SET`, `UNSUPPORTED_TRANSFER_SYNTAX`, `VALUE_TOO_LONG`, `VR_MISMATCH`, `NESTING_TOO_DEEP` and `CONVERSION_FAILED` (`DICOM_JSON_ERROR_CODES`). No other error leaves either converter: one a callback throws is replaced by `CONVERSION_FAILED`, and not kept. The message is fixed text and `err.tag` is the element's tag only when PS3.6 registers it one at a time, `"<withheld>"` otherwise, so neither carries a value. [Serialization](./serialization.md#the-dicom-json-model) says what each code refuses.

```ts runnable
import { fromDicomJson, DicomJsonError } from "@cosyte/dicom";

let code: string | undefined;
try {
  fromDicomJson(
    { "00100020": { vr: "LO", Value: [42] } },
    { fileMeta: { transferSyntaxUID: "1.2.840.10008.1.2.1" } },
  );
} catch (err) {
  if (err instanceof DicomJsonError) code = err.code;
}
code; // => "INVALID_JSON"
```

## `ProfileDefinitionError` · `DeidentifyError`

`defineProfile()` throws `ProfileDefinitionError` for a structurally invalid profile; `deidentify()` throws `DeidentifyError` (`INVALID_OPTIONS`) for an unknown Retain option or malformed UID root, and `DeidentifyError` (`UNSUPPORTED_TRANSFER_SYNTAX`) for a `Dataset` under one of the four JPIP Referenced syntaxes, whatever the options, because its Pixel Data Provider URL `(0028,7FE0)` has no PS3.15 Table E.1-1 action and would be kept by omission. Both messages carry only structural facts (option names, the UID root) or a fixed string, never a decoded value.

## What is safe to log

A DICOM header is PHI, so a log line takes only what the file cannot put a person into: codes, tags,
VRs, counts, lengths, offsets and the transfer syntax. This is every field of a parsed data set, a
warning and each error, and whether it can hold content read from the file. "File content" means
bytes the sender wrote, which can identify a person or a study: log none of it, and never log a
`Dataset`, an `Element` or a `toDicomJson` result whole. The bound behind each structural field is
in [Tolerance](./spec-notes-tolerance.md#the-model-fields-that-are-bounded-and-the-ones-that-are-values),
and the de-identifier's report in [De-identification](./deidentification.md#the-report-and-what-it-is-not-safe-to-log).

**A parsed data set**, as `parseDicom` and `readDicomHeader` return it:

- `Dataset.patient`: file content. Every field but `issues` is read from the file: the name, the
  ID and its issuer, the birth date, the sex, the responsible person. `patient.issues[].code` and
  `.message` are safe to log: the message is built from the code and the tag alone.
- `Dataset.study`: file content. The Study Instance UID, the Study ID, the accession number, the
  date, the time and the free-text description identify a study and, through it, a person.
- `Dataset.series`: `series.modality` and `series.number` are safe to log; `series.instanceUid`,
  `series.frameOfReferenceUid` and `series.description` are file content.
- `Dataset.image`: the geometry (`rows`, `columns`, the bit depths, `signed`, the rescale and window
  numbers, the spacings, `numberOfFrames`) is safe to log; `image.sopInstanceUid` and
  `image.frameOfReferenceUid` are UIDs read from the file, which is file content.
- `Dataset.elements()` and `Dataset.get(tag)` return an `Element`. `Element.value` and
  `Element.rawBytes` are file content. `Element.tag`, `Element.vr`, `Element.vm`, `Element.length`
  and `Element.byteOffset` are structure, safe to log on a well-formed file; a declared length that
  lies can make the reader take bytes of a value for a header, and then the tag and the VR are those
  bytes. `Element.privateCreator` is safe to log: it reads `<withheld>` unless the active profile
  names the creator.
- `Dataset.fileMeta`: `FileMeta.transferSyntaxUID` is one of a closed set of syntaxes, safe to log.
  `FileMeta.mediaStorageSOPInstanceUID` is a UID read from the file, which is file content, and so
  are `.sourceApplicationEntityTitle`, `.implementationVersionName`, `.implementationClassUID` and
  `.extraElements`.
- `Dataset.warnings`: each a `DicomParseWarning`, below.
- `Dataset.directory`: `DirectoryRecord.type` is the record type a DICOMDIR names (`PATIENT`,
  `STUDY`); `DirectoryRecord.referencedFileId` is a path read from the file, which is file content.

**A warning**, `DicomParseWarning`, on `ds.warnings`, through `onWarning`, and on a decoded value's
own `warnings`:

- `DicomParseWarning.code`: safe to log, a member of `WARNING_CODES`.
- `DicomParseWarning.message`: safe to log. It comes from a frozen registry, and the only things
  substituted into it are a tag PS3.6 registers, one of the 34 VRs and numbers the parser counted.
  The one exception is named in the `WARNING_MESSAGES` docblock in
  [`src/parser/warnings.ts`](https://github.com/cosyte/dicom/blob/main/src/parser/warnings.ts): the
  File Meta group length a sender declared.
- `DicomParseWarning.position.byteOffset`: safe to log, an offset the parser counted.
- `DicomParseWarning.position.contextPath`: safe to log. Only the DICOMDIR record checks set it, to
  the Directory Record Sequence tag, an Item index and the tag of the offset attribute at fault.

**Each error:**

| Error                    | Safe to log                                                                                                                                   | File content                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `DicomParseError`        | `DicomParseError.code`, `DicomParseError.message`, `DicomParseError.byteOffset`, `DicomParseError.offsetFrame`, `DicomParseError.contextPath` | `DicomParseError.snippet`: up to 16 bytes of the file as hex |
| `DicomValueError`        | `DicomValueError.code`, `DicomValueError.message`: a frame index and a frame count                                                            | none                                                         |
| `DicomSerializeError`    | `DicomSerializeError.code`, `DicomSerializeError.message`: fixed text                                                                         | none                                                         |
| `DicomJsonError`         | `DicomJsonError.code`, `DicomJsonError.message`, `DicomJsonError.tag`: a tag PS3.6 registers one at a time, else `"<withheld>"`               | none                                                         |
| `ProfileDefinitionError` | `ProfileDefinitionError.message`, `ProfileDefinitionError.profileName`: what the profile's author wrote, never the file                       | none                                                         |
| `DeidentifyError`        | `DeidentifyError.code`, `DeidentifyError.message`: the option names and the UID root you passed, or fixed text                                | none                                                         |

`DicomParseError.contextPath` is the warning's own `position.contextPath` when the error is an
escalated warning, and absent on a fatal. On `UNSUPPORTED_TRANSFER_SYNTAX`, `snippet` holds PS3.6's
name for the refused syntax when PS3.6 has one, and 16 bytes of the file when it does not.

**The de-identifier's report**, `DeidentifyReport`, is not safe to log whole. `DeidentifyReport.uidMap`
holds the source UIDs read from the file, which is file content, and the other fields that can hold
bytes of the file are named on the type and in
[De-identification](./deidentification.md#the-report-and-what-it-is-not-safe-to-log).
