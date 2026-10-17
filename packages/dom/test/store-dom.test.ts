import { expect, test } from "bun:test";
import { h, render } from "../src/dom";
import { For, Show } from "../src/control";
import { onMount } from "../src/reactive";
import { createStore, produce, reconcile } from "../src/store";
import "../../react/test/dom";

test("native store reconciliation preserves keyed inputs and mounts after insertion", () => {
  const [state, set] = createStore({
    rows: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    open: false,
  });
  const container = document.createElement("main");
  document.body.append(container);
  const connected: boolean[] = [];
  const dispose = render(
    () =>
      h(
        "section",
        null,
        For({
          each: () => state.rows,
          children: (row) =>
            h("input", { "data-id": row.id, value: () => row.label }),
        }),
        Show({
          when: () => state.open,
          children: () => {
            const element = h("p", null, "mounted");
            onMount(() => {
              connected.push(element.isConnected);
            });
            return element;
          },
        }),
      ),
    container,
  );
  try {
    const input = container.querySelector<HTMLInputElement>('[data-id="a"]')!;
    input.focus();
    input.setSelectionRange(1, 1);
    const row = state.rows[0];
    set(
      "rows",
      reconcile([
        { id: "b", label: "B2" },
        { id: "a", label: "A" },
      ]),
    );
    expect(container.querySelector('[data-id="a"]')).toBe(input);
    expect(state.rows[1]).toBe(row);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(
      container.querySelector<HTMLInputElement>('[data-id="b"]')!.value,
    ).toBe("B2");
    set(
      produce((draft) => {
        draft.open = true;
      }),
    );
    expect(connected).toEqual([true]);
    dispose();
    set("open", false);
    set("open", true);
    expect(connected).toEqual([true]);
    expect(container.childNodes.length).toBe(0);
  } finally {
    dispose();
    container.remove();
  }
});
