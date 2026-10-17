/** Narrow object styles; use a CSS string for delimiters, comments or priorities. */
export function styleEntries(value: object): Array<[string, string | null]> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Style objects must be plain records");
  }
  return Object.entries(value).map(([name, entry]) => {
    if (!/^(?:--[A-Za-z0-9_-]+|-?[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.test(name)) {
      throw new TypeError(
        "Style object names must be lowercase CSS names or custom properties",
      );
    }
    if (entry == null) return [name, null];
    if (
      (typeof entry !== "string" && typeof entry !== "number") ||
      (typeof entry === "number" && !Number.isFinite(entry))
    ) {
      throw new TypeError(
        "Style object values must be strings, finite numbers or nullish",
      );
    }
    const text = String(entry);
    if (/[;{}!]|\/\*|\*\//.test(text)) {
      throw new TypeError(
        "Style object delimiters, comments and priorities require a CSS string",
      );
    }
    return [name, text];
  });
}
