/**
 * The Node built-in modules the package uses on only some paths, loaded the first time one of
 * those paths runs rather than when the package loads.
 *
 * `node:zlib` (a Deflated transfer syntax, read or written) and `node:crypto` (the UID remap in
 * `deidentify`) together cost a cold import about as much as the rest of the package, and a read
 * of an uncompressed file uses neither. `node:fs/promises` is used only by `readDicomHeader` given
 * a path. Each is loaded once, synchronously, and kept.
 * `process.getBuiltinModule` does it on Node 22.3 and later; on an earlier Node 22 a `require`
 * made for the purpose does it, which resolves a built-in without reading the file system.
 *
 * @internal
 * @module
 */

import { createRequire } from "node:module";
import type * as Crypto from "node:crypto";
import type * as FsPromises from "node:fs/promises";
import type * as Zlib from "node:zlib";

/** `process.getBuiltinModule`, which Node added in 22.3. */
type GetBuiltinModule = (id: string) => unknown;

/**
 * Load the built-in module `id`, through `getBuiltinModule` when the running Node has one.
 *
 * @internal
 */
export function loadBuiltin(id: "node:zlib" | "node:crypto" | "node:fs/promises"): unknown {
  const getBuiltinModule = (process as { getBuiltinModule?: GetBuiltinModule }).getBuiltinModule;
  if (typeof getBuiltinModule === "function") return getBuiltinModule.call(process, id);
  // A built-in resolves the same from any directory, so the one a require is made for is moot.
  return createRequire(`${process.cwd()}/`)(id);
}

let zlib: typeof Zlib | undefined;
let crypto: typeof Crypto | undefined;
let fsPromises: typeof FsPromises | undefined;

/**
 * `node:zlib`, loaded on first use.
 *
 * @internal
 */
export function zlibModule(): typeof Zlib {
  zlib ??= loadBuiltin("node:zlib") as typeof Zlib;
  return zlib;
}

/**
 * `node:crypto`, loaded on first use.
 *
 * @internal
 */
export function cryptoModule(): typeof Crypto {
  crypto ??= loadBuiltin("node:crypto") as typeof Crypto;
  return crypto;
}

/**
 * `node:fs/promises`, loaded on first use.
 *
 * @internal
 */
export function fsPromisesModule(): typeof FsPromises {
  fsPromises ??= loadBuiltin("node:fs/promises") as typeof FsPromises;
  return fsPromises;
}
