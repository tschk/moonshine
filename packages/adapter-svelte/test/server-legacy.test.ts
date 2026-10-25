import "../../react/test/dom";
import { describe, expect, test } from "bun:test";
import { h as ssrH } from "@tschk/moonshine-dom/ssr";
import {
  head as renderSSRHead,
  title as renderSSRHeadTitle,
} from "@tschk/moonshine-dom/head-ssr";
import { h as domH } from "@tschk/moonshine-dom/dom";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { exposeComponent } from "@tschk/moonshine-dom/component-instance";
import { render } from "../src/server";
import {
  asClassComponent,
  createBubbler,
  createClassComponent,
  handlers,
  nonpassive,
  once,
  passive,
  preventDefault,
  run,
  self,
  stopImmediatePropagation,
  stopPropagation,
  trusted,
} from "../src/legacy";
import { createState, propsId } from "../src/runes";
import { getContext, tick } from "../src/svelte";

describe("@tschk/moonshine-svelte/server & /legacy", () => {
  test("render() from svelte/server renders body, head, html, context, and idPrefix", () => {
    const themeKey = Symbol("theme");
    function Page(props: { name: string }) {
      const id = propsId();
      const secondId = propsId();
      const theme = getContext<string>(themeKey);
      renderSSRHeadTitle(() => `Hello ${props.name}`);
      renderSSRHead(() =>
        ssrH("meta", { name: "theme", content: theme ?? "default" }),
      );
      return ssrH(
        "main",
        { id, "data-second": secondId, "data-theme": theme },
        `Welcome, ${props.name}!`,
      );
    }

    const out = render(Page, {
      props: { name: "<Ada>" },
      context: new Map([[themeKey, "aurora"]]),
      idPrefix: "app-",
    });

    expect(out.body).toBe(
      '<main id="app-s-0" data-second="app-s-1" data-theme="aurora">Welcome, &lt;Ada&gt;!</main>',
    );
    expect(out.html).toBe(out.body);
    expect(out.head).toBe(
      '<meta name="theme" content="aurora"><title>Hello &lt;Ada&gt;</title>',
    );

    const plain = render(() => ssrH("p", { id: propsId() }, "plain"));
    expect(plain).toEqual({
      body: '<p id="s-0">plain</p>',
      head: "",
      html: '<p id="s-0">plain</p>',
    });

    expect(() => render(null as unknown as () => unknown)).toThrow(TypeError);
    expect(() =>
      render(() => "ok", { context: {} as unknown as Map<unknown, unknown> }),
    ).toThrow(TypeError);
    expect(() =>
      render(() => "ok", { idPrefix: 123 as unknown as string }),
    ).toThrow(TypeError);
  });

  test("event modifiers in svelte/legacy compose and guard event invocation", () => {
    const log: string[] = [];
    const combined = handlers(
      function (this: { tag: string }, value: number) {
        log.push(`a:${this.tag}:${value}`);
      },
      null,
      undefined,
      false,
      function (this: { tag: string }, value: number) {
        log.push(`b:${this.tag}:${value}`);
      },
    );
    combined.call({ tag: "btn" }, 7);
    expect(log).toEqual(["a:btn:7", "b:btn:7"]);

    let onceCalls = 0;
    const onlyOnce = once(function (this: { id: number }, step: number) {
      onceCalls += this.id + step;
    });
    onlyOnce.call({ id: 10 }, 5);
    onlyOnce.call({ id: 10 }, 5);
    expect(onceCalls).toBe(15);

    let defaultPrevented = false;
    let propagationStopped = false;
    let immediateStopped = false;
    const fakeEvent = {
      preventDefault() {
        defaultPrevented = true;
      },
      stopPropagation() {
        propagationStopped = true;
      },
      stopImmediatePropagation() {
        immediateStopped = true;
      },
    } as unknown as Event;

    let handled = 0;
    preventDefault(() => {
      handled++;
    })(fakeEvent);
    stopPropagation(() => {
      handled++;
    })(fakeEvent);
    stopImmediatePropagation(() => {
      handled++;
    })(fakeEvent);
    expect(defaultPrevented).toBe(true);
    expect(propagationStopped).toBe(true);
    expect(immediateStopped).toBe(true);
    expect(handled).toBe(3);

    const node = {};
    const other = {};
    let selfHits = 0;
    const onSelf = self(() => {
      selfHits++;
    });
    onSelf({ target: other, currentTarget: node } as unknown as Event);
    expect(selfHits).toBe(0);
    onSelf({ target: node, currentTarget: node } as unknown as Event);
    expect(selfHits).toBe(1);

    let trustedHits = 0;
    const onTrusted = trusted(() => {
      trustedHits++;
    });
    onTrusted({ isTrusted: false } as unknown as Event);
    expect(trustedHits).toBe(0);
    onTrusted({ isTrusted: true } as unknown as Event);
    expect(trustedHits).toBe(1);
  });

  test("passive, nonpassive, run, and createBubbler work in native owners and DOM", async () => {
    const target = new EventTarget();
    const events: string[] = [];
    const pAction = passive(target, [
      "custom",
      () => {
        events.push("passive-1");
      },
    ]);
    target.dispatchEvent(new Event("custom"));
    pAction.update([
      "custom",
      () => {
        events.push("passive-2");
      },
    ]);
    target.dispatchEvent(new Event("custom"));
    pAction.destroy();
    target.dispatchEvent(new Event("custom"));
    expect(events).toEqual(["passive-1", "passive-2"]);

    const npAction = nonpassive(target, [
      "ping",
      () => {
        events.push("nonpassive");
      },
    ]);
    target.dispatchEvent(new Event("ping"));
    npAction.destroy();
    expect(events).toEqual(["passive-1", "passive-2", "nonpassive"]);

    const state = createState(1);
    const seen: number[] = [];
    let stopRoot!: () => void;
    createRoot((dispose) => {
      stopRoot = dispose;
      run(() => {
        seen.push(state.value);
      });
    });
    await tick();
    expect(seen).toEqual([1]);
    state.value = 2;
    await tick();
    expect(seen).toEqual([1, 2]);
    stopRoot();

    // Outside component context, createBubbler still returns a callable bubble helper
    const bubble = createBubbler();
    const fallbackBtn = new EventTarget();
    const fakeEvt = new Event("notify");
    Object.defineProperty(fakeEvt, "currentTarget", { value: fallbackBtn });
    expect(bubble("notify")(fakeEvt)).toBe(true);
  });

  test("createClassComponent and asClassComponent wrap native components with $set, $on, and $destroy", () => {
    const container = document.createElement("div");

    function CounterWidget(props: { label?: string; count?: number }) {
      let bonus = 0;
      exposeComponent({
        addBonus(n: number) {
          bonus += n;
          return bonus;
        },
      });
      return domH(
        "span",
        { class: "widget" },
        () => `${props.label ?? "Counter"}:${props.count ?? 0}`,
      );
    }

    const instance = createClassComponent({
      component: CounterWidget,
      target: container,
      props: { label: "Score", count: 3 },
    });

    expect(container.textContent).toBe("Score:3");
    expect((instance as { addBonus(n: number): number }).addBonus(5)).toBe(5);

    const events: unknown[] = [];
    const off = instance.$on("Ping", (e) => {
      events.push(e.detail);
    });
    instance.$set({ count: 9 });
    expect(container.textContent).toBe("Score:9");
    off();

    instance.$destroy();
    expect(container.textContent).toBe("");

    const LegacyCounter = asClassComponent(CounterWidget);
    const second = new LegacyCounter({
      target: container,
      props: { label: "Lives", count: 2 },
    });
    expect(container.textContent).toBe("Lives:2");
    second.$set({ label: "Stars", count: 4 });
    expect(container.textContent).toBe("Stars:4");
    second.$destroy();
    expect(container.textContent).toBe("");
  });

  const sourceCompiler = process.env.MOONSHINE_CREPUS_COMPILER;
  test.skipIf(!sourceCompiler)(
    "Crepus lowers svelte/server, svelte/legacy, and flushSync imports in Svelte and TS modules",
    async () => {
      const { cp, mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = join(import.meta.dir, "..");
      const dir = await mkdtemp(join(tmpdir(), "moonshine-svelte-server-"));
      try {
        for (const [name, source] of [
          ["moonshine", join(root, "../core")],
          ["moonshine-dom", join(root, "../dom")],
          ["moonshine-svelte", root],
        ]) {
          const target = join(dir, "node_modules/@tschk", name!);
          await cp(join(source!, "src"), join(target, "src"), {
            recursive: true,
          });
          await cp(join(source!, "package.json"), join(target, "package.json"));
        }

        await Bun.write(
          join(dir, "source/Page.svelte"),
          `<script lang="ts">
import { flushSync, type ComponentProps } from 'svelte';
import { render as serverRender, type RenderOutput } from 'svelte/server';
import { run, once, preventDefault } from 'svelte/legacy';
let { title = 'Hello' }: { title?: string } = $props();
const id = $props.id();
let count = $state(0);
const ready = $derived(typeof serverRender === 'function' && typeof run === 'function');
const bump = once(preventDefault(() => {
  flushSync(() => {
    count += 1;
  });
}));
</script>
<svelte:head><title>{title}</title></svelte:head>
<button {id} onclick={bump}>{title}:{count}:{ready}</button>`,
        );
        for (const [target, out] of [
          ["moonshine-dom", "dom"],
          ["moonshine-ssr", "ssr"],
        ] as const) {
          const proc = Bun.spawn(
            [
              sourceCompiler!,
              "web",
              "build",
              "--site",
              "source",
              "--entry",
              "Page.svelte",
              "--emit",
              target,
              "--out-dir",
              out,
            ],
            { cwd: dir, stdout: "pipe", stderr: "pipe" },
          );
          const [stdout, stderr, code] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
          ]);
          expect(code, stdout + stderr).toBe(0);
        }
        const verifyScript = `
import assert from 'node:assert/strict';
import PageSSR from './ssr/CrepusEmit.moonshine-ssr.ts';
import { render } from '@tschk/moonshine-svelte/server';
const domSource = await Bun.file('./dom/modules/moonshine-dom/Page.svelte.ts').text();
const ssrSource = await Bun.file('./ssr/modules/moonshine-ssr/Page.svelte.ts').text();
assert.ok(domSource.includes('@tschk/moonshine-svelte/server'));
assert.ok(domSource.includes('@tschk/moonshine-svelte/legacy'));
assert.ok(ssrSource.includes('@tschk/moonshine-svelte/server'));
assert.ok(ssrSource.includes('@tschk/moonshine-svelte/legacy'));
const rendered = render(PageSSR, { props: { title: 'Svelte 5 Server' }, idPrefix: 'srv-' });
assert.equal(rendered.head, '<title>Svelte 5 Server</title>');
assert.equal(rendered.body, '<button id="srv-s-0">Svelte 5 Server:0:true</button>');
assert.equal(rendered.html, rendered.body);
`;
        const child = Bun.spawn(
          [Bun.which("bun")!, "--no-install", "-e", verifyScript],
          { cwd: dir, stdout: "pipe", stderr: "pipe" },
        );
        const [out, err, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(code, out + err).toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
