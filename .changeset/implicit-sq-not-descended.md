---
"@cosyte/dicom": patch
---

PHI nested in a defined-length sequence under Implicit VR Little Endian survived `deidentify()` into
serialized output, and the report said it had been removed. The Implicit VR LE parser descended a
sequence only when its length was the undefined-length sentinel, so `Element.items` was `undefined`
for every defined-length sequence under that transfer syntax. Nothing that walks items could see
inside one, and `deidentify()` recurses into a kept sequence only when its items exist: a
`(0010,0010)` Patient's Name in a defined-length item reached `serializeDicom()` output verbatim,
with the `DeidentifyReport` naming only the root attribute. The report asserted a scrub it had not
performed, which is the part to act on: an incomplete audit that reads as a complete one is what a
caller trusts before sharing an object. The identical fixture under Explicit VR LE scrubbed clean.

PS3.5 2026c section 7.5.2, "Delimitation of The Sequence of Items", gives an encoder two ways to
delimit a Sequence of Items and then requires that "Both ways of encoding shall be supported by
decoders of the Sequence of Items." Section 7.5.1 says the same of each Item's own length field. The
two choices are independent, so both are now descended in every combination. The de-identified
output of the Implicit VR LE fixture and its Explicit VR LE twin are now the same report, attribute
for attribute and context path for context path.

One new Tier-2 warning code, `DICOM_SQ_NOT_DESCENDED`, and one behaviour change against `0.0.5` that
is not the fix itself. Under Implicit VR LE there is no VR on the wire, so `SQ` is resolved from the
data dictionary rather than declared by the sender. When a defined-length value resolved to `SQ`
turns out not to be an item stream, the descent is refused rather than fatal: the declared byte range
stays intact on `Element.rawBytes`, the rest of the object still parses, and the new warning says the
element was not opened. The undefined-length form keeps its existing fatal, because a defined length
leaves a complete alternative reading of the value and an undefined one leaves none. Under
`{ strict: true }` the new warning is promoted to a throw, so such a file parses lenient and throws
strict.

Three smaller consequences of a sequence now being read, all of them the descent working rather than
separate decisions. `Element.vm` on such an element is the item count instead of the scalar
placeholder `1`. `Element.value` yields the real items instead of an empty sequence. And warnings
raised **inside** a defined-length sequence, which previously could not exist because its bytes were
never parsed, now appear on `ds.warnings`; under `{ strict: true }` any one of them is promoted to a
throw, so a file whose nested content was always non-conformant now says so. The element itself no
longer carries `specificCharacterSet`, matching every other sequence element in the package; items
still inherit the enclosing character set as before.

Do not treat a `DeidentifyReport` as complete without checking that the sequences you care about
were opened. Recursion is driven by `Element.items`, so a sequence the parser could not open is kept
verbatim and its contents appear nowhere in the report. That set is now narrow, but it is not empty
and **only one of its two members warns**: the refusal above raises `DICOM_SQ_NOT_DESCENDED`, while
an undefined-length `UN` value the CP-246 descent could not read as a sequence raises nothing at all
and keeps `vr === "UN"`. That silence is unchanged from `0.0.5`. The test that covers both is
`el.items === undefined` on the element itself, not `ds.warnings`.

One residual, pre-existing on the CP-246 path and now reachable from one more shape: a refused
descent drops its warnings from `ds.warnings`, but an `onWarning` callback has already been handed
them, because the chokepoint delivers to the callback before the rollback can undo the push. The two
therefore disagree for those warnings. `ds.warnings` is the accurate record.
