/** Independent host-free Astro Content Layer loaders (`astro/loaders`): `glob`, `file`, and structured frontmatter/data parsers. */
import {
  extractMarkdownHeadings,
  renderSimpleMarkdownToHtml,
  type ContentLoader,
  type LoaderContext,
  type RenderedContent,
} from "./content";

export interface GenerateIdOptions {
  /** Path to the entry file, relative to the base directory (POSIX forward-slash normalized). */
  entry: string;
  /** The base directory URL. */
  base: URL;
  /** The parsed, unvalidated data of the entry. */
  data: Record<string, any>;
}

export interface GlobLoaderOptions {
  /** One or more glob patterns matched relative to `base` (supports `*`, `**`, `?`, `{a,b}`, and `!negated`). */
  pattern: string | readonly string[];
  /** Base directory path or `file:` URL (defaults to `"."`). */
  base?: string | URL;
  /** Optional custom ID generator. Defaults to stripping known content/data extensions. */
  generateId?: (options: GenerateIdOptions) => string;
  /** Optional custom parser for file contents. */
  parser?: (
    text: string,
    filePath: string,
  ) => Record<string, any> | Promise<Record<string, any>>;
}

export interface FileLoaderOptions {
  /** Optional custom parser returning either a keyed map of entries or an array of `{ id, ... }` objects. */
  parser?: (
    text: string,
  ) =>
    | Record<string, Record<string, any>>
    | Array<Record<string, any>>
    | Promise<Record<string, Record<string, any>> | Array<Record<string, any>>>;
}

export interface FrontmatterParseResult {
  data: Record<string, any>;
  body: string;
  rawFrontmatter: string;
}

const importBuiltin = new Function("specifier", "return import(specifier)") as <
  T = any,
>(
  specifier: string,
) => Promise<T>;

function unquoteScalar(raw: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    const inner = trimmed.slice(1, -1);
    if (trimmed.startsWith('"')) {
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return inner.replace(/''/g, "'");
  }
  return trimmed;
}

function parseScalarValue(raw: string): any {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return unquoteScalar(trimmed);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevel(inner, ",").map((item) => parseScalarValue(item));
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return {};
    const obj: Record<string, any> = {};
    for (const pair of splitTopLevel(inner, ",")) {
      const colonIdx = pair.indexOf(":");
      if (colonIdx === -1) continue;
      const k = unquoteScalar(pair.slice(0, colonIdx));
      const v = parseScalarValue(pair.slice(colonIdx + 1));
      if (k) obj[k] = v;
    }
    return obj;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
  }
  return trimmed;
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      current += ch;
      if (ch === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[++i]!;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "[" || ch === "{") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (depth === 0 && input.startsWith(delimiter, i)) {
      parts.push(current.trim());
      current = "";
      i += delimiter.length - 1;
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    parts.push(current.trim());
  }
  return parts;
}

function stripInlineComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === "\\" && quote === '"') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

