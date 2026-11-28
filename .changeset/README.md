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

The package is on the 0.1 line and publishes to npm through trusted publishing. Every changeset
is a **patch**, a breaking change included. A change a caller must act on has a paragraph that
opens `What a caller must change:` and says what to edit; a change that needs nothing from callers
carries no such paragraph. The opening sentence becomes one bullet of the GitHub release, so it
stands alone and is at most 400 characters: the release gate refuses a longer one after the version
commit, and nothing publishes.
