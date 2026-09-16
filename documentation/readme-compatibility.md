`README.md` links here from its own `## Compatibility` heading. Every section below carries the heading it carries there.

## Compatibility

The standard this reads is **DICOM PS3 2026c**: PS3.5, PS3.6 and PS3.15 are vendored under `vendor/nema/`, SHA-256 pinned, and the shipped data dictionary and de-identification action table are regenerated from them byte-identically in CI. Four transfer syntaxes are supported and every other one is refused rather than half-read; the vendor deviations this parser tolerates, and the ones it deliberately does not, are named below rather than left to silence.

### Supported transfer syntaxes

Supported transfer syntaxes, and **exactly** these four (**pixels never decoded** in any of them): Implicit VR LE `1.2.840.10008.1.2`, Explicit VR LE `…1.2.1`, Deflated Explicit VR LE `…1.2.1.99`, Explicit VR BE `…1.2.2` (retired, legacy-only). Any other UID, which includes every pixel-compressed syntax (JPEG, JPEG-LS, JPEG2000, RLE, HTJ2K), is rejected by `parseDicom` with the fatal `UNSUPPORTED_TRANSFER_SYNTAX` rather than read structurally. Deflated is the one compressed syntax in the supported set: it deflates the whole dataset stream rather than the pixels, and it is inflated on parse.

### Real-World Tolerance

At an RSNA-era interoperability test, ~80% of real-world patient CDs failed strict conformance (Clunie / `dciodvfy`). A parser that rejects those files is useless on real integrations, so this one reads liberally and classifies every deviation:

| Tier | Behavior       | When                           | Example codes            |
| ---- | -------------- | ------------------------------ | ------------------------ |
| 0    | Silent         | Spec-compliant input           | none                     |
| 1    | Auto-handled   | Trivial deviation, no warning  | trailing-space tidy      |
| 2    | Warning        | Recoverable deviation          | `DICOM_MISSING_PREAMBLE` |
| 3    | Fatal (always) | Unrecoverable structural error | `NOT_DICOM_PART_10`      |

Tier-2 warnings are plain data on `ds.warnings`. Each carries a stable string `code`, a `message` looked up from a frozen registry, and a `position` with the byte offset where it occurred, so you can react programmatically. **What a message may contain is stated here as a mechanism rather than as a verdict**, because the verdict form of this paragraph was corrected twice and is deleted rather than tried a third time. The only substitutions into a registry template are structural. `{tag}` renders **only when PS3.6's element registry carries a literal row for that tag**, and `<withheld>` otherwise, so a tag that is private, a Group Length `(gggg,0000)`, a repeating-group member such as `(6000,3000)` Overlay Data, or four bytes a lying Value Length composed out of somebody's value is not echoed. `{vr}` renders only one of the 34 VRs PS3.5 2026c §6.2 defines. **A raw number a header carries is bound out of the factory signature rather than checked, where it is bound at all** - a declared Value Length has neither a shape nor a membership to test - so `DICOM_ODD_LENGTH_VALUE_PADDED` no longer prints the odd length and `DICOM_NONZERO_RESERVED_BYTES` no longer prints the two reserved bytes. **A raw number SHIFTED by a constant the reader can compute is that raw number**, so it is bound the same way: `DICOM_ITEM_CROSSES_SEQUENCE_END` no longer prints how many bytes remained inside the sequence, because that count is the sequence's own declared Value Length less the bytes of the sequence already consumed, and an addition puts it back. **The exceptions are named in one place that is not a record of a past change, and are deliberately not restated here** - the `WARNING_MESSAGES` docblock in [`src/parser/warnings.ts`](../src/parser/warnings.ts). No count of the copies is quoted, here or there: this package deletes a count it has corrected twice rather than incrementing it. `w.code` and `w.position` carry nothing from the document. **This is a statement about `w.message` and not about the rest of the output**: `DicomParseError.snippet` is still 16 raw source bytes, and `DeidentifyReport`'s value-bearing fields are named on the type. **The cost is real and is not minimised**: on a well-formed file a message about a private, overlay or group-length element no longer names its tag. The element is still in the Data Set under that tag and `position.byteOffset` locates the header.

```ts
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";

const ds = parseDicom(buf);
for (const w of ds.warnings) {
  if (w.code === WARNING_CODES.DICOM_UN_PARSED_AS_SQ) {
    // a UN element was recovered as an implicit-VR sequence (CP-246)
  }
}
```

The Tier-2 codes (`DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`, `DICOM_UN_PARSED_AS_SQ`, `DICOM_ODD_LENGTH_VALUE_PADDED`, `DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_VR_MISMATCH`, `DICOM_DA_LEGACY_FORMAT`, … ) live in [`src/parser/warnings.ts`](../src/parser/warnings.ts), which is the only place their number is worth reading: it said 26 here while the registry held 29, so the numeral is gone rather than corrected. Narrow on `w.code === WARNING_CODES.…` for typo-free comparisons, or pass `{ onWarning }` to `parseDicom` to stream them.