/** Lightweight host-free YAML parser supporting objects, nested maps, arrays, and scalars. */
export function parseSimpleYaml(raw: string): any {
  const rawLines = raw.split(/\r?\n/);
  const lines: Array<{ indent: number; text: string }> = [];
  for (const rawLine of rawLines) {
    const cleaned = stripInlineComment(rawLine);
    if (!cleaned.trim() || cleaned.trim() === "---") continue;
    const indentMatch = /^(\s*)/.exec(cleaned);
    const indent = indentMatch ? indentMatch[1]!.length : 0;
    lines.push({ indent, text: cleaned.trim() });
  }
  if (lines.length === 0) return {};

  let idx = 0;

  function parseBlock(minIndent: number): any {
    if (idx >= lines.length) return {};
    const first = lines[idx]!;
    if (first.indent < minIndent) return {};

    if (first.text.startsWith("- ") || first.text === "-") {
      const arr: any[] = [];
      const listIndent = first.indent;
      while (idx < lines.length && lines[idx]!.indent === listIndent) {
        const line = lines[idx]!;
        if (!line.text.startsWith("-")) break;
        const afterDash = line.text.slice(1).trim();
        idx++;
        if (!afterDash) {
          if (idx < lines.length && lines[idx]!.indent > listIndent) {
            arr.push(parseBlock(lines[idx]!.indent));
          } else {
            arr.push(null);
          }
          continue;
        }
        const colonIdx = findKeyValueColon(afterDash);
        if (colonIdx !== -1) {
          const itemObj: Record<string, any> = {};
          const k = unquoteScalar(afterDash.slice(0, colonIdx));
          const vRaw = afterDash.slice(colonIdx + 1).trim();
          if (vRaw) {
            itemObj[k] = parseScalarValue(vRaw);
          } else if (idx < lines.length && lines[idx]!.indent > listIndent) {
            itemObj[k] = parseBlock(lines[idx]!.indent);
          } else {
            itemObj[k] = null;
          }
          while (idx < lines.length && lines[idx]!.indent > listIndent) {
            const subLine = lines[idx]!;
            if (subLine.text.startsWith("-")) break;
            const subColon = findKeyValueColon(subLine.text);
            if (subColon === -1) {
              idx++;
              continue;
            }
            const subKey = unquoteScalar(subLine.text.slice(0, subColon));
            const subValRaw = subLine.text.slice(subColon + 1).trim();
            const propIndent = subLine.indent;
            idx++;
            if (subValRaw) {
              itemObj[subKey] = parseScalarValue(subValRaw);
            } else if (idx < lines.length && lines[idx]!.indent > propIndent) {
              itemObj[subKey] = parseBlock(lines[idx]!.indent);
            } else {
              itemObj[subKey] = null;
            }
          }
          arr.push(itemObj);
        } else {
          arr.push(parseScalarValue(afterDash));
        }
      }
      return arr;
    }

    const obj: Record<string, any> = {};
    const mapIndent = first.indent;
    while (idx < lines.length && lines[idx]!.indent >= mapIndent) {
      const line = lines[idx]!;
      if (line.indent > mapIndent) {
        idx++;
        continue;
      }
      if (line.text.startsWith("-")) break;
      const colonIdx = findKeyValueColon(line.text);
      if (colonIdx === -1) {
        idx++;
        continue;
      }
      const key = unquoteScalar(line.text.slice(0, colonIdx));
      const valRaw = line.text.slice(colonIdx + 1).trim();
      idx++;
      if (valRaw === "|" || valRaw === ">") {
        const folded = valRaw === ">";
        const blockLines: string[] = [];
        const contentIndent =
          idx < lines.length && lines[idx]!.indent > mapIndent
            ? lines[idx]!.indent
            : mapIndent + 2;
        while (idx < lines.length && lines[idx]!.indent >= contentIndent) {
          blockLines.push(lines[idx]!.text);
          idx++;
        }
        obj[key] = blockLines.join(folded ? " " : "\n");
      } else if (valRaw !== "") {
        obj[key] = parseScalarValue(valRaw);
      } else if (idx < lines.length && lines[idx]!.indent > mapIndent) {
        obj[key] = parseBlock(lines[idx]!.indent);
      } else {
        obj[key] = null;
      }
    }
    return obj;
  }

  return parseBlock(lines[0]!.indent);
}

function findKeyValueColon(text: string): number {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\" && quote === '"') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ":" && (i + 1 === text.length || /\s/.test(text[i + 1]!))) {
      return i;
    }
  }
  return -1;
}

/** Lightweight host-free TOML parser supporting key-value pairs, `[table]` sections, and `[[array]]` tables. */
export function parseSimpleToml(raw: string): Record<string, any> {
  const root: Record<string, any> = {};
  let currentTarget: Record<string, any> = root;
  const lines = raw.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    if (line.startsWith("[[") && line.endsWith("]]")) {
      const path = line
        .slice(2, -2)
        .trim()
        .split(".")
        .map((part) => unquoteScalar(part));
      let cursor = root;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i]!;
        if (typeof cursor[segment] !== "object" || cursor[segment] === null) {
          cursor[segment] = {};
        }
        cursor = cursor[segment];
      }
      const last = path[path.length - 1]!;
      if (!Array.isArray(cursor[last])) {
        cursor[last] = [];
      }
      const item: Record<string, any> = {};
      cursor[last].push(item);
      currentTarget = item;
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      const path = line
        .slice(1, -1)
        .trim()
        .split(".")
        .map((part) => unquoteScalar(part));
      let cursor = root;
      for (const segment of path) {
        if (typeof cursor[segment] !== "object" || cursor[segment] === null) {
          cursor[segment] = {};
        }
        cursor = cursor[segment];
      }
      currentTarget = cursor;
      continue;
    }

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = unquoteScalar(line.slice(0, eqIdx));
    const valRaw = line.slice(eqIdx + 1).trim();
    if (key) {
      currentTarget[key] = parseScalarValue(valRaw);
    }
  }

  return root;
}

