import { expect, test } from "bun:test";
import "../../react/test/dom";
import { Show, createSolidShow } from "@tschk/moonshine-solid/control";
import { Show as nativeShow } from "@tschk/moonshine-dom/control";
import { createSignal, onCleanup } from "@tschk/moonshine-solid/solid";
import { h, render } from "@tschk/moonshine-solid/dom";
import {
  cleanupOrderKey,
  getOwner,
  createRoot as nativeRoot,
} from "@tschk/moonshine-dom/reactive";
test("compiler selection helper preserves existing native Show identity and does not install policy", () => {
  expect(Show).toBe(nativeShow);
  nativeRoot((stop) => {
    const owner = getOwner()!;
    const before = owner.context?.get(cleanupOrderKey);
    createSolidShow({
      when: () => true,
      children: () => h("p", null, "local"),
    });
    expect(owner.context?.get(cleanupOrderKey)).toBe(before);
    stop();
  });
});
test("accessor-shaped selected branch owns cleanup before parent and retains its live branch", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const [read, set] = createSignal(1);
  const trace: string[] = [];
  let calls = 0;
  const stop = render(() => {
    onCleanup(() => trace.push("parent"));
    return createSolidShow({
      when: read,
      children: (value) => {
        calls++;
        const node = h("button", null, value);
        onCleanup(() => trace.push("child:" + node.isConnected));
        return node;
      },
      fallback: () => h("i", null, "empty"),
    });
  }, host);
  const first = host.querySelector("button");
  set(2);
  expect(host.querySelector("button")).toBe(first);
  expect(calls).toBe(1);
  set(0);
  expect(trace).toEqual(["child:true"]);
  expect(host.textContent).toBe("empty");
  set(3);
  stop();
  expect(trace).toEqual(["child:true", "child:true", "parent"]);
  expect(host.childNodes.length).toBe(0);
  host.remove();
});
