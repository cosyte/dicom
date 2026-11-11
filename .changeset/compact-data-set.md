---
"@cosyte/dicom": patch
---

Keep each parsed Data Set as a compact table and build an Element or Item only when it is asked for, so a parse makes far fewer objects and holds far less memory.

- `parseDicom` writes one row of integers per element into typed arrays instead of building an `Element` for every element and an `Item`, with a `Map` of its own, for every Sequence Item. `get`, `has`, `getAll` and `elements` build each `Element` the first time it is asked for and return that same object every time; an `SQ` Element builds its `Item`s when it is built. Every element, value, warning, error and written byte is what it was, in the same order, with the same rule for a repeated tag (the earlier position, the later value).
- A parsed `Dataset` or `Item` no longer has an own `_elements` property holding a `Map`: `Object.keys`, a spread and `JSON.stringify` of one no longer list or dump its elements. Read them through `get`, `has`, `getAll` and `elements`, as before. A subclass that read the protected `_elements` still gets a `Map` from it, built on first read; a Dataset built by hand still returns the map it was built with.
- `Element.rawBytes` is an accessor, not an own property: it returns the same bytes, the same Buffer on every read, but `Object.keys(el)`, a spread of an Element and `JSON.stringify(el)` do not include it. Read `el.rawBytes` directly where you spread or serialized an Element to get its bytes. Every other own key of an Element is unchanged.
- Under `{ copyValues: true }` the Dataset reads from one copy of the input made by the parse, and each `Element.rawBytes` is a standalone copy made when that Element is first built, so the input can still be released after the parse.
- `ByteCursor` and the File Meta reader read integers from the bytes directly rather than through `Buffer.readUInt16LE` and its kin, and the model classes keep one instance each for the life of the process, so the first parse after a garbage collection no longer pays to rebuild their hidden classes.
