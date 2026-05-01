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
 *
 * UIDs: Innolitics' current revision ships `sops.json` (SOP Class UIDs) but not a
 * comprehensive UID table covering Transfer Syntaxes, Well-Known UIDs, etc. The
 * canonical Transfer Syntax + Well-Known UIDs are sourced from PS3.6 §A.1 / Table A-1
 * directly, hand-curated below as `CURATED_UIDS`, and merged with `sops.json` at
 * generation time. See vendor/innolitics/README.md for rationale.
 *
 * Determinism (DICT-05):
 *   - The header comment uses ONLY the pinned Innolitics SHA + the input file
 *     SHA-256 — NEVER `Date.now()` or `new Date()`.
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
const OUT_DIR = join(REPO_ROOT, "src", "dictionary", "generated");

// -----------------------------------------------------------------------------
// Curated UID table — PS3.6 §A.1 / Table A-1.
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
    name: "RFC 2557 MIME Encapsulation",
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
  // 7-char short SHA — aligned with plan 01-03 (which committed first using 7-char).
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
 * preserve lowercase `x` placeholders verbatim — these are NOT lookable up by
 * concrete tag and are flagged via `repeatingGroup: true`.
 */
function normalizeId(id: string): { tag: string; repeatingGroup: boolean } {
  if (!/^[0-9a-fA-F]{8}$/.test(id) && !/^[0-9a-fxX]{8}$/.test(id)) {
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
// Emitters
// -----------------------------------------------------------------------------

function emitHeader(
  generatorName: string,
  sources: ReadonlyArray<{ path: string; sha256: string }>,
  innoSha: string,
): string {
  const lines: string[] = [
    "/* eslint-disable */",
    "// generated — do not edit by hand.",
    "//",
    `// Generator: scripts/${generatorName}`,
    `// Innolitics dicom-standard SHA (pinned, full): ${innoSha}`,
    "// Inputs (path → SHA-256):",
  ];
  for (const s of sources) {
    lines.push(`//   - ${s.path} → ${s.sha256}`);
  }
  lines.push(
    "//",
    "// Re-generate via `pnpm gen:dictionary`. CI gates byte-identical output.",
    "// See vendor/innolitics/README.md for re-pinning procedure.",
    "",
  );
  return lines.join("\n");
}

interface BuiltEntry {
  readonly tagOrKey: string;
  readonly literal: string;
}

function buildTagsTs(
  attrs: ReadonlyArray<InnoliticsAttribute>,
  innoSha: string,
  attrSha: string,
): { ts: string; tagCount: number; keywordCount: number } {
  // Build entries keyed by tag (concrete or repeating-group placeholder).
  // Multiple attributes can share an id ONLY in retired shadow-cases — collapse
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

  for (const [, a] of seen) {
    const { tag, repeatingGroup } = normalizeId(a.id);
    const vr = parseVr(a.valueRepresentation);
    const retired = a.retired === "Y";

    const fields: string[] = [
      `tag: ${escape(tag)}`,
      `keyword: ${escape(a.keyword)}`,
      `name: ${escape(a.name)}`,
      `vr: [${vr.map(escape).join(", ")}] as const`,
      `vm: ${escape(a.valueMultiplicity)}`,
      `retired: ${retired}`,
    ];
    if (repeatingGroup) fields.push("repeatingGroup: true as const");

    const literal = `{ ${fields.join(", ")} }`;
    entries.push({ tagOrKey: tag, literal });

    // Build reverse map only for concrete tags with non-empty keyword.
    if (!repeatingGroup && a.keyword.length > 0) {
      keywordPairs.push({ keyword: a.keyword, tag });
    }
  }

  // Deterministic sort.
  entries.sort((a, b) => (a.tagOrKey < b.tagOrKey ? -1 : a.tagOrKey > b.tagOrKey ? 1 : 0));
  keywordPairs.sort((a, b) => (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0));

  const tagsTs =
    emitHeader(
      "generate-dictionary.ts",
      [{ path: "vendor/innolitics/<sha>/attributes.json", sha256: attrSha }],
      innoSha,
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
    ) +
    `export const KEYWORDS: { readonly [keyword: string]: string } = {\n` +
    keywordPairs.map((p) => `  ${escape(p.keyword)}: ${escape(p.tag)},`).join("\n") +
    `\n};\n`;

  // We're emitting two files in this single function — return TS for tags and
  // pass keywordsTs out via a side channel by writing directly. Cleaner: split.
  // Keep clean by writing keywords inline here and returning both:
  writeFileSync(join(OUT_DIR, "keywords.ts"), keywordsTs, "utf8");

  return { ts: tagsTs, tagCount: entries.length, keywordCount: keywordPairs.length };
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
    merged.set(s.id, { uid: s.id, name: s.name + " Storage", type: "SOPClass", retired: false });
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

  mkdirSync(OUT_DIR, { recursive: true });

  console.log("[gen:dictionary] building tags + keywords...");
  const { ts: tagsTs, tagCount, keywordCount } = buildTagsTs(attrs, full, attrSha);
  writeFileSync(join(OUT_DIR, "tags.ts"), tagsTs, "utf8");

  console.log("[gen:dictionary] building uids...");
  const { ts: uidsTs, uidCount } = buildUidsTs(sops, full, sopsSha);
  writeFileSync(join(OUT_DIR, "uids.ts"), uidsTs, "utf8");

  console.log(
    `[gen:dictionary] done — tags: ${tagCount}, keywords: ${keywordCount}, uids: ${uidCount}`,
  );
}

try {
  main();
} catch (err) {
  console.error("[gen:dictionary] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
}
