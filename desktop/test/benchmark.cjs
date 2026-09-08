const { performance } = require("node:perf_hooks");
const fs = require("node:fs/promises");
const path = require("node:path");
const { SearchIndex } = require("../search-index.cjs");
async function main() {
  const report = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    scenarios: [],
  };
  for (const count of [10000, 100000, 500000]) {
    const index = new SearchIndex();
    const start = performance.now();
    for (let i = 0; i < count; i++)
      index.upsert(
        path.resolve(
          `benchmark/workspace-${i % 800}/项目-${i % 300}/meeting-notes-计划-${i}.md`,
        ),
      );
    const buildMs = performance.now() - start;
    const queries = [
      "meeting",
      "计划",
      "项目-29 meeting",
      "workspace-123 notes",
      "notes-计划-998",
      "unmatched-file",
      "m",
      "计划 789",
      "99999",
      "MEETING",
    ];
    for (const query of queries) index.search(query);
    const samples = [];
    for (let repeat = 0; repeat < 10; repeat++)
      for (const query of queries) {
        index.cache.clear(); // Distinct uncached queries, not repeated cache hits.
        const began = performance.now();
        index.search(query);
        samples.push(performance.now() - began);
      }
    samples.sort((a, b) => a - b);
    report.scenarios.push({
      markdownFiles: count,
      buildMs: +buildMs.toFixed(2),
      medianMs: +samples[50].toFixed(2),
      p95Ms: +samples[95].toFixed(2),
      maxMs: +samples.at(-1).toFixed(2),
    });
  }
  const target = path.join(__dirname, "artifacts", "search-benchmark.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
