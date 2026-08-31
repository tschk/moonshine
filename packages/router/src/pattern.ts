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

function parsePattern(pattern: string): {
  segments: Segment[];
  precedence: number[];
  normalized: string;
} {
  const parts = splitPath(pattern);
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

  return { segments, precedence, normalized };
}

/**
 * Decodes the tail a `*rest` segment captures.
 *
 * Per part, not on the joined string. Decoding after the join lets an encoded
 * separator smuggle structure past the router: `/files/%2e%2e%2fsecret` used
 * to arrive as `path: "../secret"`, and a handler doing the obvious
 * `join(dir, params.path)` then read outside its directory. `a%2Fb` and `a/b`
 * were likewise indistinguishable. Same rules the static server already
 * applies in `resolveStaticPath`, so the two agree about what a path segment
 * may contain.
 */
function decodeRest(parts: readonly string[]): string | null {
  const decoded: string[] = [];
  for (const part of parts) {
    const d = decodePart(part);
    if (
      d === null ||
      d === "." ||
      d === ".." ||
      d.includes("\0") ||
      d.includes("/")
    ) {
      return null;
    }
    decoded.push(d);
  }
  return decoded.join("/");
}

function withHead(
  rest: MatchResult,
  points: number,
  binding?: [string, string],
): MatchResult {
  return {
    params: binding
      ? { [binding[0]]: binding[1], ...rest.params }
      : rest.params,
    score: [points, ...rest.score],
  };
}

/**
 * Matches `segments` from `si` against `pathParts` from `pi`.
 *
 * Recursive because an optional segment has to be able to give its part back.
 * The old linear pass consumed a part whenever one was present, so
 * `/:lang?/about` matched `/en/about` and then failed `/about` — the i18n
 * prefix route 404ing on its own default locale, silently, because a failed
 * match is indistinguishable from no route. Consuming is tried first so the
 * greedy reading still wins where both work.
 */
function matchSegments(
  segments: readonly Segment[],
  pathParts: readonly string[],
  si: number = 0,
  pi: number = 0,
): MatchResult | null {
  if (si === segments.length) {
    return pi === pathParts.length ? { params: {}, score: [] } : null;
  }

  const segment = segments[si];
  const part = pathParts[pi];

  if (segment.kind === "rest") {
    const value = decodeRest(pathParts.slice(pi));
    if (value === null) return null;
    const rest = matchSegments(segments, pathParts, si + 1, pathParts.length);
    return (
      rest && withHead(rest, SEGMENT_PRECEDENCE.rest, [segment.name, value])
    );
  }

  if (segment.kind === "static") {
    if (part === undefined) return null;
    const decoded = decodePart(part);
    if (decoded === null || decoded !== segment.value) return null;
    const rest = matchSegments(segments, pathParts, si + 1, pi + 1);
    return rest && withHead(rest, SEGMENT_PRECEDENCE.static);
  }

  if (segment.kind === "dynamic") {
    if (part === undefined) return null;
    const decoded = decodePart(part);
    if (decoded === null) return null;
    const rest = matchSegments(segments, pathParts, si + 1, pi + 1);
    return (
      rest &&
      withHead(rest, SEGMENT_PRECEDENCE.dynamic, [segment.name, decoded])
    );
  }

  // optional: consume first, then fall back to skipping.
  if (part !== undefined) {
    const decoded = decodePart(part);
    if (decoded !== null) {
      const rest = matchSegments(segments, pathParts, si + 1, pi + 1);
      if (rest)
        return withHead(rest, SEGMENT_PRECEDENCE.optional, [
          segment.name,
          decoded,
        ]);
    }
  }
  const skipped = matchSegments(segments, pathParts, si + 1, pi);
  return skipped && withHead(skipped, 0);
}

export function compilePattern(pattern: string): CompiledPattern {
  const { segments, precedence, normalized } = parsePattern(pattern);

  const match = (pathname: string): MatchResult | null => {
    return matchSegments(segments, splitPath(pathname));
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
