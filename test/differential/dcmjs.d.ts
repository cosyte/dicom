/**
 * The part of dcmjs the differential test reads. dcmjs ships no type declarations, and it is a
 * development dependency of this test only: nothing under `src/` imports it.
 */
declare module "dcmjs" {
  /** One element of a dcmjs data set: its VR, its formatted values, and the values as read. */
  export interface DcmjsElement {
    readonly vr: string;
    readonly Value?: readonly unknown[];
    readonly _rawValue?: unknown;
  }

  /** A dcmjs data set: elements keyed by eight upper-case hex digits. */
  export type DcmjsDict = Readonly<Record<string, DcmjsElement>>;

  /** What `DicomMessage.readFile` returns: the File Meta group and the Data Set. */
  export interface DcmjsDicomDict {
    readonly meta: DcmjsDict;
    readonly dict: DcmjsDict;
  }

  export interface ReadFileOptions {
    readonly ignoreErrors?: boolean;
    readonly untilTag?: string | null;
    readonly includeUntilTagValue?: boolean;
    readonly noCopy?: boolean;
    readonly forceStoreRaw?: boolean;
  }

  export const data: {
    readonly DicomMessage: {
      readFile(buffer: ArrayBuffer, options?: ReadFileOptions): DcmjsDicomDict;
    };
  };

  export const log: {
    setLevel(level: "silent" | "error" | "warn" | "info" | "debug" | "trace"): void;
    getLogger(name: string): { setLevel(level: "silent"): void };
  };
}
