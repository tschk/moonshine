import { describe, expect, test } from "bun:test";
import {
  paintSparkline,
  sparklineColumnTops,
  resample,
  BAYER,
} from "../src/dither/dither-paint";
import { seedOfColor } from "../src/dither/themes";

describe("dither sparkline paint", () => {
  test("BAYER matrix is 4x4 normalized", () => {
    expect(BAYER).toHaveLength(4);
    expect(BAYER[0]).toHaveLength(4);
    expect(BAYER[0]![0]).toBeGreaterThan(0);
    expect(BAYER[0]![0]).toBeLessThan(1);
  });

  test("resample and column tops", () => {
    const tops = sparklineColumnTops([1, 3, 2, 5], 8, 16);
    expect(tops).toHaveLength(8);
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...tops)).toBeLessThan(16);
    expect(resample([0, 10], 5)[2]).toBeCloseTo(5, 5);
  });

  test("paintSparkline draws pixels", () => {
    const w = 40;
    const h = 20;
    const buf = new Uint8ClampedArray(w * h * 4);
    let painted = 0;
    const ctx = {
      save() {},
      restore() {},
      clearRect() {},
      scale() {},
      set imageSmoothingEnabled(_v: boolean) {},
      get imageSmoothingEnabled() {
        return false;
      },
      set fillStyle(_v: string) {
        painted++;
      },
      fillRect() {
        painted++;
      },
    } as unknown as CanvasRenderingContext2D;

    paintSparkline(
      ctx,
      w,
      h,
      [1, 2, 4, 3, 5],
      seedOfColor("blue"),
      "gradient",
      0,
    );
    expect(painted).toBeGreaterThan(0);
    expect(buf).toHaveLength(w * h * 4);
  });
});
