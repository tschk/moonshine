const ESCAPE_PATTERN = /[<>&\u2028\u2029]/g;

function escapeJsonChar(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
}

/**
 * HTML-safe JSON for anything embedded in a document: server loader data and
 * island props both land inside `<script>`, so one implementation escapes for
 * both. Two copies drift, and a copy that misses an escape vector is an XSS.
 */
export function serializeData(value: unknown): string {
  // Ancestor chain, not a visited set: a value repeated in sibling positions
  // is shared, not cyclic, and must still serialize.
  const ancestors = new Set<unknown>();

  function visit(v: unknown): string {
    if (v === undefined || v === null) return "null";

    const type = typeof v;

    if (type === "boolean" || type === "number") {
      if (Number.isNaN(v as number) || !Number.isFinite(v as number)) {
        return "null";
      }
      return String(v);
    }

    if (type === "string") {
      const raw = JSON.stringify(v);
      if (raw === undefined)
        throw new TypeError("serializeData: cannot serialize");
      return raw;
    }

    if (type === "bigint" || type === "function" || type === "symbol") {
      throw new TypeError(`serializeData: cannot serialize ${type}`);
    }

    if (ancestors.has(v))
      throw new TypeError("serializeData: cyclic reference");

    if (Array.isArray(v)) {
      ancestors.add(v);
      try {
        const parts: string[] = [];
        for (const item of v) {
          parts.push(visit(item));
        }
        return `[${parts.join(",")}]`;
      } finally {
        ancestors.delete(v);
      }
    }

    const proto = Object.prototype.toString.call(v);

    if (proto === "[object Date]" || proto === "[object RegExp]") {
      ancestors.add(v);
      try {
        const raw = JSON.stringify(v);
        if (raw === undefined)
          throw new TypeError("serializeData: cannot serialize");
        return raw;
      } finally {
        ancestors.delete(v);
      }
    }

    // JSON.stringify skips symbol keys silently. A prop the server drops but
    // the client expects is a hydration mismatch, so refuse the value instead.
    const symbols = Object.getOwnPropertySymbols(v);
    if (symbols.length) {
      throw new TypeError("serializeData: cannot serialize symbol");
    }

    ancestors.add(v);
    try {
      const parts: string[] = [];
      for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === "function" || typeof val === "symbol") {
          throw new TypeError(
            "serializeData: cannot serialize function/symbol",
          );
        }
        // An undefined property is absent, not null: JSON semantics, and what
        // the client's own JSON.parse round-trip would produce.
        if (val === undefined) continue;
        parts.push(`${visit(key)}:${visit(val)}`);
      }
      return `{${parts.join(",")}}`;
    } finally {
      ancestors.delete(v);
    }
  }

  const raw = visit(value);
  return raw.replace(ESCAPE_PATTERN, escapeJsonChar);
}
