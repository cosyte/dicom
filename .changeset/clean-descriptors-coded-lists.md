---
"@cosyte/dicom": patch
---

The Clean Descriptors Option now empties each coded list it cleans, and `serializeDicom` runs under Deno.

- **Clean Descriptors.** PS3.15 Table E.1-1 gives nine Sequences a `C` under Clean Descriptors:
  the five diagnosis code lists (Admitting, Principal, Primary, Secondary and Histological), Reason
  for Visit Code Sequence, Request Attributes Sequence, Reason for Requested Procedure Code Sequence
  and Prescription Notes Sequence. `deidentify` used to keep each one and walk its Items, and since
  Code Value `(0008,0100)` and the free-text Code Meaning `(0008,0104)` have no row of their own,
  both were kept while the report said `cleaned`. Each of these is now kept with no Items, the same
  conservative blank `C` writes on any other attribute, and the report still says `cleaned`. A
  Sequence the Clean Structured Content or Clean Graphics Option cleans is unchanged. A caller that
  read Items out of one of the nine gets none now, and one that needs a code from such a list reads
  it from the source before de-identifying.
- **Deno.** Under Deno 2.9.8, `serializeDicom` threw `RangeError: The value of "sourceEnd" is out
of range` from `Buffer.prototype.compare`, which it called with a source range to check an
  element against its source bytes. It now makes that check with `equals`, and CI runs the whole
  test suite under Deno.
- **ISO-IR 149 under Deno.** KS X 1001's row 2 now ends at cell 69 on every runtime. Deno's
  `euc-kr` decoder reads characters a later edition added past that cell, so the same bytes
  decoded to a character under Deno and to U+FFFD under Node; both now give U+FFFD.
