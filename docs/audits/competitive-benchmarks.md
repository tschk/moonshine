# Competitive size and speed benchmarks

Measured locally on the development host by `bun scripts/benchmark-competitive.ts`.
That script has since been removed as internal-only tooling, so this file is a
dated record of one run rather than a reproducible procedure.

## Environment

- bun: 1.3.14
- os: darwin arm64
- date: 2026-07-31T17:08:13.885Z
- runs per latency measurement: 50 (warmup 5, median + p95)

## Bundle size (minified ESM, browser target)

| bundle                                                    |  bytes |    KiB | note                                                                                                                    |
| --------------------------------------------------------- | -----: | -----: | ----------------------------------------------------------------------------------------------------------------------- |
| Moonshine kernel (signals only)                           |   2903 |   2.83 | packages/core/src/index.ts, minified ESM, browser target                                                                |
| Moonshine island (signals + react bridge, react external) |    412 |   0.40 | island fixture using @tschk/moonshine + react bridge; react/react-dom external; built inside repo so workspace resolves |
| React 19 + react-dom client (tiny fixture)                | 361879 | 353.40 | react@19.1.0 + react-dom@19.1.0, minified ESM, browser target, bundled                                                  |
| Solid 1.9 client (tiny fixture)                           |  38561 |  37.66 | solid-js@1.9.14 + solid-js/web, minified ESM, browser target, bundled                                                   |

## Request latency (localhost, single process, Bun.serve)

| handler                                                   | p50 (ms) | p95 (ms) | note                                         |
| --------------------------------------------------------- | -------: | -------: | -------------------------------------------- |
| Bare Bun.serve text response                              |    0.093 |    0.180 | 50 runs, warmup 5, localhost, single-process |
| Moonshine static route (loader + reactRenderer prerender) |    0.148 |    0.268 | 50 runs, warmup 5, localhost, single-process |
| Moonshine SSR route (loader + stream render)              |    0.105 |    0.218 | 50 runs, warmup 5, localhost, single-process |

## Methodology

- Bundle size: each fixture is built with `Bun.build({ minify: true, format: "esm", target: "browser" })` and the emitted `.js` bytes are summed. Externalized deps (e.g. `react`, `react-dom`) are not counted toward the bundle that ships to the browser for the island fixture; for the React and Solid fixtures all deps are bundled so the comparison reflects what a tiny client app would ship.
- Request latency: each handler runs under `Bun.serve({ port: 0 })` on localhost. After a 5-request warmup, `fetch` round-trip time is recorded for 50 runs. p50 and p95 are reported.
- The bare Bun.serve baseline is the floor: a single `new Response("ok")` with no framework code on the hot path.

## What this does NOT prove

- These numbers do not compare full applications across Astro / Next.js / SvelteKit / Waku / SolidStart. Those frameworks are not installed in this workspace and were not measured here. Cross-framework apples-to-apples comparisons would require equivalent fixtures and the same Bun runtime, which is out of scope for this script.
- The React and Solid "tiny fixture" sizes reflect a minimal client app, not a full site. They are included as reference points for what each renderer adds on top of the Moonshine kernel when you opt in.
- Server latency is measured in a single process on localhost and excludes network and TLS overhead. Production numbers will differ.
- No claim is made about throughput under concurrent load; this is a cold-path latency snapshot.

## Source

- `scripts/benchmark-competitive.ts` — this script.
- `scripts/check-size.ts` — kernel budget gate (12 KiB).
- `scripts/benchmark.ts` — internal discovery / classify / build / startup benchmarks.
