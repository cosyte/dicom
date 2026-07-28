#!/usr/bin/env tsx
/**
 * Phase 1 Plan 02 generator: Innolitics dicom-standard JSON + curated PS3.6 §A.1
 * UID table → committed TypeScript modules under `src/dictionary/generated/`.
 *
 * Runs via `pnpm gen:dictionary` (devDep `tsx`). Writes:
 *   - src/dictionary/generated/tags.ts     (Tag → DictionaryEntry)
 *   - src/dictionary/generated/keywords.ts (Keyword → Tag reverse map)
 *   - src/dictionary/generated/uids.ts     (UID → UidEntry)
 *
 * Reads:
 *   - vendor/innolitics/<short-sha>/attributes.json (where <short-sha> = first 7 chars of vendor/innolitics/SHA.txt)
 *   - vendor/innolitics/<short-sha>/sops.json
 *   - vendor/nema/part06/<sha-256>/part06.xml (the PS3.6 DocBook, normative)
 *
 * Authority for the element registry (tags.ts / keywords.ts):
 *   NEMA's PS3.6 DocBook is the normative publication of the Registry of DICOM
 *   Data Elements. Innolitics' `attributes.json` is a convenient regenerated
 *   mirror of it, and its regeneration cadence is not ours to control: at the
 *   pinned revision it is grounded in PS3.6 2024b. So the DocBook is applied as
 *   a **per-field overlay** over the Innolitics base:
 *
 *     - For a tag both sources carry, PS3.6 wins on every field it publishes:
 *       name, keyword, VR, VM, retirement.
 *     - A tag PS3.6 carries and Innolitics does not is ADDED from PS3.6.
 *     - A tag Innolitics carries and PS3.6 does not is KEPT. PS3.6 retires
 *       elements, it does not delete them, so a tag missing from the DocBook is
 *       far more likely to be a parse gap here than a withdrawal there, and
 *       dropping it would turn a decoded element into an unknown one. That is
 *       the wrong direction to fail in. (Today the set is empty.)
 *
 *   The overlay is scoped to the element registry. UIDs stay on the
 *   `sops.json` + CURATED_UIDS path deliberately: this dictionary's UID names
 *   deviate from Table A-1 on purpose (four short forms every DICOM toolkit
 *   uses, and retirement carried as a structured `retired` boolean rather than
 *   a trailing " (Retired)" in the name), and a normative overlay would undo
 *   both. See vendor/nema/README.md.
 *
 *   No entry is ever hand-corrected. A correction that cannot be derived from
 *   fetched normative bytes does not get made here.
 *
 * UIDs: Innolitics' current revision ships `sops.json` (SOP Class UIDs) but not a
 * comprehensive UID table covering Transfer Syntaxes, Well-Known UIDs, etc. The
 * canonical Transfer Syntax + Well-Known UIDs are sourced from PS3.6 §A.1 / Table A-1
 * directly, hand-curated below as `CURATED_UIDS`, and merged with `sops.json` at
 * generation time. See vendor/innolitics/README.md for rationale.
 *
 * Determinism (DICT-05):
 *   - The header comment uses ONLY the pinned Innolitics SHA + the input file
 *     SHA-256 - NEVER `Date.now()` or `new Date()`.
 *   - Entries are sorted lexicographically (tag/keyword/UID).
 *   - All Object.entries / iteration is explicit-sorted before emit.
 *   - Re-running the generator with unchanged inputs produces byte-identical output.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// -----------------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_ROOT = join(REPO_ROOT, "vendor", "innolitics");
const SHA_FILE = join(VENDOR_ROOT, "SHA.txt");
const NEMA_PART06_ROOT = join(REPO_ROOT, "vendor", "nema", "part06");
const NEMA_SHA_FILE = join(NEMA_PART06_ROOT, "SHA.txt");
const OUT_DIR = join(REPO_ROOT, "src", "dictionary", "generated");

// -----------------------------------------------------------------------------
// Curated UID table - PS3.6 §A.1 / Table A-1.
//
// Scope: Transfer Syntax UIDs + Well-Known UIDs + a handful of canonical
// MetaSOPClass / Coding Scheme / Application Context UIDs. SOP Class UIDs come
// from Innolitics sops.json and are merged at generation time.
//
// Stability: this table changes rarely (Transfer Syntax UIDs haven't changed
// meaningfully in 20+ years; new ones are appended for new image compression
// formats). When NEMA publishes a new edition, append entries here and bump the
// pinned Innolitics SHA in the same PR.
// -----------------------------------------------------------------------------

interface CuratedUid {
  readonly uid: string;
  readonly name: string;
  readonly type: UidType;
  readonly retired: boolean;
}

type UidType =
  | "TransferSyntax"
  | "SOPClass"
  | "MetaSOPClass"
  | "WellKnownFrameOfReference"
  | "WellKnownSOPInstance"
  | "CodingScheme"
  | "ApplicationContext"
  | "ServiceClass"
  | "Other";

const CURATED_UIDS: readonly CuratedUid[] = [
  // ---- Transfer Syntaxes (PS3.6 §A.1, PS3.5 §10) ----
  {
    uid: "1.2.840.10008.1.2",
    name: "Implicit VR Little Endian",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.1",
    name: "Explicit VR Little Endian",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.1.98",
    name: "Encapsulated Uncompressed Explicit VR Little Endian",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.1.99",
    name: "Deflated Explicit VR Little Endian",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.2",
    name: "Explicit VR Big Endian",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.50",
    name: "JPEG Baseline (Process 1)",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.51",
    name: "JPEG Extended (Process 2 & 4)",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.52",
    name: "JPEG Extended (Process 3 & 5)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.53",
    name: "JPEG Spectral Selection, Non-Hierarchical (Process 6 & 8)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.54",
    name: "JPEG Spectral Selection, Non-Hierarchical (Process 7 & 9)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.55",
    name: "JPEG Full Progression, Non-Hierarchical (Process 10 & 12)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.56",
    name: "JPEG Full Progression, Non-Hierarchical (Process 11 & 13)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.57",
    name: "JPEG Lossless, Non-Hierarchical (Process 14)",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.58",
    name: "JPEG Lossless, Non-Hierarchical (Process 15)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.59",
    name: "JPEG Extended, Hierarchical (Process 16 & 18)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.60",
    name: "JPEG Extended, Hierarchical (Process 17 & 19)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.61",
    name: "JPEG Spectral Selection, Hierarchical (Process 20 & 22)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.62",
    name: "JPEG Spectral Selection, Hierarchical (Process 21 & 23)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.63",
    name: "JPEG Full Progression, Hierarchical (Process 24 & 26)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.64",
    name: "JPEG Full Progression, Hierarchical (Process 25 & 27)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.65",
    name: "JPEG Lossless, Hierarchical (Process 28)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.66",
    name: "JPEG Lossless, Hierarchical (Process 29)",
    type: "TransferSyntax",
    retired: true,
  },
  {
    uid: "1.2.840.10008.1.2.4.70",
    name: "JPEG Lossless, Non-Hierarchical, First-Order Prediction (Process 14 [Selection Value 1])",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.80",
    name: "JPEG-LS Lossless Image Compression",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.81",
    name: "JPEG-LS Lossy (Near-Lossless) Image Compression",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.90",
    name: "JPEG 2000 Image Compression (Lossless Only)",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.91",
    name: "JPEG 2000 Image Compression",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.92",
    name: "JPEG 2000 Part 2 Multi-component Image Compression (Lossless Only)",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.93",
    name: "JPEG 2000 Part 2 Multi-component Image Compression",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.94",
    name: "JPIP Referenced",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.95",
    name: "JPIP Referenced Deflate",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.100",
    name: "MPEG2 Main Profile / Main Level",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.100.1",
    name: "Fragmentable MPEG2 Main Profile / Main Level",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.101",
    name: "MPEG2 Main Profile / High Level",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.101.1",
    name: "Fragmentable MPEG2 Main Profile / High Level",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.102",
    name: "MPEG-4 AVC/H.264 High Profile / Level 4.1",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.102.1",
    name: "Fragmentable MPEG-4 AVC/H.264 High Profile / Level 4.1",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.103",
    name: "MPEG-4 AVC/H.264 BD-compatible High Profile / Level 4.1",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.103.1",
    name: "Fragmentable MPEG-4 AVC/H.264 BD-compatible High Profile / Level 4.1",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.104",
    name: "MPEG-4 AVC/H.264 High Profile / Level 4.2 For 2D Video",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.104.1",
    name: "Fragmentable MPEG-4 AVC/H.264 High Profile / Level 4.2 For 2D Video",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.105",
    name: "MPEG-4 AVC/H.264 High Profile / Level 4.2 For 3D Video",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.105.1",
    name: "Fragmentable MPEG-4 AVC/H.264 High Profile / Level 4.2 For 3D Video",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.106",
    name: "MPEG-4 AVC/H.264 Stereo High Profile / Level 4.2",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.106.1",
    name: "Fragmentable MPEG-4 AVC/H.264 Stereo High Profile / Level 4.2",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.107",
    name: "HEVC/H.265 Main Profile / Level 5.1",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.108",
    name: "HEVC/H.265 Main 10 Profile / Level 5.1",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.110",
    name: "JPEG XL Lossless",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.111",
    name: "JPEG XL JPEG Recompression",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.4.112",
    name: "JPEG XL",
    type: "TransferSyntax",
    retired: false,
  },
  { uid: "1.2.840.10008.1.2.5", name: "RLE Lossless", type: "TransferSyntax", retired: false },
  {
    uid: "1.2.840.10008.1.2.6.1",
    // Lowercase "encapsulation" is what PS3.6 Table A-1 prints, verified against
    // PS3.6 2026c. The capitalized form here was the only remaining name in this
    // table that did not match the standard character for character.
    name: "RFC 2557 MIME encapsulation",
    type: "TransferSyntax",
    retired: true,
  },
  { uid: "1.2.840.10008.1.2.6.2", name: "XML Encoding", type: "TransferSyntax", retired: true },
  {
    uid: "1.2.840.10008.1.2.7.1",
    name: "SMPTE ST 2110-20 Uncompressed Progressive Active Video",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.7.2",
    name: "SMPTE ST 2110-20 Uncompressed Interlaced Active Video",
    type: "TransferSyntax",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.2.7.3",
    name: "SMPTE ST 2110-30 PCM Digital Audio",
    type: "TransferSyntax",
    retired: false,
  },

  // ---- Application Contexts ----
  {
    uid: "1.2.840.10008.3.1.1.1",
    name: "DICOM Application Context Name",
    type: "ApplicationContext",
    retired: false,
  },

  // ---- Well-Known SOP Instance UIDs (PS3.6 §A.1) ----
  {
    uid: "1.2.840.10008.1.1",
    name: "Verification SOP Class",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.20.1",
    name: "Storage Commitment Push Model SOP Class",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.20.1.1",
    name: "Storage Commitment Push Model SOP Instance",
    type: "WellKnownSOPInstance",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.40",
    name: "Procedural Event Logging SOP Class",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.40.1",
    name: "Procedural Event Logging SOP Instance",
    type: "WellKnownSOPInstance",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.42",
    name: "Substance Administration Logging SOP Class",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.42.1",
    name: "Substance Administration Logging SOP Instance",
    type: "WellKnownSOPInstance",
    retired: false,
  },

  // ---- Well-Known Frame of Reference UIDs (PS3.6 §A.1) ----
  {
    uid: "1.2.840.10008.1.4.1.1",
    name: "Talairach Brain Atlas Frame of Reference",
    type: "WellKnownFrameOfReference",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.4.1.2",
    name: "SPM2 T1 Frame of Reference",
    type: "WellKnownFrameOfReference",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.4.1.3",
    name: "SPM2 T2 Frame of Reference",
    type: "WellKnownFrameOfReference",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.4.1.4",
    name: "SPM2 PD Frame of Reference",
    type: "WellKnownFrameOfReference",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.4.1.5",
    name: "SPM2 EPI Frame of Reference",
    type: "WellKnownFrameOfReference",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.4.2.1",
    name: "ICBM 452 T1 Frame of Reference",
    type: "WellKnownFrameOfReference",
    retired: false,
  },
  {
    uid: "1.2.840.10008.1.4.2.2",
    name: "ICBM Single Subject MRI Frame of Reference",
    type: "WellKnownFrameOfReference",
    retired: false,
  },

  // ---- Coding Schemes (Part 16) ----
  {
    uid: "1.2.840.10008.2.16.4",
    name: "DICOM Controlled Terminology",
    type: "CodingScheme",
    retired: false,
  },
  {
    uid: "1.2.840.10008.2.16.5",
    name: "Adult Mouse Anatomy Ontology",
    type: "CodingScheme",
    retired: false,
  },
  { uid: "1.2.840.10008.2.16.6", name: "Uberon Ontology", type: "CodingScheme", retired: false },
  {
    uid: "1.2.840.10008.2.16.7",
    name: "Integrated Taxonomic Information System (ITIS) Taxonomic Serial Number (TSN)",
    type: "CodingScheme",
    retired: false,
  },
  {
    uid: "1.2.840.10008.2.16.8",
    name: "Mouse Genome Initiative (MGI)",
    type: "CodingScheme",
    retired: false,
  },
  {
    uid: "1.2.840.10008.2.16.9",
    name: "PubChem Compound CID",
    type: "CodingScheme",
    retired: false,
  },
  { uid: "1.2.840.10008.2.16.10", name: "Dublin Core", type: "CodingScheme", retired: false },
  {
    uid: "1.2.840.10008.2.16.11",
    name: "New York University Melanoma Clinical Cooperative Group",
    type: "CodingScheme",
    retired: false,
  },
  {
    uid: "1.2.840.10008.2.16.12",
    name: "Mayo Clinic Non-radiological Images Specific Body Structure Anatomical Surface Region Guide",
    type: "CodingScheme",
    retired: false,
  },
  {
    uid: "1.2.840.10008.2.16.13",
    name: "Image Biomarker Standardisation Initiative",
    type: "CodingScheme",
    retired: false,
  },
  {
    uid: "1.2.840.10008.2.16.14",
    name: "Radiomics Ontology",
    type: "CodingScheme",
    retired: false,
  },
  { uid: "1.2.840.10008.2.16.15", name: "RadElement", type: "CodingScheme", retired: false },
  { uid: "1.2.840.10008.2.16.16", name: "ICD-11", type: "CodingScheme", retired: false },
  {
    uid: "1.2.840.10008.2.16.17",
    name: "Unified numbering system (UNS) for metals and alloys",
    type: "CodingScheme",
    retired: false,
  },
  {
    uid: "1.2.840.10008.2.16.18",
    name: "Research Resource Identification",
    type: "CodingScheme",
    retired: false,
  },

  // ---- SOP Classes whose sops.json name disagrees with PS3.6 Table A-1 ----
  // Curated entries win on UID collision, so this is where a vendor-input name
  // defect gets corrected against the standard rather than papered over with a
  // blanket transform. One entry qualifies today: Innolitics' sops.json carries
  // "Macular Grid Thickness and Volume Report" for this UID, identical to its
  // `ciod` field and missing the "Storage" suffix that PS3.6 Table A-1 gives
  // it. Every other sops.json name matches Table A-1 verbatim.
  // Source: PS3.6 2026c, Annex A Table A-1 (UID Values), verified 2026-07-28.
  {
    uid: "1.2.840.10008.5.1.4.1.1.79.1",
    name: "Macular Grid Thickness and Volume Report Storage",
    type: "SOPClass",
    retired: false,
  },

  // ---- Query/Retrieve, MWL, Print, Storage Service Classes (canonical SOP Classes) ----
  {
    uid: "1.2.840.10008.5.1.4.1.2.1.1",
    name: "Patient Root Query/Retrieve Information Model - FIND",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.5.1.4.1.2.1.2",
    name: "Patient Root Query/Retrieve Information Model - MOVE",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.5.1.4.1.2.1.3",
    name: "Patient Root Query/Retrieve Information Model - GET",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.5.1.4.1.2.2.1",
    name: "Study Root Query/Retrieve Information Model - FIND",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.5.1.4.1.2.2.2",
    name: "Study Root Query/Retrieve Information Model - MOVE",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.5.1.4.1.2.2.3",
    name: "Study Root Query/Retrieve Information Model - GET",
    type: "SOPClass",
    retired: false,
  },
  {
    uid: "1.2.840.10008.5.1.4.31",
    name: "Modality Worklist Information Model - FIND",
    type: "SOPClass",
    retired: false,
  },
];

// -----------------------------------------------------------------------------
// Standard VR set (PS3.5 §6.2). Includes 64-bit additions OV/SV/UV (DICOM 2018+).
// -----------------------------------------------------------------------------

const STANDARD_VRS: ReadonlySet<string> = new Set([
  "AE",
  "AS",
  "AT",
  "CS",
  "DA",
  "DS",
  "DT",
  "FL",
  "FD",
  "IS",
  "LO",
  "LT",
  "OB",
  "OD",
  "OF",
  "OL",
  "OV",
  "OW",
  "PN",
  "SH",
  "SL",
  "SQ",
  "SS",
  "ST",
  "SV",
  "TM",
  "UC",
  "UI",
  "UL",
  "UN",
  "UR",
  "US",
  "UT",
  "UV",
]);

// -----------------------------------------------------------------------------
// Innolitics raw shape (subset of fields we consume)
// -----------------------------------------------------------------------------

interface InnoliticsAttribute {
  readonly tag: string; // e.g., "(0010,0010)" or "(0020,31XX)"
  readonly name: string; // human display name
  readonly keyword: string; // e.g., "PatientName" or "" for repeating-group/retired
  readonly valueRepresentation: string; // VR or "VR1 or VR2" or "" or "See Note 2"
  readonly valueMultiplicity: string; // VM string preserved verbatim
  readonly retired: "Y" | "N";
  readonly id: string; // 8-char id, lowercase x for repeating groups
}

interface InnoliticsSop {
  readonly name: string;
  readonly id: string; // UID
  readonly ciod: string; // CIOD name (unused for v1)
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function readSha(): { full: string; short: string } {
  const raw = readFileSync(SHA_FILE, "utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(raw)) {
    throw new Error(`vendor/innolitics/SHA.txt must contain a 40-char hex SHA, got: ${raw}`);
  }
  // 7-char short SHA - aligned with plan 01-03 (which committed first using 7-char).
  // Both worktrees converge on the same vendor/innolitics/<short>/ directory at merge.
  return { full: raw, short: raw.slice(0, 7) };
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function readJson<T>(path: string): { data: T; sha: string } {
  const buf = readFileSync(path);
  const data = JSON.parse(buf.toString("utf8")) as T;
  return { data, sha: sha256(buf) };
}

function escape(s: string): string {
  // Emit JSON.stringify form for safe TS string literal embedding.
  return JSON.stringify(s);
}

/**
 * Map an Innolitics id (8-char, possibly with lowercase `x`) to the Tag string
 * we emit. For concrete tags we uppercase. For repeating-group families we
 * preserve lowercase `x` placeholders verbatim - these are NOT lookable up by
 * concrete tag and are flagged via `repeatingGroup: true`.
 */
