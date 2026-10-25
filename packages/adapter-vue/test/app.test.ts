import { expect, test } from "bun:test";
import "../../react/test/dom";
import { createApp } from "../src/app";
import { bindRef, exposeRefs } from "../src/expose";
import { exposeComponent } from "@tschk/moonshine-dom/component-instance";
import { h } from "@tschk/moonshine-dom/dom";
import { ref, watchSyncEffect } from "../src/reactive";
import { onMounted, onBeforeUnmount, onUnmounted } from "../src/lifecycle";
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test("independent factory apps retain nodes/local state and owned lifecycle", async () => {
  const trace: string[] = [];
  const local = ref(0);
  let runs = 0;
  const App = ({ id }: { id: string }) => {
    watchSyncEffect(() => {
      void local.value;
      runs++;
    });
    onMounted(() => trace.push("mount:" + id));
    onBeforeUnmount(() => trace.push("before:" + id));
    onUnmounted(() => trace.push("stop:" + id));
    return h("button", { "data-id": id }, () => local.value);
  };
  const first = document.createElement("main"),
    second = document.createElement("main");
  document.body.append(first, second);
  first.innerHTML = "<i>old</i>";
  const a = createApp(App, { id: "a" }),
    b = createApp(App, { id: "b" });
  a.mount(first);
  b.mount(second);
  await tick();
  const node = first.querySelector("button");
  local.value = 1;
  expect(first.querySelector("button")).toBe(node);
  expect(first.textContent).toBe("1");
  a.unmount();
  a.unmount();
  await tick();
  expect(first.innerHTML).toBe("");
  expect(second.textContent).toBe("1");
  const before = runs;
  local.value = 2;
  expect(runs).toBe(before + 1);
  b.unmount();
  await tick();
  local.value = 3;
  expect(runs).toBe(before + 1);
  expect(trace).toEqual([
    "mount:a",
    "mount:b",
    "before:a",
    "stop:a",
    "before:b",
    "stop:b",
  ]);
  first.remove();
  second.remove();
});
test("invalid targets preserve content and do not consume the mount attempt; remount rejects", () => {
  const el = document.createElement("div");
  el.innerHTML = "old";
  const app = createApp(() => h("p", {}, "new"), {});
  app.unmount();
  expect(() => app.mount("#missing-native-app")).toThrow("target");
  expect(() => app.mount({} as Element)).toThrow("target");
  expect(el.innerHTML).toBe("old");
  app.mount(el);
  expect(el.textContent).toBe("new");
  expect(() => app.mount(el)).toThrow("again");
  app.unmount();
  expect(() => app.mount(el)).toThrow("again");
});
test("selector, shadow and SVG containers use existing namespace rendering", () => {
  const el = document.createElement("section");
  el.id = "native-app-target";
  document.body.append(el);
  const a = createApp(() => h("b", {}, "selected"), {});
  a.mount("#native-app-target");
  expect(el.textContent).toBe("selected");
  a.unmount();
  const shadow = el.attachShadow({ mode: "open" }),
    b = createApp(() => h("em", {}, "shadow"), {});
  b.mount(shadow);
  expect(shadow.textContent).toBe("shadow");
  b.unmount();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    c = createApp(() => h("a", {}, "svg"), {});
  c.mount(svg);
  expect(svg.firstChild?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  c.unmount();
  el.remove();
});
test("failed setup or asynchronous result cleans prior setup work and is terminal", () => {
  for (const fail of [
    () => {
      throw Error("setup");
    },
    () => Promise.resolve("invalid"),
  ]) {
    const source = ref(0);
    let runs = 0;
    const el = document.createElement("main");
    el.innerHTML = "old";
    const app = createApp(() => {
      watchSyncEffect(() => {
        void source.value;
        runs++;
      });
      return fail() as never;
    }, {});
    expect(() => app.mount(el)).toThrow();
    expect(el.innerHTML).toBe("");
    source.value = 1;
    expect(runs).toBe(1);
    expect(() => app.mount(el)).toThrow("again");
    app.unmount();
  }
});
test("unmount requested during setup or mounted callback drains new root once", async () => {
  for (const phase of ["setup", "mounted"]) {
    const source = ref(0);
    let runs = 0,
      cleaned = 0;
    const el = document.createElement("main");
    let app: ReturnType<typeof createApp>;
    app = createApp(() => {
      watchSyncEffect((clean) => {
        void source.value;
        runs++;
        clean(() => cleaned++);
      });
      if (phase === "setup") app.unmount();
      else onMounted(() => app.unmount());
      return h("p", {}, "pending");
    }, {});
    app.mount(el);
    await tick();
    expect(el.innerHTML).toBe("");
    expect(cleaned).toBe(1);
    source.value = 1;
    expect(runs).toBe(1);
    app.unmount();
    expect(cleaned).toBe(1);
  }
});
test("invalid root/props reject before mount work", () => {
  expect(() => createApp({} as never, {})).toThrow("factory");
  expect(() => createApp(() => null, null as never)).toThrow("props");
});
test("reentrant mount rejects before touching its other target", () => {
  const first = document.createElement("main"),
    other = document.createElement("main");
  other.innerHTML = "keep";
  let app: ReturnType<typeof createApp>;
  app = createApp(() => {
    expect(() => app.mount(other)).toThrow("again");
    return h("b", {}, "first");
  }, {});
  app.mount(first);
  expect(other.innerHTML).toBe("keep");
  app.unmount();
});
test("mounted failure rolls back and throwing disposal still drains peers once", async () => {
  let stopped = 0;
  const first = document.createElement("main");
  const bad = createApp(() => {
    watchSyncEffect((clean) => clean(() => stopped++));
    onMounted(() => {
      throw Error("mounted");
    });
    return h("p", {}, "failed");
  }, {});
  expect(() => bad.mount(first)).toThrow("mounted");
  expect(first.innerHTML).toBe("");
  expect(stopped).toBe(1);
  bad.unmount();
  const trace: string[] = [];
  const target = document.createElement("main");
  const app = createApp(() => {
    watchSyncEffect((clean) => clean(() => trace.push("effect")));
    onBeforeUnmount(() => {
      trace.push("before");
      throw Error("cleanup");
    });
    onUnmounted(() => trace.push("after"));
    return h("p", {}, "live");
  }, {});
  app.mount(target);
  expect(() => app.unmount()).toThrow("cleanup");
  await tick();
  expect(target.innerHTML).toBe("");
  expect(trace).toEqual(["before", "effect", "after"]);
  app.unmount();
  expect(trace).toEqual(["before", "effect", "after"]);
});

test("disconnected old content can cancel mounting before the factory runs", () => {
  const target = document.createElement("main");
  document.body.append(target);
  let setups = 0;
  const app = createApp(() => {
    setups++;
    return h("p", {}, "new");
  }, {});
  customElements.define(
    "native-app-cancel-old",
    class extends HTMLElement {
      disconnectedCallback() {
        app.unmount();
      }
    },
  );
  target.append(document.createElement("native-app-cancel-old"));
  app.mount(target);
  expect(setups).toBe(0);
  expect(target.innerHTML).toBe("");
  expect(() => app.mount(target)).toThrow("again");
  target.remove();
});
test("container lease rejects simultaneous apps and permits a fresh app after disposal", () => {
  const el = document.createElement("main");
  const first = createApp(() => h("b", {}, "first"), {}),
    second = createApp(() => h("i", {}, "second"), {});
  first.mount(el);
  expect(() => second.mount(el)).toThrow("already owned");
  expect(el.textContent).toBe("first");
  first.unmount();
  second.mount(el);
  expect(el.textContent).toBe("second");
  second.unmount();
  expect(el.innerHTML).toBe("");
});
test("container lease is reserved before clearing and held through cleanup callbacks", () => {
  const el = document.createElement("main");
  document.body.append(el);
  const second = createApp(() => h("i", {}, "second"), {});
  let attempts = 0;
  customElements.define(
    "native-app-lease-old",
    class extends HTMLElement {
      disconnectedCallback() {
        attempts++;
        expect(() => second.mount(el)).toThrow("already owned");
      }
    },
  );
  el.append(document.createElement("native-app-lease-old"));
  const first = createApp(() => {
    watchSyncEffect((clean) =>
      clean(() => {
        attempts++;
        expect(() => second.mount(el)).toThrow("already owned");
      }),
    );
    return h("b", {}, "first");
  }, {});
  first.mount(el);
  expect(el.textContent).toBe("first");
  first.unmount();
  expect(attempts).toBe(2);
  second.mount(el);
  expect(el.textContent).toBe("second");
  second.unmount();
  el.remove();
});
test("failed mount releases its lease only after owned cleanup completes", () => {
  const el = document.createElement("main");
  const next = createApp(() => h("i", {}, "recovered"), {});
  const bad = createApp(() => {
    watchSyncEffect((clean) =>
      clean(() => expect(() => next.mount(el)).toThrow("already owned")),
    );
    throw Error("failure");
  }, {});
  expect(() => bad.mount(el)).toThrow("failure");
  expect(el.innerHTML).toBe("");
  next.mount(el);
  expect(el.textContent).toBe("recovered");
  next.unmount();
});

test("cancelled mounting holds the lease through its pending root stop", () => {
  const el = document.createElement("main");
  const next = createApp(() => h("i", {}, "next"), {});
  let app: ReturnType<typeof createApp>;
  app = createApp(() => {
    watchSyncEffect((clean) =>
      clean(() => expect(() => next.mount(el)).toThrow("already owned")),
    );
    app.unmount();
    return h("b", {}, "cancelled");
  }, {});
  app.mount(el);
  expect(el.innerHTML).toBe("");
  next.mount(el);
  expect(el.textContent).toBe("next");
  next.unmount();
});

test("mount returns exposed instance synchronously, flushes template refs, and falls back to an empty null-proto object", () => {
  const target = document.createElement("main");
  const inputRef = ref<HTMLInputElement | null>(null);
  const count = ref(3);
  const app = createApp(() => {
    exposeComponent(
      exposeRefs({
        count,
        increment() {
          count.value++;
        },
      }),
    );
    return h("input", {
      ref: (el: HTMLInputElement) =>
        bindRef(el, {
          get: () => inputRef.value,
          set: (next) => {
            inputRef.value = next;
          },
        }),
    });
  }, {});
  const vm = app.mount(target) as { count: number; increment: () => void };
  expect(Object.getPrototypeOf(vm)).not.toBe(Object.prototype);
  expect(vm.count).toBe(3);
  expect(inputRef.value).toBe(target.querySelector("input"));
  vm.increment();
  expect(vm.count).toBe(4);
  app.unmount();
  expect(inputRef.value).toBeNull();

  const plainTarget = document.createElement("main");
  const plainApp = createApp(() => h("span", {}, "plain"), {});
  const plainVm = plainApp.mount(plainTarget);
  expect(Object.getPrototypeOf(plainVm)).toBeNull();
  expect(Reflect.ownKeys(plainVm)).toEqual([]);
  plainApp.unmount();
});

test("Vue 3 App API supports use, provide, runWithContext, component, directive, config, onUnmount, router, and pinia", async () => {
  const {
    createSSRApp,
    definePlugin,
    resolveComponent,
    resolveDirective,
    withDirectives,
  } = await import("../src/app");
  const { inject, hasInjectionContext, useId } = await import("../src/context");
  const { createPinia, defineStore } = await import("../src/store");
  const { createRouter, createMemoryHistory, useRoute } =
    await import("../src/router");
  const { h: ssrH } = await import("@tschk/moonshine-dom/ssr");
  const { renderToString } = await import("../src/server-renderer");

  const useCartStore = defineStore("app-cart", () => {
    const items = ref(2);
    return { items };
  });

  const pluginCalls: string[] = [];
  const myPlugin = definePlugin((app, prefix: string) => {
    pluginCalls.push(`${prefix}:${app.version}`);
    app.provide("pluginGreeting", `${prefix}-hello`);
    app.component("BadgeComp", (props: { label: string }) =>
      ssrH("em", { class: "badge" }, props.label),
    );
    app.directive("focus", {
      getSSRProps(binding) {
        return { "data-focused": String(binding.value) };
      },
    });
  });

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/checkout", component: () => null }],
  });
  await router.push("/checkout");
  const pinia = createPinia();

  const app = createSSRApp(() => {
    const greeting = inject<string>("pluginGreeting", "missing");
    const route = useRoute();
    const cart = useCartStore();
    const Badge = resolveComponent("BadgeComp") as (props: {
      label: string;
    }) => unknown;
    const focusDir = resolveDirective("focus");
    const id = useId();
    const extraProps = withDirectives({ id, "data-path": route.path }, [
      [focusDir, "yes"],
    ]);
    return ssrH(
      "section",
      extraProps,
      `${greeting}:${cart.items}:`,
      ssrH(Badge as never, { label: "VIP" }),
    );
  });

  app.config.idPrefix = "custom";
  app.use(myPlugin, "v3").use(myPlugin, "duplicate-ignored");
  app.use(pinia).use(router);

  expect(pluginCalls).toEqual(["v3:3.5.13"]);
  expect(
    app.runWithContext(() => [hasInjectionContext(), inject("pluginGreeting")]),
  ).toEqual([true, "v3-hello"]);

  const html = await renderToString(app);
  expect(html).toBe(
    '<section id="custom-0" data-path="/checkout" data-focused="yes">v3-hello:2:<em class="badge">VIP</em></section>',
  );

  // Verify app.onUnmount runs on DOM unmount
  const unmounted: string[] = [];
  const domTarget = document.createElement("div");
  const domApp = createApp(() => h("span", {}, "dom"), {});
  domApp.onUnmount(() => unmounted.push("hook-1"));
  domApp.onUnmount(() => unmounted.push("hook-2"));
  domApp.mount(domTarget);
  domApp.unmount();
  expect(unmounted).toEqual(["hook-1", "hook-2"]);
});

