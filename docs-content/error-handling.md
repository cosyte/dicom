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

`DICOM_PARSE_STOPPED_BEFORE_TAG` is the exception and is never escalated: it says a parse given `stopBeforeTag` stopped where it was asked to. It reports no fault in the file, so `{ strict: true }` and a profile's `escalate` list both leave it a warning.

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
