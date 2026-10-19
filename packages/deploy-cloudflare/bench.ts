import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

// Sequential implementation (Original)
async function copyAssetsSequential(
  assets: Array<{ file: string; path?: string }>,
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
  assets: Array<{ file: string; path?: string }>,
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

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  bench: (msg: string) => console.log(`[BENCH] ${msg}`),
  result: (msg: string) => console.log(`[RESULT] ${msg}`),
  error: (err: unknown) => console.error(`[ERROR]`, err)
};

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

  logger.info(`Setting up ${NUM_FILES} files for benchmark...`);
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
  logger.bench("Running Sequential Asset Copying...");
  const startSeq = performance.now();
  await copyAssetsSequential(assetsSeq, outDirSeq);
  const endSeq = performance.now();
  const timeSeq = endSeq - startSeq;
  logger.bench(`Sequential copy took: ${timeSeq.toFixed(2)}ms`);

  // Benchmark Parallel
  logger.bench("Running Parallel Asset Copying...");
  const startPar = performance.now();
  await copyAssetsParallel(assetsPar, outDirPar);
  const endPar = performance.now();
  const timePar = endPar - startPar;
  logger.bench(`Parallel copy took: ${timePar.toFixed(2)}ms`);

  // Calculate improvement
  const improvement = timeSeq / timePar;
  const percentFaster = ((timeSeq - timePar) / timeSeq) * 100;

  logger.result(`\n--- Benchmark Results ---`);
  logger.result(`Baseline (Sequential): ${timeSeq.toFixed(2)}ms`);
  logger.result(`Optimized (Parallel): ${timePar.toFixed(2)}ms`);
  logger.result(
    `Improvement: ${improvement.toFixed(2)}x faster (${percentFaster.toFixed(2)}% reduction in time)`,
  );

  // Cleanup
  logger.info("Cleaning up...");
  await rm(tempDir, { recursive: true, force: true });
}

runBenchmark().catch(logger.error);