The 4 Tier-3 fatal codes (`NOT_DICOM_PART_10`, `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX`, `EMPTY_INPUT`) always throw a `DicomParseError`; they represent input the parser cannot meaningfully recover.

**Two Tier-2 codes report a LOSS rather than a tolerated deviation, and they are worth reading before you trust a parsed object.** A parsed Data Set is a map keyed by tag, so a file that carries one tag twice in the same Data Set loses the first element's value: the second replaces it, and the survivor looks exactly like an element the sender wrote once. `DICOM_DUPLICATE_TAG_IN_DATA_SET` is raised at the moment of the replacement, with the byte offset of the header that replaced. **That offset is the surviving element's own `Element.byteOffset`, which makes it a lookup only for a collision at the root** - inside a defined-length Sequence Item `Element.byteOffset` is relative to that item's own slice, so the same number can name an untouched root element and the warning does not tell you which Data Set it came from (`position.contextPath` is not populated by any parser warning). PS3.5 2026c §7.1 requires a tag to occur at most once in a Data Set and §7.5.1 requires the same inside an Item, so it cannot fire on a conformant file - the ordinary way to reach it is a length field that lies, which makes bytes inside somebody's value read as a Data Element header. **The reading is unchanged: last one read still wins, and nothing is guessed for the value that was replaced.** If you see this code, the object is missing something the file contained and no round trip will show you what; treat it as you would a fatal, and raise the file with the sender.

**`DICOM_DUPLICATE_FILE_META_ELEMENT` is the same loss in the `(0002,xxxx)` group, and that group is the one that decides how every following byte is read.** The File Meta group is collected into an array rather than a map, so nothing is overwritten there - but the eight tags this library projects into typed `FileMeta` fields are answered by a **first-match** search and are excluded from `FileMeta.extraElements`, the verbatim residue that gives the group its byte-exact round trip. A second copy of one of those tags is in neither, so it left the object. Two copies of `(0002,0010)` Transfer Syntax UID carrying different UIDs are two different readings of the same file, and the order alone decides which you get. **The two codes resolve a repeat the opposite way round, deliberately, because the two readings do: the FIRST copy wins in the File Meta group, the LAST read wins in a Data Set.** Neither reading changed in this release. Unlike the Data Set code, `position.byteOffset` here is unambiguously file-absolute - the File Meta group is never nested - and it locates the copy that was **dropped**, not the survivor. A repeated `(0002,xxxx)` tag this library does not model is silent, because every copy of one is kept in `extraElements` and nothing is dropped - though note that `serializeDicom` then **re-emits both copies**, which is `PRE-EXISTING` and is where this package's round-trip promise and its spec-clean promise disagree. **Two bounds, both `PRE-EXISTING` and neither closed here.** The disclosure covers the group **as the parser delimits it**: a copy an intermediary appended past an honest `(0002,0000)` group length is never a File Meta element to this parser at all, and is relocated into the main Data Set silently. And an over-long or wrong group length is reported by its own codes, not this one.

### Profiles

Real files come from real vendors, and vendors deviate in documented, predictable ways. A **profile** lets you opt into source-specific tolerance without ever risking a wrong decode. Pass one to `parseDicom`:

```ts
import { parseDicom, profiles } from "@cosyte/dicom";

// Resolve Siemens CSA private headers to their real VRs instead of UN.
const ds = parseDicom(buf, { profile: profiles.siemens });
```

A profile bundles three things that only ever **tighten or annotate** a parse, never loosen it past the lenient default:

- **Private-dictionary overlay**: resolves the Implicit VR of vendor private data elements by the file's _live_ Private Creator string (e.g. `"SIEMENS CSA HEADER"`), keyed canonically as `"GGGGxxLL"` (PS3.5 §7.8.1), never a hard-coded block number. (This is why Agfa IMPAX re-assigning blocks still resolves.) An unknown creator degrades to `UN` plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning. The lookup is scoped to one Data Set, and every Sequence Item is its own (PS3.5 §7.5.1, §7.8.1): a block claimed at the root does not resolve an element inside an item, and an element whose block was never claimed in its own Data Set reads `UN` plus `DICOM_PRIVATE_TAG_NO_CREATOR` rather than borrowing a neighbour's VR. Declare the creator in each item that writes private data.
- **Escalations**: Tier-2 warning codes promoted to a thrown `DicomParseError` (a stricter posture for known-unsafe deviations).
- **Suppressions**: benign, high-volume warning codes silenced for a known-quirky source.

Five built-ins ship under the `profiles` namespace: `ge`, `siemens`, `philips` (vendor overlays, grounded in the public GDCM / dcm4che / dcm2niix dictionaries) and `strict` / `lenient` (posture presets). Build your own with `defineProfile()`. It validates input, composes via `extends`, and returns a frozen profile:

```ts
import { defineProfile, profiles } from "@cosyte/dicom";

const acmeStrict = defineProfile({
  name: "acme-strict",
  extends: profiles.strict,
  privateTags: {
    "ACME PRIV 01": { "0019XX10": { vr: "DS", keyword: "AcmeDose", name: "ACME Dose" } },
  },
});
```
