---
id: performance
title: Performance
sidebar_label: Performance
sidebar_position: 21
description: "What we measure on @cosyte/dicom (throughput, latency, memory, import cost) and how, the CI gate on scaling, and how to run the benchmarks yourself."
---

# Performance

This page describes what we measure on `@cosyte/dicom`, how we measure it, and how to run the
benchmarks yourself. The shared method every Cosyte package follows (throughput, latency
percentiles, memory, import time and bundle size, and how a pull request is compared with `main`)
is written down in the performance standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

Three things run today: the benchmarks, which compare a pull request's build with its base; the
scaling gates, which fail a pull request when parsing, reading or writing grows faster than its
input; and a reading with a memory profile on a GitHub-hosted runner when the benchmarks change.

What a parse costs depends on what you read. `parseDicom` decodes an element's value the first time
something reads it, and keeps Pixel Data as raw bytes that are never decoded. To index large files,
`readDicomHeader` reads only as far as the Pixel Data; [Recipes](./recipes.md#read-only-the-header-of-a-large-file)
shows it.

## The benchmarks

`bench/dicom.bench.mjs` is our benchmark suite, run by the shared `@cosyte/bench` tool against the
built `dist/index.mjs`, the entry a consumer imports. It measures synthetic files in the shapes real
traffic has, each built in code by `bench/shapes.mjs`:

- a Modality Worklist entry, the small object a modality reads all day;
- a CT slice of 512 by 512 pixels at 16 bits;
- an Enhanced CT series of many frames, at two sizes;
- a header-only structured report of many small tags in Sequences nested four deep.

Each shape is parsed, parsed then read tag by tag, and written. A reading reports throughput,
latency at p50, p95 and p99, allocations, peak heap, a long run for leaks, and the cold import with
its gzip size. The peak heap is the V8 heap only, so Pixel Data, which is a `Buffer`, is not in it:
`bench/profile.mjs` measures each large size's peak resident memory and single-call time in a fresh
process, then profiles the hottest paths. `bench/budgets.mjs` judges each shape's peak memory
against a budget.

`test/perf/bench-shapes.test.ts` holds that every shape reads cleanly and writes back to its own
bytes, so the benchmarks measure correct work.

## In CI

- **On every pull request**, CI builds the base and the head and compares them at each shape's
  first size. The comparison is advisory: it reports, it does not fail.
- **The scaling gates** (`test/perf/scaling-gate.perf.ts`) run in their own job on every pull
  request and fail when `parseDicom`, reading every tag or `serializeDicom` grows faster than its
  input.
- **When `bench/` changes**, `.github/workflows/bench.yml` takes a full reading and a profile on a
  GitHub-hosted runner, one job per shape, and keeps the results as artifacts. It is advisory too.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm bench:reading --out bench-results/reading.json --summary bench-results/reading.md
node bench/budgets.mjs bench-results/reading.json
pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
pnpm bench:profile --out bench-results/profile
pnpm test:perf
```

A reading names the machine it ran on. Compare readings from the same machine only.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