function normalizeId(id: string): { tag: string; repeatingGroup: boolean } {
  // The `x` alternative admits A-F too: PS3.6 prints repeating-group tags with
  // uppercase hex ((50xx,200A)), and only the mirror happens to be all-lowercase.
  if (!/^[0-9a-fA-F]{8}$/.test(id) && !/^[0-9a-fA-FxX]{8}$/.test(id)) {
    throw new Error(`malformed id: ${id}`);
  }
  if (/[xX]/.test(id)) {
    return { tag: id.toLowerCase(), repeatingGroup: true };
  }
  return { tag: id.toUpperCase(), repeatingGroup: false };
}

/**
 * Parse Innolitics' valueRepresentation field into a VR list.
 *  - "PN" → ["PN"]
 *  - "US or SS" → ["US", "SS"]
 *  - "US or SS or OW" → ["US", "SS", "OW"]
 *  - "" → [] (some retired entries have no VR)
 *  - "See Note 2" → [] (special non-VR entries; flagged with VM but no VR)
 *  - "ALL" / "OB or OW" with non-standard token → filtered to standard-only.
 */
function parseVr(raw: string): string[] {
  if (!raw || raw === "See Note 2") return [];
  const tokens = raw.split(/\s+or\s+/).map((t) => t.trim());
  const valid = tokens.filter((t) => STANDARD_VRS.has(t));
  return valid;
}

