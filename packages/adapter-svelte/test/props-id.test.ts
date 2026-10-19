import { describe, expect, test } from "bun:test";
import { createRoot, onCleanup } from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import {
  createRuneEffect,
  createState,
  propsId,
} from "@tschk/moonshine-svelte/runes";
import {
  flushSync,
  settled,
  tick,
  untrack,
} from "@tschk/moonshine-svelte/svelte";
import {
  flushSync as serverFlushSync,
  propsId as serverPropsId,
  settled as serverSettled,
  untrack as serverUntrack,
} from "@tschk/moonshine-svelte/ssr";

function collectDomTree(): string[] {
  return createRoot((dispose) => {
    const ids: string[] = [];
    createComponent(
      () => {
        ids.push(propsId());
        createComponent(
          () => {
            ids.push(`${propsId()}:${propsId()}`);
          },
          {},
          "dom",
        );
        createComponent(
          () => {
            ids.push(propsId());
          },
          {},
          "dom",
        );
      },
      {},
      "dom",
    );
    dispose();
    return ids;
  });
}

function Child(props: { label: string }) {
  const id = serverPropsId();
  return [
    h("label", { for: id }, props.label),
    h("input", { id, type: "text" }),
  ];
}

function Parent() {
  const groupId = serverPropsId();
  return h(
    "fieldset",
    { id: groupId },
    h(Child, { label: "First" }),
    h(Child, { label: "Last" }),
  );
}

describe("Svelte $props.id() and scheduling helpers", () => {
  test("propsId generates deterministic tree-scoped IDs matching between DOM and SSR without leaking across roots", () => {
    expect(propsId).toBe(serverPropsId);
    expect(collectDomTree()).toEqual(["s-0", "s-1:s-2", "s-3"]);
    expect(collectDomTree()).toEqual(["s-0", "s-1:s-2", "s-3"]);

    const expectedHtml =
      '<fieldset id="s-0"><label for="s-1">First</label><input id="s-1" type="text"><label for="s-2">Last</label><input id="s-2" type="text"></fieldset>';
    expect(renderToString(() => h(Parent, {}))).toBe(expectedHtml);
    expect(renderToString(() => h(Parent, {}))).toBe(expectedHtml);

    expect(() => propsId()).toThrow(
      /\$props\.id\(\) must be called during native component initialization/,
    );
    let cleanupError: unknown;
    createRoot((dispose) => {
      onCleanup(() => {
        try {
          propsId();
        } catch (err) {
          cleanupError = err;
        }
      });
      dispose();
    });
    expect(cleanupError).toBeInstanceOf(Error);
  });

  test("flushSync, settled, and untrack coordinate queued rune work across DOM and SSR", async () => {
    const trace: string[] = [];
    let stop!: () => void;
    const count = createState(0);
    const secondary = createState(0);

    createRoot((dispose) => {
      stop = dispose;
      createRuneEffect(() => {
        const current = count.value;
        trace.push(`effect1:${current}`);
        if (current > 0 && untrack(() => secondary.value) < current * 10) {
          secondary.value = current * 10;
        }
      });
      createRuneEffect(() => {
        trace.push(`effect2:${secondary.value}`);
      });
    });

    await settled();
    expect(trace).toEqual(["effect1:0", "effect2:0"]);
    trace.length = 0;

    const returned = flushSync(() => {
      count.value = 2;
      return untrack(() => count.value * 5);
    });
    expect(returned).toBe(10);
    expect(trace).toEqual(["effect1:2", "effect2:20"]);

    trace.length = 0;
    count.value = 3;
    expect(trace).toEqual([]);
    flushSync();
    expect(trace).toEqual(["effect1:3", "effect2:30"]);

    trace.length = 0;
    count.value = 4;
    await settled();
    expect(trace).toEqual(["effect1:4", "effect2:40"]);

    stop();
    await tick();

    expect(() => flushSync(123 as unknown as () => void)).toThrow(TypeError);
    expect(() => serverFlushSync(123 as unknown as () => void)).toThrow(
      TypeError,
    );
    expect(serverFlushSync(() => serverUntrack(() => "ok"))).toBe("ok");
    expect(serverFlushSync()).toBeUndefined();
    await expect(serverSettled()).resolves.toBeUndefined();
  });
});
