import { describe, expect, test } from "bun:test";
import {
  createRoot,
  createSignal,
  DEV,
  enableExternalSource,
  ErrorBoundary,
  getExternalSourceFactories,
  resetErrorBoundaries,
  Suspense,
  SuspenseList,
} from "../src/solid";
import {
  h as ssrH,
  Match as ssrMatch,
  mergeProps as ssrMergeProps,
  renderToString,
  Show as ssrShow,
  Suspense as ssrSuspense,
  Switch as ssrSwitch,
} from "../src/ssr";
import {
  addEventListener,
  Assets,
  assign,
  classList,
  clearDelegatedEvents,
  delegateEvents,
  generateHydrationScript,
  HydrationScript,
  insert,
  isDev,
  isServer,
  NoHydration,
  setAttribute,
  setAttributeNS,
  spread,
  style,
} from "../src/web";

describe("@tschk/moonshine-solid/web & primitives", () => {
  test("isServer, isDev, DEV, NoHydration, Assets, and hydration script helpers", () => {
    expect(isServer).toBe(false);
    expect(isDev).toBe(false);
    expect(DEV).toBeUndefined();
    expect(generateHydrationScript()).toBe("");
    expect(HydrationScript()).toBeUndefined();
    expect(NoHydration({ children: "static" })).toBe("static");
    expect(Assets({ children: "meta" })).toBeUndefined();
  });

  test("setAttribute, setAttributeNS, classList, style, addEventListener, and delegateEvents", () => {
    const attrs = new Map<string, string>();
    const nsAttrs = new Map<string, string>();
    const classes = new Set<string>();
    const styles = new Map<string, string>();
    const listeners = new Map<string, Set<EventListener>>();

    const fakeNode = {
      setAttribute(k: string, v: string) {
        attrs.set(k, v);
      },
      removeAttribute(k: string) {
        attrs.delete(k);
        if (k === "style") styles.clear();
      },
      setAttributeNS(ns: string, k: string, v: string) {
        nsAttrs.set(`${ns}:${k}`, v);
      },
      removeAttributeNS(ns: string, k: string) {
        nsAttrs.delete(`${ns}:${k}`);
      },
      classList: {
        toggle(name: string, force?: boolean) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
      style: {
        internalCssText: "",
        get cssText() {
          return this.internalCssText;
        },
        set cssText(val: string) {
          this.internalCssText = val;
          styles.clear();
        },
        setProperty(k: string, v: string) {
          styles.set(k, v);
        },
        removeProperty(k: string) {
          styles.delete(k);
        },
      },
      addEventListener(type: string, fn: EventListener) {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener(type: string, fn: EventListener) {
        listeners.get(type)?.delete(fn);
      },
    } as unknown as HTMLElement;

    setAttribute(fakeNode, "data-id", 42);
    expect(attrs.get("data-id")).toBe("42");
    setAttribute(fakeNode, "disabled", true);
    expect(attrs.get("disabled")).toBe("");
    setAttribute(fakeNode, "disabled", false);
    expect(attrs.has("disabled")).toBe(false);

    setAttributeNS(fakeNode, "http://www.w3.org/1999/xlink", "href", "#icon");
    expect(nsAttrs.get("http://www.w3.org/1999/xlink:href")).toBe("#icon");
    setAttributeNS(fakeNode, "http://www.w3.org/1999/xlink", "href", null);
    expect(nsAttrs.has("http://www.w3.org/1999/xlink:href")).toBe(false);

    const prevClasses = classList(fakeNode, {
      "btn primary": true,
      hidden: false,
    });
    expect(Array.from(classes)).toEqual(["btn", "primary"]);
    classList(fakeNode, { "btn primary": false, active: true }, prevClasses);
    expect(Array.from(classes)).toEqual(["active"]);

    const prevStyle = style(fakeNode, { color: "red", "--gap": "8px" });
    expect(styles.get("color")).toBe("red");
    expect(styles.get("--gap")).toBe("8px");
    style(fakeNode, { color: null, "--gap": "12px" }, prevStyle);
    expect(styles.has("color")).toBe(false);
    expect(styles.get("--gap")).toBe("12px");

    const clicked: unknown[] = [];
    createRoot((dispose) => {
      addEventListener(fakeNode, "Click", [
        (arg: string) => clicked.push(arg),
        "payload",
      ]);
      for (const fn of listeners.get("click") ?? []) {
        fn({} as Event);
      }
      expect(clicked).toEqual(["payload"]);
      dispose();
      expect(listeners.get("click")?.size).toBe(0);
    });

    const fakeDoc = {} as Document;
    delegateEvents(["click", "input"], fakeDoc);
    clearDelegatedEvents(fakeDoc);
  });

  test("assign, spread, and insert update target nodes reactively", () => {
    const attrs = new Map<string, string>();
    const node = {
      textContent: "",
      firstChild: null,
      setAttribute(k: string, v: string) {
        attrs.set(k, v);
      },
      removeAttribute(k: string) {
        attrs.delete(k);
      },
      appendChild() {},
    } as unknown as HTMLElement;

    let refNode: unknown;
    createRoot((dispose) => {
      const [label, setLabel] = createSignal("hello");
      spread(node, () => ({
        id: label(),
        ref: (el: Element) => {
          refNode = el;
        },
      }));
      expect(refNode).toBe(node);
      expect(attrs.get("id")).toBe("hello");

      insert(node, () => label());
      expect(node.textContent).toBe("hello");

      setLabel("world");
      expect(attrs.get("id")).toBe("world");
      expect(node.textContent).toBe("world");

      assign(node, { "data-mode": "fast" });
      expect(attrs.get("data-mode")).toBe("fast");
      dispose();
    });
  });

  test("Suspense, SuspenseList, resetErrorBoundaries,enableExternalSource, and SSR Show/Switch/Match", () => {
    let extTracked = 0;
    enableExternalSource((fn) => ({
      track: () => {
        extTracked++;
        return fn();
      },
      dispose() {},
    }));
    expect(getExternalSourceFactories().length).toBeGreaterThanOrEqual(1);

    createRoot((dispose) => {
      const [ready, setReady] = createSignal<string | undefined>(undefined);
      const susp = Suspense({
        fallback: "loading...",
        get children() {
          return ready();
        },
      });
      expect(susp()).toBe("loading...");
      setReady("loaded!");
      expect(susp()).toBe("loaded!");

      const list = SuspenseList({
        revealOrder: "forwards",
        get children() {
          return ["a", "b"];
        },
      });
      expect(list()).toEqual(["a", "b"]);
      dispose();
    });

    const [bad, setBad] = createSignal(false);
    let boundary!: () => string | undefined;
    let stopBoundary!: () => void;
    createRoot((dispose) => {
      stopBoundary = dispose;
      boundary = ErrorBoundary({
        get children() {
          if (bad()) throw new Error("boom");
          return "recovered";
        },
        fallback: (err) => `caught:${err.message}`,
      });
    });
    expect(boundary()).toBe("recovered");
    setBad(true);
    expect(boundary()).toBe("caught:boom");
    setBad(false);
    resetErrorBoundaries();
    expect(boundary()).toBe("recovered");
    stopBoundary();

    const html = renderToString(() => {
      const merged = ssrMergeProps({ tag: "span" }, { label: "ok" });
      return ssrH("div", null, [
        ssrShow({
          when: merged.label,
          keyed: true,
          children: (val: string) => ssrH("b", null, val),
        }),
        ssrSwitch({
          fallback: ssrH("i", null, "none"),
          children: [
            ssrMatch({ when: false, children: ssrH("i", null, "no") }),
            ssrMatch({
              when: "yes",
              keyed: true,
              children: (v: string) => ssrH("i", null, v),
            }),
          ],
        }),
        ssrSuspense({
          fallback: "wait",
          children: ssrH("em", null, "done"),
        }),
      ]);
    });
    expect(html).toBe("<div><b>ok</b><i>yes</i><em>done</em></div>");
  });
});
