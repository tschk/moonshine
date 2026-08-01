import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import SignalGraph, { ISLAND_ID, type GraphProps } from "./islands/graph";

function readProps(): GraphProps {
  const script = document.querySelector(
    `script[data-island-props="${ISLAND_ID}"]`,
  );
  if (!script?.textContent) return { seed: 0 };
  try {
    const parsed = JSON.parse(script.textContent) as Partial<GraphProps>;
    return { seed: typeof parsed.seed === "number" ? parsed.seed : 0 };
  } catch {
    return { seed: 0 };
  }
}

const host = document.querySelector(`[data-island="${ISLAND_ID}"]`);
if (host) {
  hydrateRoot(host, createElement(SignalGraph, readProps()));
}
