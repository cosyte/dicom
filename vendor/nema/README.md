# vendor/nema/

This directory is reserved for the PS3.15 DocBook XML fallback path described in
`.planning/phases/01-project-foundation/01-CONTEXT.md` D-14. The Phase 1 plan 03
discovery sub-task determined the Innolitics-machine-readable path was sufficient —
see `scripts/_annex-e-discovery.md`.

This directory contains only this README and a `.gitkeep` placeholder. If a future
re-pinning needs to switch to the NEMA fallback (because Innolitics drops Annex E
publication), follow plan 03's NEMA-fallback procedure:

1. Download `https://dicom.nema.org/medical/dicom/current/source/docbook/part15/part15.xml`
   (or the Annex-E-only chunk if available).
2. Compute SHA-256 of the file content (`sha256sum part15.xml`).
3. Save as `vendor/nema/<sha-256>/part15-annex-e.xml` (or `part15.xml` if the full
   document is committed).
4. Replace this README with full provenance (URL, retrieval date, full SHA-256, regen
   procedure mirroring `vendor/innolitics/README.md`'s structure).
5. Update `vendor/nema/SHA.txt` with the full 64-char hex SHA-256.
6. Update `scripts/_annex-e-discovery.md` "Resolution" to `NEMA-DocBook-fallback` and
   replace the "Generator input path" with the new XML path.
7. Update `scripts/generate-annex-e.ts` to take the DocBook-XML branch (the generator
   already has a comment-marked seam for the fallback parser).

The SHA pinning in `SHA.txt` and the generator's input-path read in lockstep — they
are committed together so that re-pinning is one PR.
