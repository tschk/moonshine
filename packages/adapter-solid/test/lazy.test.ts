import { test, expect } from "bun:test";
import { lazy } from "../src/solid";
import {
  createRoot,
  getOwner,
  runWithOwner,
  createSignal,
  onCleanup,
  catchError,
} from "@tschk/moonshine-dom/reactive";
import {
  createComponent,
  setContext,
  getContext,
} from "@tschk/moonshine-dom/component";
import { renderToString, h as ssrH } from "@tschk/moonshine-dom/ssr";
const tick = () => new Promise((r) => setTimeout(r, 0));
test("preload cached module shape and synchronous first setup; live props retained", async () => {
  let calls = 0,
    setups = 0;
  const Component = (props: { label: string }) => {
    setups++;
    return () => props.label;
  };
  const module = { default: Component };
  const Lazy = lazy(() => {
    calls++;
    return Promise.resolve(module);
  });
  const p = Lazy.preload();
  expect(Lazy.preload()).toBe(p);
  expect(await p).toBe(module);
  createRoot((stop) => {
    const [label, set] = createSignal("one");
    const view = Lazy({
      get label() {
        return label();
      },
    });
    expect(view()()).toBe("one");
    set("two");
    expect(view()()).toBe("two");
    expect(setups).toBe(1);
    stop();
  });
  expect(calls).toBe(1);
});
test("pending instances own setup/context and disposal independently", async () => {
  let resolve!: Function,
    calls = 0;
  const setups: string[] = [],
    cleaned: string[] = [];
  const Lazy = lazy(() => {
    calls++;
    return new Promise<any>((r) => (resolve = r));
  });
  function mount(name: string) {
    let view!: ReturnType<typeof Lazy>, stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      createComponent(
        () => {
          setContext("name", name);
          view = Lazy({});
        },
        {},
        "dom",
      );
    });
    return { view, stop };
  }
  const a = mount("a"),
    b = mount("b");
  expect(a.view()).toBe("");
  expect(b.view()).toBe("");
  a.stop();
  resolve({
    default: () => {
      const name = getContext<string>("name")!;
      setups.push(name);
      onCleanup(() => cleaned.push(name));
      return name;
    },
  });
  await tick();
  expect(b.view()).toBe("b");
  expect(setups).toEqual(["b"]);
  b.stop();
  expect(cleaned).toEqual(["b"]);
  const c = mount("c");
  expect(c.view()).toBe("c");
  c.stop();
  expect(calls).toBe(1);
});
test("synchronous loader throws retry but async failures remain cached", async () => {
  let calls = 0;
  const failure = Error("loader");
  const sync = lazy(() => {
    calls++;
    throw failure;
  });
  expect(sync.preload).toThrow(failure);
  expect(sync.preload).toThrow(failure);
  expect(calls).toBe(2);
  const async = lazy(() => {
    calls++;
    return Promise.reject(failure);
  });
  const p = async.preload();
  await expect(p).rejects.toBe(failure);
  expect(async.preload()).toBe(p);
  await tick();
  expect(calls).toBe(3);
});
test("bad default rejects explicitly and reads default only once", async () => {
  let reads = 0;
  const Component = () => {
    expect(reads).toBe(1);
    return "ok";
  };
  const Lazy = lazy(() =>
    Promise.resolve({
      get default() {
        reads++;
        return reads === 1 ? Component : null;
      },
    } as any),
  );
  await Lazy.preload();
  createRoot((stop) => {
    expect(Lazy({})()).toBe("ok");
    stop();
  });
  expect(reads).toBe(1);
  const bad = lazy(() => Promise.resolve({ default: 42 } as any));
  await expect(bad.preload()).rejects.toThrow(TypeError);
  await tick();
});
test("SSR component and bare serializer reject invocation/preload before loader", () => {
  let calls = 0;
  const Lazy = lazy(() => {
    calls++;
    return Promise.resolve({ default: () => "bad" });
  });
  for (const preload of [false, true]) {
    expect(() =>
      renderToString(() => {
        if (preload) Lazy.preload();
        else Lazy({});
        return "";
      }),
    ).toThrow("client-only");
    expect(() =>
      createRoot(() =>
        ssrH(() => {
          if (preload) Lazy.preload();
          else Lazy({});
          return "";
        }, {}),
      ),
    ).toThrow("client-only");
  }
  expect(calls).toBe(0);
});
test("mounted asynchronous loader and child failures use native owner handler", async () => {
  for (const childError of [false, true]) {
    const failure = Error(childError ? "child" : "loader"),
      errors: Error[] = [];
    const Lazy = lazy(() =>
      childError
        ? Promise.resolve({
            default: () => {
              throw failure;
            },
          })
        : Promise.reject(failure),
    );
    let stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      catchError(
        () => Lazy({}),
        (e) => errors.push(e),
      );
    });
    await tick();
    expect(errors).toEqual([failure]);
    stop();
  }
});

test("sync mount loader failure preserves error and releases owner work", () => {
  const failure = Error("loader setup"),
    trace: string[] = [];
  const Lazy = lazy(() => {
    throw failure;
  });
  expect(() =>
    createRoot(() => {
      onCleanup(() => trace.push("clean"));
      Lazy({});
    }),
  ).toThrow(failure);
  expect(trace).toEqual(["clean"]);
});

test("caught failed preload and malformed module never create orphan rejections", async () => {
  const unhandled: unknown[] = [];
  const capture = (error: unknown) => {
    unhandled.push(error);
  };
  process.on("unhandledRejection", capture);
  try {
    for (const loader of [
      () => Promise.reject(Error("load")),
      () => Promise.resolve({ default: null } as any),
    ]) {
      const Lazy = lazy(loader);
      await Lazy.preload().catch(() => {});
    }
    await tick();
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", capture);
  }
});

test("component invocation rejects absent or disposed owners before loading", async () => {
  let calls = 0;
  const Lazy = lazy(() => {
    calls++;
    return Promise.resolve({ default: () => "ready" });
  });
  expect(() => Lazy({})).toThrow("requires a live native owner");
  let stale!: ReturnType<typeof getOwner>;
  createRoot((stop) => {
    stale = getOwner();
    stop();
  });
  expect(() => runWithOwner(stale!, () => Lazy({}))).toThrow(
    "requires a live native owner",
  );
  expect(calls).toBe(0);
  await Lazy.preload();
  expect(calls).toBe(1);
  expect(() => Lazy({})).toThrow("requires a live native owner");
});
