---
"@cosyte/dicom": patch
---

Fix a de-identification defect: `deidentify()` neither removed nor reported `(6000,4000)` Overlay
Comments, nor any other attribute PS3.15 marks for removal as a repeating-group family.

PS3.15 Table E.1-1 states three of its rows as a group mask rather than as a single tag:
`(50xx,xxxx)` Curve Data, `(60xx,3000)` Overlay Data and `(60xx,4000)` Overlay Comments. All three
are marked `X`, remove. The matcher looked attributes up by exact tag, which cannot express a mask,
so all three rows were unreachable. `deidentify()` reads "not in the table" as "not listed, keep", so
the elements survived the call verbatim and the `DeidentifyReport` said nothing about them. Overlay
comments are a common carrier for text a technologist typed onto a study, which makes a silent keep
the worst of the three. The burned-in-annotation warning does not cover this: it keys on Pixel Data
and Burned In Annotation, which describe the image, not the overlay planes. This shipped at `0.0.3`.

The three rows are now generated from the pinned PS3.15 DocBook as pattern rules and applied on an
exact-tag miss. A matched element is removed **and** reported: its report entry carries the concrete
tag that was in the file, the family's attribute name, and a new `repeatingGroup` field naming the
mask that matched, so an audit can tell a mask hit from a single-tag hit without re-deriving it.
`CleanGraphics` is honoured on these rows too, exactly as the table states it. Where an exact row and
a mask could both apply, the exact row wins, as the more specific statement the standard makes about
that tag; PS3.15 2026c publishes no such overlap and the generator counts and prints it every run.

**The mask covers the groups PS3.5 bounds it to, not any four hex digits.** PS3.5 §7.6 states that
repeating groups "shall only be allowed in the even numbered Groups 6000-601E", and PS3.5-2004 §7.6,
which the current edition's note delegates to for curves, states the same for "even Groups
(5000-501E,eeee)". So each mask covers sixteen groups, not 256, and the same section says of the odd
ones that there is "no implication of repeating semantics". Both bounds matter, in opposite
directions: reading `xx` as a hex wildcard would remove attributes the standard never marked, which
is data loss on a call the caller asked to be conservative, while reading the mask as an exact tag
matched nothing at all. Odd groups in the overlay range remain private attributes and go through the
private-attribute path, as before. The VR-resolution path used when reading a file keeps its own, deliberately wider,
mask matcher, because a too-wide VR guess only makes a decode lenient where it would otherwise be
`UN`, while a too-wide removal deletes data.

The generator now refuses a masked row on a group prefix PS3.5 does not define as a repeating group,
rather than printing it and carrying on. That refusal is what closes the class: the previous
behaviour was to drop such a row in silence, which is exactly how these three rows went missing. It
is proven by mutation, not by assertion: against a Table E.1-1 carrying an injected `(7Fxx,0010)`
family row the previous generator exits 0 and drops it, and the current one exits 1 and names the
prefix. A second mutation moves the Overlay Comments Basic Profile code from `X` to `K` and asserts
the emitted rule moves with it, so the action codes are read from the document rather than assumed.
Every run prints the rules it emitted, the concrete groups each covers, and the counts behind both.

Also documented rather than changed: `RetainLongitudinalTemporal` collapses PS3.15's two E.3.6
sub-options into one name and carries the **full-dates** column, the less protective of the two. The
two columns disagree on 169 of Table E.1-1's rows, and on every one of them full-dates keeps the real
value where modified-dates would clean it. The option's documentation now says so, and says that date
shifting is not performed at this layer.