// -----------------------------------------------------------------------------
// NEMA PS3.6 DocBook reader (normative source for the element registry).
//
// The four registry tables. Every one of them has the same six columns:
// Tag | Name | Keyword | VR | VM | (retirement / dictionary marker).
// -----------------------------------------------------------------------------

// The character the founder directive bans (U+2014), built from its code point on
// purpose. `scripts/check-no-emdash.sh` scans tracked files for the backslash-u
// escape as well as for the literal byte, so a detector for the character cannot
// spell it either way without reddening the gate that bans it. Do not "simplify"
// this into a string literal. A numeric entity in a future PS3.6 edition would
// decode to this character and land in a generated name, so the check is real.
const EM_DASH = String.fromCodePoint(0x2014);

const NEMA_REGISTRY_TABLES = ["table_6-1", "table_7-1", "table_8-1", "table_9-1"] as const;

/** Lower bound on total registry rows. 2026c has 5,309; a parse that silently
 *  matched a fraction of them must fail rather than quietly shrink the overlay. */
const NEMA_MIN_ROWS = 5000;

interface NormativeElement {
  /** Emitted tag key: uppercase for concrete tags, lowercase for `x` families. */
  readonly tag: string;
  readonly repeatingGroup: boolean;
  readonly name: string;
  readonly keyword: string;
  readonly vr: readonly string[];
  readonly vm: string;
  readonly retired: boolean;
}

