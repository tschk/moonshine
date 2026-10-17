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

function isClassWhitespace(code: number): boolean {
  return (
    code === 0x20 ||
    (code >= 0x09 && code <= 0x0d) ||
    code === 0xa0 ||
    code === 0xfeff
  );
}

/** Host-free class directive application over a classValue-normalized base. */
export function classDirectives(
  value: unknown,
  hash: string | null | undefined,
  directives: Readonly<Record<string, unknown>>,
): string | undefined {
  const names = Object.keys(directives);
  for (const name of names) {
    let blank = true;
    for (let index = 0; index < name.length; index++) {
      if (!isClassWhitespace(name.charCodeAt(index))) {
        blank = false;
        break;
      }
    }
    if (blank) {
      throw new TypeError(
        `Class directive name must contain a non-whitespace character: ${JSON.stringify(name)}`,
      );
    }
  }
  let result = classValue(value) ?? "";
  if (hash) result = result ? `${result} ${hash}` : hash;
  for (const name of names) {
    if (directives[name]) {
      result = result ? `${result} ${name}` : name;
      continue;
    }
    const width = name.length;
    let from = 0;
    while (result.length > 0) {
      const start = result.indexOf(name, from);
      if (start < 0) break;
      const end = start + width;
      if (
        (start === 0 || isClassWhitespace(result.charCodeAt(start - 1))) &&
        (end === result.length || isClassWhitespace(result.charCodeAt(end)))
      ) {
        // The delimiter after the removed token is consumed with it.
        result = result.slice(0, start) + result.slice(end + 1);
      } else {
        from = end;
      }
    }
  }
  return result || undefined;
}
