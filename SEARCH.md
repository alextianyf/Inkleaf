# Local search

The target is an input-to-visible-results response under 100 ms once the relevant files are indexed, without blocking typing during discovery. This is a performance target, not a guarantee on every computer or a claim of parity with Apple's Spotlight. The first disk scan, cached-index loading and PDF generation are separate operations.

## Behavior

- The default scope includes common user folders and automatically discovered local fixed Windows drives. Additional folders and exclusions are saved immediately in tray settings. No administrator elevation or external search application is required.
- Discovery reads directory metadata, not document contents. It skips known system/dependency/cache folders and symbolic links. It searches other hidden folders. Explicitly adding a directory inside a normally skipped ancestor allows that directory to be searched; explicit exclusions always take priority.
- Results include `.md` / `.markdown` files and folders containing indexed Markdown descendants. Folder icons and counts distinguish them. Counts and ancestor metadata update with file additions/removals; no directory scan occurs while typing. Keywords can match portions of the filename and its path, in any order. Ranking is exact filename/stem, filename prefix, all keywords in the filename, then path-assisted matches. Empty input shows no results. Typo correction, pinyin and body-text search are not implemented.
- A worker thread handles the metadata index, queries, scanning and disk writes. Directory discovery is breadth-first in batches of four, so a deep directory does not delay every other location. Matches are available progressively. After restart, the saved index is loaded before checking current disk contents.
- Native filesystem events are coalesced for 200 ms. Changed files update directly; created/renamed directories are reconciled as subtrees. Watch failures, missing event details or overflow are handled with reconciliation. A full background reconciliation also runs every ten minutes; it is not run on each keystroke or every minute.
- Query text and metadata are normalized for case and Unicode compatibility. Shared directory strings are processed once per query. A bounded heap selects the top 80 results without sorting the entire collection. A small cache is invalidated on index changes. Requests carry renderer sequencing so old queries cannot overwrite newer results.
- Index metadata is saved locally and atomically in bounded batches, only when it changes. The index contains paths, never the source text. It is disposable and can be rebuilt after corruption. Query failures and incomplete coverage remain visible in the app.

## Measurements

Development machine, Windows, Node 22.20.0, 2026-09-07 (local date). Synthetic metadata has English and Chinese filenames distributed across project directories. Each size uses 100 uncached queries after warm-up, including broad one-character matches, name fragments, multiple keywords, paths and misses. The current measurements include folder results in the shared top-80 heap. These timings measure search computation only; they exclude disk discovery, startup, IPC and React rendering.

| Indexed Markdown files | Median query | 95th percentile | Maximum |
| --- | ---: | ---: | ---: |
| 10,000 | 2.12 ms | 4.79 ms | 8.40 ms |
| 100,000 | 12.42 ms | 18.25 ms | 19.29 ms |
| 500,000 | 70.25 ms | 103.11 ms | 113.49 ms |

The Electron smoke test separately measures 24 input events through the actual renderer, preload, main process and worker to the results' render frame. Its fixture contains two real Markdown files and alternates repeated queries; this validates the interaction pipeline, not a 100,000-file end-to-end workload. The development run recorded median 50 ms, p95 51.5 ms, maximum 204.5 ms. The final packaged 0.3.0 run recorded median 16.8 ms, p95 49.7 ms, maximum 171.9 ms. Hidden-window compositor scheduling and first-interaction overhead affect these measurements.

Reproduce with `node desktop/test/benchmark.cjs` and `npm run test:desktop`. Reports are in `desktop/test/artifacts/search-benchmark.json` and `search-ui-latency.json`. Disk discovery time depends on directory count, permissions, drive speed and provider availability. Missing or unindexed files cannot be returned instantly; the UI distinguishes discovery in progress from no match. At the 500,000-file capacity limit, broad searches can exceed the 100 ms end-to-end target.
