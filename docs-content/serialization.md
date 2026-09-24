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
  every byte of the encoding, and the writer does not transcode.
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
    are written as read, unordered; and an element the parser relocated because a length field lied
    is ordered where the parser placed it, since ordering cannot recover an order the source
    destroyed.
  - **Written last, even when its tag sorts earlier:** an element whose own bytes do not show where a
    reader ends it, such as an undefined-length `UN` the parser could not read as a Sequence, or a
    Sequence, `UN` or Pixel Data value missing its Sequence Delimitation Item. A reader takes whatever
    follows such a value into it, so it keeps its place after the ascending rest of its Data Set, at
    the root and inside an Item, rather than losing the elements after it on the next read.
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
| `SERIALIZE_ERROR_CODES`                                    | The frozen registry of codes the writer may throw. `MISSING_TRANSFER_SYNTAX` and `UNSUPPORTED_TRANSFER_SYNTAX`.                              |
| `SerializeErrorCode`                                       | The discriminant type over that registry, so a `switch` on a caught code is exhaustive.                                                      |
| `DicomSerializeError`                                      | The thrown class. Narrow with `err instanceof DicomSerializeError`, then on `err.code`.                                                       |

`MISSING_TRANSFER_SYNTAX` means the `Dataset` carries no `fileMeta`, or its `transferSyntaxUID` is
empty. The Transfer Syntax UID is the dispatch input that decides every byte of the encoding, so
there is no safe default to fall back to and none is invented. `UNSUPPORTED_TRANSFER_SYNTAX` means
the UID is outside the set this package reads and writes; the writer never transcodes, so it cannot
emit a syntax it does not understand.

A `DicomSerializeError` message is built from the code and the offending Transfer Syntax UID and
nothing else, so unlike a `DicomParseError` (which carries a raw `snippet`) it holds no source bytes.

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
