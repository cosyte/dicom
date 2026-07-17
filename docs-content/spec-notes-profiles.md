---
id: spec-notes-profiles
title: Source & vendor profiles
sidebar_label: Source profiles
sidebar_position: 5
---

# Source & vendor profiles

Real objects come from real vendors, and vendors deviate in documented, predictable ways — private
data elements with implicit VRs, benign quirks emitted at high volume, deviations you want to treat
as hard errors from a trusted sender. A **profile** lets you opt into source-specific tolerance
without ever risking a wrong decode. Pass one to `parseDicom`:

```ts runnable
import { parseDicom, profiles } from "@cosyte/dicom";

const buf = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMjAyNDAxMTUIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);

// Selecting a vendor profile never changes a correct decode — it only tightens
// or annotates. This clean object reads identically with the Siemens overlay.
const ds = parseDicom(buf, { profile: profiles.siemens });

ds.series.modality; // => "CT"
ds.warnings.length; // => 0
```

## What a profile bundles

A profile only ever **tightens or annotates** a parse — it never loosens one past the lenient
default:

- **Private-dictionary overlay** — resolves the Implicit VR of vendor private data elements by the
  object's _live_ private-creator string (canonical `"GGGGxxLL"` key, PS3.5 §7.8.1), never a
  hard-coded block number. A creator the profile does not recognize degrades to `UN` plus a
  `DICOM_PRIVATE_CREATOR_UNKNOWN` warning — never a wrong decode.
- **Escalations** — chosen Tier-2 warning codes promoted to a thrown `DicomParseError`, a stricter
  posture for known-unsafe deviations from a trusted sender.
- **Suppressions** — benign, high-volume warning codes silenced for a known-quirky source.

## The five built-ins

Five profiles ship under the frozen `profiles` namespace: `ge`, `siemens`, `philips` (vendor
overlays) and `strict` / `lenient` (posture presets). They are the [tolerance dial](./spec-notes-tolerance)
made concrete — `strict` escalates, `lenient` suppresses.

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
was already correct. Selecting the wrong vendor overlay costs you resolved private tags — it can
never turn a right answer into a wrong one.