function readNemaSha(): string {
  const raw = readFileSync(NEMA_SHA_FILE, "utf8").trim().split(/\s+/)[0] ?? "";
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      `vendor/nema/part06/SHA.txt must contain a 64-char hex SHA-256, got: ${JSON.stringify(raw)}`,
    );
  }
  return raw.toLowerCase();
}

/**
 * Read the pinned DocBook and prove it is the pinned bytes.
 *
 * The Innolitics inputs are hashed only for the provenance header; here the hash
 * is a precondition. A dictionary is exactly the artifact where "the input was
 * swapped and nobody noticed" is unacceptable, and the check costs one hash of a
 * file already being read.
 */
function readNemaPart06(pinnedSha: string): string {
  const path = join(NEMA_PART06_ROOT, pinnedSha, "part06.xml");
  const buf = readFileSync(path);
  const actual = sha256(buf);
  if (actual !== pinnedSha) {
    throw new Error(
      `vendor/nema/part06 pin mismatch:\n  pinned:   ${pinnedSha}\n  on disk:  ${actual}\n` +
        `  file:     ${path}\n` +
        `Re-fetch the DocBook and update SHA.txt, or restore the pinned bytes.`,
    );
  }
  return buf.toString("utf8");
}

/** Pull the edition string out of `<subtitle>DICOM PS3.6 2026c - Data Dictionary</subtitle>`. */
function nemaEdition(xml: string): string {
  const m = /<subtitle>\s*DICOM PS3\.6 ([0-9]{4}[a-z]?) - Data Dictionary\s*<\/subtitle>/.exec(xml);
  if (!m?.[1]) {
    throw new Error(
      "part06.xml: cannot find the `<subtitle>DICOM PS3.6 <edition> - Data Dictionary</subtitle>` " +
        "line. Refusing to generate from a document that does not identify itself as PS3.6.",
    );
  }
  return m[1];
}

