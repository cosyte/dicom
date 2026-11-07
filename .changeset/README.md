# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump**, the **publish**, and the **release section in `CHANGELOG.md`** for
`@cosyte/dicom`: `config.json` names the changelog generator, so a release writes its own version
heading there from the changesets it consumed. So **the changeset summary is the changelog entry**.
Write it for a reader of the package, and do not hand-edit `CHANGELOG.md`, whose sections above
`## Released before this file was generated` are generated output.

Add a changeset for every change that reaches the published package:

```bash
pnpm changeset
```

The package is on the 0.1 line and publishes to npm through trusted publishing. Below 1.0, a
breaking change takes **minor** and its summary says how to migrate; everything else takes
**patch**. Keep the opening sentence under 200 characters: the release gate refuses a longer one
after the version commit, and nothing publishes. The release standard (Changesets writes the
changelog of every published package) is in the umbrella's `plans/standards.md`.
