---
'@cosyte/dicom': patch
---

Fold the `Known limitations` sidebar category into `Troubleshooting`, so the shipped
`docs-content/sidebars.json` conforms to the documentation IA spine (`DOCS-STALE-BEHIND-IA040`)

No source, no public API and no parse behaviour changes. `docs-content/limitations.md` is not
renamed, not moved and not edited: only its placement in the navigation changes, and the page keeps
its URL, so every existing link to it still resolves.

WHAT SHIPS. The top level of `docs-content/sidebars.json` goes from

    intro, Installation, Quickstart, [Known limitations], Core Concepts, Guides, Troubleshooting

to

    intro, Installation, Quickstart, Core Concepts, Guides, Troubleshooting[troubleshooting, limitations]

`Known limitations` was never on the canonical spine, which is
`[Overview, Installation, Quickstart, Core Concepts, Guides, API Reference, Troubleshooting]`.
The spine's own definition of Troubleshooting is "common error symptoms plus how to debug, plus
Known Limitations if the package surfaces them", so this is the label's canonical home rather than a
workaround for the lint. The two docs now sit under one heading in the order a reader meets them:
`troubleshooting` (what went wrong) then `limitations` (what will never work).

WHY IT WAS URGENT. `docs.cosyte.com` builds the released corpus and lints each package's SHIPPED
sidebar against that spine, in strict mode, where a non-canonical top-level label is a hard error.
A finding inside an ARCHIVED release is downgraded to non-gating info, because immutable bytes have
no remedy diff. The same finding against the CURRENT release gates, because the remedy is exactly
this: cut the next release. So the label sat dormant through `v0.0.14` and became blocking the
moment `v0.0.15` was published and became current. It was not a new defect, and it stopped the whole
site rebuilding, not just this package's pages.

WHICH MEANS THE FIX ONLY LANDS ON A RELEASE. `docs` reads `docs-content/` out of the release
artifact (`docs-content.tar.gz`), never out of `main`, so this changeset is load-bearing rather than
bookkeeping: without a new version the corrected sidebar never reaches the site.

THE CATEGORY IS NOT FORCED OPEN. The deleted category carried `"collapsed": false`, and
`Troubleshooting` deliberately keeps the Docusaurus default instead of inheriting it. That flag
existed to keep a one-item category permanently expanded so `limitations` read like a top-level
page, a need that disappears once the page lives inside a real two-item category. `Core Concepts`
keeps its `"collapsed": false` because it is the five-part reading spine of the package, not a
destination a reader navigates to on purpose.

NO `API Reference` CATEGORY IS AUTHORED HERE, and none may be. The docs site injects it at the
canonical position (immediately before Troubleshooting) from the package's generated API set;
hand-authoring it is a separate hard error in the same lint.
