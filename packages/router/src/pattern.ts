export type RouteParams = Record<string, string>;

export type SegmentKind = "static" | "dynamic" | "optional" | "rest";

export const SEGMENT_PRECEDENCE: Record<SegmentKind, number> = {
  static: 3,
  dynamic: 2,
  optional: 1,
  rest: 0,
};

export type Segment = {
  kind: SegmentKind;
  name: string;
  value: string;
};

export type MatchResult = {
  params: RouteParams;
  score: number[];
};

export type CompiledPattern = {
  pattern: string;
  segments: Segment[];
  precedence: number[];
  normalized: string;
  match: (pathname: string) => MatchResult | null;
};

function splitPath(path: string): string[] {
  return path
    .replace(/\/+$/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
}

function decodePart(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

export function compilePattern(pattern: string): CompiledPattern {
  const raw = pattern.replace(/\/+$/, "").replace(/^\/+/, "");
  const parts = raw === "" ? [] : raw.split("/").filter(Boolean);
  const segments: Segment[] = [];
  const precedence: number[] = [];
  let normalized = "";

  for (const part of parts) {
    if (part.startsWith("*")) {
      const name = part.length > 1 ? part.slice(1) : "*";
      segments.push({ kind: "rest", name, value: part });
      precedence.push(SEGMENT_PRECEDENCE.rest);
      normalized += "/*rest";
    } else if (part.startsWith(":")) {
      const optional = part.endsWith("?");
      const name = optional ? part.slice(1, -1) : part.slice(1);
      const kind: SegmentKind = optional ? "optional" : "dynamic";
      segments.push({ kind, name, value: name });
      precedence.push(SEGMENT_PRECEDENCE[kind]);
      normalized += optional ? "/:param?" : "/:param";
    } else {
      segments.push({ kind: "static", name: part, value: part });
      precedence.push(SEGMENT_PRECEDENCE.static);
      normalized += "/" + part;
    }
  }

  if (normalized === "") {
    normalized = "/";
  }

  const match = (pathname: string): MatchResult | null => {
    const pathParts = splitPath(pathname);
    const params: RouteParams = {};
    const score: number[] = [];
    let i = 0;

    for (const segment of segments) {
      if (segment.kind === "rest") {
        const remaining = pathParts.slice(i).join("/");
        try {
          params[segment.name] = decodeURIComponent(remaining);
        } catch {
          return null;
        }
        score.push(SEGMENT_PRECEDENCE.rest);
        i = pathParts.length;
        continue;
      }

      if (segment.kind === "static") {
        const part = pathParts[i];
        if (part === undefined) return null;
        const decoded = decodePart(part);
        if (decoded === null) return null;
        if (decoded !== segment.value) return null;
        score.push(SEGMENT_PRECEDENCE.static);
        i++;
        continue;
      }

      if (segment.kind === "dynamic") {
        const part = pathParts[i];
        if (part === undefined) return null;
        const decoded = decodePart(part);
        if (decoded === null) return null;
        params[segment.name] = decoded;
        score.push(SEGMENT_PRECEDENCE.dynamic);
        i++;
        continue;
      }

      if (segment.kind === "optional") {
        const part = pathParts[i];
        if (part === undefined) {
          score.push(0);
          continue;
        }
        const decoded = decodePart(part);
        if (decoded === null) return null;
        params[segment.name] = decoded;
        score.push(SEGMENT_PRECEDENCE.optional);
        i++;
        continue;
      }
    }

    if (i < pathParts.length) return null;
    return { params, score };
  };

  return { pattern, segments, precedence, normalized, match };
}

export function matchPath(
  pattern: string,
  pathname: string,
): { path: string; pattern: string; params: RouteParams } | null {
  const result = compilePattern(pattern).match(pathname);
  if (!result) return null;
  return { path: pathname, pattern, params: result.params };
}
