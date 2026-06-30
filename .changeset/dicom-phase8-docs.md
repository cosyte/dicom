---
"@cosyte/dicom": patch
---

Phase 8 — pre-publication docs polish. Rewrote `README.md` from a stub into a full developer-facing
guide: quickstart, feature tour, a "DICOM in 90 seconds" primer, the two access patterns (safety-critical
views + keyword/tag `get`), an 80/20 **cookbook** (index a folder, build routing keys, read
pixel-interpretation metadata safely, de-identify, bridge to FHIR `ImagingStudy` / HL7 v2, round-trip
serialize), the four-tier Postel's-Law tolerance model, the full warning/fatal code taxonomy, error
handling for all typed errors, and an explicit known-limitations / non-goals section. Every public export
now carries a JSDoc `@example` (filled the remaining gaps in `src/deident/`). Fixed an `intro.md` snippet
that referenced a nonexistent `ds.pixelData` getter (correct accessor is `ds.get("PixelData")?.value`).
Extended the dual ESM/CJS smoke harnesses to exercise the full Phase 1–7 published surface
(`parseDicom`/`serializeDicom`/`deidentify`/`defineProfile`/`makeUidRemapper`, the five built-in
`profiles`, deterministic UID remapping, and the warning/fatal/serialize/value code registries) so the
documented entrypoints are guaranteed importable from both module systems. Docs-only — no runtime API change.
