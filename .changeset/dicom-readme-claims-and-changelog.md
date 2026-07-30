---
"@cosyte/dicom": patch
---

**The README documented an API that does not exist: `ds.get` takes a tag and never a keyword, and a pixel-compressed object is refused rather than read structurally.**

`README.md` also now opens with the cosyte social banner for this package (`ASSETS-P8`), as a plain
markdown image above the H1, matching `hl7`, `x12` and `ccda`. The alt text is content rather than
decoration, because it is what a screen reader reads on the npm page. The image URL was re-verified
with `curl -I` as `200 image/png`, 19,456 bytes, rather than taken from the `live` flag in
`assets/published-urls.json`, whose own `$fields.status` note says to read `live` for what it is: a
declaration made on evidence from another repo, never a fact checked there.

Four false claims are corrected on the published surface, and `CHANGELOG.md` is rebuilt so that it
records what each released version contained.

- **Element access.** `Dataset.get` / `has` / `getAll` take the 8-character tag (`"00080060"`,
  case-insensitive) and nothing else, but the README's quickstart, feature list, access-pattern
  section, typed-value examples and Philips vendor note showed `ds.get("Modality")` and
  `ds.get("(0008,0060)")`. Both return `undefined`, and the `Tag` type is `string`, so the compiler
  catches neither. The same defect was corrected in `docs-content/intro.md` before `0.0.3` and the
  README was not swept with it. Every example now uses the tag form, with
  `Dictionary.byKeyword(...)?.tag` shown for resolving a keyword first. `docs-content/spec-notes-model.md`
  separately said `getAll` "returns every element at a repeating tag"; a `Dataset` holds at most one
  element per tag, so it returns 0 or 1, and both pages now say that.
- **Transfer syntaxes.** The README said the supported set was the four v1 syntaxes "and any
  compressed syntax at the structural level (fragments preserved)". The dispatch table holds exactly
  four entries and any other UID is the fatal `UNSUPPORTED_TRANSFER_SYNTAX`, confirmed by parsing a
  synthetic object in `1.2.840.10008.1.2.4.50` and catching the throw. Deflated Explicit VR LE is the
  one compressed syntax in the supported set, because it deflates the dataset stream rather than the
  pixels. The "index a folder of studies" recipe promised that nothing there throws on a quirky file;
  it now names all four Tier-3 conditions a folder walk meets and says to catch `DicomParseError` per
  file and skip.
- **Error count.** The Error Handling section said "four typed errors" and then documented five
  (`DicomParseError`, `DicomValueError`, `DicomSerializeError`, `ProfileDefinitionError`,
  `DeidentifyError`). It also said warnings are never thrown, which a profile's `escalate` list
  contradicts.
- **Published version.** `docs-content/installation.md` and `docs-content/troubleshooting.md` both
  stated the published version as `0.0.1` while npm served `0.0.4`. Neither quotes a version any
  more.

`CHANGELOG.md` carried every entry under `[Unreleased]` across three published releases, and it is
in `package.json#files`, so it shipped inside the tarball telling a consumer that the version they
had installed was unreleased. No entry's substance is rewritten: each is moved to the version that
actually shipped it, reconstructed from the tags, the GitHub releases, and the changesets each
"Version Packages" commit consumed. `0.0.2` gets no heading because it was never published.
