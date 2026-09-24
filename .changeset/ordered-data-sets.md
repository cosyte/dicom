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
  bytes, never re-encoded from the parsed `items`, so nothing its bytes did not carry is written.
  The input `Dataset` is not modified, and `Dataset.elements()` still returns parse order.
- **What is still not ordered.** A tag repeated inside an Item is kept twice, in source order, so
  that output is still not §7.1-clean. A Sequence whose Item stream cannot be walked to exactly its
  end, one nested past the bound, and any `UN`-carried Sequence are written as read, unordered. An
  element the parser relocated because a length field lied is ordered where the parser placed it.
- **A source that was already in order** is written back with the same bytes after the File Meta
  group, as before.