/** Lightweight host-free CSV parser returning an array of header-keyed objects. */
export function parseSimpleCsv(raw: string): Array<Record<string, string>> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  function parseRow(line: string): string[] {
    void parseRow;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  const headers = parseRow(lines[0]!);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]!);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]!;
      if (header) {
        record[header] = values[j] ?? "";
      }
    }
    rows.push(record);
  }
  return rows;
}

/** Parses YAML (`---`) or TOML (`+++`) frontmatter and markdown body from a raw document. */
export function parseFrontmatter(raw: string): FrontmatterParseResult {
  const normalized = raw.replace(/^\uFEFF/, "");
  const yamlMatch = /^---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(
    normalized,
  );
  if (yamlMatch) {
    const rawFrontmatter = (yamlMatch[1] ?? "").trimEnd();
    const body = normalized.slice(yamlMatch[0].length);
    const parsed = rawFrontmatter ? parseSimpleYaml(rawFrontmatter) : {};
    return {
      data:
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? parsed
          : {},
      body,
      rawFrontmatter,
    };
  }

  const tomlMatch =
    /^\+\+\+[ \t]*\r?\n([\s\S]*?\r?\n)?\+\+\+[ \t]*(?:\r?\n|$)/.exec(
      normalized,
    );
  if (tomlMatch) {
    const rawFrontmatter = (tomlMatch[1] ?? "").trimEnd();
    const body = normalized.slice(tomlMatch[0].length);
    const parsed = rawFrontmatter ? parseSimpleToml(rawFrontmatter) : {};
    return {
      data: parsed,
      body,
      rawFrontmatter,
    };
  }

  return {
    data: {},
    body: normalized,
    rawFrontmatter: "",
  };
}

function globToRegExp(globPattern: string): RegExp {
  const normalized = globPattern.replace(/\\/g, "/").replace(/^\.\//, "");
  let regexStr = "^";
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i]!;
    if (ch === "*") {
      if (normalized[i + 1] === "*") {
        if (normalized[i + 2] === "/") {
          regexStr += "(?:.*/)?";
          i += 3;
        } else {
          regexStr += ".*";
          i += 2;
        }
      } else {
        regexStr += "[^/]*";
        i++;
      }
      continue;
    }
    if (ch === "?") {
      regexStr += "[^/]";
      i++;
      continue;
    }
    if (ch === "{") {
      const closeIdx = normalized.indexOf("}", i + 1);
      if (closeIdx !== -1) {
        const alternatives = normalized
          .slice(i + 1, closeIdx)
          .split(",")
          .map((alt) =>
            alt.replace(/[.+^$|()[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"),
          );
        regexStr += `(?:${alternatives.join("|")})`;
        i = closeIdx + 1;
        continue;
      }
    }
    if (ch === "[") {
      const closeIdx = normalized.indexOf("]", i + 1);
      if (closeIdx !== -1) {
        regexStr += normalized.slice(i, closeIdx + 1);
        i = closeIdx + 1;
        continue;
      }
    }
    if (/[.+^$|()\\]/.test(ch)) {
      regexStr += `\\${ch}`;
    } else {
      regexStr += ch;
    }
    i++;
  }

  regexStr += "$";
  return new RegExp(regexStr);
}

/** Matches a POSIX-normalized relative path against one or more glob patterns (including `!` negations). */
export function matchGlobPattern(
  entryPath: string,
  pattern: string | readonly string[],
): boolean {
  const normalizedPath = entryPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const patterns = typeof pattern === "string" ? [pattern] : pattern;
  let matched = false;
  let hasPositive = false;

  for (const rawPat of patterns) {
    const trimmed = rawPat.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("!")) {
      const negRegex = globToRegExp(trimmed.slice(1));
      if (negRegex.test(normalizedPath)) {
        matched = false;
      }
    } else {
      hasPositive = true;
      const posRegex = globToRegExp(trimmed);
      if (posRegex.test(normalizedPath)) {
        matched = true;
      }
    }
  }

  return hasPositive ? matched : false;
}

function defaultGenerateId({ entry }: GenerateIdOptions): string {
  return entry
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\.(md|mdx|markdown|json|yaml|yml|toml|csv)$/i, "");
}

