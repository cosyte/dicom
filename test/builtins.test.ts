/**
 * `node:zlib` and `node:crypto` are loaded on first use, not when the package loads, and either
 * way of loading them hands back the module itself.
 */

import * as crypto from "node:crypto";
import * as zlib from "node:zlib";

import { describe, expect, it } from "vitest";

import { cryptoModule, loadBuiltin, zlibModule } from "../src/builtins.js";

type Process = { getBuiltinModule?: unknown };

describe("the lazily loaded built-ins", () => {
  it("are the modules themselves, loaded once", () => {
    expect(zlibModule().inflateRawSync).toBe(zlib.inflateRawSync);
    expect(zlibModule()).toBe(zlibModule());
    expect(cryptoModule().createHash).toBe(crypto.createHash);
    expect(cryptoModule()).toBe(cryptoModule());
  });

  it("load through process.getBuiltinModule when the running Node has it", () => {
    expect(typeof (process as Process).getBuiltinModule).toBe("function");
    expect((loadBuiltin("node:zlib") as typeof zlib).inflateRawSync).toBe(zlib.inflateRawSync);
  });

  it("load through a require on a Node 22 before getBuiltinModule (22.0 to 22.2)", () => {
    const p = process as Process;
    const saved = p.getBuiltinModule;
    p.getBuiltinModule = undefined;
    try {
      expect((loadBuiltin("node:crypto") as typeof crypto).createHash).toBe(crypto.createHash);
      expect((loadBuiltin("node:zlib") as typeof zlib).deflateRawSync).toBe(zlib.deflateRawSync);
    } finally {
      p.getBuiltinModule = saved;
    }
  });
});
