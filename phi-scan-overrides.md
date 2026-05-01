# phi-scan bypass log

This file logs every `--allow-fixture <path>` bypass invocation of `scripts/phi-scan.ts`. The scanner refuses to honor a `--allow-fixture <path>` flag UNLESS this file contains an entry referencing the same path. The committed log is intentionally annoying — discourages bypass and creates an audit trail (D-17).

## Format

Each entry is a markdown subsection:

```
### <path>

- **Date:** <YYYY-MM-DD>
- **Reason:** <one-line justification>
- **Approved by:** <committer name>
- **Expires:** <YYYY-MM-DD or "permanent">
```

## Entries

(none yet)
