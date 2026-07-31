import { describe, expect, test } from "bun:test";
import {
  Geist_Mono,
  Inter,
  Roboto_Mono,
  fontHrefs,
  fontLinks,
  fontStyles,
  googleFont,
} from "../src/font/google";

describe("next/font/google", () => {
  test("returns the Next-compatible shape", () => {
    const inter = Inter({ subsets: ["latin"] });
    expect(Object.keys(inter).sort()).toEqual([
      "className",
      "href",
      "style",
      "variable",
    ]);
    expect(typeof inter.className).toBe("string");
    expect(typeof inter.variable).toBe("string");
    expect(typeof inter.style.fontFamily).toBe("string");
  });

  test("derives a stable class name from the family", () => {
    expect(Inter({ subsets: ["latin"] }).className).toBe(
      "__moonshine_font_inter",
    );
    expect(Roboto_Mono({ subsets: ["latin"] }).className).toBe(
      "__moonshine_font_roboto-mono",
    );
  });

  test("style.fontFamily quotes the family and appends fallbacks", () => {
    expect(
      Inter({ fallback: ["system-ui", "sans-serif"] }).style.fontFamily,
    ).toBe("'Inter', system-ui, sans-serif");
    expect(Inter({}).style.fontFamily).toBe("'Inter'");
  });

  test("variable defaults to the class name and honours an override", () => {
    expect(Inter({}).variable).toBe("__moonshine_font_inter");
    expect(Inter({ variable: "--font-inter" }).variable).toBe("--font-inter");
  });

  test("a single weight becomes style.fontWeight", () => {
    expect(Inter({ weight: "700" }).style.fontWeight).toBe("700");
    expect(Inter({}).style.fontWeight).toBeUndefined();
    expect(Inter({ weight: "variable" }).style.fontWeight).toBeUndefined();
  });

  test("href targets the Google css2 endpoint with weights and display", () => {
    const href = Inter({ weight: ["400", "700"], display: "swap" }).href;
    expect(href).toBe(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
    );
  });

  test("href encodes multi-word families with a plus", () => {
    expect(Roboto_Mono({ subsets: ["latin"] }).href).toContain(
      "family=Roboto+Mono",
    );
  });

  test("display defaults to swap", () => {
    expect(Inter({}).href).toContain("display=swap");
    expect(Inter({ display: "optional" }).href).toContain("display=optional");
  });

  test("googleFont covers families without a named export", () => {
    const font = googleFont("Fira Code")({ subsets: ["latin"] });
    expect(font.className).toBe("__moonshine_font_fira-code");
    expect(font.href).toContain("family=Fira+Code");
  });

  test("fontLinks emits preconnects plus a stylesheet per loaded family", () => {
    const font = Geist_Mono({ subsets: ["latin"] });
    const html = fontLinks();
    expect(html).toContain(
      '<link rel="preconnect" href="https://fonts.googleapis.com" />',
    );
    expect(html).toContain(
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    );
    expect(html).toContain(`<link rel="stylesheet" href="${font.href}" />`);
    expect(fontHrefs()).toContain(font.href);
  });

  test("fontStyles binds each generated class to its family", () => {
    Geist_Mono({ subsets: ["latin"] });
    expect(fontStyles()).toContain(
      ".__moonshine_font_geist-mono{font-family:'Geist Mono'}",
    );
  });

  test("re-loading a family keeps one registry entry", () => {
    const before = fontHrefs().length;
    Inter({ subsets: ["latin"] });
    Inter({ subsets: ["latin"] });
    expect(fontHrefs().length).toBe(before);
  });
});