/** Slice out one `<table>...</table>` by `xml:id`, counting nesting rather than
 *  taking the first closing tag. */
function extractTable(xml: string, id: string): string {
  const marker = `xml:id="${id}"`;
  const at = xml.indexOf(marker);
  if (at < 0) throw new Error(`part06.xml: no element carries ${marker}`);
  const open = xml.lastIndexOf("<table", at);
  if (open < 0) throw new Error(`part06.xml: ${marker} is not on a <table> element`);
  // The marker must live in that opening tag, not in some later element the
  // backward search happened to skip over. A wrong `open` slices a wrong table.
  const openTag = xml.slice(open, xml.indexOf(">", open) + 1);
  if (!openTag.includes(marker)) {
    throw new Error(`part06.xml: ${marker} is not inside the nearest preceding <table ...>`);
  }

  const scan = /<table\b[^>]*?(\/?)>|<\/table>/g;
  scan.lastIndex = open;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(xml)) !== null) {
    if (m[0] === "</table>") {
      depth -= 1;
      if (depth === 0) return xml.slice(open, m.index + m[0].length);
    } else if (m[1] === "/") {
      // Self-closing <table/> - not a container, and never seen in PS3.6.
      if (m.index === open) throw new Error(`part06.xml: ${id} is a self-closing <table/>`);
    } else {
      depth += 1;
    }
  }
  throw new Error(`part06.xml: unterminated <table> for ${id}`);
}

/** Decode the entity forms DocBook actually uses, and refuse any other. */
function decodeEntities(s: string, where: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    switch (body) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        throw new Error(`part06.xml (${where}): unrecognized entity ${whole}`);
    }
  });
}

/**
 * Cell markup to text. PS3.6 wraps every cell in `<para>` and marks retired rows
 * with `<emphasis role="italic">`; note references are empty `<xref/>` elements.
 * The keyword column carries ZERO WIDTH SPACE (U+200B) as a line-break hint,
 * 13,470 of them in 2026c, and leaving even one in would produce a keyword that
 * looks right and never matches.
 */
