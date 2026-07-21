---
"@cosyte/dicom": patch
---

Correct stale publish-status language in `docs-content/` (`README-ORG-SWEEP`). `installation.md` said
the package was "not yet published to npm" and `troubleshooting.md` carried a "Not yet published … not
on npm; gated on the coordinated public launch" non-goal — both false now that `@cosyte/dicom` is
published on npm at `0.0.1` and public. Both are rewritten to state the truth (published, public, still
pre-alpha on the `0.0.x`-until-first-alpha ladder, install command live), and the troubleshooting
bullet becomes an honest pin-your-version pre-alpha caveat rather than a stale non-goal. Docs-only, no
code or public-surface change.
