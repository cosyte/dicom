---
"@cosyte/dicom": patch
---

`serializeDicom()` now writes every Data Set in ascending tag order, so a file this library writes
satisfies the element-ordering rule a strict receiver checks even when the file it was read from
did not. It used to write elements in the order the `Dataset` held them (parse order, plus anything
your code or `deidentify()` added afterwards), and to copy every Sequence through as read, so a
round trip propagated an out-of-order source instead of normalizing it.

PS3.5 2026c §7.1: "The Data Elements in a Data Set shall be ordered by increasing Data Element Tag
Number", and §7.5.1 says the same of the Data Set inside every Item.

- **What is ordered.** The root Data Set, and the Data Set of every Item of every Sequence the
  writer can walk on the wire, at every depth up to `NESTING_DEPTH_LIMIT`, under all four supported
  transfer syntaxes. That includes the elements `deidentify()` inserts, such as `(0012,0062)` and
  `(0012,0063)`.
- **What does not change.** Items keep their order (§7.5). Only whole elements move, so no value
  byte changes and every Item and Sequence length stays valid. The Sequence is walked from its own
  bytes, never re-encoded from the parsed `items`, so nothing its bytes did not carry is written,
  and it is re-ordered only where those `items` match its bytes, so the output reads back as the
  source did. The input `Dataset` is not modified, and `Dataset.elements()` still returns parse
  order.
- **What is still not ordered.** A tag repeated inside an Item is kept twice, in source order, so
  that output still breaks the "at most once" of PS3.5 2026c §7.1. A Sequence whose Item stream
  cannot be walked to exactly its end, one nested past the bound, one whose parsed `items` do not
  match its bytes (a Sequence the parser did not descend, `DICOM_SQ_NOT_DESCENDED`, for one), and any
  `UN`-carried Sequence (under Implicit VR LE that includes a private Sequence inside an Item, even
  one a `Profile` resolved to `SQ`, since a default read resolves its tag to `UN`) are written as
  read, unordered. An element the parser relocated because a length field lied is ordered where the
  parser placed it.
- **What is written last, whatever its tag.** An element whose own bytes do not show where a reader
  ends it: an undefined-length `UN` the parser could not read as a Sequence, or a Sequence, `UN` or
  Pixel Data value missing its Sequence Delimitation Item. A reader takes whatever follows such a
  value into it, so it stays after the ascending rest of its Data Set, at the root and inside an
  Item. A Sequence nested past the bound also goes after the ascending rest of its Item, unless it
  is a defined-length Sequence under Implicit VR LE, since seeing where a reader ends any other
  would take the walk past the bound.
- **A source that was already in order** is written back with the same bytes after the File Meta
  group, as before.
