import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import Image from "../src/image";
import { render, cleanup } from "./dom";

async function renderImage(
  props: Parameters<typeof Image>[0],
): Promise<HTMLImageElement> {
  const container = await render(createElement(Image, props));
  const img = container.querySelector("img");
  if (!img) throw new Error("Image did not render an img");
  return img;
}

describe("next/image", () => {
  afterEach(cleanup);

  test("renders src and alt unchanged (no optimizer)", async () => {
    const img = await renderImage({ src: "/photo.png", alt: "A photo" });
    expect(img.getAttribute("src")).toBe("/photo.png");
    expect(img.getAttribute("alt")).toBe("A photo");
  });

  test("accepts a static import object for src", async () => {
    const img = await renderImage({
      src: { src: "/hero.png", width: 800, height: 600 },
      alt: "Hero",
    });
    expect(img.getAttribute("src")).toBe("/hero.png");
    expect(img.getAttribute("width")).toBe("800");
    expect(img.getAttribute("height")).toBe("600");
  });

  test("explicit width/height beat the static import's", async () => {
    const img = await renderImage({
      src: { src: "/hero.png", width: 800, height: 600 },
      alt: "Hero",
      width: 100,
      height: 50,
    });
    expect(img.getAttribute("width")).toBe("100");
    expect(img.getAttribute("height")).toBe("50");
  });

  test("defaults to lazy loading and async decoding", async () => {
    const img = await renderImage({ src: "/a.png", alt: "a" });
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("fetchpriority")).toBeNull();
  });

  test("priority switches to eager, sync decode and high fetch priority", async () => {
    const img = await renderImage({ src: "/a.png", alt: "a", priority: true });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("decoding")).toBe("sync");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  test("an explicit loading prop overrides priority's default", async () => {
    const img = await renderImage({
      src: "/a.png",
      alt: "a",
      priority: true,
      loading: "lazy",
    });
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  test("fill stretches to the positioned ancestor and drops dimensions", async () => {
    const img = await renderImage({
      src: "/a.png",
      alt: "a",
      fill: true,
      width: 100,
      height: 100,
    });
    expect(img.getAttribute("width")).toBeNull();
    expect(img.getAttribute("height")).toBeNull();
    expect(img.style.position).toBe("absolute");
    expect(img.style.width).toBe("100%");
    expect(img.style.height).toBe("100%");
  });

  test("a caller style merges over the fill style", async () => {
    const img = await renderImage({
      src: "/a.png",
      alt: "a",
      fill: true,
      style: { objectFit: "cover", position: "fixed" },
    });
    expect(img.style.objectFit).toBe("cover");
    expect(img.style.position).toBe("fixed");
  });

  test("quality and unoptimized are accepted but never reach the DOM", async () => {
    const img = await renderImage({
      src: "/a.png",
      alt: "a",
      quality: 80,
      unoptimized: true,
    });
    expect(img.getAttribute("quality")).toBeNull();
    expect(img.getAttribute("unoptimized")).toBeNull();
  });

  test("passes through sizes and class names", async () => {
    const img = await renderImage({
      src: "/a.png",
      alt: "a",
      sizes: "(max-width: 600px) 100vw, 50vw",
      className: "rounded",
    });
    expect(img.getAttribute("sizes")).toBe("(max-width: 600px) 100vw, 50vw");
    expect(img.className).toBe("rounded");
  });
});
