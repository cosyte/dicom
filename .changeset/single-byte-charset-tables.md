---
"@cosyte/dicom": patch
---

Text under a single-byte Specific Character Set now decodes by that set's own table, byte for byte, so some bytes read as different text than before.

- Under `ISO_IR 100`, and with no `(0008,0005)` or `ISO_IR 6`, the bytes `0x80` to `0x9F` read as
  U+FFFD where they read as windows-1252 characters (`0x80` was the euro sign). PS3.5 section 6.1.1
  says the C1 set shall not be used, so no set defines them. `ISO_IR 148` read them as
  windows-1254 and `ISO_IR 166` read nine of them as windows-874; they read as U+FFFD too.
- With no `(0008,0005)`, an empty one, or `ISO_IR 6`, every byte from `0x80` up reads as U+FFFD:
  the default repertoire is ISO-IR 6 (PS3.5 section 6.1.2.1). A file that writes Latin-1 letters
  without declaring `ISO_IR 100` now reads them as U+FFFD.
- `ISO_IR 13` and `ISO 2022 IR 13` read as JIS X 0201, not Shift_JIS. `0x7E` reads as OVERLINE,
  and `0x5C` as YEN SIGN in `ST`, `LT` and `UT` (PS3.5 section 6.1.2.3); in `PN`, `LO`, `SH` and
  `UC` it still separates Values. A byte past the half-width katakana, `0xE0` to `0xFF`, reads as
  U+FFFD, and two bytes such as `81 5C` no longer read as one kanji.
- `ISO_IR 126` reads `0xA4`, `0xA5` and `0xAA` as U+FFFD, and `ISO_IR 138` reads `0xFD` and
  `0xFE` as U+FFFD: ISO 8859-7:2003 and ISO 8859-8:1999 added those characters after ISO-IR 126 and
  ISO-IR 138 were registered.
- A value holding a byte its single-byte set does not define now carries
  `DICOM_CHARSET_BYTES_UNDECODABLE` on `element.value.warnings`, as one under ISO 2022 code
  extensions already did. `element.rawBytes` keeps the bytes, so a caller that knows a file's real
  encoding can still decode them. `decodeText` returns the same text without the warning.
- `toDicomJson` refuses such a value with `MALFORMED_VALUE`, and `fromDicomJson` refuses text that
  would be written as such a byte with `UNSUPPORTED_CHARACTER_SET`: any character past U+007F under
  the default repertoire, and every C1 code point under `ISO_IR 100`, where 27 of the 32 were
  refused before. `fromDicomJson` also refuses an element in group `FFFF` with `INVALID_JSON`, as
  PS3.5 section 7.8.1 rules it out with the odd groups below `0008`.
- `resolveDecoderLabel` returns the labels it did. They name the nearest WHATWG decoder, which
  `decodeText` no longer uses for a single-byte set.
