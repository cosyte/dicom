---
id: spec-notes-tolerance
title: Tolerance & the warning model
sidebar_label: Tolerance & warnings
sidebar_position: 2
---

# Tolerance & the warning model

Real scanners and archives emit objects that deviate from the letter of the standard in documented,
recoverable ways — odd-length values with no padding, a missing preamble, an off-spec VR, a
group-length that disagrees with reality. `@cosyte/dicom` follows **Postel's Law**: the parser is
liberal (it recovers and records a stable-coded warning), and the serializer is conservative (it
always emits spec-clean Part 10). A recoverable quirk is **never** a silent change and never a throw.

## Two tiers plus a small fatal set

- **Recoverable deviations → a warning.** The parser recovers, keeps the data, and appends a
  `DicomParseWarning` to `ds.warnings` carrying a **stable code** and the **byte offset** where it
  occurred. There are 24 such codes today (e.g. `DICOM_ODD_LENGTH_VALUE_PADDED`,
  `DICOM_MISSING_PREAMBLE`, `DICOM_VR_MISMATCH`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`).
- **Unrecoverable structural corruption → a throw.** Only **four** Tier-3 conditions throw a typed
  `DicomParseError`: `NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, and
  `EMPTY_INPUT`. Everything short of "these bytes are not a readable Part 10 object" is a warning.

```ts runnable
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

// Synthetic object with the 128-byte preamble omitted — a recoverable quirk.
const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==",
  "base64",
);

const ds = parseDicom(buf);

// It parsed — the data is intact...
ds.series.modality; // => "CT"
ds.patient.id; // => "MRN-42"

// ...and the deviation is recorded, not hidden.
ds.warnings.map((w) => w.code); // => ["DICOM_MISSING_PREAMBLE"]
ds.warnings[0]?.code === WARNING_CODES.DICOM_MISSING_PREAMBLE; // => true
typeof ds.warnings[0]?.position?.byteOffset; // => "number"
```

## Fatal input throws a typed error

An unreadable object throws `DicomParseError`, whose `.code` is one of the four fatal codes. Narrow
on it with `err instanceof DicomParseError`:

```ts runnable
import { parseDicom, DicomParseError, FATAL_CODES } from "@cosyte/dicom";

let code: string | undefined;
try {
  parseDicom(Buffer.alloc(0)); // no bytes at all
} catch (err) {
  if (err instanceof DicomParseError) code = err.code;
}

code; // => "EMPTY_INPUT"
code === FATAL_CODES.EMPTY_INPUT; // => true
```

## Positions are PHI-free by construction

Every warning and error carries a **byte offset** (and, for nested elements, the sequence path) —
never the value that triggered it. A `DicomParseError` retains no raw input snippet. You can log the
full `ds.warnings` array without leaking: it holds codes and positions, not patient data. Keep the
same discipline in your own code — log `w.code` and `w.position`, never the element value. See
[Troubleshooting](./troubleshooting) for the full symptom table and the logging posture.

## Escalate when you want strictness

The tolerance posture is not fixed. A [source profile](./spec-notes-profiles) can **escalate** chosen
warning codes to a thrown error (a stricter gate for a trusted sender) or **suppress** benign,
high-volume codes for a known-quirky source — without ever loosening a correct decode. The built-in
`profiles.strict` and `profiles.lenient` are the two ends of that dial.