function cellText(markup: string, where: string): string {
  // Strip markup to a fixpoint rather than in one pass. A single pass can leave
  // a residue that reassembles into another tag, which is why CodeQL treats a
  // one-shot tag strip as incomplete sanitization. This is a build-time reader
  // of SHA-256-pinned normative bytes and not an HTML sink, so the injection
  // framing does not apply, but the underlying failure does: residue here would
  // become a dictionary keyword. So strip until stable, then refuse anything
  // still carrying markup. Measured on 2026c: identical output to the one-pass
  // form across all 31,854 cells, and no cell legitimately holds `<` or `>`.
  // The check runs BEFORE entity decoding, so a literal `&lt;` cannot trip it.
  let withoutTags = markup;
  for (;;) {
    const next = withoutTags.replace(/<[^<>]*>/g, "");
    if (next === withoutTags) break;
    withoutTags = next;
  }
  if (/[<>]/.test(withoutTags)) {
    throw new Error(
      `part06.xml (${where}): cell still carries markup after stripping: ` +
        JSON.stringify(withoutTags),
    );
  }
  return decodeEntities(withoutTags, where)
    .replace(/\u200B/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Same normalization as {@link normalizeId}, from a PS3.6 `(gggg,eeee)` cell. */
function normalizeNemaTag(cell: string, where: string): { tag: string; repeatingGroup: boolean } {
  const m = /^\(([0-9A-Fa-fxX]{4}),([0-9A-Fa-fxX]{4})\)$/.exec(cell);
  if (!m) throw new Error(`part06.xml (${where}): malformed tag cell ${JSON.stringify(cell)}`);
  return normalizeId(`${m[1]}${m[2]}`);
}

/**
 * VR cell to VR list, strictly. `parseVr` silently drops tokens it does not
 * recognize, which is tolerable for a mirror we are only reading for shape but
 * not for the normative source: a dropped VR is exactly how a dictionary starts
 * mis-reading bytes. An unknown token throws instead.
 */
function parseNemaVr(raw: string, where: string): string[] {
  if (raw === "" || /^See Note/.test(raw)) return [];
  const tokens = raw.split(/\s+or\s+/).map((t) => t.trim());
  for (const t of tokens) {
    if (!STANDARD_VRS.has(t)) {
      throw new Error(`part06.xml (${where}): unknown VR token ${JSON.stringify(t)} in ${raw}`);
    }
  }
  return tokens;
}

/**
 * Parse the four registry tables into normative entries, keyed by lowercase tag
 * so the merge never depends on the hex casing either side happens to print.
 */
function parseNemaRegistry(xml: string): Map<string, NormativeElement> {
  const out = new Map<string, NormativeElement>();

  for (const id of NEMA_REGISTRY_TABLES) {
    const table = extractTable(xml, id);

    // Collect EVERY `<tbody>` section. PS3.6 uses exactly one per table today,
    // but the guard must not assume it: slicing to the first `</tbody>` and then
    // counting `<tr>` opens on that already-truncated slice cannot see rows past
    // it, so a table split across two bodies would drop the second in silence.
    const bodies: string[] = [];
    const bodyScan = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g;
    let bm: RegExpExecArray | null;
    while ((bm = bodyScan.exec(table)) !== null) bodies.push(bm[1] ?? "");
    if (bodies.length === 0) throw new Error(`part06.xml: ${id} has no <tbody>`);
    const bodyOpens = (table.match(/<tbody\b/g) ?? []).length;
    if (bodyOpens !== bodies.length) {
      throw new Error(
        `part06.xml: ${id} has ${bodyOpens} <tbody> opens but ${bodies.length} closed sections`,
      );
    }

    const rows: string[] = [];
    for (const body of bodies) {
      rows.push(...(body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? []));
    }
    if (rows.length === 0) throw new Error(`part06.xml: ${id} has no <tr> rows`);

    // Every `<tr>` in the table must be accounted for as a body row we matched or
    // a header row. That covers all three silent-drop shapes at once: a row the
    // matcher does not recognize (a self-closing `<tr/>`), a row in a second
    // `<tbody>`, and a row sitting outside any `<tbody>` at all.
    const headRows = (table.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/g) ?? []).reduce(
      (n, head) => n + (head.match(/<tr\b/g) ?? []).length,
      0,
    );
    const trOpens = (table.match(/<tr\b/g) ?? []).length;
    if (trOpens !== rows.length + headRows) {
      throw new Error(
        `part06.xml: ${id} has ${trOpens} <tr> opens but matched ${rows.length} body rows ` +
          `plus ${headRows} header rows`,
      );
    }

    for (const row of rows) {
      const cells = (row.match(/<td\b[^>]*?(?:\/>|>[\s\S]*?<\/td>)/g) ?? []).map((c) =>
        cellText(c, id),
      );
      if (cells.length !== 6) {
        throw new Error(
          `part06.xml: ${id} row has ${cells.length} cells, expected 6 ` +
            `(Tag | Name | Keyword | VR | VM | marker): ${JSON.stringify(cells)}`,
        );
      }
      const [tagCell = "", name = "", keyword = "", vrCell = "", vm = "", marker = ""] = cells;
      const { tag, repeatingGroup } = normalizeNemaTag(tagCell, id);

      if (keyword !== "" && !/^[A-Za-z][A-Za-z0-9]*$/.test(keyword)) {
        throw new Error(`part06.xml: ${id} ${tagCell} has a non-identifier keyword: ${keyword}`);
      }
      for (const [field, value] of [
        ["name", name],
        ["keyword", keyword],
      ] as const) {
        if (value.includes(EM_DASH)) {
          throw new Error(
            `part06.xml: ${id} ${tagCell} ${field} carries a banned em dash: ${value}`,
          );
        }
      }

      const key = tag.toLowerCase();
      if (out.has(key)) throw new Error(`part06.xml: duplicate tag ${tagCell} in ${id}`);

      out.set(key, {
        tag,
        repeatingGroup,
        name,
        keyword,
        vr: parseNemaVr(vrCell, `${id} ${tagCell}`),
        vm,
        // The sixth column carries "RET", "RET (2025a)", or a dictionary marker
        // ("DICOS", "DICONDE") that is NOT a retirement. Only RET retires.
        retired: /^RET\b/.test(marker),
      });
    }
  }

  if (out.size < NEMA_MIN_ROWS) {
    throw new Error(
      `part06.xml: parsed only ${out.size} registry rows, expected at least ${NEMA_MIN_ROWS}. ` +
        `The DocBook table shape has probably changed; fix the parser rather than lowering this.`,
    );
  }
  return out;
}

// -----------------------------------------------------------------------------
// Emitters
// -----------------------------------------------------------------------------

function emitHeader(
  generatorName: string,
  sources: ReadonlyArray<{ path: string; sha256: string }>,
  innoSha: string,
  normative?: { edition: string; sha256: string },
): string {
  const lines: string[] = [
    "/* eslint-disable */",
    "// generated - do not edit by hand.",
    "//",
    `// Generator: scripts/${generatorName}`,
    `// Innolitics dicom-standard SHA (pinned, full): ${innoSha}`,
  ];
  if (normative) {
    lines.push(
      `// Normative source: NEMA DICOM PS3.6 ${normative.edition} DocBook (Tables 6-1, 7-1, 8-1, 9-1).`,
      `//   vendor/nema/part06/<sha>/part06.xml → ${normative.sha256}`,
      "//   PS3.6 wins per field over the Innolitics mirror on every tag it publishes.",
    );
  }
  lines.push("// Inputs (path → SHA-256):");
  for (const s of sources) {
    lines.push(`//   - ${s.path} → ${s.sha256}`);
  }
  lines.push(
    "//",
    "// Re-generate via `pnpm gen:dictionary`. CI gates byte-identical output.",
    normative
      ? "// See vendor/innolitics/README.md and vendor/nema/README.md for re-pinning."
      : "// See vendor/innolitics/README.md for re-pinning procedure.",
    "",
  );
  return lines.join("\n");
}

interface BuiltEntry {
  readonly tagOrKey: string;
  readonly literal: string;
}

interface OverlayStats {
  readonly shared: number;
  readonly added: number;
  readonly innoliticsOnly: readonly string[];
  readonly overridden: Readonly<Record<"name" | "keyword" | "vr" | "vm" | "retired", number>>;
  readonly vrOverrides: readonly string[];
}

function buildTagsTs(
  attrs: ReadonlyArray<InnoliticsAttribute>,
  normative: ReadonlyMap<string, NormativeElement>,
  innoSha: string,
  attrSha: string,
  nema: { edition: string; sha256: string },
): { ts: string; tagCount: number; keywordCount: number; stats: OverlayStats } {
  // Build entries keyed by tag (concrete or repeating-group placeholder).
  // Multiple attributes can share an id ONLY in retired shadow-cases - collapse
  // by preferring non-retired, then alphabetical keyword for stability.
  const seen = new Map<string, InnoliticsAttribute>();
  for (const a of attrs) {
    const existing = seen.get(a.id);
    if (!existing) {
      seen.set(a.id, a);
      continue;
    }
    // Prefer current (retired === "N") over retired duplicates; on tie, prefer
    // alphabetically earlier keyword (deterministic).
    const existingRetired = existing.retired === "Y";
    const candRetired = a.retired === "Y";
    if (existingRetired && !candRetired) {
      seen.set(a.id, a);
    } else if (existingRetired === candRetired && a.keyword < existing.keyword) {
      seen.set(a.id, a);
    }
  }

  const entries: BuiltEntry[] = [];
  const keywordPairs: Array<{ keyword: string; tag: string }> = [];

  // Merge: Innolitics supplies the base row, PS3.6 overrides every field it
  // publishes, and PS3.6-only tags are appended below.
  const consumed = new Set<string>();
  const innoliticsOnly: string[] = [];
  const vrOverrides: string[] = [];
  const overridden = { name: 0, keyword: 0, vr: 0, vm: 0, retired: 0 };
  let shared = 0;

  const emit = (
    tag: string,
    repeatingGroup: boolean,
    keyword: string,
    name: string,
    vr: readonly string[],
    vm: string,
    retired: boolean,
  ): void => {
    const fields: string[] = [
      `tag: ${escape(tag)}`,
      `keyword: ${escape(keyword)}`,
      `name: ${escape(name)}`,
      `vr: [${vr.map(escape).join(", ")}] as const`,
      `vm: ${escape(vm)}`,
      `retired: ${retired}`,
    ];
    if (repeatingGroup) fields.push("repeatingGroup: true as const");

    entries.push({ tagOrKey: tag, literal: `{ ${fields.join(", ")} }` });

    // Build reverse map only for concrete tags with non-empty keyword.
    if (!repeatingGroup && keyword.length > 0) {
      keywordPairs.push({ keyword, tag });
    }
  };

  for (const [, a] of seen) {
    const { tag, repeatingGroup } = normalizeId(a.id);
    const norm = normative.get(tag.toLowerCase());

    if (!norm) {
      innoliticsOnly.push(tag);
      emit(
        tag,
        repeatingGroup,
        a.keyword,
        a.name,
        parseVr(a.valueRepresentation),
        a.valueMultiplicity,
        a.retired === "Y",
      );
      continue;
    }

    consumed.add(tag.toLowerCase());
    shared += 1;
    const baseVr = parseVr(a.valueRepresentation);
    if (a.name !== norm.name) overridden.name += 1;
    if (a.keyword !== norm.keyword) overridden.keyword += 1;
    if (baseVr.join("|") !== norm.vr.join("|")) {
      overridden.vr += 1;
      vrOverrides.push(`${tag}: [${baseVr.join(", ")}] -> [${norm.vr.join(", ")}]`);
    }
    if (a.valueMultiplicity !== norm.vm) overridden.vm += 1;
    if ((a.retired === "Y") !== norm.retired) overridden.retired += 1;

    emit(tag, repeatingGroup, norm.keyword, norm.name, norm.vr, norm.vm, norm.retired);
  }

  // PS3.6 tags the mirror has not caught up to yet.
  let added = 0;
  for (const [key, norm] of normative) {
    if (consumed.has(key)) continue;
    added += 1;
    emit(norm.tag, norm.repeatingGroup, norm.keyword, norm.name, norm.vr, norm.vm, norm.retired);
  }

  const stats: OverlayStats = {
    shared,
    added,
    innoliticsOnly: innoliticsOnly.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    overridden,
    vrOverrides,
  };

  // A keyword must resolve to exactly one tag; the reverse map cannot represent
  // a collision, and silently keeping the last one would break `byKeyword`.
  const byKeyword = new Map<string, string>();
  for (const p of keywordPairs) {
    const prior = byKeyword.get(p.keyword);
    if (prior !== undefined && prior !== p.tag) {
      throw new Error(`keyword ${p.keyword} maps to both ${prior} and ${p.tag}`);
    }
    byKeyword.set(p.keyword, p.tag);
  }

  // Deterministic sort.
  entries.sort((a, b) => (a.tagOrKey < b.tagOrKey ? -1 : a.tagOrKey > b.tagOrKey ? 1 : 0));
  keywordPairs.sort((a, b) => (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0));

  const tagsTs =
    emitHeader(
      "generate-dictionary.ts",
      [{ path: "vendor/innolitics/<sha>/attributes.json", sha256: attrSha }],
      innoSha,
      nema,
    ) +
    `import type { DictionaryEntry } from "../types.js";\n\n` +
    `export const TAGS: { readonly [tag: string]: DictionaryEntry } = {\n` +
    entries.map((e) => `  ${escape(e.tagOrKey)}: ${e.literal},`).join("\n") +
    `\n};\n`;

  const keywordsTs =
    emitHeader(
      "generate-dictionary.ts",
      [{ path: "vendor/innolitics/<sha>/attributes.json", sha256: attrSha }],
      innoSha,
      nema,
    ) +
    `export const KEYWORDS: { readonly [keyword: string]: string } = {\n` +
    keywordPairs.map((p) => `  ${escape(p.keyword)}: ${escape(p.tag)},`).join("\n") +
    `\n};\n`;

  // We're emitting two files in this single function - return TS for tags and
  // pass keywordsTs out via a side channel by writing directly. Cleaner: split.
  // Keep clean by writing keywords inline here and returning both:
  writeFileSync(join(OUT_DIR, "keywords.ts"), keywordsTs, "utf8");

  return { ts: tagsTs, tagCount: entries.length, keywordCount: keywordPairs.length, stats };
}

function buildUidsTs(
  sops: ReadonlyArray<InnoliticsSop>,
  innoSha: string,
  sopsSha: string,
): { ts: string; uidCount: number } {
  // Merge curated UIDs with Innolitics SOP class UIDs (sops.json).
  // Curated entries take precedence on UID collision (the curated table is
  // authoritative for SOP classes that also carry a "retired" flag we know
  // about).
  const merged = new Map<string, CuratedUid>();

  for (const s of sops) {
    if (!/^[0-9.]+$/.test(s.id)) {
      throw new Error(`Invalid UID in sops.json: ${s.id}`);
    }
    // `sops.json`'s `name` is already the full PS3.6 Table A-1 "UID Name", e.g.
    // "CT Image Storage" and "Digital X-Ray Image Storage - For Presentation".
    // Appending " Storage" here produced "CT Image Storage Storage" for the 164
    // entries whose name already ends in "Storage", and an equally wrong
    // "... - For Presentation Storage" / "Macular Grid Thickness and Volume
    // Report Storage" for the other 11. Every one of the 175 was wrong. The
    // sibling `ciod` field is the bare CIOD name ("Computed Radiography Image");
    // `name` is not, and never needed a suffix.
    merged.set(s.id, { uid: s.id, name: s.name, type: "SOPClass", retired: false });
  }
  for (const c of CURATED_UIDS) {
    if (!/^[0-9.]+$/.test(c.uid)) {
      throw new Error(`Invalid UID in CURATED_UIDS: ${c.uid}`);
    }
    merged.set(c.uid, c);
  }

  const sorted = [...merged.values()].sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

  const lines = sorted.map((u) => {
    const fields = [
      `uid: ${escape(u.uid)}`,
      `name: ${escape(u.name)}`,
      `type: ${escape(u.type)}`,
      `retired: ${u.retired}`,
    ];
    return `  ${escape(u.uid)}: { ${fields.join(", ")} },`;
  });

  const ts =
    emitHeader(
      "generate-dictionary.ts",
      [{ path: "vendor/innolitics/<sha>/sops.json", sha256: sopsSha }],
      innoSha,
    ) +
    `import type { UidEntry } from "../types.js";\n\n` +
    `export const UIDS: { readonly [uid: string]: UidEntry } = {\n` +
    lines.join("\n") +
    `\n};\n`;

  return { ts, uidCount: sorted.length };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  console.log("[gen:dictionary] resolving pinned Innolitics SHA...");
  const { full, short } = readSha();
  console.log(`[gen:dictionary] SHA: ${full} (short: ${short})`);

  const inputDir = join(VENDOR_ROOT, short);
  const attrPath = join(inputDir, "attributes.json");
  const sopsPath = join(inputDir, "sops.json");

  console.log(`[gen:dictionary] reading ${attrPath}`);
  const { data: attrs, sha: attrSha } = readJson<InnoliticsAttribute[]>(attrPath);
  if (!Array.isArray(attrs) || attrs.length < 3000) {
    throw new Error(
      `attributes.json sanity check failed: expected ≥ 3000 entries, got ${attrs.length}`,
    );
  }
  for (const a of attrs.slice(0, 5)) {
    for (const k of [
      "tag",
      "name",
      "keyword",
      "valueRepresentation",
      "valueMultiplicity",
      "retired",
      "id",
    ] as const) {
      if (!(k in a)) {
        throw new Error(`attributes.json entry missing field "${k}": ${JSON.stringify(a)}`);
      }
    }
  }

  console.log(`[gen:dictionary] reading ${sopsPath}`);
  const { data: sops, sha: sopsSha } = readJson<InnoliticsSop[]>(sopsPath);
  if (!Array.isArray(sops) || sops.length < 100) {
    throw new Error(`sops.json sanity check failed: expected ≥ 100 entries, got ${sops.length}`);
  }

  console.log("[gen:dictionary] resolving pinned NEMA PS3.6 DocBook...");
  const nemaSha = readNemaSha();
  const nemaXml = readNemaPart06(nemaSha);
  const edition = nemaEdition(nemaXml);
  console.log(`[gen:dictionary] PS3.6 edition: ${edition} (sha256 ${nemaSha.slice(0, 12)})`);
  const normative = parseNemaRegistry(nemaXml);
  console.log(`[gen:dictionary] normative registry rows: ${normative.size}`);

  mkdirSync(OUT_DIR, { recursive: true });

  console.log("[gen:dictionary] building tags + keywords...");
  const {
    ts: tagsTs,
    tagCount,
    keywordCount,
    stats,
  } = buildTagsTs(attrs, normative, full, attrSha, { edition, sha256: nemaSha });
  writeFileSync(join(OUT_DIR, "tags.ts"), tagsTs, "utf8");

  // Print the overlay, so a re-pin shows exactly what the normative source moved
  // rather than burying it in a 5,000-line diff.
  console.log(
    `[gen:dictionary] overlay vs PS3.6 ${edition}: ${stats.shared} shared, ${stats.added} added, ` +
      `${stats.innoliticsOnly.length} mirror-only kept`,
  );
  console.log(
    `[gen:dictionary] fields overridden by PS3.6 - name: ${stats.overridden.name}, ` +
      `keyword: ${stats.overridden.keyword}, vr: ${stats.overridden.vr}, ` +
      `vm: ${stats.overridden.vm}, retired: ${stats.overridden.retired}`,
  );
  for (const line of stats.vrOverrides) {
    console.log(`[gen:dictionary]   VR override ${line}`);
  }
  if (stats.innoliticsOnly.length > 0) {
    console.log(`[gen:dictionary]   mirror-only: ${stats.innoliticsOnly.join(", ")}`);
  }

  console.log("[gen:dictionary] building uids...");
  const { ts: uidsTs, uidCount } = buildUidsTs(sops, full, sopsSha);
  writeFileSync(join(OUT_DIR, "uids.ts"), uidsTs, "utf8");

  console.log(
    `[gen:dictionary] done - tags: ${tagCount}, keywords: ${keywordCount}, uids: ${uidCount}`,
  );
}

try {
  main();
} catch (err) {
  console.error("[gen:dictionary] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
}
