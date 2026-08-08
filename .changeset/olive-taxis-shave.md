---
"@cosyte/dicom": patch
---

Disclose an over-long `(0012,0063)` Value that `deidentify()` did not compose (`DICOM-LO-LENGTH-AND-SILENT-REPLACE`).

PS3.5 2026c Table 6.2-1 caps an `LO` at "64 chars maximum", and that row describes a **Value**:
`(0012,0063)` is `1-n`, so the bound falls on each value between `5CH` delimiters and never on the
Value Field. Reading it the other way is the misreading that left `#74`'s hole, and a field of 619
bytes made of ten Values of 61 is conformant. The text this library composes for itself has been
inside the maximum on all 512 option subsets since `#75`. The two Values it does **not** compose can
be over, and both were written through with `report.warnings` saying nothing about their length: a
caller's `deidentificationMethod`, and a value the source file already carried and PS3.15 2026c
E.1.1 obliges this to keep.

**The likeliest writer of the second one is this library.** Every object any published release
de-identified without a caller-supplied method carries a 76-character Value, and re-de-identifying
one keeps it: measured flat at 138 bytes over four passes, Values of 76 and 61. The **retention** has
been disclosed since `DICOM_DEIDENT_METHOD_PRIOR_RETAINED`; the **length** was disclosed by nothing,
on that route or on the caller's. So "a sender's non-conformant `LO` is the sender's" does not apply
to the common case, and the earlier changesets that described the retention are not corrected by
this: they were about which bytes survive, not about how long they are.

`report.warnings` now carries `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH` whenever the `(0012,0063)`
this run writes carries a Value longer than 64 bytes. **It is a disclosure and not a bound: nothing
is shortened, split or truncated**, because splitting or truncating either Value would invent a
de-identification record nobody made, and keeping a prior record intact is what E.1.1's provenance
carrier is for. The code is measured over the value actually written, so one check covers the caller
route, the retained-prior route and both replacement fallbacks, and it is raised on **every** pass
rather than only the first, which is what a re-de-identified object needs.

**Widened by union, never by replacement.** No existing branch moved and no existing code stopped
firing: `DICOM_DEIDENT_METHOD_NOT_ADDED`, `DICOM_DEIDENT_METHOD_NOT_LO` and
`DICOM_DEIDENT_METHOD_PRIOR_RETAINED` are unchanged on every shape, pinned by a matrix that strips
the new code and compares against the base's answers, and a sweep of all 512 option subsets shows
the new code raised **0** times on the text this library composes for itself.

**The measurement is over BYTES and that is a deliberate over-approximation, disclosed rather than
argued away.** No repertoire encodes a character in fewer than one byte, so a Value of 64 bytes or
fewer can never hold more than 64 characters and this cannot miss a Value that is genuinely over.
The converse fails for **two** reasons, and PS3.5 2026c §6.2 gives both in the paragraph above Table
6.2-1: those lengths are "expressly specified in characters rather than bytes ... because the
mapping from a character to the number of bytes used for that character's encoding may be dependent
on the character set used", and "Escape Sequences used for Code Extension shall not be included in
the count of characters". So a conformant 64-character Value exceeds 64 bytes under a multi-byte
`(0008,0005)` repertoire (40 characters of `ISO_IR 192` is 120 bytes) **and** under a single-byte one
at Level 4 (`\ISO 2022 IR 100` with an ISO/IEC 2022 escape sequence Table 6.2-1's `LO` row expressly
admits: 67 bytes carrying 64 counted characters, parsing with no warnings). Both raise the code and
both are pinned with files that really declare the repertoire, rather than fixtures that assert
bytes are characters. The encoder's trailing pad does **not** count, because both operands are
trimmed before the check; a leading space does. Read the code as "a Value in this attribute is over
64 bytes", which is what is measured, never as "the attribute is non-conformant".

The message is the frozen registry string with nothing substituted: **no value, no length, no count
of how many Values are over, and no origin.** 64 is a constant of the VR; the offending Value's own
length is a measurement over document content, which is the number `DICOM-DIAGNOSTIC-PHI-RESIDUALS`
bound out of six other messages, and which of the two sources a Value came from is not decidable
when they are equal. **`position.byteOffset` locates the prior element and is `0` when there was
none**: this is the first method code that can be raised on a Data Set carrying no `(0012,0063)` at
all, so on the caller route the offset is a sentinel rather than a location, and both routes are
pinned so the `0` reads as an absence. Emitted by `deidentify()` only, so it never reaches the
parser's `{ strict: true }` escalation and cannot refuse a conformant file.

Adding a warning code is a public-surface change and the `WARNING_CODES` snapshot moves with it.

Still open and unchanged, a backlog line rather than a rider on this one: `(0012,0063)` records the
**union** of the options ever applied rather than a per-run history, so a later pass with fewer
options leaves no trace an earlier one had more. The direction is conservative (the union
over-states retention, never understates it), and changing it would rewrite what every run writes
and reopen the unbounded growth the fixed-point rule and the ceiling guard exist to stop.
