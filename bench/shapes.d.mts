// Types for bench/shapes.mjs, so the scaling gate under test/perf builds its inputs from the same
// code the benchmarks do.

import type { Buffer } from "node:buffer";

/** 1024. */
export declare const KIB: number;
/** 1024 * 1024. */
export declare const MIB: number;
/** A Modality Worklist entry of about 1 KiB, the same length for every index. */
export declare function worklistItem(i: number): Buffer;
/** One CT slice of 512 by 512 by 16-bit native Pixel Data, about 514 KiB. */
export declare function ctImage(i: number): Buffer;
/** An Enhanced CT object of `frames` 512 by 512 by 16-bit frames. */
export declare function enhancedCt(i: number, frames: number): Buffer;
/** A Comprehensive SR of `measurements` NUM content items, every sequence of undefined length. */
export declare function srDocument(i: number, measurements: number): Buffer;
