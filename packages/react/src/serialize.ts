const HTML_ESCAPE = /[<>&\u2028\u2029]/g;

function escapeHtmlChar(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
}

function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function serializeIslandProps(value: unknown): string {
  // Ancestor chain, not a visited set: a value repeated in sibling positions
  // is shared, not cyclic, and must still serialize.
  const ancestors: unknown[] = [];
  function replacer(this: object, _key: string, v: unknown): unknown {
    if (v === undefined) return undefined;
    const type = typeof v;
    if (type === "function" || type === "symbol" || type === "bigint") {
      throw new TypeError(`cannot serialize ${type}`);
    }
    if (v !== null && typeof v === "object") {
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
        ancestors.pop();
      }
      if (ancestors.includes(v)) throw new TypeError("cyclic reference");
      ancestors.push(v);
    }
    return v;
  }
  const raw = JSON.stringify(value, replacer);
  if (raw === undefined) return "null";
  return raw.replace(HTML_ESCAPE, escapeHtmlChar);
}

export function escapeHtml(value: string): string {
  return escapeHtmlValue(value);
}
