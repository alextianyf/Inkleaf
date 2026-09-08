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

## 重构前后的性能核对（0.4.6）

2026-09-07（本机日期），Windows、Node 22.20.0。在同一个进程中交替运行重构前提交 `58ff778` 的搜索索引与当前实现：每个规模预热后各测 100 次查询，每次清空查询缓存；交替先后顺序，同时断言结果及排序完全一致。测试包含中英文、路径、多关键词、单字符、未命中和大小写输入。

| Markdown 文件数 | 旧版中位数 | 新版中位数 |  旧版 p95 |  新版 p95 |
| --------------- | ---------: | ---------: | --------: | --------: |
| 10,000          |    3.64 ms |    3.88 ms |   5.09 ms |   5.51 ms |
| 100,000         |   22.42 ms |   22.74 ms |  36.69 ms |  35.92 ms |
| 500,000         |  108.38 ms |  108.71 ms | 159.86 ms | 163.17 ms |

10 万、50 万文件的搜索中位数基本持平；小规模差异低于 0.3 ms。这支持“此次语法整理没有造成明显搜索性能退化”，不能证明所有电脑或所有输入下耗时完全相同。

这组对照测的是**内存索引查询**，不包括磁盘发现、启动、IPC 和界面绘制；对照进程同时持有两份索引。原始报告在本地忽略目录 `artifacts/performance/search-comparison.json`。单独运行当前实现可用 `npm run benchmark`，报告写入 `artifacts/performance/search-benchmark.json`。机器负载和内存压力会影响绝对耗时，因此不同时间的单次成绩不能直接当作回归证据。

`npm run test:desktop` 另外测量 24 次输入到结果绘制帧的耗时，报告在 `artifacts/tests/search-ui-latency.json`。它只使用两个真实文件和重复查询，用来检查完整交互链路，不代表十万文件的端到端测试。隐藏测试窗口的后台节流和系统合成器可能造成约一秒的尾部延迟；这次开发构建的中位数约 49 ms，p95 约 1018 ms，打包后的 0.4.6 同项测试中位数约 34 ms、p95 约 150 ms。不能据此宣称所有交互都在 100 ms 内。

磁盘首次扫描取决于目录数量、权限和硬盘速度。尚未进入索引的文件无法立即返回；界面会区分“正在建立索引”和“没有匹配项”。在 50 万文件的容量上限，宽泛查询可能超过 100 ms 的端到端目标。
