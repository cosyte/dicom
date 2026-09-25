---
"@cosyte/dicom": patch
---

`PN`, `LO`, `SH`, `UC`, `ST`, `LT` and `UT` values now decode ISO 2022 code extensions when
`(0008,0005)` Specific Character Set has more than one Value (and Value 1 is not `ISO_IR 192`,
`GB18030` or `GBK`). Every escape sequence in PS3.3's code-extension tables switches G0 or G1, so a
Japanese, Korean or Chinese Person Name comes back as the characters its sender encoded rather than
with escape bytes inside it or JIS bytes read as ASCII. PS3.5 2026d's worked examples H.3-2, I.2-1
and K.2-1 used to come back wrong with no warning; all four examples now decode to the names the
standard prints.

- **Reset points follow PS3.5 section 6.1.2.5.3.** Value 1's designations come back at the start of
  the value, after CR, LF or FF, after the `\` of a multi-valued VR and after the `^` and `=` of
  `PN`. A delimiter counts only as a single byte, never as half of a two-byte character.
- **`decodeText(bytes, terms)`** returns the same characters for a multi-valued term list, with the
  text reset rules (CR, LF and FF).
- **New Tier-2 code `DICOM_CHARSET_ESCAPE_UNDECLARED`**: an escape sequence switches to a set
  `(0008,0005)` does not declare. The bytes are decoded in the set it names.
- **New Tier-2 code `DICOM_CHARSET_BYTES_UNDECODABLE`**: bytes no designated set decodes (an
  unrecognized escape sequence and what follows it, a GR byte with no G1 set, a code the set does
  not define, or a set this runtime cannot decode) read as U+FFFD, never as another set's reading.
  `Element.rawBytes` keeps them.
- **New Tier-2 code `DICOM_CHARSET_EXTENSION_NOT_RESET`**: a line, value or `PN` component ends
  while G0 still holds a set other than Value 1's. The characters are kept and what follows decodes
  from Value 1.
- The three codes ride on `Element.value.warnings`, at most once each per value, and never reach
  `Dataset.warnings` or `onWarning`, so `{ strict: true }` does not refuse such a file. Their
  messages carry the tag and VR only.
- **Unchanged:** a single-valued `(0008,0005)`, a multi-valued one whose Value 1 is `ISO_IR 192`,
  `GB18030` or `GBK`, `resolveDecoderLabel`, `serializeDicom` and `deidentify()`. ISO-IR 14's
  `0x5C` and `0x7E` still read as `\` and `~`.
