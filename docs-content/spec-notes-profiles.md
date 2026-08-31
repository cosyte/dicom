---
id: spec-notes-profiles
title: Source & vendor profiles
sidebar_label: Source profiles
---

# Source & vendor profiles

Real objects come from real vendors, and vendors deviate in documented, predictable ways: private
data elements with implicit VRs, benign quirks emitted at high volume, deviations you want to treat
as hard errors from a trusted sender. A **profile** lets you opt into source-specific tolerance
without ever risking a wrong decode. Pass one to `parseDicom`:

```ts runnable
import { parseDicom, profiles } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

// Selecting a vendor profile never changes a correct decode. It only tightens
// or annotates. This clean object reads identically with the Siemens overlay.
const ds = parseDicom(buf, { profile: profiles.siemens });

ds.series.modality; // => "CT"
ds.warnings.length; // => 0
```

## What a profile bundles

A profile only ever **tightens or annotates** a parse. It never loosens one past the lenient
default:

- **Private-dictionary overlay**: resolves the Implicit VR of vendor private data elements by the
  object's _live_ private-creator string (canonical `"GGGGxxLL"` key, PS3.5 §7.8.1), never a
  hard-coded block number. A creator the profile does not recognize degrades to `UN` plus a
  `DICOM_PRIVATE_CREATOR_UNKNOWN` warning: never a wrong decode.

  The lookup is **scoped to one Data Set**. PS3.5 §7.8.1 reserves a private block for the Data Set
  its Private Creator element sits in, and §7.5.1 makes every Sequence Item a Data Set of its own,
  so a block claimed at the root does not resolve an element inside an item, an item's claim does
  not resolve one in a sibling item, and neither survives back out to the enclosing Data Set. A
  private element whose block was never claimed in its own Data Set reads `UN` plus
  `DICOM_PRIVATE_TAG_NO_CREATOR`, with `Element.privateCreator` left `undefined`: the bytes are
  still on `Element.rawBytes`, and the profile's typed decode is withheld rather than borrowed from
  a neighbouring Data Set. If you write private data into sequence items, declare the creator in
  each item that uses it. Under `{ strict: true }` that warning is promoted to a thrown
  `DicomParseError` like any other Tier-2 code, so a file whose items borrow an enclosing block
  parses under the lenient default and throws under `strict`.

- **Escalations**: chosen Tier-2 warning codes promoted to a thrown `DicomParseError`, a stricter
  posture for known-unsafe deviations from a trusted sender.
- **Suppressions**: benign, high-volume warning codes silenced for a known-quirky source.

## The five built-ins

Five profiles ship under the frozen `profiles` namespace: `ge`, `siemens`, `philips` (vendor
overlays) and `strict` / `lenient` (posture presets). They are the [tolerance dial](./spec-notes-tolerance)
made concrete: `strict` escalates, `lenient` suppresses.

## Build your own

`defineProfile()` validates its input, composes via `extends`, and returns a **frozen** profile:

```ts runnable
import { defineProfile, profiles } from "@cosyte/dicom";

const acmeStrict = defineProfile({
  name: "acme-strict",
  extends: profiles.strict,
  privateTags: {
    "ACME PRIV 01": {
      "0019XX10": { vr: "DS", keyword: "AcmeDose", name: "ACME Dose" },
    },
  },
});

acmeStrict.name; // => "acme-strict"
Object.isFrozen(acmeStrict); // => true
```

A profile is a value, not a side effect: it never mutates a dataset and never changes a decode that
was already correct. Selecting the wrong vendor overlay costs you resolved private tags. It can
never turn a right answer into a wrong one.

## The exported shapes

| Export                   | What it is                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Profile`                | The frozen profile itself, as `parseDicom` and `deidentify` accept it.                                                                                            |
| `defineProfile`          | Builds one from a validated options object.                                                                                                                       |
| `DefineProfileOptions`   | Those options: `name` (the only required field), `description`, `escalate`, `suppress`, `privateTags`, and `extends` (one profile or several, composed in order).  |
| `ProfilePrivateTags`     | The per-creator overlay: a map of canonical `"GGGGxxLL"` key to `PrivateTagDefinition`, keyed under the private-creator string it belongs to.                      |
| `PrivateTagDefinition`   | One private element's declaration: its `vr`, `keyword` and human-readable `name`.                                                                                 |
| `ProfileDefinitionError` | Thrown by `defineProfile` for an invalid definition (an unknown warning code to escalate, a malformed private-tag key). An author-time error, never a file error.  |

**A profile's declared VR is a second authority, and it is not a licence over what a value nests.**
PS3.15 §E.3.10 lets a de-identifier retain a private *Attribute* it knows to be safe; it does not let
one vouch for a Data Set a sender nested inside that attribute's value. See
[De-identification](./deidentification) for what `RetainSafePrivate` plus a profile does and does not
keep, and [Known limitations](./limitations) for the residuals around it.
