/**
 * `next/font/google` without the build-time download.
 *
 * Each loader returns the same `{ className, style, variable }` shape Next
 * produces, plus the `<link>` hrefs to reach the family. Emit those with
 * `fontLinks()` in the document head.
 *
 * ```ts
 * const inter = Inter({ subsets: ["latin"] });
 * <body className={inter.className}>
 * ```
 */
export type FontOptions = {
  subsets?: string[];
  weight?: string | string[];
  style?: string | string[];
  display?: "auto" | "block" | "swap" | "fallback" | "optional";
  variable?: string;
  preload?: boolean;
  fallback?: string[];
};

export type FontModule = {
  className: string;
  style: { fontFamily: string; fontWeight?: string; fontStyle?: string };
  variable: string;
  /** Stylesheet URL for this family; render it in the document head. */
  href: string;
};

const registry = new Map<string, string>();

function familyToCss(family: string, fallback?: string[]): string {
  const quoted = `'${family}'`;
  return [quoted, ...(fallback ?? [])].join(", ");
}

function slug(family: string): string {
  return family.toLowerCase().replaceAll(/[^a-z\d]+/g, "-");
}

function buildHref(family: string, options: FontOptions): string {
  const weights = Array.isArray(options.weight)
    ? options.weight
    : options.weight
      ? [options.weight]
      : [];
  const axis = weights.filter((w) => w !== "variable").join(";");
  const name = family.replaceAll(" ", "+");
  const spec = axis ? `${name}:wght@${axis}` : name;
  return `https://fonts.googleapis.com/css2?family=${spec}&display=${options.display ?? "swap"}`;
}

function loader(family: string) {
  return (options: FontOptions = {}): FontModule => {
    const href = buildHref(family, options);
    registry.set(family, href);
    const className = `__moonshine_font_${slug(family)}`;
    return {
      className,
      variable: options.variable ?? className,
      href,
      style: {
        fontFamily: familyToCss(family, options.fallback),
        ...(typeof options.weight === "string" && options.weight !== "variable"
          ? { fontWeight: options.weight }
          : {}),
      },
    };
  };
}

/** Stylesheet hrefs for every family loaded so far. */
export function fontHrefs(): string[] {
  return [...registry.values()];
}

/** `<link>` tags for every family loaded so far, for the document head. */
export function fontLinks(): string {
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com" />',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    ...fontHrefs().map((href) => `<link rel="stylesheet" href="${href}" />`),
  ].join("\n");
}

/** CSS binding each generated class to its family. */
export function fontStyles(): string {
  return [...registry.keys()]
    .map(
      (family) =>
        `.__moonshine_font_${slug(family)}{font-family:${familyToCss(family)}}`,
    )
    .join("");
}

export const Inter = loader("Inter");
export const Roboto = loader("Roboto");
export const Roboto_Mono = loader("Roboto Mono");
export const Open_Sans = loader("Open Sans");
export const Lato = loader("Lato");
export const Montserrat = loader("Montserrat");
export const Poppins = loader("Poppins");
export const Source_Code_Pro = loader("Source Code Pro");
export const JetBrains_Mono = loader("JetBrains Mono");
export const IBM_Plex_Mono = loader("IBM Plex Mono");
export const Space_Mono = loader("Space Mono");
export const Space_Grotesk = loader("Space Grotesk");
export const Chivo_Mono = loader("Chivo Mono");
export const Geist = loader("Geist");
export const Geist_Mono = loader("Geist Mono");

/** Any family not exported above. */
export function googleFont(family: string) {
  return loader(family);
}
