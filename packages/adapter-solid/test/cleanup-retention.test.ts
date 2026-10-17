import { expect, test } from "bun:test";
import "../../react/test/dom";
import {
  h,
  render as nativeRender,
  templateBlock,
} from "@tschk/moonshine-dom/dom";
import { createSignal, onCleanup } from "@tschk/moonshine-dom/reactive";
import { render as solidRender } from "../src/cleanup-policy";
for (const [name, render] of [
  ["native", nativeRender],
  ["policy", solidRender],
] as const)
  test(
    name +
      " explicit templateBlock keeps its before-cleanup detach and inherited descendant retention",
    () => {
      const host = document.createElement("div");
      document.body.append(host);
      let root!: HTMLElement,
        child!: HTMLElement,
        set!: (value: number) => void;
      let connected: boolean | undefined,
        events = 0;
      const stop = render(
        () =>
          templateBlock(() => {
            const [n, write] = createSignal(1);
            set = write;
            child = h("button", { onClick: () => events++ }, () => n());
            root = h("section", null, child);
            onCleanup(() => {
              connected = root.isConnected;
            });
            return root;
          }),
        host,
      );
      expect(root.textContent).toBe("1");
      child.click();
      stop();
      expect(connected).toBe(false);
      expect(root.isConnected).toBe(false);
      expect(child.parentNode).toBe(root);
      expect(root.textContent).toBe("1");
      set(2);
      child.click();
      expect(root.textContent).toBe("1");
      expect(events).toBe(1);
      host.remove();
    },
  );
