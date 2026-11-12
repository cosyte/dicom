---
"@cosyte/dicom": patch
---

PS3.5 is re-pinned to the 2026d edition, so PS3.5, PS3.6 and PS3.15 are now all read from DICOM 2026d.

- The only change between PS3.5 2026c and 2026d is in section 8.2.5 (MPEG2 Main Profile): its
  attribute values move into a new Table 8.2.5-1 that allows single-component `MONOCHROME2` data.
  No tag, UID or transfer syntax was added, changed or removed, and nothing here reads section 8.2.5,
  so parsing, writing and `deidentify()` behave as before.
- The repeating-group bound (section 7.6) and the section A.4 encapsulation syntaxes, 35 UIDs, are
  regenerated from 2026d and are unchanged.
- The `UNSUPPORTED_TRANSFER_SYNTAX` fatal message now names "PS3.5 2026d section A.4" instead of
  2026c. A caller that matches on `code` needs no change; one that matches the message text should
  expect the new edition.
