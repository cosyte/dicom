---
"@cosyte/dicom": patch
---

Refuse a `###` run an invisible character separates from the path, in the PHI gate's override log.

`scripts/phi-scan.ts` refuses a `--allow-fixture <path>` bypass unless `phi-scan-overrides.md`
carries a `### <path>` heading. `tripleHashValue` separated the `###` run from the path with the
whole of `\s`, where CommonMark 0.31.2 section 4.2 says the opening run "must be followed by spaces
or tabs, or by the end of line". So a line whose separator was an invisible character was a live
allow entry where the document renders a paragraph, and that target was exempted at exit 0. Measured
live on three trees before the change, each against the same bytes without the flag, which exit 1.

It is one conjunct on the pattern the function replaced, so for every line the parser returns either
that pattern's answer or nothing: no line that was not already an entry becomes one, and every
difference is a refusal at exit 2. That is a property of the source rather than one a test can
prove, and it is left as one: the evidence beside it is the comment-stripped diff, a single added
early return, and the per-log relation the shipped instrument prints against a base, which reads as
a subset on the one log the two trees differ on.

Section 4.2's strip is deliberately NOT taken, and that is measured rather than assumed: the prose
says leading and trailing spaces or tabs, and `commonmark@0.31.2`, the reference implementation of
the pinned document version, strips with `String.prototype.trim`, which is the whole of `\s` and is
what this parser does. A draft that took the prose named `path<NBSP>` where this parser names
`path`, which exempted at exit 0 a target it refuses at exit 2, and it was deleted. The strip,
section 4.2's optional closing sequence and its inline parsing are each pinned as they are, with
their cost stated in both directions.

`scripts/measure-phi-scan-atx-heading.ts` ships beside the change so the figures can be re-run
against any tree. It carries a control the sibling instruments do not: an entry must be shown to
exempt a real hit, not merely to be accepted.