test("server-renderer awaits onServerPrefetch, replays reactive state, populates useSSRContext + teleports, and streams", async () => {
  const { createSSRApp } = await import("../src/app");
  const { onServerPrefetch } = await import("../src/lifecycle");
  const { reactive, Teleport } = await import("../src/reactive");
  const { h: ssrH } = await import("@tschk/moonshine-dom/ssr");
  const {
    renderToString,
    renderToWebStream,
    renderToSimpleStream,
    useSSRContext,
    ssrInterpolate,
    ssrRenderAttrs,
    ssrRenderClass,
    ssrRenderStyle,
    ssrRenderAttr,
    ssrRenderTeleport,
  } = await import("../src/server-renderer");

  const Root = () => {
    const title = ref("loading");
    const state = reactive({ count: 1 });
    const ssrCtx = useSSRContext<{ requestId?: string; fetched?: boolean }>();

    onServerPrefetch(async () => {
      await Promise.resolve();
      title.value = `ready-${ssrCtx?.requestId ?? "none"}`;
      state.count = 42;
      if (ssrCtx) ssrCtx.fetched = true;
    });

    return ssrH(
      "main",
      { "data-count": state.count },
      ssrH("h1", null, title.value),
      ssrH(
        Teleport as never,
        { to: "#modals" },
        ssrH("div", { class: "modal" }, `Modal:${state.count}`),
      ),
    );
  };

  const ctx: {
    requestId: string;
    fetched?: boolean;
    teleports?: Record<string, string>;
  } = { requestId: "req-7" };
  const html = await renderToString(createSSRApp(Root), ctx);
  expect(html).toBe(
    '<main data-count="42"><h1>ready-req-7</h1><!--teleport start--><!--teleport end--></main>',
  );
  expect(ctx.fetched).toBe(true);
  expect(ctx.teleports?.["#modals"]).toBe('<div class="modal">Modal:42</div>');

  // Web ReadableStream
  const stream = renderToWebStream(createSSRApp(Root), { requestId: "web-1" });
  const streamText = await new Response(stream).text();
  expect(streamText).toBe(
    '<main data-count="42"><h1>ready-web-1</h1><!--teleport start--><!--teleport end--></main>',
  );

  // SimpleStream
  const chunks: string[] = [];
  await new Promise<void>((resolve, reject) => {
    renderToSimpleStream(
      createSSRApp(Root),
      { requestId: "simple-1" },
      {
        push(content) {
          if (content !== null) chunks.push(content);
          else resolve();
        },
        destroy(err) {
          reject(err);
        },
      },
    );
  });
  expect(chunks.join("")).toBe(
    '<main data-count="42"><h1>ready-simple-1</h1><!--teleport start--><!--teleport end--></main>',
  );

  // Low-level SSR helpers
  expect(ssrInterpolate("<tag>&")).toBe("&lt;tag&gt;&amp;");
  expect(ssrRenderClass(["a", { b: true, c: false }])).toBe("a b");
  expect(ssrRenderStyle({ backgroundColor: "red", "--x": "1" })).toBe(
    "background-color:red;--x:1",
  );
  expect(ssrRenderAttr("data-title", 'a"b')).toBe(' data-title="a&quot;b"');
  expect(
    ssrRenderAttrs({ id: "hero", class: ["x", { y: true }], disabled: true }),
  ).toBe(' id="hero" class="x y" disabled');
  const teleportOut: string[] = [];
  const teleportCtx: { teleports?: Record<string, string> } = {};
  ssrRenderTeleport(
    (chunk) => teleportOut.push(chunk),
    (push) => push("<span>inside</span>"),
    "#drawer",
    false,
    teleportCtx,
  );
  expect(teleportOut.join("")).toBe("<!--teleport start--><!--teleport end-->");
  expect(teleportCtx.teleports?.["#drawer"]).toBe("<span>inside</span>");
});
