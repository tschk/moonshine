> 2026-07-31: historical record of one `scripts/benchmark.ts` run. That script
> was removed as internal-only tooling in 0.3.2 and these figures cannot be
> reproduced here.

- bun: 1.3.14
- os: darwin arm64
- runs per measurement: 10
- counts: 10, 100, 1000

| routes | discovery (ms) | classification (ms) | manifest (ms) | cold build (ms) | incremental build (ms) | server startup (ms) | static request (ms) | SSR request (ms) |
| -----: | -------------: | ------------------: | ------------: | --------------: | ---------------------: | ------------------: | ------------------: | ---------------: |
|     10 |           0.25 |                1.16 |          0.89 |            4.96 |                   5.51 |                1.07 |                0.21 |             0.20 |
|    100 |           1.50 |                4.33 |          6.10 |           13.14 |                  13.06 |                0.05 |                0.13 |             0.23 |
|   1000 |          11.61 |               37.01 |         51.24 |          107.73 |                  99.74 |                0.98 |                0.14 |             0.78 |
