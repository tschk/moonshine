import { describe, expect, test } from "bun:test";
import {
  batch,
  collectDeps,
  createMemo,
  createSignal,
  createStore,
  untrack,
} from "../src/signal";
import { createResource } from "../src/resource";
import {
  createMoonshineRouter,
  matchPath,
  matchRoutes,
  navigate,
  getLocation,
} from "../src/router";
import { createFullscreenFragment, wrapFragmentSource } from "../src/shaders";
import {
  createMoonshineServer,
  definePage,
  handleMoonshineRequest,
  resolvePage,
  resolveStaticPath,
  tryServeStatic,
} from "../src/server";

describe("createSignal", () => {
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
});

describe("untrack", () => {
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

describe("createStore", () => {
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

describe("createResource", () => {
  test("fetches and exposes status", async () => {
    const r = createResource(async () => 7, { immediate: false });
    expect(r()).toBeUndefined();
    await r.refetch();
    expect(r()).toBe(7);
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);
  });

  test("captures errors", async () => {
    const r = createResource(
      async () => {
        throw new Error("nope");
      },
      { immediate: false },
    );
    await r.refetch();
    expect(r.error()?.message).toBe("nope");
    expect(r.status()).toBe("errored");
  });
});
