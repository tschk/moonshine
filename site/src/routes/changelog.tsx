import { createElement, type ReactNode } from "react";
import { Chrome } from "../chrome";
import {
  formatInline,
  parseChangelog,
  type ChangelogRelease,
  type InlinePart,
} from "../changelog";
import source from "../../../CHANGELOG.md" with { type: "text" };
import type { PageData } from "../renderer";

export async function loader(): Promise<PageData> {
  return {
    meta: {
      title: "moonshine — changelog",
      description:
        "What changed in each moonshine release, from the repository CHANGELOG.",
    },
  };
}

function inline(parts: InlinePart[]): ReactNode[] {
  return parts.map((part, index) => {
    if (part.kind === "code") {
      return createElement("code", { key: index }, part.value);
    }
    if (part.kind === "link") {
      return createElement(
        "a",
        { key: index, href: part.href, rel: "noopener noreferrer" },
        part.value,
      );
    }
    return part.value;
  });
}

function Release({ release }: { release: ChangelogRelease }) {
  return (
    <article className="log-release" aria-labelledby={`v-${release.version}`}>
      <h2 className="log-version" id={`v-${release.version}`}>
        {release.title}
      </h2>
      {release.sections.map((section) => (
        <section key={section.heading} aria-label={section.heading}>
          <h3 className="log-section">{section.heading}</h3>
          <ul className="log-items">
            {section.items.map((item) => (
              <li key={item.slice(0, 72)}>{inline(formatInline(item))}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

export default function Changelog() {
  const releases = parseChangelog(source);
  return (
    <Chrome current="/changelog">
      <section>
        <h1>changelog</h1>
        <p className="lede">
          What changed in each release, taken from the repository changelog and
          bundled into this Worker — not fetched at request time.
        </p>
      </section>
      <div className="log">
        {releases.map((release) => (
          <Release key={release.version} release={release} />
        ))}
      </div>
    </Chrome>
  );
}