function resolveBasePathAndUrl(
  base: string | URL | undefined,
  pathMod: { resolve: (...paths: string[]) => string; sep: string },
  urlMod: {
    fileURLToPath: (url: URL | string) => string;
    pathToFileURL: (p: string) => URL;
  },
): { baseDir: string; baseUrl: URL } {
  if (base instanceof URL) {
    const baseDir =
      base.protocol === "file:"
        ? urlMod.fileURLToPath(base)
        : pathMod.resolve(base.pathname);
    const baseUrl = urlMod.pathToFileURL(
      baseDir.endsWith(pathMod.sep) ? baseDir : baseDir + pathMod.sep,
    );
    return { baseDir, baseUrl };
  }
  if (typeof base === "string" && base.startsWith("file://")) {
    const baseDir = urlMod.fileURLToPath(base);
    const baseUrl = urlMod.pathToFileURL(
      baseDir.endsWith(pathMod.sep) ? baseDir : baseDir + pathMod.sep,
    );
    return { baseDir, baseUrl };
  }
  const baseDir = pathMod.resolve(base ?? ".");
  const baseUrl = urlMod.pathToFileURL(
    baseDir.endsWith(pathMod.sep) ? baseDir : baseDir + pathMod.sep,
  );
  return { baseDir, baseUrl };
}

async function walkFilesRecursively(
  dir: string,
  fsMod: {
    readdir: (
      p: string,
      opts: { withFileTypes: true },
    ) => Promise<
      Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    >;
  },
  pathMod: { join: (...paths: string[]) => string },
  prefix = "",
): Promise<Array<{ relPath: string; fullPath: string }>> {
  let entries: Array<{
    name: string;
    isDirectory: () => boolean;
    isFile: () => boolean;
  }>;
  try {
    entries = await fsMod.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const results: Array<{ relPath: string; fullPath: string }> = [];
  for (const dirent of entries) {
    if (dirent.name === "node_modules" || dirent.name === ".git") continue;
    const relPath = prefix ? `${prefix}/${dirent.name}` : dirent.name;
    const fullPath = pathMod.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      const nested = await walkFilesRecursively(
        fullPath,
        fsMod,
        pathMod,
        relPath,
      );
      results.push(...nested);
    } else if (dirent.isFile()) {
      results.push({ relPath, fullPath });
    }
  }
  return results;
}

/**
 * Built-in Astro Content Layer `glob()` loader (`astro/loaders`).
 * Discovers files matching `pattern` under `base`, parses Markdown/MDX/JSON/YAML/TOML,
 * validates against the collection schema, and populates the Content Layer store.
 */
export function glob(options: GlobLoaderOptions): ContentLoader {
  return {
    name: "glob-loader",
    async load(context: LoaderContext): Promise<void> {
      const [fsMod, pathMod, urlMod] = await Promise.all([
        importBuiltin<{
          readdir: any;
          readFile: (p: string, enc: string) => Promise<string>;
        }>("node:fs/promises"),
        importBuiltin<{
          resolve: (...paths: string[]) => string;
          join: (...paths: string[]) => string;
          extname: (p: string) => string;
          sep: string;
        }>("node:path"),
        importBuiltin<{
          fileURLToPath: (u: URL | string) => string;
          pathToFileURL: (p: string) => URL;
        }>("node:url"),
      ]);

      const { baseDir, baseUrl } = resolveBasePathAndUrl(
        options.base,
        pathMod,
        urlMod,
      );
      const files = await walkFilesRecursively(baseDir, fsMod, pathMod);
      const seenIds = new Set<string>();

      for (const { relPath, fullPath } of files) {
        if (!matchGlobPattern(relPath, options.pattern)) continue;
        const rawText = await fsMod.readFile(fullPath, "utf8");
        const digest = context.generateDigest(rawText);
        const ext = pathMod.extname(relPath).toLowerCase();

        let rawData: Record<string, any> = {};
        let body: string | undefined;
        let rendered: RenderedContent | undefined;

        if (options.parser) {
          rawData = await options.parser(rawText, fullPath);
        } else if (ext === ".md" || ext === ".mdx" || ext === ".markdown") {
          const parsed = parseFrontmatter(rawText);
          rawData = parsed.data;
          body = parsed.body;
          const headings = extractMarkdownHeadings(body);
          rendered = {
            html: body.trim() ? renderSimpleMarkdownToHtml(body) : "",
            metadata: {
              headings,
              frontmatter: { ...rawData },
            },
          };
        } else if (ext === ".json") {
          const parsed = JSON.parse(rawText);
          rawData =
            typeof parsed === "object" && parsed !== null
              ? parsed
              : { value: parsed };
        } else if (ext === ".yaml" || ext === ".yml") {
          const parsed = parseSimpleYaml(rawText);
          rawData =
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
              ? parsed
              : { value: parsed };
        } else if (ext === ".toml") {
          rawData = parseSimpleToml(rawText);
        } else {
          const parsed = parseFrontmatter(rawText);
          rawData = parsed.data;
          body = parsed.body;
        }

        const generateId = options.generateId ?? defaultGenerateId;
        const id = generateId({
          entry: relPath,
          base: baseUrl,
          data: rawData,
        });
        seenIds.add(id);

        const existing = context.store.get(id);
        if (existing && existing.digest === digest) {
          continue;
        }

        const validatedData = await context.parseData({
          id,
          data: rawData,
          filePath: fullPath,
        });

        context.store.set({
          id,
          data: validatedData,
          ...(body !== undefined ? { body } : {}),
          filePath: fullPath,
          digest,
          ...(rendered !== undefined ? { rendered } : {}),
        });
      }

      for (const existingId of context.store.keys()) {
        if (!seenIds.has(existingId)) {
          context.store.delete(existingId);
        }
      }
    },
  };
}

