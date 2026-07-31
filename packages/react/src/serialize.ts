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
  const seen = new WeakSet<object>();
  function replacer(this: object, _key: string, v: unknown): unknown {
    if (v === undefined) return undefined;
    const type = typeof v;
    if (type === "function" || type === "symbol" || type === "bigint") {
      throw new TypeError(`cannot serialize ${type}`);
    }
    if (v !== null && (typeof v === "object" || Array.isArray(v))) {
      if (seen.has(v)) throw new TypeError("cyclic reference");
      seen.add(v);
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
