import { describe, expect, test } from "bun:test";
import {
  batch,
  collectDeps,
  isTracking,
  createMemo,
  createSignal,
  createStore,
  getStoreRoot,
  untrack,
} from "../src/signal";
import {
  createMoonshineRouter,
  matchPath,
  matchRoutes,
  navigate,
  getLocation,
} from "../src/router";
import { createFullscreenFragment, wrapFragmentSource } from "../src/shaders";

test("failed memo updates retry reads instead of returning an old cached value", () => {
  const value = createSignal(1);
  let failing = false;
  const memo = createMemo(() => {
    const current = value();
    if (failing) throw new Error("failed update");
    return current;
  });
  const stop = memo.subscribe(() => {});
  expect(memo()).toBe(1);
  failing = true;
  expect(() => value.set(2)).toThrow("failed update");
  expect(memo).toThrow("failed update");
  expect(memo).toThrow("failed update");
  failing = false;
  expect(memo()).toBe(2);
  stop();
});

test("failed dependency validation also retries through downstream memos", () => {
  const value = createSignal(1);
  let failing = false;
  const inner = createMemo(() => {
    const current = value();
    if (failing) throw new Error("dependency failed");
    return current;
  });
  const outer = createMemo(() => inner() * 2);
  expect(outer()).toBe(2);
  value.set(2);
  failing = true;
  expect(outer).toThrow("dependency failed");
  expect(outer).toThrow("dependency failed");
  failing = false;
  expect(outer()).toBe(4);
});
import {
  createMoonshineServer,
  definePage,
  handleMoonshineRequest,
  resolvePage,
  resolveStaticPath,
  tryServeStatic,
} from "../src/server";

