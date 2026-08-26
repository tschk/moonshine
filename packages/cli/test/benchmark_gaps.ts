import { findManualWork } from "../src/adopt/gaps.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function runBenchmark() {
  const numFiles = 5000;
  const testDir = join(tmpdir(), "moonshine-benchmark-gaps");

  // Cleanup if exists
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });

  const files: string[] = [];
  const dummyContent = `
    export const metadata = { title: "Test" };
    export default async function page() { return <div></div>; }
    "use server"
  `;

  for (let i = 0; i < numFiles; i++) {
    const filename = `file_${i}.tsx`;
    writeFileSync(join(testDir, filename), dummyContent);
    files.push(filename);
  }

  const scan = { framework: "next" as const, routesDir: "app" };

  console.log(`Starting benchmark for ${numFiles} files...`);
  const start = performance.now();

  // Handle both sync (before) and async (after)
  let result = await findManualWork(testDir, files, scan as any);

  const end = performance.now();
  const timeMs = end - start;

  console.log(`Execution time: ${timeMs.toFixed(2)} ms`);
  console.log(`Manual notes count: ${result.length}`);

  // Cleanup
  rmSync(testDir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
