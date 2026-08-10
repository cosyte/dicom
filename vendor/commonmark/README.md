# vendor/commonmark/

A pinned copy of the **CommonMark specification**, the normative source for what a line is in
`phi-scan-overrides.md` and for the BLOCK rules the PHI gate's override-log parser follows: fenced
code blocks, and the HTML blocks that hide a heading without showing anything at all.

Runtime has zero dependency on this file, and it is not published: `package.json`'s `files` list
ships `dist` only. It is read by `test/scripts/commonmark-pin.test.ts`, which re-hashes it, reads
the version out of the document itself, and locates the normative sentences the gate cites, and by
`test/helpers/commonmark-spec.ts`, which re-hashes it again and reads section 4.6's two TAG LISTS
out of it. A list is the one thing a cited sentence cannot carry, and a table nobody checked against
the document is a table somebody typed.

## Layout

| Path                                    | Status                                                              |
| --------------------------------------- | ------------------------------------------------------------------- |
| `spec/SHA.txt` + `spec/<sha256>/`       | **Active.** Normative source for the line ending, the fence rules and the HTML-block rules. |

One directory per document, each with its own `SHA.txt` and its own `<sha256>/` tree, matching
`vendor/nema/`. New documents go under `<name>/`.

## The document

- **Source:** `https://raw.githubusercontent.com/commonmark/commonmark-spec/0.31.2/spec.txt`
- **Version:** **0.31.2**, dated 2024-01-28 (read from the document's own YAML front matter by the
  test, not asserted here)
- **Author:** John MacFarlane
- **License:** CC-BY-SA 4.0 (`https://creativecommons.org/licenses/by-sa/4.0/`)
- **SHA-256:** in `spec/SHA.txt`

**Why the git tag and not `https://spec.commonmark.org/0.31.2/spec.txt`.** The two documents are
byte-identical apart from the published copy having its YAML front matter stripped, and that front
matter is the only place the document states its own version. Vendoring the copy that carries it is
what lets the pin read the edition from the document rather than from the URL it was fetched with,
which is the same rule `vendor/nema/` follows with its `<subtitle>`.

**Why the whole document.** The same reason `vendor/nema/part15/` vendors all of `part15.xml`
rather than an Annex E slice: the pin can then be verified against the published document byte for
byte. Excerpting would make the hash a fact about our excerpt.

## Has upstream moved?

One content-comparing command, offline-safe to skip:

```sh
curl -sL https://raw.githubusercontent.com/commonmark/commonmark-spec/0.31.2/spec.txt |
  sha256sum | cut -d' ' -f1
```

That must equal `spec/SHA.txt`. A tagged version is immutable, so a mismatch means the tag was
moved, not that a new version exists. There is deliberately **no staleness clock** here: a newer
CommonMark version does not make the cited sentences wrong, and a date gate would red unrelated
PRs (the same rule `vendor/nema/` states).

## What cites it

- `scripts/phi-scan.ts`: `splitCommonMarkLines` (section 2.1, the line ending and the blank line),
  `fenceRun` and `overrideLogPaths` (section 4.5, fenced code blocks), `htmlBlockStart` and
  `htmlBlockCloses` (section 4.6, HTML blocks).
- `test/scripts/commonmark-pin.test.ts`: the precondition, the version, and the section locator.
- `test/helpers/commonmark-spec.ts`: section 4.6's tag lists, read out of the document.
- `documentation/agent-notes/dicom-phi-scan-line-endings.md` and
  `documentation/agent-notes/dicom-phi-scan-html-blocks.md`: the records.
