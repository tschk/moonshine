/**
 * @tschk/moonshine-solid
 *
 * Solid gets a separate adapter — no shared vnode with React.
 * Bridges `@tschk/moonshine` signals into Solid's reactive model and
 * maps Crepus View IR onto solid-js elements via `solid-js/h`.
 */

import { createSignal as msCreateSignal, type Signal as MsSignal } from "@tschk/moonshine";
import {
  createSignal as solidCreateSignal,
  createEffect,
  type Accessor,
  type Setter,
  type JSX,
} from "solid-js";
import h from "solid-js/h";

/** Wrap a moonshine signal as a Solid accessor + setter pair. */
export function fromMoonshineSignal<T>(
  signal: MsSignal<T>,
): [Accessor<T>, Setter<T>] {
  const [get, set] = solidCreateSignal(signal());
  createEffect(() => {
    const unsub = signal.subscribe(() => set(() => signal()));
    return unsub;
  });
  return [
    get,
    ((v: T | ((prev: T) => T)) => {
      if (typeof v === "function") {
        signal.set(v as (prev: T) => T);
      } else {
        signal.set(v as T);
      }
      return signal();
    }) as Setter<T>,
  ];
}

/** Create a Solid-friendly store backed by moonshine createSignal. */
export function createBridgedSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
  return fromMoonshineSignal(msCreateSignal(initial));
}

export type CrepusSolidNode = {
  kind: string;
  content?: string;
  label?: string;
  children?: CrepusSolidNode[];
  values?: number[];
  [key: string]: unknown;
};

export type CrepusSolidIr = {
  version?: number;
  root: CrepusSolidNode[];
};

/**
 * Map View IR → Solid elements (separate from the React renderer).
 * Covers the same kind surface as `@tschk/crepus-moonshine` at a structural level.
 */
export function renderCrepusIrSolid(ir: CrepusSolidIr): JSX.Element {
  const kids = (ir.root ?? []).map((n, i) => renderNode(n, `s.${i}`));
  return h(
    "div",
    {
      "data-crepus-root": true,
      "data-crepus-target": "solid",
      "data-crepus-ir-version": ir.version ?? 1,
    },
    ...kids,
  ) as JSX.Element;
}

function renderNode(node: CrepusSolidNode, key: string): JSX.Element {
  switch (node.kind) {
    case "text":
      return h("span", { "data-crepus-kind": "text" }, node.content ?? "") as JSX.Element;
    case "stack":
      return h(
        "div",
        {
          "data-crepus-kind": "stack",
          style: { display: "flex", "flex-direction": "column", gap: "8px" },
        },
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      ) as JSX.Element;
    case "button":
      return h(
        "button",
        { type: "button", "data-crepus-kind": "button" },
        node.label ?? "",
      ) as JSX.Element;
    case "sparkline": {
      const values = (node.values ?? []).join(",");
      return h("span", {
        "data-crepus-kind": "sparkline",
        "data-values": values,
      }) as JSX.Element;
    }
    case "badge":
      return h("span", { "data-crepus-kind": "badge" }, node.label ?? "") as JSX.Element;
    case "list":
      return h(
        "ul",
        { "data-crepus-kind": "list" },
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      ) as JSX.Element;
    case "listItem":
      return h(
        "li",
        { "data-crepus-kind": "listItem" },
        node.label ?? "",
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      ) as JSX.Element;
    default:
      return h("div", {
        "data-crepus-kind": node.kind,
        "data-crepus-unknown": "true",
      }) as JSX.Element;
  }
}

export { msCreateSignal as createMoonshineSignal };
export type { MsSignal as MoonshineSignal };
