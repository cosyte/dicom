---
id: serialization
title: Serialization to Part 10
sidebar_label: Serialization
sidebar_position: 13
description: What serializeDicom guarantees when it writes a dataset back to Part 10 bytes, when it refuses, what it never does, and the DICOM JSON Model converters.
---

# Serialization to Part 10

`serializeDicom(ds)` writes a `Dataset` back to a Part 10 `Buffer`. It is the conservative half of
Postel's Law: the parser accepts what real scanners emit, and the writer applies the guarantees
below.

Every DICOM object on this page is **synthetic** (an invented patient, obviously-fake UIDs) and
encoded as a base64 buffer, so an example needs no file on disk. Never paste a real object into a
doc or a test: a real object is PHI, and one committed to a repository is a leak the moment it
publishes.

## What the writer guarantees

- **Preamble and `DICM`.** A 128-byte preamble and the magic, always, even for an object parsed from
  bytes that had neither (`DICOM_MISSING_PREAMBLE` on the way in).
- **A recomputed File Meta group.** Always Explicit VR LE, with `(0002,0000)` File Meta Information
  Group Length recomputed from what is actually written rather than copied from the source.
- **The dataset body in the source transfer syntax.** The Transfer Syntax UID on the object decides
  every byte of the encoding, and the writer does not transcode. Under every encapsulation syntax
  PS3.5 2026c section A.4 names ([Compatibility](./compatibility.md#supported-transfer-syntaxes) lists them), the Data Set is
  Explicit VR LE and the top-level Pixel Data is `OB` of undefined length: the source's Basic Offset
  Table and fragment Items byte for byte and in order, then a zero-length Sequence Delimitation Item.
  A top-level Pixel Data section A.4 does not allow is refused, not repaired (below).
- **Even-length Value Fields.** PS3.5 2026c §7.1.1 defines a Value Field as "an even number of bytes
  containing the Value(s) of the Data Element", so odd values are padded with the pad byte their VR
  specifies. An odd length that arrived tolerated goes out even.
- **A value too long for a 16-bit Value Length Field goes out as `UN`.** Under Explicit VR, a value
  past 65,534 bytes in a VR whose length field is 16 bits is written with VR `UN` in the long form,
  as PS3.5 2026c §6.2.2 requires, and reads back as `UN`; a Private Creator or File Meta element,
  for which that section forbids `UN`, is refused with `VALUE_TOO_LONG_FOR_VR` instead.
- **Every Data Set in ascending tag order.** PS3.5 2026c §7.1 says the Data Elements in a Data Set
  "shall be ordered by increasing Data Element Tag Number", and PS3.5 §7.5.1 says the same inside every
  Item. The writer emits the root that way, and the Data Set of every Item of every Sequence it can
  walk on the wire, at every depth up to `NESTING_DEPTH_LIMIT`, whatever order the source file, your
  code or `deidentify()` left it in. Items stay in their order (PS3.5 §7.5), only whole elements move, so
  no value byte changes, and nothing is written that the Sequence's own bytes did not carry. A
  Sequence is re-ordered only where its parsed `items` match its bytes, so the output reads back as
  the source did.
  - **Not ordered, and said here rather than found later:** a tag repeated inside an Item is kept
    twice, in source order, so that output still breaks the "at most once" of PS3.5 2026c §7.1; a
    Sequence whose Item stream cannot be walked to exactly its end (a length that runs past its
    container, an undefined-length Item with no Item Delimitation Item, bytes that are not an Item
    stream), one nested past the bound, one whose parsed `items` do not match its bytes (a Sequence
    the parser did not descend, `DICOM_SQ_NOT_DESCENDED`, for one), and any `UN`-carried Sequence
    (under Implicit VR LE that includes a private Sequence inside an Item, even one a `Profile`
    resolved to `SQ`, since a default read resolves its tag to `UN`) are written as read, unordered;
    and an element the parser relocated because a length field lied is ordered where the parser
    placed it, since ordering cannot recover an order the source destroyed.
  - **Written last, even when its tag sorts earlier:** an element whose own bytes do not show where a
    reader ends it, such as an undefined-length `UN` the parser could not read as a Sequence, or a
    Sequence, `UN`, or Pixel Data value missing its Sequence Delimitation Item. A reader takes whatever
    follows such a value into it, so it keeps its place after the ascending rest of its Data Set, at
    the root and inside an Item, rather than losing the elements after it on the next read. A
    Sequence nested past the bound goes after the ascending rest of its Item too, unless it is a
    defined-length Sequence under Implicit VR LE: seeing where a reader ends any other would take the
    walk past the bound.
- **Byte-for-byte passthrough of what it must not touch.** Encapsulated Pixel Data fragments and
  `UN` values are re-emitted as read; the writer never re-encodes pixels.
- **A fixed point.** Serializing an already-serialized object returns the same bytes.

```ts runnable
import { parseDicom, serializeDicom } from "@cosyte/dicom";

// Synthetic object with the preamble omitted: a quirk the parser tolerates.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);

const ds = parseDicom(buf);
ds.warnings.length > 0; // => true

// What comes out is spec-clean regardless: preamble, DICM, recomputed File Meta.
const out = serializeDicom(ds);
out.subarray(128, 132).toString("ascii"); // => "DICM"

// The data survives the round trip...
parseDicom(out).patient.id; // => "MRN-42"

// ...the output no longer carries the deviation...
parseDicom(out).warnings.length; // => 0

// ...and re-serializing is byte-identical: the writer is a fixed point.
serializeDicom(parseDicom(out)).equals(out); // => true
```

## When it throws, and what the error carries

The writer has its own error taxonomy, separate from the parser's `FATAL_CODES` (which are locked to
read-side structural corruption) and from the value layer's `DicomValueError`. It throws only with
a code listed below.

| Export                  | What it is                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERIALIZE_ERROR_CODES` | The frozen registry of the writer's codes: `MISSING_TRANSFER_SYNTAX`, `UNSUPPORTED_TRANSFER_SYNTAX`, `INVALID_ENCAPSULATED_PIXEL_DATA`, `DIRECTORY_OFFSET_UNRESOLVED`, `DIRECTORY_OFFSET_DEFLATED`, `VALUE_TOO_LONG_FOR_VR`. |
| `SerializeErrorCode`    | The discriminant type over that registry, so a `switch` on a caught code is exhaustive.                                                                                                                                      |
| `DicomSerializeError`   | The thrown class. Narrow with `err instanceof DicomSerializeError`, then on `err.code`.                                                                                                                                      |

`MISSING_TRANSFER_SYNTAX` means the `Dataset` carries no `fileMeta`, or its `transferSyntaxUID` is
empty. The Transfer Syntax UID is the dispatch input that decides every byte of the encoding, so
there is no safe default to fall back to and none is invented. `UNSUPPORTED_TRANSFER_SYNTAX` means
the UID is outside the set this package writes, the four native syntaxes and the section A.4 ones;
the writer never transcodes, so it cannot emit a syntax it does not understand. That includes the
four JPIP Referenced syntaxes, which `parseDicom` reads for metadata and this writer refuses.

`INVALID_ENCAPSULATED_PIXEL_DATA` means the UID is a PS3.5 2026c section A.4 one and the top-level
Data Set is not one that syntax may carry, so the writer returns nothing rather than repairing it:
no top-level Pixel Data `(7FE0,0010)`; Float or Double Float Pixel Data `(7FE0,0008)` /
`(7FE0,0009)` present; Pixel Data with a defined Value Length (Native Format); a fragment stream not
ended by its Sequence Delimitation Item, including one `parseDicom` read with
`DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED` (appending a delimiter to a stream that may be short would
write a well-formed file missing frames); anything other than an Item of defined length before that
delimiter; an Item of odd length; a fragment Item of length zero after the Basic Offset Table; or no
Basic Offset Table Item or no fragment Item. Pixel Data inside a Sequence Item, such as an Icon Image
Sequence, is written as read and not checked.

`DIRECTORY_OFFSET_UNRESOLVED` and `DIRECTORY_OFFSET_DEFLATED` are the DICOMDIR codes. For a `Dataset`
whose `(0002,0002)` is `1.2.840.10008.1.3.10`, the writer writes `(0004,1200)`, `(0004,1202)`, and each
Directory Record's `(0004,1400)` and `(0004,1420)` as the byte offset, counted from the first byte of
the preamble it writes, of the record each named when the file was read, as PS3.3's Basic Directory
IOD defines them (PS3.3 is not vendored here, so no clause is claimed for it).
That is how a record stays named after the File Meta group is rebuilt, a record's elements are put in
ascending order, or `deidentify()` re-encodes every record at a new length. A record's identity is
`Item.fileOffset`, where the parser found its Item tag, which `deidentify()` carries to the Item it
rebuilds; an offset is tied to the Directory Record Sequence Item whose `fileOffset` it equals and to
nothing found by scanning for an Item tag. `DIRECTORY_OFFSET_UNRESOLVED` means an offset cannot be
tied: a non-zero value naming no Item of the Directory Record Sequence the `Dataset` holds (one
`parseDicom` warned about, one left after the Sequence was removed or emptied, one on a hand-built
`Dataset` with no records) or a value that is not one 32-bit unsigned integer. It is refused rather
than written stale, which would name the wrong bytes, or written as zero, which would silently prune
the tree. `DIRECTORY_OFFSET_DEFLATED` means the DICOMDIR is written under Deflated Explicit VR LE with
a non-zero offset, which names no Item a reader of a deflated stream can seek to; one whose offsets
are all zero is written. The limits of the record model are on
[Known limitations](./limitations.md).

`VALUE_TOO_LONG_FOR_VR` means a Private Creator Data Element under an Explicit VR syntax, or a File
Meta Information element under any (the File Meta group is always Explicit VR Little Endian), has a
value past 65,534 bytes in a VR with a 16-bit Value Length Field: PS3.5 2026c §6.2.2 forbids the
`UN` every other such value is written as, so the value has no encoding and nothing is written.
`deidentify()` throws it too when it re-encodes a Sequence Item that keeps such a creator.

A `DicomSerializeError` message is built from the code and fixed structural text and nothing else:
no Transfer Syntax UID, length, or byte from the `Dataset` reaches it, so unlike a `DicomParseError`
(which carries a raw `snippet`) it holds no source bytes.

## What the writer will not do

These are boundaries, not defects. The full list of package non-goals is on
[Known limitations](./limitations.md); what follows is the part that belongs to the writer.

- **No transcode.** The body is re-emitted in the transfer syntax the object arrived in. Converting
  between syntaxes is a different operation with different failure modes, and this package does not
  perform it.
- **No pixel re-encoding.** Encapsulated fragments pass through byte for byte. Pixel decode and
  encode are `@cosyte/dicom-pixel`.
- **Only the typed `FileMeta` fields round-trip through the model.** The group is recomputed
  spec-clean on emit. Non-modeled `(0002,xxxx)` elements the source carried are preserved verbatim
  and re-emitted in ascending tag order, so a repeated non-modeled element is re-emitted repeated;
  that is unchanged behavior and is recorded here rather than fixed silently.
- **The byte-for-byte File Meta round trip is scoped to parse-then-serialize.** It does **not** hold
  for [de-identified](./deidentification.md) output, because a de-identified File Meta group describes
  the de-identifying application instead of the source (PS3.15 §E.1.1). That is a deliberate fidelity
  loss and the report records it.
- **A repeated tag is not recoverable here.** A parsed Data Set is a `Map<Tag, Element>`, so where the
  source wrote one tag twice the earlier element was already gone before the writer saw it
  (`DICOM_DUPLICATE_TAG_IN_DATA_SET` on the parse). Serializing does not restore it, and no value is
  invented for it.

## The DICOM JSON Model

`toDicomJson(ds)` writes a Data Set as the DICOM JSON Model of PS3.18 Annex F: one JSON object
keyed by tag, eight uppercase hex digits, each attribute with its `vr` and its value as `Value`,
`InlineBinary` or `BulkDataURI`. `fromDicomJson(json, { fileMeta })` reads such an object back
into a `Dataset`, which `serializeDicom` writes as Part 10. The JSON Model holds no File Meta, so
`fromDicomJson` takes the File Meta to write under, and its Transfer Syntax UID picks the encoding.

```ts runnable
import { fromDicomJson, parseDicom, serializeDicom, toDicomJson } from "@cosyte/dicom";

// Synthetic object: Modality CT and an invented Patient ID.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);
const ds = parseDicom(buf);

const json = toDicomJson(ds);
json["00080060"]; // => { vr: "CS", Value: ["CT"] }
json["00100020"]; // => { vr: "LO", Value: ["MRN-42"] }

// The JSON Model carries no File Meta, so the source's goes back in.
const fileMeta = ds.fileMeta ?? { transferSyntaxUID: "1.2.840.10008.1.2.1" };
const back = fromDicomJson(JSON.parse(JSON.stringify(json)), { fileMeta });

// Part 10 to JSON to Part 10 writes the same bytes.
serializeDicom(back).equals(serializeDicom(ds)); // => true
```

How each VR is written, and read back the same way:

| VR                                                | JSON form                                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `AE` `AS` `CS` `DA` `DT` `LO` `SH` `TM` `UC` `UI` | `Value`: strings split on backslashes, padding removed, `null` for an empty value of several                                            |
| `LT` `ST` `UT` `UR`                               | `Value`: one string, a backslash kept as a character                                                                                    |
| `PN`                                              | `Value`: objects of `Alphabetic`, `Ideographic` and `Phonetic` component groups                                                         |
| `DS` `IS`                                         | `Value`: JSON numbers of the text's exact decimal value                                                                                 |
| `US` `SS` `UL` `SL` `FL` `FD`                     | `Value`: JSON numbers                                                                                                                   |
| `AT`                                              | `Value`: tags as eight uppercase hex digits                                                                                             |
| `SQ`                                              | `Value`: nested Data Sets, `{}` for an empty Item                                                                                       |
| `OB` `OD` `OF` `OL` `OV` `OW` `UN`                | `InlineBinary` (base64), or `BulkDataURI` where the `bulkDataUri` option gives one; bulk values inline only with `inlineBulkData: true` |

The shapes are typed: a `DicomJsonDataset` maps each tag to a `DicomJsonAttribute`, whose `Value`
is an array of `DicomJsonValue`, a Person Name value being a `DicomJsonPersonName`. The options are
`ToDicomJsonOptions` and `FromDicomJsonOptions`, and a refusal's code is a `DicomJsonErrorCode`.

An attribute with an empty value has no value field. Text is decoded through `(0008,0005)`
Specific Character Set by the same decoder `element.value` uses, so the two never disagree;
`(0008,0005)` is kept as it is, and text is encoded back under it. A `BulkDataURI` comes back
through the `resolveBulkData` option of `fromDicomJson`; one it does not resolve is refused, and
one it throws for is refused with `CONVERSION_FAILED`.

**Specific Character Sets carried.** One value of the default repertoire (no value, an empty one,
or `ISO_IR 6`), of a single-byte set without code extensions (`ISO_IR 100`, `101`, `109`, `110`,
`144`, `127`, `126`, `138`, `148`, `203`, `13` and `166`), or `ISO_IR 192`. Both converters refuse
any Data Set, at any depth, whose `(0008,0005)` has more than one value or names another set (an
ISO 2022 term, `GB18030`, `GBK`) with `UNSUPPORTED_CHARACTER_SET`, even when it holds no text: the
JSON Model has no place for the escape sequences of the code extensions of ISO 2022, and a converter that
read them differently from the reader would change a name without a word. `fromDicomJson` writes
text outside 7-bit ASCII only under the default repertoire and `ISO_IR 100` (as Latin-1) and
`ISO_IR 192` (as UTF-8); under the other single-byte sets it writes 7-bit ASCII alone. It then
reads every text value back through the reader's decoder, at every depth, and refuses with
`UNSUPPORTED_CHARACTER_SET` any that does not read back as the text the JSON gave. The reader
decodes each single-byte set by its own table and reads a byte the set does not define as
U+FFFD, so that refuses any character past U+007F under the default repertoire and `ISO_IR 6`,
which is ISO-IR 6 and has none, and the C1 control characters (U+0080 to U+009F) under
`ISO_IR 100`, which PS3.5 section 6.1.1 says shall not be used. Under `ISO_IR 192` a lone
surrogate, which UTF-8 cannot encode, is refused too.

**Bulk values are not written inline by default.** The model is for metadata, so Pixel Data
`(7FE0,0010)`, Float and Double Float Pixel Data `(7FE0,0008)` and `(7FE0,0009)`, Overlay Data
`(60xx,3000)`, Waveform Data `(5400,1010)`, Spectroscopy Data `(5600,0020)` and Encapsulated
Document `(0042,0011)` need a URI from the `bulkDataUri` option, at any depth. With none, and
without `inlineBulkData: true`, `toDicomJson` refuses the call with `BULK_DATA_URI_REQUIRED`
rather than leave the value out. Every other binary value is written inline unless `bulkDataUri`
gives it a URI.

**Exact, or refused.** A converter gives back exactly the value it was given, or refuses with a
code; it never writes a value it cannot carry faithfully:

- **Implicit VR.** Implicit VR Little Endian writes no VR, and the reader takes the one PS3.5 and
  the dictionary give the tag, `UN` for a private one. `fromDicomJson` reads the Data Set it wrote
  back and refuses with `VR_MISMATCH` any attribute, at any depth, whose VR came back other than
  the JSON's: Smallest Image Pixel Value `SS` -1 with no Pixel Representation of 1 would read as
  `US` 65535, and a private `DS` as `UN`. A private Sequence of defined length reads as `UN` too;
  write it with `sequenceLength: "undefined"`, or under Explicit VR.
- **Delimiters.** One value holding a backslash in any string VR but `LT`, `ST`, `UT` and `UR`, or
  an `=` or a backslash in a Person Name group, is refused with `INVALID_JSON` rather than split
  into several values or groups. A `^` inside a group is a component delimiter and is kept.
- **`DS` and `IS` numbers.** A JSON number is a double, so a `DS` whose decimal value no double
  holds exactly, such as `9007199254740993` (past 2^53) or `0.10000000000000001`, is refused with
  `UNREPRESENTABLE_NUMBER` rather than rounded. Only the form of the text may change.
- **`FL` numbers.** A JSON number is rounded to the nearest float32, as any `FL` writer rounds it.
  One past float32's range, or below its smallest normal value and not a float32 itself, is
  refused with `UNREPRESENTABLE_NUMBER`: `1e-50` would otherwise be written as 0.
- **Person Name groups.** A Person Name of more than three component groups is refused with
  `MALFORMED_VALUE`, never truncated: PS3.5 section 6.2 says "There shall be no more than two
  component group delimiters".
- **Text bytes.** Bytes the Specific Character Set does not decode, such as invalid UTF-8 under
  `ISO_IR 192`, are refused with `MALFORMED_VALUE` rather than read as U+FFFD, and a leading byte
  order mark is kept as U+FEFF.
- **Control characters.** PS3.5 section 6.2 allows TAB, LF, FF and CR in `LT`, `ST` and `UT`, no
  control character in any other string VR, and ESC only for code extensions, which are not
  carried. `fromDicomJson` refuses text holding any other C0 control character (U+0000 to U+001F)
  with `MALFORMED_VALUE`, under every Specific Character Set, so no escape sequence written as JSON
  text can turn into other characters when it is read back. `toDicomJson` writes such a character
  as it reads it, so JSON it wrote from a value holding one is refused when it comes back to
  `fromDicomJson`.
- **Text that reads back as other text.** `fromDicomJson` reads back every text value it wrote and
  refuses with `UNSUPPORTED_CHARACTER_SET` one that differs from the JSON's, such as a C1 code
  point under `ISO_IR 100`, a character past U+007F under the default repertoire, a `~` under
  `ISO_IR 13`, where `0x7E` is OVERLINE, or a lone surrogate under `ISO_IR 192`.
- **Odd groups below `0008`, and `FFFF`.** PS3.5 section 7.8.1 says elements in group `0001`,
  `0003`, `0005`, `0007` and `FFFF` "shall not be used", so `fromDicomJson` refuses a tag in one
  with `INVALID_JSON`.
- **`FL` and `FD` negative zero.** JSON writes `-0` as `0`, which is another IEEE value, so
  `toDicomJson` refuses an `FL` or `FD` negative zero with `UNREPRESENTABLE_NUMBER`.
- **Nesting.** `parseDicom` reads Sequences nested at most 64 deep (`NESTING_DEPTH_LIMIT`), so
  `fromDicomJson` refuses JSON nested deeper with `NESTING_TOO_DEEP` before it writes the next
  level: neither the reader's error nor a stack overflow leaves it.
- **No other error.** Any error a converter meets that no code above names, one a callback threw
  included, is refused with `CONVERSION_FAILED`. The error it replaces is not kept, since its
  message could hold a value; a `resolveBulkData` that cannot resolve a URI should return
  `undefined`, which is refused with `BULK_DATA_UNRESOLVED`.

**Where the bytes can differ.** The JSON Model does not record everything Part 10 does, so the
round trip is byte-identical only where the source already wrote what `fromDicomJson` writes:

- **Sequence and Item lengths.** The model does not say whether a Sequence or Item had a defined
  or an undefined length. `fromDicomJson` writes defined lengths, or undefined lengths with
  `sequenceLength: "undefined"`; a source that mixed the two comes back with one of them.
- **`DS` and `IS` text.** A number is written in JavaScript's shortest text for it, so `1.0`
  comes back as `1`, `+5` as `5` and `-0` as `0`; where that text is past the 16 characters `DS`
  allows, the value is written as its significant digits and a power of ten, so `100E14` comes
  back as `1e16`. The decimal value never changes; a text whose value a JSON number does not hold
  is refused, as above.
- **Padding.** Values are padded as PS3.5 pads them, `UI` with a NUL and other text with a space,
  so a `UI` a source padded with a space comes back padded with a NUL. Trailing spaces of a value
  are removed in the JSON.
- **An odd-length binary value from JSON.** A Part 10 value has an even length, so an
  `InlineBinary` or resolved `BulkDataURI` of an odd number of bytes is written with one NUL pad
  byte after it. Read back, that byte is part of the value: `{ vr: "OB", InlineBinary: "AAAA" }`
  (three bytes) comes back as `"AAAAAA=="` (four). JSON to Part 10 to JSON adds the byte; Part 10
  to JSON to Part 10 never meets an odd value.
- **A `UN` value read as a Sequence** comes back as `SQ`, and a DICOMDIR's Directory Record
  offsets name bytes of the file it was read from, so `serializeDicom` refuses the rebuilt Data
  Set with `DIRECTORY_OFFSET_UNRESOLVED`.

**What is refused, with a `DicomJsonError`.** The converters refuse rather than change or guess a
value, and the message carries no value. `UNSUPPORTED_VR`: `SV` and `UV` with a value.
`BULK_DATA_URI_REQUIRED`: a bulk value with no URI and no `inlineBulkData`. `VR_MISMATCH`: an
attribute whose VR the written Data Set does not read back with.
`UNSUPPORTED_ELEMENT`: encapsulated Pixel Data and any other undefined-length value that is not a
Sequence. `UNSUPPORTED_BYTE_ORDER`: `OW`, `OF`, `OD`, `OL` and `OV` under Explicit VR Big Endian.
`UNREPRESENTABLE_NUMBER`: NaN, an infinity, an `FL` or `FD` negative zero, a `DS` or `IS` that is
not a number or whose value no JSON number holds exactly, or a number its VR cannot hold.
`MALFORMED_VALUE`: a binary length that is not a whole number of values, a Person Name of more
than three groups, text bytes the Specific Character Set does not decode, or a control character
the VR does not allow. `UNSUPPORTED_CHARACTER_SET`: a Specific Character Set of more than one value
or one not carried, at any depth, or text `fromDicomJson` cannot encode, which is any character
outside 7-bit ASCII under a set other than the default repertoire, `ISO_IR 100` and `ISO_IR 192`.
`UNSUPPORTED_TRANSFER_SYNTAX`: `fromDicomJson` writes only the three uncompressed syntaxes and
Deflated Explicit VR LE. `NESTING_TOO_DEEP`: Sequences nested more than 64 deep.
`CONVERSION_FAILED`: any other error. `INVALID_JSON` (another shape, or a delimiter inside one
value), `BULK_DATA_UNRESOLVED` and `VALUE_TOO_LONG` cover the rest.

**What we have not checked against the standard.** PS3.18 is not vendored in this repository, so
these forms are what we write and read, not a conformance verdict. The cases we could not confirm
are the ones refused above: the JSON form of `SV` and `UV` values, the byte order of an
`InlineBinary` under Big Endian, and `DS` or `IS` carried as JSON strings, which `fromDicomJson`
refuses as `INVALID_JSON`. The `null` for an empty value among several, and an Item written as
`{}`, are also our reading, and so is which values count as bulk and the rounding of an `FL`
number to float32. A JSON array of several Data Sets is not read; pass each Data Set in
turn.

## Where to go next

- The steps, with a sample that runs: [Re-serialize a parsed object](./recipes.md#re-serialize-a-parsed-object-to-spec-clean-bytes).
- What the parser tolerated on the way in: [Tolerance and warnings](./spec-notes-tolerance.md).
- Stripping identifying metadata before you share the bytes: [De-identification](./deidentification.md).