/**
 * Built-in Astro Content Layer `file()` loader (`astro/loaders`).
 * Loads multiple collection entries from a single JSON, YAML, TOML, or CSV file
 * (or via a custom `parser` function).
 */
export function file(
  filePath: string | URL,
  options?: FileLoaderOptions,
): ContentLoader {
  return {
    name: "file-loader",
    async load(context: LoaderContext): Promise<void> {
      const [fsMod, pathMod, urlMod] = await Promise.all([
        importBuiltin<{
          readFile: (p: string, enc: string) => Promise<string>;
        }>("node:fs/promises"),
        importBuiltin<{
          resolve: (...paths: string[]) => string;
          extname: (p: string) => string;
        }>("node:path"),
        importBuiltin<{
          fileURLToPath: (u: URL | string) => string;
        }>("node:url"),
      ]);

      const resolvedPath =
        filePath instanceof URL
          ? filePath.protocol === "file:"
            ? urlMod.fileURLToPath(filePath)
            : pathMod.resolve(filePath.pathname)
          : typeof filePath === "string" && filePath.startsWith("file://")
            ? urlMod.fileURLToPath(filePath)
            : pathMod.resolve(filePath);

      const rawText = await fsMod.readFile(resolvedPath, "utf8");
      const ext = pathMod.extname(resolvedPath).toLowerCase();

      let parsedEntries:
        Record<string, Record<string, any>> | Array<Record<string, any>>;

      if (options?.parser) {
        parsedEntries = await options.parser(rawText);
      } else if (ext === ".json") {
        parsedEntries = JSON.parse(rawText);
      } else if (ext === ".yaml" || ext === ".yml") {
        parsedEntries = parseSimpleYaml(rawText);
      } else if (ext === ".toml") {
        parsedEntries = parseSimpleToml(rawText);
      } else if (ext === ".csv") {
        parsedEntries = parseSimpleCsv(rawText);
      } else {
        parsedEntries = JSON.parse(rawText);
      }

      context.store.clear();

      if (Array.isArray(parsedEntries)) {
        for (const item of parsedEntries) {
          if (typeof item !== "object" || item === null) continue;
          const rawId = item.id ?? item.slug;
          if (rawId === undefined || rawId === null || String(rawId) === "") {
            throw new Error(
              `[${context.collection}] file() loader array entry is missing an "id" or "slug" property in ${resolvedPath}`,
            );
          }
          const id = String(rawId);
          const validatedData = await context.parseData({
            id,
            data: item,
            filePath: resolvedPath,
          });
          context.store.set({
            id,
            data: validatedData,
            filePath: resolvedPath,
            digest: context.generateDigest(item),
          });
        }
      } else if (typeof parsedEntries === "object" && parsedEntries !== null) {
        for (const [id, rawItem] of Object.entries(parsedEntries)) {
          if (typeof rawItem !== "object" || rawItem === null) continue;
          if (Array.isArray(rawItem)) {
            for (const subItem of rawItem) {
              if (typeof subItem !== "object" || subItem === null) continue;
              const subId = String(subItem.id ?? subItem.slug ?? "");
              if (!subId) continue;
              const validatedData = await context.parseData({
                id: subId,
                data: subItem,
                filePath: resolvedPath,
              });
              context.store.set({
                id: subId,
                data: validatedData,
                filePath: resolvedPath,
                digest: context.generateDigest(subItem),
              });
            }
            continue;
          }
          const validatedData = await context.parseData({
            id,
            data: rawItem,
            filePath: resolvedPath,
          });
          context.store.set({
            id,
            data: validatedData,
            filePath: resolvedPath,
            digest: context.generateDigest(rawItem),
          });
        }
      }
    },
  };
}
