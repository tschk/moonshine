# Same-authored SFC counter

Run from the repository root after `bun install`, with Python Playwright and
Chromium installed:

```sh
CREPUS_COMPILER=/path/to/crepus BENCHMARK_RESULT=/tmp/sfc-counter.json bun scripts/benchmark-sfc-counter.ts
```

The native compiler must emit DOM/SSR module graphs. The benchmark compiles the
same two unchanged Svelte components through Crepuscularity and Svelte, checks
visible output and retained child identity, then measures production bundles.

It records 25 fresh documents per framework after five warmups, alternating
framework order. Each document contributes its startup observation and 25
serial click-to-DOM-commit observations. Raw document samples, observed clock
resolution, compiler/source/input/bundle hashes and host load are retained.
Warm SSR uses 25 batches of 5,000 fresh synchronous requests after five warmups.

## Recorded run: 2026-10-17

Moonshine runtime commit `9340e19`; local native Crepus 0.16.0 prototype
`4e12d3dbe1682ccb955e43ab1d4f7e0932614c4f2812f35eb133274104abcba5`;
Svelte 5.57.1; Bun 1.4.0; Chromium 151.0.7922.34; Apple M5 Pro.

| Measurement                                           |    Moonshine |       Svelte |
| ----------------------------------------------------- | -----------: | -----------: |
| Browser bundle, gzip level 9                          | 12,903 bytes | 17,344 bytes |
| Server bundle, gzip level 9                           |  4,559 bytes |  9,876 bytes |
| Warm document startup, median                         |       4.3 ms |       5.1 ms |
| Sum of 25 observed click commits per document, median |       1.6 ms |       1.0 ms |
| Warm SSR, median per request                          |     1.988 µs |     0.492 µs |

Bundle sizes are deterministic for the recorded inputs. This workload's native
SSR was about four times slower. Individual click medians were both zero with
an observed clock resolution of 0.1 ms; they cannot establish equal speed.
The click sum excludes gaps between clicks and remains quantized.

Host load averaged about 10.7 with 15 logical CPUs during the run. Small timing
differences need further runs under comparable load. Startup uses a warm browser
and localhost module fetch; paint, cold browser startup, routing, remote network,
asynchronous data and hydration are outside this workload. These results do not
establish a universal smallest or fastest framework.

## Rejected experiment: skip empty SSR attribute scans

A follow-up changed only intrinsic SSR `h` to skip `Object.keys(props ?? {})`
when props are absent. On the unchanged compiled counter this avoided one empty
attribute scan per render. Both versions passed the same 84 scoped tests,
389 assertions and strict type checks; rendered HTML stayed identical.

An alternating paired run used 50 samples per version, 5,000 fresh renders per
sample and five warmups. Baseline median was 2.015 µs; candidate median was
2.042 µs, with the candidate faster in 16 of 50 pairs. The candidate's bundle
changed by +1 raw byte, -2 gzip bytes and +1 Brotli byte. Input and bundle hashes
were checked before/after measurement. Host load was still elevated.

This run demonstrated no speed benefit, so the change was rejected. It does
not establish that the guard is universally slower; the runtime remains
unchanged rather than adding an unproven optimization.