describe("createSignal", () => {
  test("one failing subscriber does not starve independent subscribers", () => {
    const signal = createSignal(0);
    const failure = new Error("first subscriber");
    const seen: string[] = [];
    signal.subscribe(() => {
      seen.push("first");
      throw failure;
    });
    signal.subscribe(() => {
      seen.push(`second:${signal()}`);
      throw new Error("second");
    });
    signal.subscribe(() => {
      seen.push(`third:${signal()}`);
    });
    expect(() => signal.set(1)).toThrow(failure);
    expect(seen).toEqual(["first", "second:1", "third:1"]);
  });

  test("batched notification failures drain the queue and preserve callback errors", () => {
    const signal = createSignal(0);
    const seen: number[] = [];
    signal.subscribe(() => {
      throw new Error("notification");
    });
    signal.subscribe(() => {
      seen.push(signal());
    });
    expect(() =>
      batch(() => {
        signal.set(1);
        signal.set(2);
      }),
    ).toThrow("notification");
    expect(seen).toEqual([2]);
    expect(() =>
      batch(() => {
        signal.set(3);
        throw new Error("callback");
      }),
    ).toThrow("callback");
    expect(seen).toEqual([2, 3]);
    expect(() => signal.set(4)).toThrow("notification");
    expect(seen).toEqual([2, 3, 4]);
  });

  test("reads and writes", () => {
    const count = createSignal(0);
    expect(count()).toBe(0);
    count.set(1);
    expect(count()).toBe(1);
    count.set((n) => n + 1);
    expect(count()).toBe(2);
  });

  test("notifies subscribers", () => {
    const count = createSignal(0);
    let hits = 0;
    const unsub = count.subscribe(() => {
      hits++;
    });
    count.set(1);
    count.set(1); // same value — no notify
    count.set(2);
    unsub();
    count.set(3);
    expect(hits).toBe(2);
  });

  test("batch coalesces notifications", () => {
    const a = createSignal(0);
    let hits = 0;
    a.subscribe(() => {
      hits++;
    });
    batch(() => {
      a.set(1);
      a.set(2);
      a.set(3);
    });
    expect(hits).toBe(1);
    expect(a()).toBe(3);
  });

  test("batch decrements depth on error", () => {
    const a = createSignal(0);
    let hits = 0;
    a.subscribe(() => {
      hits++;
    });

    try {
      batch(() => {
        a.set(1);
        throw new Error("fail");
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("fail");
    }

    expect(hits).toBe(1);
    expect(a()).toBe(1);

    // Normal operation should resume (batchDepth should be 0)
    a.set(2);
    expect(hits).toBe(2);
    expect(a()).toBe(2);
  });
});

describe("createMemo", () => {
  test("derives and updates", () => {
    const n = createSignal(2);
    const doubled = createMemo(() => n() * 2);
    expect(doubled()).toBe(4);
    n.set(5);
    expect(doubled()).toBe(10);
  });

  test("notifies when dependency changes", () => {
    const n = createSignal(1);
    const m = createMemo(() => n() + 10);
    let hits = 0;
    m.subscribe(() => {
      hits++;
    });
    n.set(2);
    expect(m()).toBe(12);
    expect(hits).toBeGreaterThanOrEqual(1);
  });

  test("does not compute until read", () => {
    const n = createSignal(1);
    let runs = 0;
    const m = createMemo(() => {
      runs++;
      return n() * 2;
    });
    expect(runs).toBe(0);
    n.set(2);
    n.set(3);
    expect(runs).toBe(0);
    expect(m()).toBe(6);
    expect(runs).toBe(1);
  });

  test("repeat reads reuse the cached value", () => {
    const n = createSignal(1);
    let runs = 0;
    const m = createMemo(() => {
      runs++;
      return n();
    });
    m();
    m();
    m();
    expect(runs).toBe(1);
  });

  test("a batch of writes costs one recompute", () => {
    const n = createSignal(0);
    let runs = 0;
    const m = createMemo(() => {
      runs++;
      return n();
    });
    m();
    batch(() => {
      n.set(1);
      n.set(2);
      n.set(3);
    });
    expect(m()).toBe(3);
    expect(runs).toBe(2);
  });

  test("never observes a half-updated graph", () => {
    const src = createSignal(1);
    const left = createMemo(() => src() + 1);
    const right = createMemo(() => src() * 2);
    const seen: string[] = [];
    const pair = createMemo(() => {
      const value = `${left()}/${right()}`;
      seen.push(value);
      return value;
    });
    pair.subscribe(() => {});
    seen.length = 0;

    src.set(10);
    expect(pair()).toBe("11/20");
    // A glitchy graph also reports the intermediate "11/2".
    expect(seen).toEqual(["11/20"]);
  });

  test("stays quiet when the derived value is unchanged", () => {
    const n = createSignal(1);
    const parity = createMemo(() => n() % 2);
    let hits = 0;
    parity.subscribe(() => {
      hits++;
    });
    n.set(3);
    n.set(5);
    expect(parity()).toBe(1);
    expect(hits).toBe(0);
    n.set(2);
    expect(hits).toBe(1);
  });

  test("drops dependency subscriptions once nobody listens", () => {
    const n = createSignal(1);
    let runs = 0;
    const m = createMemo(() => {
      runs++;
      return n();
    });
    const unsub = m.subscribe(() => {});
    n.set(2);
    const whileObserved = runs;
    unsub();
    n.set(3);
    expect(runs).toBe(whileObserved);
  });
});

describe("collectDeps", () => {
  test("opt-in propagation preserves an enclosing memo's lazy dependency graph", () => {
    const value = createSignal(1);
    let runs = 0;
    const memo = createMemo(() => {
      let result = 0;
      collectDeps(
        () => {
          runs++;
          result = value() * 2;
        },
        undefined,
        true,
      );
      return result;
    });
    expect(runs).toBe(0);
    expect(memo()).toBe(2);
    value.set(3);
    expect(runs).toBe(1);
    expect(memo()).toBe(6);
    expect(runs).toBe(2);
  });

  test("reports the first read version without tracking observer reads", () => {
    const value = createSignal(1);
    const incidental = createSignal(0);
    const versions: number[] = [];
    const dependencies = collectDeps(
      () => {
        value();
        value.set(2);
        value();
      },
      (dependency) => {
        versions.push(dependency.version);
        incidental();
      },
    );
    expect(dependencies).toHaveLength(1);
    expect(versions).toHaveLength(1);
    expect(versions[0]!).toBeLessThan(dependencies[0]!.version);
  });

  test("collects signal dependencies", () => {
    const s1 = createSignal(1);
    const s2 = createSignal(2);

    const deps = collectDeps(() => {
      s1();
      s2();
    });

    expect(deps.length).toBe(2);
    expect(typeof deps[0].subscribe).toBe("function");
    expect(typeof deps[1].subscribe).toBe("function");
  });

  test("deduplicates dependencies", () => {
    const s1 = createSignal(1);

    const deps = collectDeps(() => {
      s1();
      s1();
      s1();
    });

    expect(deps.length).toBe(1);
  });

  test("restores previous tracker", () => {
    const s1 = createSignal(1);
    const s2 = createSignal(2);
    const s3 = createSignal(3);

    let memoRuns = 0;
    const m = createMemo(() => {
      memoRuns++;
      s1(); // tracked by memo
      const deps = collectDeps(() => {
        s2(); // tracked by collectDeps, not memo
      });
      expect(deps.length).toBe(1);
      s3(); // tracked by memo
      return deps;
    });

    m();
    expect(memoRuns).toBe(1);

    // Changing s2 should not trigger the memo
    s2.set(4);
    m();
    expect(memoRuns).toBe(1);

    // Changing s1 should trigger the memo
    s1.set(2);
    m();
    expect(memoRuns).toBe(2);

    // Changing s3 should trigger the memo
    s3.set(4);
    m();
    expect(memoRuns).toBe(3);
  });

  test("restores previous tracker on error", () => {
    const s1 = createSignal(1);
    const s2 = createSignal(2);

    let memoRuns = 0;
    const m = createMemo(() => {
      memoRuns++;
      try {
        collectDeps(() => {
          s1();
          throw new Error("test");
        });
      } catch {
        // ignore
      }
      s2(); // tracked by memo
      return 1;
    });

    m();
    expect(memoRuns).toBe(1);
    s1.set(2);
    m();
    expect(memoRuns).toBe(1); // not triggered by s1
    s2.set(3);
    m();
    expect(memoRuns).toBe(2); // triggered by s2
  });

  test("collects memo dependencies", () => {
    const s1 = createSignal(1);
    const m1 = createMemo(() => s1() * 2);

    const deps = collectDeps(() => {
      m1();
    });

    expect(deps.length).toBe(1);
    expect(typeof deps[0].subscribe).toBe("function");
  });

  test("collects store dependencies", () => {
    const [state] = createStore({ count: 1 });

    const deps = collectDeps(() => {
      expect(state.count).toBe(1);
    });

    expect(deps.length).toBe(1);
    expect(typeof deps[0].subscribe).toBe("function");
  });
});

describe("untrack", () => {
  test("restores previous tracker on error", () => {
    const s1 = createSignal(1);
    const s2 = createSignal(2);
    const s3 = createSignal(3);

    let memoRuns = 0;
    const m = createMemo(() => {
      memoRuns++;
      s1(); // tracked
      try {
        untrack(() => {
          s2(); // untracked
          throw new Error("test");
        });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
      s3(); // tracked
      return 1;
    });

    m();
    expect(memoRuns).toBe(1);

    s2.set(10);
    m();
    expect(memoRuns).toBe(1); // not triggered by s2

    s1.set(10);
    m();
    expect(memoRuns).toBe(2); // triggered by s1

    s3.set(10);
    m();
    expect(memoRuns).toBe(3); // triggered by s3
  });

  test("reads without registering a dependency", () => {
    const tracked = createSignal(1);
    const hidden = createSignal(100);
    let runs = 0;
    const m = createMemo(() => {
      runs++;
      return tracked() + untrack(() => hidden());
    });
    expect(m()).toBe(101);
    hidden.set(200);
    expect(m()).toBe(101);
    expect(runs).toBe(1);
    tracked.set(2);
    expect(m()).toBe(202);
  });
});

describe("getStoreRoot", () => {
  test("retrieves the trackable root of a store", () => {
    const [store] = createStore({ count: 1 });
    const root = getStoreRoot(store);
    expect(root).toBeDefined();
    expect(typeof root?.subscribe).toBe("function");
  });

  test("returns undefined for non-store objects", () => {
    const obj = { count: 1 };
    const root = getStoreRoot(obj);
    expect(root).toBeUndefined();
  });
});

describe("createStore", () => {
  test("cloning preserves JSON prototype-named keys and null prototypes", () => {
    const input = JSON.parse(
      '{"__proto__":{"admin":true},"constructor":"own","nested":{"__proto__":{"label":"nested"}}}',
    );
    const [store] = createStore(input);
    expect(Object.hasOwn(store, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(store)).toBe(Object.prototype);
    expect(Object.keys(store)).toEqual(["__proto__", "constructor", "nested"]);
    expect(store.__proto__.admin).toBe(true);
    expect(store.constructor).toBe("own");
    expect(Object.hasOwn(store.nested, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(store.nested)).toBe(Object.prototype);
    const dictionary = Object.assign(Object.create(null), input);
    const [nullStore] = createStore(dictionary);
    expect(Object.getPrototypeOf(nullStore)).toBeNull();
    expect(Object.hasOwn(nullStore, "__proto__")).toBe(true);
    store.__proto__.admin = false;
    expect(input.__proto__.admin).toBe(true);
  });

  test("prototype-key writes stay own data properties, including array entries", () => {
    const [store, setStore] = createStore<{
      items: Array<Record<string, unknown>>;
      [key: string]: unknown;
    }>({ items: [{}] });
    let updates = 0;
    const stop = getStoreRoot(store)!.subscribe(() => {
      updates++;
    });
    setStore((state) => {
      state.__proto__ = { own: true };
      state.items[0]!.__proto__ = { child: true };
    });
    expect(updates).toBe(1);
    expect(Object.hasOwn(store, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(store)).toBe(Object.prototype);
    expect(Object.hasOwn(store.items[0]!, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(store.items[0]!)).toBe(Object.prototype);
    delete store.__proto__;
    store.__proto__ = Object.prototype;
    expect(Object.hasOwn(store, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(store)).toBe(Object.prototype);
    store.items.push({ next: true });
    expect(store.items).toHaveLength(2);
    expect(updates).toBe(4);
    Reflect.set(store.items, "__proto__", { array: true });
    expect(Object.hasOwn(store.items, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(store.items)).toBe(Array.prototype);
    expect(updates).toBe(5);
    stop();
  });

  test("nested mutations notify", () => {
    const [state, setState] = createStore({ user: { name: "Ada", age: 1 } });
    let hits = 0;
    // Access through proxy then subscribe via a signal bridge:
    // store notifies on mutation — listen by wrapping a read in a memo.
    const age = createMemo(() => state.user.age);
    age.subscribe(() => {
      hits++;
    });

    setState((s) => {
      s.user.age = 2;
    });
    expect(state.user.age).toBe(2);
    expect(age()).toBe(2);
    expect(hits).toBeGreaterThanOrEqual(1);

    state.user.name = "Grace";
    expect(state.user.name).toBe("Grace");
  });

  test("nested reads are identity-stable", () => {
    const [state] = createStore({ user: { name: "Ada" } });
    expect(state.user).toBe(state.user);
  });

  test("carries values structuredClone cannot", () => {
    class Session {
      id = "s1";
      describe(): string {
        return `session ${this.id}`;
      }
    }
    const [state] = createStore({
      session: new Session(),
      at: new Date(0),
      onSave: () => "saved",
    });

    expect(state.session).toBeInstanceOf(Session);
    expect(state.session.describe()).toBe("session s1");
    expect(state.at.getTime()).toBe(0);
    expect(state.onSave()).toBe("saved");
  });

  test("does not alias the caller's object", () => {
    const initial = { user: { name: "Ada" } };
    const [state] = createStore(initial);
    state.user.name = "Grace";
    expect(initial.user.name).toBe("Ada");
  });
});

describe("router", () => {
  test("matchPath extracts params", () => {
    const m = matchPath("/users/:id", "/users/42");
    expect(m).not.toBeNull();
    expect(m!.params.id).toBe("42");
  });

  test("matchPath rejects length mismatch", () => {
    expect(matchPath("/a/b", "/a")).toBeNull();
  });

  test("matchRoutes picks first hit", () => {
    const hit = matchRoutes(
      [
        { path: "/", element: "home" },
        { path: "/about", element: "about" },
        { path: "/users/:id", element: "user" },
      ],
      "/users/7",
    );
    expect(hit?.element).toBe("user");
    expect(hit?.params.id).toBe("7");
  });
});

describe("router instance", () => {
  test("createMoonshineRouter isolates path state", () => {
    const a = createMoonshineRouter("/a");
    const b = createMoonshineRouter("/b");
    expect(a.getLocation()).toBe("/a");
    expect(b.getLocation()).toBe("/b");
    a.navigate("/a2");
    expect(a.getLocation()).toBe("/a2");
    expect(b.getLocation()).toBe("/b");
  });

  test("navigate on instance updates only that runtime", () => {
    const r = createMoonshineRouter("/start");
    let hits = 0;
    r.location.subscribe(() => {
      hits++;
    });
    r.navigate("/next");
    expect(r.getLocation()).toBe("/next");
    expect(hits).toBeGreaterThanOrEqual(1);
  });

  test("module navigate falls back when nothing mounted", () => {
    // Should not throw; uses fallback runtime.
    navigate("/fallback-path");
    expect(typeof getLocation()).toBe("string");
  });
});

describe("shaders", () => {
  test("wrapFragmentSource wraps shade() bodies", () => {
    const src = wrapFragmentSource(
      `vec4 shade(vec2 uv, float t) { return vec4(uv, 0.5, 1.0); }`,
      true,
    );
    expect(src).toContain("#version 300 es");
    expect(src).toContain("void main");
    expect(src).toContain("shade(uv, u_time)");
  });

  test("createFullscreenFragment returns vertex + fragment", () => {
    const prog = createFullscreenFragment(
      `vec4 shade(vec2 uv, float t) { return vec4(1.0); }`,
    );
    expect(prog.vertex).toContain("gl_Position");
    expect(prog.fragment).toContain("shade");
  });

  test("full shaders pass through", () => {
    const full = `#version 300 es
precision highp float;
out vec4 c;
void main() { c = vec4(1.0); }
`;
    expect(wrapFragmentSource(full, true)).toBe(full);
  });
});

describe("server", () => {
  test("resolvePage exact and splat", () => {
    const pages = {
      "/": definePage({ render: () => "home" }),
      "/blog/*": definePage({ render: () => "blog" }),
    };
    expect(resolvePage(pages, "/")?.render({} as never)).toBe("home");
    expect(resolvePage(pages, "/blog/a")?.render({} as never)).toBe("blog");
    expect(resolvePage(pages, "/missing")).toBeNull();
  });

  test("handleMoonshineRequest returns html", async () => {
    const server = createMoonshineServer({
      pages: {
        "/": definePage({ render: () => "<h1>ok</h1>" }),
      },
    });
    const res = await server.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>ok</h1>");
  });

  test("handleMoonshineRequest 404", async () => {
    const res = await handleMoonshineRequest(
      new Request("http://localhost/x"),
      {
        pages: {},
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("server static", () => {
  test("resolveStaticPath rejects traversal", () => {
    expect(resolveStaticPath("/tmp/www", "/../../etc/passwd")).toBeNull();
    expect(resolveStaticPath("/tmp/www", "/ok.css")).toContain("ok.css");
  });

  test("tryServeStatic serves existing file", async () => {
    const dir = await import("node:fs/promises").then(async (fs) => {
      const os = await import("node:os");
      const path = await import("node:path");
      const d = await fs.mkdtemp(path.join(os.tmpdir(), "ms-static-"));
      await fs.writeFile(path.join(d, "hi.txt"), "hello-static");
      return d;
    });
    const res = await tryServeStatic(dir, "/hi.txt");
    expect(res).not.toBeNull();
    expect(await res!.text()).toBe("hello-static");
    expect(res!.headers.get("content-type")).toContain("text/plain");
  });

  test("handleMoonshineRequest prefers static over 404", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ms-static-"));
    await fs.writeFile(path.join(dir, "app.css"), "body{color:red}");
    const res = await handleMoonshineRequest(new Request("http://x/app.css"), {
      pages: {},
      staticDir: dir,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("body{color:red}");
  });
});

test("optional tracking query reflects collectors and restores nested untrack/errors", () => {
  expect(isTracking()).toBe(false);
  collectDeps(() => {
    expect(isTracking()).toBe(true);
    untrack(() => {
      expect(isTracking()).toBe(false);
      collectDeps(() => expect(isTracking()).toBe(true));
      expect(isTracking()).toBe(false);
    });
    expect(isTracking()).toBe(true);
    expect(() =>
      untrack(() => {
        throw new Error("untracked");
      }),
    ).toThrow("untracked");
    expect(isTracking()).toBe(true);
  });
  expect(isTracking()).toBe(false);
  expect(() =>
    collectDeps(() => {
      throw new Error("tracked");
    }),
  ).toThrow("tracked");
  expect(isTracking()).toBe(false);
  const memo = createMemo(() => isTracking());
  expect(memo()).toBe(true);
  expect(isTracking()).toBe(false);
});
