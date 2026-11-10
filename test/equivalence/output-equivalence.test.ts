/**
 * Output equivalence: head outputs exactly what the captured tree output, for every document of
 * the corpus in `_output-corpus.ts`.
 *
 * The captured half is committed data (`__data__/output-digests.json`), one SHA-256 per document of
 * everything a caller can observe: the read under every option that changes it, every element and
 * decoded value at every depth, every warning, the domain views, the DICOMDIR tree, the
 * encapsulated fragments, the write and a read of it, and `deidentify` with its report and write,
 * with every error any of them throws. `capture-output-digests.ts` captures it from a ref with
 * `git archive`; re-run at the same ref, the file comes back byte-identical.
 *
 * It exists for changes that make the reader or the writer cheaper and are meant to change nothing
 * else. A change that does mean to change an output re-captures the digests at the ref that ships
 * it, and says so.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as head from "../../src/index.js";
import { digestOf, outputCorpus, recordOf } from "./_output-corpus.js";

interface CapturedFile {
  readonly base: string;
  readonly documents: Readonly<Record<string, string>>;
}

const captured = JSON.parse(
  readFileSync(new URL("./__data__/output-digests.json", import.meta.url), "utf8"),
) as CapturedFile;

describe("output equivalence with the captured tree", () => {
  const corpus = outputCorpus();

  it("covers the same documents the digests were captured over", () => {
    expect(corpus.map((doc) => doc.name)).toEqual(Object.keys(captured.documents));
  });

  it(
    "outputs exactly what the captured tree output, for every document",
    { timeout: 300_000 },
    () => {
      const differing = corpus
        .filter((doc) => digestOf(recordOf(head, doc)) !== captured.documents[doc.name])
        .map((doc) => doc.name);
      expect(differing).toEqual([]);
    },
  );
});
