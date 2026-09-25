/**
 * A synthetic CT object in DICOM Part 10 form: the declared-synthetic patient "Doe^Jane", an
 * invented identifier and issuer, the placeholder study date 1900-01-01, and every UID under the
 * `1.2.826.0.1.3680043.8.498` example root. It carries header attributes only, no pixel data.
 *
 * The bytes are a copy of the first-use fixture (`test/fixtures/first-use/ct-object.ts`), the same
 * object the README and the quickstart parse, stored here as base64 because this repository builds
 * every fixture in a module rather than committing binary files.
 */
import { Buffer } from "node:buffer";

/** The object with its 128-byte preamble and `DICM` magic, as a conformant writer saves it. */
export const SYNTHETIC_CT = Buffer.from(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABESUNNAgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);
