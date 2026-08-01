import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import SignalGraph, { ISLAND_ID, type GraphProps } from "./islands/graph";
import Downloads, {
  DOWNLOADS_ISLAND,
  type DownloadsProps,
} from "./islands/downloads";

function readJson(key: string): unknown {
  const script = document.querySelector(`script[data-island-props="${key}"]`);
  if (!script?.textContent) return null;
  try {
    return JSON.parse(script.textContent) as unknown;
  } catch {
    return null;
  }
}

function readProps(): GraphProps {
  const parsed = readJson(ISLAND_ID) as Partial<GraphProps> | null;
  return { seed: typeof parsed?.seed === "number" ? parsed.seed : 0 };
}

const host = document.querySelector(`[data-island="${ISLAND_ID}"]`);
if (host) {
  hydrateRoot(host, createElement(SignalGraph, readProps()));
}

/**
 * Both download charts share one island id; the per-chart id on the host names
 * the props script, so two instances hydrate from two separate payloads.
 */
for (const node of document.querySelectorAll(
  `[data-island="${DOWNLOADS_ISLAND}"]`,
)) {
  const id = (node as HTMLElement).dataset.chartId;
  if (!id) continue;
  const props = readJson(`${DOWNLOADS_ISLAND}:${id}`) as DownloadsProps | null;
  if (!props || !Array.isArray(props.series?.points)) continue;
  hydrateRoot(node, createElement(Downloads, props));
}
