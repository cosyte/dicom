---
"@cosyte/dicom": patch
---

Relocate the README's reference sections into `documentation/`, and the trap list out of `CLAUDE.md`.

The published `README.md` measured 71047 bytes, which is a file nobody reads to the end and which
carries its whole reference surface twice, once here and once in `docs-content/`. The API reference,
the compatibility notes, the cookbook and the full known-limitations list now live in
`documentation/readme-api.md`, `documentation/readme-compatibility.md`,
`documentation/readme-cookbook.md`, `documentation/readme-known-limitations.md` and
`documentation/readme-why-this-exists.md`. `CLAUDE.md`'s trap list moved the same way, into
`documentation/claude-traps.md`.

Nothing was rewritten and nothing was dropped. Every section moved whole, under the heading it
already had, and each heading it left behind now sits above a link to the file it moved to, so every
heading the file carried is still reachable from it. The only edits to moved text are relative links
re-based by one directory, and a link to a `CONTRIBUTING.md` that this repository does not carry,
which is now plain text rather than a link that resolves nowhere.

What stays in the README is what a reader who gets no further has to meet: why the package exists,
the status, install, usage, the PHI and safety statement, the temporal declaration a de-identified
object makes about its own dates, and the two known limitations a consumer acts on. No code, no
public export, no behaviour and no warning code changed.
