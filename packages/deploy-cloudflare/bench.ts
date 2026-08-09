import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

// Sequential implementation (Original)
async function copyAssetsSequential(
  assets: any[],
  outDir: string,
): Promise<void> {
  for (const asset of assets) {
    const source = isAbsolute(asset.file)
      ? asset.file
      : resolve(outDir, asset.file);
    const target = resolve(
      outDir,
      (asset.path ?? asset.file).replace(/^\/+/, ""),
    );
    await mkdir(dirname(target), { recursive: true });
    if (source !== target) {
      await copyFile(source, target);
    }
  }
}

// Parallel implementation (Optimized)
async function copyAssetsParallel(
  assets: any[],
  outDir: string,
): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      const source = isAbsolute(asset.file)
        ? asset.file
        : resolve(outDir, asset.file);
      const target = resolve(
        outDir,
        (asset.path ?? asset.file).replace(/^\/+/, ""),
      );
      await mkdir(dirname(target), { recursive: true });
      if (source !== target) {
        await copyFile(source, target);
      }
    }),
  );
}

async function runBenchmark() {
  const NUM_FILES = 1000;

  // Setup temp directories
  const tempDir = await mkdtemp(resolve(tmpdir(), "bench-"));
  const srcDir = resolve(tempDir, "src");
  const outDirSeq = resolve(tempDir, "out-seq");
  const outDirPar = resolve(tempDir, "out-par");

  await mkdir(srcDir, { recursive: true });
  await mkdir(outDirSeq, { recursive: true });
  await mkdir(outDirPar, { recursive: true });

  console.log(`Setting up ${NUM_FILES} files for benchmark...`);
  const assetsSeq = [];
  const assetsPar = [];

  // Create dummy files
  for (let i = 0; i < NUM_FILES; i++) {
    const fileName = `file-${i}.txt`;
    const filePath = resolve(srcDir, fileName);
    await writeFile(filePath, `Dummy content for file ${i}`);

    assetsSeq.push({ file: filePath, path: `assets/${fileName}` });
    assetsPar.push({ file: filePath, path: `assets/${fileName}` });
  }

  // Benchmark Sequential
  console.log("Running Sequential Asset Copying...");
  const startSeq = performance.now();
  await copyAssetsSequential(assetsSeq, outDirSeq);
  const endSeq = performance.now();
  const timeSeq = endSeq - startSeq;
  console.log(`Sequential copy took: ${timeSeq.toFixed(2)}ms`);

  // Benchmark Parallel
  console.log("Running Parallel Asset Copying...");
  const startPar = performance.now();
  await copyAssetsParallel(assetsPar, outDirPar);
  const endPar = performance.now();
  const timePar = endPar - startPar;
  console.log(`Parallel copy took: ${timePar.toFixed(2)}ms`);

  // Calculate improvement
  const improvement = timeSeq / timePar;
  const percentFaster = ((timeSeq - timePar) / timeSeq) * 100;

  console.log(`\n--- Benchmark Results ---`);
  console.log(`Baseline (Sequential): ${timeSeq.toFixed(2)}ms`);
  console.log(`Optimized (Parallel): ${timePar.toFixed(2)}ms`);
  console.log(
    `Improvement: ${improvement.toFixed(2)}x faster (${percentFaster.toFixed(2)}% reduction in time)`,
  );

  // Cleanup
  console.log("Cleaning up...");
  await rm(tempDir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
