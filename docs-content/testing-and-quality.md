---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
sidebar_position: 20
description: "How we test @cosyte/dicom: unit tests, corpora, property tests, fuzzing, mutation testing and the PHI scan, with what each one catches and misses."
---

# Testing and quality

This page describes how we test `@cosyte/dicom`, what each technique catches, and what it cannot.
The shared rules every Cosyte package follows (the coverage and mutation floors, the property-based
runners, what a pull request must prove) are written down in the testing standard in
[cosyte/config](https://github.com/cosyte/config), the repository our shared configuration lives in.
The numbers for the current release are in [Current numbers](#current-numbers) below.

The failure we test hardest against is the quiet one: a header read wrong but plausible, such as a
defaulted rescale slope or a patient identifier from the wrong element, or a de-identified object
that reports itself clean while a name survives in it. So most of what follows checks values and
what leaves the library, not only that the parser did not throw.

## What we run, and what each technique catches

| Technique | What it catches | What it cannot catch |
| --- | --- | --- |
| Unit and integration tests | each documented behavior and failure path of the parser, the dataset model, the value decoders, the writer, the profiles and `deidentify`, run against the source | an input nobody thought to write down |
| Synthetic corpora | a regression on a known object shape: synthetic Part 10 objects under every supported transfer syntax, every fatal input, nested and undefined-length Sequences, DICOMDIR files, encapsulated and JPIP Referenced objects | behavior on real vendor files, since every fixture is synthetic |
| Output equivalence | any change to what a caller can observe, for a fixed corpus: each read, decoded value, warning, view, write and de-identification is hashed and compared with digests captured from an earlier commit | a wrong output that was already wrong when the digests were captured |
| Property-based tests | a whole class of input breaking a stated rule: a parsed object writes back and reads the same, lenient reading never throws except on a fatal code, the model cannot be mutated, and a parse stopped before a tag matches the whole parse up to it | a rule nobody stated; a case outside the cases run; a gap in what the generators produce |
| Fuzzing | a crash or an unexpected throw on hostile input: arbitrary bytes, and synthetic objects with lengths, tags and values mutated | a wrong but plausible result, unless a property states what right is |
| Coverage gate | code no test runs: lines, branches, functions and statements, held at a floor that only rises | a test that runs code without checking what it returns |
| Mutation testing | a test that runs code but would not notice it changing: every mutant in the changed lines of a pull request must be killed or excused inline with its reason | a mutant the mutation tool does not generate |
| Generated data checks | a data dictionary or de-identification table that drifts from the standard: both are regenerated from the SHA-256 pinned NEMA sources under `vendor/nema/` and must come back byte for byte | an error in the published standard itself |
| Spec citation check | a clause cited on these pages that does not exist in the pinned edition, or does not carry the sentence we rely on, and an attribute named differently from the registry | a citation written away from its part, which a person reads instead |
| Doc samples | a documentation sample that no longer matches the code: the samples on these pages run against the built package and their `// =>` values are checked | prose that is wrong beside a sample that is right |
| PHI scan | a realistic patient identifier or a recent date in a fixture, a doc page or a staged file, against a declared allow-list of synthetic values | anything outside the fields and formats it knows; it detects after a write, it does not prevent one |
| Scaling gates | parsing, reading every tag or writing that grows faster than its input | a constant slowdown that keeps the same growth |

## How each one runs

- **Unit tests, corpora, output equivalence, properties and doc samples** run in one Vitest suite
  on every pull request and on `main`, on Node.js 22, 24 and 26. Each property runs 100 cases on a
  pull request and 10,000 in a nightly run, from a new seed each time. Each prints its seed before
  it runs, and a failure prints the seed and path that replay it (`COSYTE_PROPERTY_SEED`,
  `COSYTE_PROPERTY_PATH`). The properties draw from the generators we publish at
  `@cosyte/dicom/arbitraries`; [Property-test your code](./property-testing.md) shows them on code
  of your own.
- **Fuzzing** runs nightly, apart from the pull request suite.
- **The coverage gate** runs with the suite on every pull request. A floor that is not met, or a
  changed line no test ran, fails the pull request.
- **Mutation testing** runs on the changed source files of each pull request, and over all of `src/`
  twice a week, whose score is held to its floor.
- **The generated data checks** run when `vendor/`, the generators or the generated files change.
- **The PHI scan** runs on every commit (a pre-commit hook) and in CI.
- **The scaling gates** run in their own CI job, never under coverage.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm test                 # unit tests, corpora, equivalence, properties and doc samples
pnpm test:coverage        # the same suite with coverage
pnpm quality:check        # hold coverage to the floor in quality-floor.json
pnpm test:property        # the properties, at the depth COSYTE_PROPERTY_RUNS sets
pnpm fuzz                 # the fuzz targets
pnpm test:perf            # the scaling gates
pnpm phi-scan             # the PHI scan over the repository
pnpm gen:clean && pnpm gen:all && git diff --exit-code src/dictionary/generated/
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
