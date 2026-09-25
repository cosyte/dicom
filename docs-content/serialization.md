---
id: serialization
title: Serializing spec-clean Part 10
sidebar_label: Serialization
---

# Serializing spec-clean Part 10

`serializeDicom(ds)` writes a `Dataset` back to a Part 10 `Buffer`. It is the conservative half of
Postel's Law: the parser accepts what real scanners emit, and the writer emits only what the standard
describes. Whatever quirks came in, what goes out is spec-clean.

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
  PS3.5 2026c section A.4 names (JPEG, JPEG-LS, JPEG 2000, HTJ2K, RLE and the rest), the Data Set is
  Explicit VR LE and the top-level Pixel Data is `OB` of undefined length: the source's Basic Offset
  Table and fragment Items byte for byte and in order, then a zero-length Sequence Delimitation Item.
  A top-level Pixel Data section A.4 does not allow is refused, not repaired (below).
- **Even-length Value Fields.** PS3.5 2026c §7.1.1 defines a Value Field as "an even number of bytes
  containing the Value(s) of the Data Element", so odd values are padded with the pad byte their VR
  specifies. An odd length that arrived tolerated goes out even.
- **Every Data Set in ascending tag order.** PS3.5 2026c §7.1 says the Data Elements in a Data Set
  "shall be ordered by increasing Data Element Tag Number", and §7.5.1 says the same inside every
  Item. The writer emits the root that way, and the Data Set of every Item of every Sequence it can
  walk on the wire, at every depth up to `NESTING_DEPTH_LIMIT`, whatever order the source file, your
  code or `deidentify()` left it in. Items stay in their order (§7.5), only whole elements move, so
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
    Sequence, `UN` or Pixel Data value missing its Sequence Delimitation Item. A reader takes whatever
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
read-side structural corruption) and from the value layer's `DicomValueError`. It throws only when it
is asked to emit a buffer it cannot make spec-clean.

| Export                                                     | What it is                                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERIALIZE_ERROR_CODES`                                    | The frozen registry of the writer's codes: `MISSING_TRANSFER_SYNTAX`, `UNSUPPORTED_TRANSFER_SYNTAX`, `INVALID_ENCAPSULATED_PIXEL_DATA`, `DIRECTORY_OFFSET_UNRESOLVED`, `DIRECTORY_OFFSET_DEFLATED`. |
| `SerializeErrorCode`                                       | The discriminant type over that registry, so a `switch` on a caught code is exhaustive.                                                      |
| `DicomSerializeError`                                      | The thrown class. Narrow with `err instanceof DicomSerializeError`, then on `err.code`.                                                       |

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
whose `(0002,0002)` is `1.2.840.10008.1.3.10`, the writer writes `(0004,1200)`, `(0004,1202)` and each
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
[Known limitations](./limitations).

A `DicomSerializeError` message is built from the code and fixed structural text and nothing else:
no Transfer Syntax UID, length or byte from the `Dataset` reaches it, so unlike a `DicomParseError`
(which carries a raw `snippet`) it holds no source bytes.

## What the writer will not do

These are boundaries, not defects. The full list of package non-goals is on
[Known limitations](./limitations); what follows is the part that belongs to the writer.

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
  for [de-identified](./deidentification) output, because a de-identified File Meta group describes
  the de-identifying application instead of the source (PS3.15 §E.1.1). That is a deliberate fidelity
  loss and the report records it.
- **A repeated tag is not recoverable here.** A parsed Data Set is a `Map<Tag, Element>`, so where the
  source wrote one tag twice the earlier element was already gone before the writer saw it
  (`DICOM_DUPLICATE_TAG_IN_DATA_SET` on the parse). Serializing does not restore it, and no value is
  invented for it.

## Where to go next

- A worked recipe with a fuller object: [Cookbook](./cookbook#6-re-serialize-a-parsed-object-to-spec-clean-bytes).
- What the parser tolerated on the way in: [Tolerance & warnings](./spec-notes-tolerance).
- Stripping identifying metadata before you share the bytes: [De-identification](./deidentification).
