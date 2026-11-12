---
id: compatibility
title: Compatibility
sidebar_label: Compatibility
sidebar_position: 16
description: The DICOM editions this package reads, the transfer syntaxes it supports, the deviations it tolerates, and the source profiles it ships.
---

# Compatibility

The standard this reads is vendored under `vendor/nema/` and SHA-256 pinned, one edition for all three parts: **PS3.5, PS3.6 and PS3.15 2026d**. The shipped data dictionary and de-identification action table are regenerated from them byte-identically in CI. The four native transfer syntaxes, every PS3.5 2026d section A.4 encapsulation syntax and the four JPIP Referenced syntaxes of its sections A.6, A.7, A.11 and A.12 are read, and every other one is refused rather than half-read; the vendor deviations this parser tolerates, and the ones it deliberately does not, are named below rather than left to silence.

## Supported transfer syntaxes

Supported transfer syntaxes (**pixels never decoded** in any of them): the four native ones, Implicit VR LE `1.2.840.10008.1.2`, Explicit VR LE `1.2.840.10008.1.2.1`, Deflated Explicit VR LE `1.2.840.10008.1.2.1.99`, and Explicit VR BE `1.2.840.10008.1.2.2` (retired, legacy-only), plus **every encapsulation syntax PS3.5 2026c section A.4 names**: JPEG Baseline, Extended, Lossless, and Lossless First-Order Prediction; RLE Lossless; JPEG-LS Lossless and Near-Lossless; JPEG 2000 and HTJ2K; MPEG2; MPEG-4 AVC/H.264; HEVC/H.265 Main and Main 10; JPEG XL; Deflated Image Frame Compression; and Encapsulated Uncompressed Explicit VR LE (`Dictionary.uid()` names each UID). An encapsulated object is read under Explicit VR LE rules, as section A.4 requires: its metadata parses in full, and [`readPixelDataFragments`](./recipes.md#read-raw-pixel-data-without-decoding-it) hands back its Basic Offset Table and fragments as raw, **undecoded** bytes. `serializeDicom` writes each of those syntaxes back under the object's own UID, a de-identified object included: the Data Set as Explicit VR LE and the top-level Pixel Data as `OB` of undefined length, its Basic Offset Table and fragment Items byte for byte, then a Sequence Delimitation Item. **The limit sits with it**: a top-level Pixel Data section A.4 does not allow (absent, native, beside Float or Double Float Pixel Data, a stream not ended by its delimiter, an odd or empty Item) is refused with `INVALID_ENCAPSULATED_PIXEL_DATA`, never repaired, so an object read with `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED` is not written. The four JPIP Referenced syntaxes are read for metadata and only read: JPIP Referenced `…1.2.4.94` and JPIP HTJ2K Referenced `…1.2.4.204` (sections A.6 and A.11) under Explicit VR LE rules, and JPIP Referenced Deflate `…1.2.4.95` and JPIP HTJ2K Referenced Deflate `…1.2.4.205` (sections A.7 and A.12) inflated first, under the same decompression cap and inflate fatals as Deflated Explicit VR LE. Such an object carries no Pixel Data; `ds.get("00287FE0")` returns its Pixel Data Provider URL as the `UR` element the file carries, and **the URL is never fetched, resolved or validated**. **The limits sit with it**: `serializeDicom` refuses each of them with `UNSUPPORTED_TRANSFER_SYNTAX`; `deidentify()` refuses each with a `DeidentifyError` whose code is `UNSUPPORTED_TRANSFER_SYNTAX`, because `(0028,7FE0)` has no PS3.15 Table E.1-1 row and would be kept by omission (the refusal keys on the File Meta Transfer Syntax alone, so a non-JPIP object that carries `(0028,7FE0)` is de-identified like any other and keeps it); and an object with no URL, with a top-level Pixel Data, or with a Photometric Interpretation outside the four Values section A.6 allows parses without a code. Every other registered UID is rejected by `parseDicom` with the fatal `UNSUPPORTED_TRANSFER_SYNTAX`, named by its PS3.6 registry name: the SMPTE ST 2110 syntaxes, and every retired UID, the retired JPEG processes included. Deflated Explicit VR LE deflates the whole dataset stream rather than the pixels, and it is inflated on parse.

## Real-world tolerance

At an RSNA-era interoperability test, ~80% of real-world patient CDs failed strict conformance (Clunie / `dciodvfy`). A parser that rejects those files is useless on real integrations, so this one reads liberally and classifies every deviation:

A tolerated deviation is data on the parsed object, not a failure. The synthetic object below was
saved without its 128-byte preamble, and the parse records that as a warning code:

```ts runnable
import { parseDicom } from "@cosyte/dicom";

// A synthetic CT object, saved without its 128-byte preamble: an invented patient and example-root
// UIDs, no real PHI.
const ds = parseDicom(
  Buffer.from(
    "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
    "base64",
  ),
);

ds.warnings.map((w) => w.code); // => ["DICOM_MISSING_PREAMBLE"]
ds.patient.id; // => "MRN-42" /* synthetic */
```

| Tier | Behavior       | When                           | Example codes            |
| ---- | -------------- | ------------------------------ | ------------------------ |
| 0    | Silent         | No deviation detected          | none                     |
| 1    | Auto-handled   | Trivial deviation, no warning  | trailing-space tidy      |
| 2    | Warning        | Recoverable deviation          | `DICOM_MISSING_PREAMBLE` |
| 3    | Fatal (always) | Unrecoverable structural error | `NOT_DICOM_PART_10`      |

Tier-2 warnings are plain data on `ds.warnings`. Each carries a stable string `code`, a `message` looked up from a frozen registry, and a `position` with the byte offset where it occurred, so you can react programmatically. **What a message may contain is stated here as a mechanism rather than as a verdict**, because the verdict form of this paragraph was corrected twice and is deleted rather than tried a third time. The only substitutions into a registry template are structural. `{tag}` renders **only when PS3.6's element registry carries a literal row for that tag**, and `<withheld>` otherwise, so a tag that is private, a Group Length `(gggg,0000)`, a repeating-group member such as `(6000,3000)` Overlay Data, or four bytes a lying Value Length composed out of somebody's value is not echoed. `{vr}` renders only one of the 34 VRs PS3.5 2026c §6.2 defines. **A raw number a header carries is bound out of the factory signature rather than checked, where it is bound at all** (a declared Value Length has neither a shape nor a membership to test), so `DICOM_ODD_LENGTH_VALUE_PADDED` no longer prints the odd length and `DICOM_NONZERO_RESERVED_BYTES` no longer prints the two reserved bytes. **A raw number SHIFTED by a constant the reader can compute is that raw number**, so it is bound the same way: `DICOM_ITEM_CROSSES_SEQUENCE_END` no longer prints how many bytes remained inside the sequence, because that count is the sequence's own declared Value Length less the bytes of the sequence already consumed, and an addition puts it back. **The exceptions are named in one place that is not a record of a past change, and are deliberately not restated here**: the `WARNING_MESSAGES` docblock in [`src/parser/warnings.ts`](https://github.com/cosyte/dicom/blob/main/src/parser/warnings.ts). No count of the copies is quoted, here or there: this package deletes a count it has corrected twice rather than incrementing it. `w.code` and `w.position` carry nothing from the document. **This is a statement about `w.message` and not about the rest of the output**: `DicomParseError.snippet` is still 16 raw source bytes, and `DeidentifyReport`'s value-bearing fields are named on the type. **The cost is real and is not minimized**: on a well-formed file a message about a private, overlay or group-length element no longer names its tag. The element is still in the Data Set under that tag and `position.byteOffset` locates the header.

```ts runnable
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

const ds = parseDicom(Buffer.from("AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAYABDUwIAQ1QQACAATE8GAE1STi00Mg==", "base64"));

const recovered: string[] = [];
for (const w of ds.warnings) {
  if (w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ) {
    // a UN element was recovered as an implicit-VR sequence (CP-246)
    recovered.push(w.code);
  }
}
recovered.length; // => 0
ds.warnings[0]?.code === WARNING_CODES.DICOM_MISSING_PREAMBLE; // => true
```

The Tier-2 codes (`DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_VR_MISMATCH`, `DICOM_DA_LEGACY_FORMAT`, … ) live in [`src/parser/warnings.ts`](https://github.com/cosyte/dicom/blob/main/src/parser/warnings.ts), which is the only place their number is worth reading: it said 26 here while the registry held 29, so the numeral is gone rather than corrected. Narrow on `w.code === WARNING_CODES.…` for typo-free comparisons, or pass `{ onWarning }` to `parseDicom` to stream them.

The Tier-3 fatal codes (`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`) always throw a `DicomParseError`; they represent input the parser cannot meaningfully recover.

**A pair of Tier-2 codes reports a LOSS rather than a tolerated deviation, and both are worth reading before you trust a parsed object.** A parsed Data Set is a map keyed by tag, so a file that carries one tag twice in the same Data Set loses the first element's value: the second replaces it, and the survivor looks exactly like an element the sender wrote once. `DICOM_DUPLICATE_TAG_IN_DATA_SET` is raised at the moment of the replacement, with the byte offset of the header that replaced. **That offset is the surviving element's own `Element.byteOffset`, which makes it a lookup only for a collision at the root**: inside a defined-length Sequence Item `Element.byteOffset` is relative to that item's own slice, so the same number can name an untouched root element and the warning does not tell you which Data Set it came from (`position.contextPath` is not populated by any parser warning). PS3.5 2026c §7.1 requires a tag to occur at most once in a Data Set and §7.5.1 requires the same inside an Item, so it cannot fire on a conformant file: the ordinary way to reach it is a length field that lies, which makes bytes inside somebody's value read as a Data Element header. **The reading is unchanged: last one read still wins, and nothing is guessed for the value that was replaced.** If you see this code, the object is missing something the file contained and no round trip will show you what; treat it as you would a fatal, and raise the file with the sender.

**`DICOM_DUPLICATE_FILE_META_ELEMENT` is the same loss in the `(0002,xxxx)` group, and that group is the one that decides how every following byte is read.** The File Meta group is collected into an array rather than a map, so nothing is overwritten there, but the eight tags this library projects into typed `FileMeta` fields are answered by a **first-match** search and are excluded from `FileMeta.extraElements`, the verbatim residue that gives the group its byte-exact round trip. A second copy of one of those tags is in neither, so it left the object. Two copies of `(0002,0010)` Transfer Syntax UID carrying different UIDs are two different readings of the same file, and the order alone decides which you get. **The pair resolves a repeat the opposite way round, deliberately, because the two readings do: the FIRST copy wins in the File Meta group, the LAST read wins in a Data Set.** Neither reading changed in this release. Unlike the Data Set code, `position.byteOffset` here is unambiguously file-absolute (the File Meta group is never nested), and it locates the copy that was **dropped**, not the survivor. A repeated `(0002,xxxx)` tag this library does not model is silent, because every copy of one is kept in `extraElements` and nothing is dropped, though note that `serializeDicom` then **re-emits both copies**, which is `PRE-EXISTING` and is where this package's round-trip promise and its spec-clean promise disagree. **Two bounds, both `PRE-EXISTING` and neither closed here.** The disclosure covers the group **as the parser delimits it**: a copy an intermediary appended past an honest `(0002,0000)` group length is never a File Meta element to this parser at all, and is relocated into the main Data Set silently. And an over-long or wrong group length is reported by its own codes, not this one.

## Profiles

Real files come from real vendors, and vendors deviate in documented, predictable ways. A **profile** lets you opt into source-specific tolerance without ever risking a wrong decode. Pass one to `parseDicom`:

```ts runnable
import { parseDicom, profiles } from "@cosyte/dicom";

// Resolve Siemens CSA private headers to their real VRs instead of UN.
const ds = parseDicom(Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIADAAVE0GADA5MDAwMAgAUABTSAgAQUNDLTAwMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAAgBVUwIAAQAoAAQAQ1MMAE1PTk9DSFJPTUUyICgAEABVUwIAAAIoABEAVVMCAAACKAAwAERTCAAwLjVcMC41ICgAAAFVUwIAEAAoAAEBVVMCAAwAKAACAVVTAgALACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSA=", "base64"), { profile: profiles.siemens });
ds.patient.id; // => "MRN-42" /* synthetic */
```

A profile bundles three things that only ever **tighten or annotate** a parse, never loosen it past the lenient default:

- **Private-dictionary overlay**: resolves the Implicit VR of vendor private data elements by the file's _live_ Private Creator string (e.g. `"SIEMENS CSA HEADER"`), keyed canonically as `"GGGGxxLL"` (PS3.5 §7.8.1), never a hard-coded block number. (This is why Agfa IMPAX re-assigning blocks still resolves.) An unknown creator degrades to `UN` plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning. The lookup is scoped to one Data Set, and every Sequence Item is its own (PS3.5 §7.5.1, §7.8.1): a block claimed at the root does not resolve an element inside an item, and an element whose block was never claimed in its own Data Set reads `UN` plus `DICOM_PRIVATE_TAG_NO_CREATOR` rather than borrowing a neighbor's VR. Declare the creator in each item that writes private data.
- **Escalations**: Tier-2 warning codes promoted to a thrown `DicomParseError` (a stricter posture), whose `code` is the warning's own code ([Error handling](./error-handling.md#when-a-warning-becomes-a-throw)).
- **Suppressions**: benign, high-volume warning codes silenced for a known-quirky source.

Five built-ins ship under the `profiles` namespace: `ge`, `siemens`, `philips` (vendor overlays, grounded in the public GDCM / dcm4che / dcm2niix dictionaries) and `strict` / `lenient` (posture presets). Build your own with `defineProfile()`. It validates input, composes via `extends`, and returns a frozen profile:

```ts runnable
import { defineProfile, profiles } from "@cosyte/dicom";

const acmeStrict = defineProfile({
  name: "acme-strict",
  extends: profiles.strict,
  privateTags: {
    "ACME PRIV 01": { "0019XX10": { vr: "DS", keyword: "AcmeDose", name: "ACME Dose" } },
  },
});
acmeStrict.name; // => "acme-strict"
```

## Exports that grow between releases

The warning registry and the de-identification report gain members as the package grows. Read them so that an addition cannot break your code:

- `WARNING_CODES`, `WarningCode`: adding a member widens the exported union, and with it `DicomParseError.code`, which carries an escalated warning's code. That is additive for a consumer narrowing on a name, and breaking for one with an exhaustive `switch` over the union, so treat the union as open and give a `switch` a `default` branch.
- `DeidentifyReport`: read it by field name.

## Citations on these pages

Our pages name the PS3 clause for the attributes they read, and the rule for which clause they may
name is deliberately narrow.

- **Attribute identity** (tag, name, keyword, VR, VM) is cited to **PS3.6 2026c**, the Registry of
  DICOM Data Elements. The edition **vendored in this repository and pinned by SHA-256**
  (`vendor/nema/part06/`) is **2026d**, which carries every row cited here unchanged and is the copy
  the shipped data dictionary is generated from, and a test re-reads it to confirm that every
  `(gggg,eeee) Name` pair written on these pages is the registry's own.
- **Encoding rules** are cited to **PS3.5 2026c** and **de-identification rules to PS3.15 2026c**.
  The editions vendored and pinned the same way (`vendor/nema/part05/` and `vendor/nema/part15/`)
  are **2026d**, which carries every clause cited here unchanged. A clause written in the form
  `PS3.N §X`, `PS3.N section X`, or `PS3.N Annex X`, with the label next to its part, is resolved in
  the pinned document by collecting all candidate sections carrying that label and requiring exactly
  one. **A label written away from its part is not covered**: a second label in a list
  (`PS3.5 §7.5.1, §7.8.1`) and a bare `section X` whose part was named a sentence earlier are both
  read by a person, not by the check. On top of that, each clause the text leans on for a normative
  statement is required to carry that sentence **in its own body, not in a subsection**, because a
  label proves the label exists and proves nothing about what the body says.
- **No numbered clause of PS3.3, PS3.4, PS3.10 or PS3.16 is cited anywhere on these pages.** Those
  parts are not vendored here, so a clause number for one could not be checked against anything.
  Where an IOD-level or file-format rule matters, the text names the part and says what it relies
  on, without a clause number.
