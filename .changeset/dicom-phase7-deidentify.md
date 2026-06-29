---
"@cosyte/dicom": patch
---

Phase 7 — metadata-level de-identification (PS3.15 Annex E). New `deidentify(ds, options?)` applies the
**Basic Application Level Confidentiality Profile** plus the nine metadata-affecting Annex E Options
(`RetainUIDs`, `RetainLongitudinalTemporal`, `RetainPatientCharacteristics`, `RetainDeviceIdentity`,
`RetainInstitutionIdentity`, `RetainSafePrivate`, `CleanDescriptors`, `CleanStructuredContent`,
`CleanGraphics`), driven by the generated Table E.1-1 action map. It is a **pure** function: the input
`Dataset` is never mutated; a fresh de-identified `Dataset` and a value-free `DeidentifyReport` (tags,
keywords, resolved action codes, the UID map, warnings) are returned. Conditional action codes (`Z/D`,
`X/Z`, `X/D`, `X/Z/D`, `X/Z/U*`, `C/X`) collapse to their most-protective leftmost branch (no IOD Type-1
analysis — fail-safe toward more removal). `U`-coded UIDs are remapped to deterministic, content-derived
`2.25` replacements that stay referentially consistent across files (`makeUidRemapper`); kept sequences
are recursively de-identified and **re-encoded** so nested PHI is gone from the serialized bytes too.
Private attributes are removed by default; `RetainSafePrivate` + a `Profile` keeps only creator-recognized
safe private elements. Pixel data is out of scope (deferred to `@cosyte/dicom-pixel`): burned-in
annotation is **warned** (`DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`), never silently passed. New public
exports: `deidentify`, `makeUidRemapper`, `DEFAULT_UID_ROOT`, `DEIDENTIFY_OPTIONS`,
`DEIDENTIFY_ERROR_CODES`, `DeidentifyError`, and the types `UidRemapper`, `AppliedAction`,
`DeidentifiedAttribute`, `DeidentifyErrorCode`, `DeidentifyOption`, `DeidentifyOptions`,
`DeidentifyReport`, `DeidentifyResult`.
