const ESCAPE_PATTERN = /[<>&\u2028\u2029]/g;

function escapeJsonChar(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
}

export function serializeData(value: unknown): string {
  const seen = new Set<unknown>();

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

    if (seen.has(v)) throw new TypeError("serializeData: cyclic reference");

    if (Array.isArray(v)) {
      seen.add(v);
      try {
        const parts: string[] = [];
        for (const item of v) {
          parts.push(visit(item));
        }
        return `[${parts.join(",")}]`;
      } finally {
        seen.delete(v);
      }
    }

    const proto = Object.prototype.toString.call(v);

    if (proto === "[object Date]" || proto === "[object RegExp]") {
      seen.add(v);
      try {
        const raw = JSON.stringify(v);
        if (raw === undefined)
          throw new TypeError("serializeData: cannot serialize");
        return raw;
      } finally {
        seen.delete(v);
      }
    }

    const symbols = Object.getOwnPropertySymbols(v);
    if (symbols.length) {
      throw new TypeError("serializeData: cannot serialize symbol");
    }

    seen.add(v);
    try {
      const parts: string[] = [];
      for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === "function" || typeof val === "symbol") {
          throw new TypeError(
            "serializeData: cannot serialize function/symbol",
          );
        }
        parts.push(`${visit(key)}:${visit(val)}`);
      }
      return `{${parts.join(",")}}`;
    } finally {
      seen.delete(v);
    }
  }

  const raw = visit(value);
  return raw.replace(ESCAPE_PATTERN, escapeJsonChar);
}
