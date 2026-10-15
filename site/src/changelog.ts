/**
 * The repo CHANGELOG is bundled into the worker as text so the page does not
 * fetch GitHub at request time. Parsing is deterministic: a `# Moonshine`
 * heading starts a release, `##` starts a section, `- ` starts an item.
 */

export type ChangelogSection = {
  heading: string;
  items: string[];
};

export type ChangelogRelease = {
  version: string;
  title: string;
  sections: ChangelogSection[];
};

export function parseChangelog(source: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;

  for (const raw of source.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const versionMatch = /^# Moonshine (.+)$/.exec(line);
    if (versionMatch) {
      if (current) releases.push(current);
      current = {
        version: versionMatch[1]!,
        title: line.slice(2),
        sections: [],
      };
      section = null;
      continue;
    }
    const headingMatch = /^## (.+)$/.exec(line);
    if (headingMatch && current) {
      section = { heading: headingMatch[1]!, items: [] };
      current.sections.push(section);
      continue;
    }
    if (!current || !section) continue;
    if (line.startsWith("- ")) {
      section.items.push(line.slice(2));
      continue;
    }
    if (/^\s+\S/.test(line) && section.items.length > 0) {
      const last = section.items.length - 1;
      section.items[last] = `${section.items[last]} ${line.trim()}`;
    }
  }
  if (current) releases.push(current);
  return releases;
}

export type InlinePart =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; value: string };

/** Split a changelog item into text, `` `code` ``, and `[label](href)` parts. */
export function formatInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const token = /`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let cursor = 0;
  for (const match of text.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ kind: "text", value: text.slice(cursor, index) });
    }
    if (match[1] !== undefined) {
      parts.push({ kind: "code", value: match[1] });
    } else {
      parts.push({ kind: "link", href: match[3]!, value: match[2]! });
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push({ kind: "text", value: text.slice(cursor) });
  }
  return parts;
}
