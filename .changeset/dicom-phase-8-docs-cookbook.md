---
"@cosyte/dicom": patch
---

Docs, cookbook and examples: the roadmap's final phase, plus the gates that keep them honest.

**A cookbook that covers the jobs a metadata parser is actually handed.** Four new recipes, every one
executable in CI: extract metadata and index a folder of studies, build routing keys (hierarchy UIDs,
Accession Number, Patient ID paired with its issuer), read pixel-interpretation metadata safely, and
bridge to FHIR `ImagingStudy` and HL7 v2. The FHIR recipe cites the `ImagingStudy` "Mappings for
DICOM" tab, which is the authoritative crosswalk.

**The site's citations are checked against the SHA-pinned normative documents.** A new gate re-hashes
the vendored PS3.5, PS3.6 and PS3.15 2026c DocBook sources as a precondition, then runs two checks of
different strength. Every clause citation of a vendored **prose** part (PS3.5, PS3.15) is resolved by
collecting **every** candidate section carrying that label and requiring exactly one, so zero and two
are both refusals and a first-match read cannot take the table of contents. Each clause the text leans
on for a normative statement is additionally required to carry that sentence **in its own body, not in
a subsection** (a body that swallowed subsections would certify `§7.5` for a `§7.5.2` fact and `§E.1`
for an `§E.1.1` one, which are the two confusions this package has already paid for; both are pinned
as controls). PS3.6 is cited for attribute identity rather than for prose, and is checked by its own
case: every `(gggg,eeee) Some Name` pair written anywhere in the docs must be the registry's own name
for that tag. **A numbered clause of a part this repository does not vendor may no longer be cited at
all**: two such citations were in the README and are replaced by prose that names the part and says
what is and is not claimed.

**`@example` on every public export is a gate rather than a convention.** Two exports were missing one
and now have it. The checker walks the public barrel through the compiler, so a namespace export and a
type count the same as a function does, and it carries a mutation control that proves it can go red.

**The PHI scanner reads doc fixtures.** The documentation ships DICOM objects as base64-encoded Part 10
buffers inline in markdown, and until now the scanner never opened one: to a text sweep a base64 run is
a single alphanumeric token with no `FAMILY^GIVEN` and no `YYYYMMDD` in it. `README.md` and
`docs-content/**` are now a second corpus, embedded objects are decoded and walked as DICOM, and both
the preamble-bearing and the preamble-less shape are recognized, the latter being what the cookbook
ships to demonstrate `DICOM_MISSING_PREAMBLE`. **The run floor is not the filter, and a first draft
that treated it as one shipped blind**: it required 120 base64 characters on the reasoning that a Part
10 object is big, and the cookbook's preamble-less fixture encodes to 88, so the one file the route's
own comments named as its reason was the one file it never opened while every test still passed. The
floor is now the shortest run that could encode a single Data Element header, the decode does the
filtering, and a regression case takes the **shortest real object out of the shipped cookbook** rather
than building its own. **It found real content the moment it ran**: every
sample object on the site carried a Study Date inside the 120-year window. Each is now `19000101`, and
the docs say why rather than leaving it as an unexplained oddity.

**A prominent "do not over-trust" page.** Known limitations moves out of the end of a long
troubleshooting page and into its own entry near the top of the navigation, linked from the README's
opening and from Getting started. It is an index rather than a second copy: scope non-goals, the open
PHI residuals (the retain-route leak whose extent is a matrix, the over-long `LO` in `(0012,0063)` that
this library is the likeliest writer of, `contextPath` being inert and not safe to log), the structural
facts no reader can resolve, and what is deliberately never defaulted.

**Two owed corrections.** The README described a Tier-2 warning message as "never composed from the
document", and `ParseOptions.strict`'s JSDoc called one "safe to log whole". Neither is true without a
qualifier: the registry's tag slot is filled by a shape check, which cannot refuse a tag a lying Value
Length composed out of somebody's value. Both now say safe on a well-formed file and not
unconditionally safe, which is what the measurement supports.
