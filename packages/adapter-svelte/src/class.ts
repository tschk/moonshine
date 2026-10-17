/** Normalize source class expressions; ordinary native h attributes stay unchanged. */
export function classValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return `${value}` || undefined;
  const tokens: string[] = [];
  function append(entry: unknown): void {
    if (!entry) return;
    if (typeof entry === "string" || typeof entry === "number") {
      tokens.push(`${entry}`);
    } else if (Array.isArray(entry)) {
      const length = entry.length;
      for (let index = 0; index < length; index++) append(entry[index]);
    } else if (typeof entry === "object") {
      // Enumerable inherited class flags are part of Svelte's class expression API.
      for (const key in entry)
        if ((entry as Record<string, unknown>)[key]) tokens.push(key);
    }
  }
  append(value);
  return tokens.join(" ") || undefined;
}
