import { createState } from "../src/state";
import {
  holdHistory,
  releaseHistory,
  withHistoryCleanup,
} from "../src/history";
import { expect, test } from "bun:test";
import { createProp } from "../src/prop";
import {
  createSignal,
  createRoot,
  createComputed,
} from "@tschk/moonshine-dom/reactive";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";

test("ordinary prop writes stay local while bound writes preserve parent descriptor receiver", () => {
  const [value, set] = createSignal(1);
  let calls = 0;
  const props = {
    get value() {
      expect(this).toBe(props);
      return value();
    },
    set value(next: number) {
      expect(this).toBe(props);
      calls++;
      set(next);
    },
  };
  const stop = createRoot((dispose) => {
    const local = createProp<number>(props, "value"),
      bound = createProp<number>(props, "value", { bindable: true });
    expect([local.value, bound.value]).toEqual([1, 1]);
    local.value = 9;
    expect([local.value, bound.value, value(), calls]).toEqual([9, 1, 1, 0]);
    set(2);
    expect(local.value).toBe(2);
    bound.value = 8;
    expect([local.value, bound.value, value(), calls]).toEqual([8, 8, 8, 1]);
    return dispose;
  });
  stop();
});

test("bindable without a parent setter has local overrides and does not clone fallback objects", () => {
  const fallback = { nested: { value: 1 } },
    props = { value: undefined };
  const value = createProp<typeof fallback>(props, "value", {
    bindable: true,
    fallback: () => fallback,
  });
  expect(value.value).toBe(fallback);
  value.value.nested.value = 2;
  expect(fallback.nested.value).toBe(2);
  const replacement = { nested: { value: 3 } };
  value.value = replacement;
  expect(value.value).not.toBe(replacement);
  expect(value.value.nested.value).toBe(3);
  value.value.nested.value = 4;
  expect(replacement.nested.value).toBe(3);
  expect(props.value).toBeUndefined();
});

test("fallback thunks are lazy reactive derived values cached across parent phases", () => {
  const [parent, setParent] = createSignal<number | undefined>(1),
    [incidental, setIncidental] = createSignal(10);
  let calls = 0;
  const props = {
    get value() {
      return parent();
    },
  };
  const stop = createRoot((dispose) => {
    const local = createProp<number>(props, "value", {
      fallback: () => {
        calls++;
        return incidental();
      },
    });
    expect(calls).toBe(0);
    expect(local.value).toBe(1);
    setParent(undefined);
    expect(local.value).toBe(10);
    expect(local.value).toBe(10);
    expect(calls).toBe(1);
    setIncidental(11);
    expect(local.value).toBe(11);
    local.value = 12;
    expect(local.value).toBe(12);
    setParent(2);
    expect(local.value).toBe(2);
    setParent(undefined);
    expect(local.value).toBe(11);
    expect(calls).toBe(2);
    return dispose;
  });
  stop();
});

test("DOM undefined bound fallbacks reject before parent writes, SSR assigns only defined fallback", () => {
  let calls = 0;
  const [parent, set] = createSignal<number | undefined>(undefined);
  const props = {
    get value() {
      return parent();
    },
    set value(value: number | undefined) {
      calls++;
      set(value);
    },
  };
  expect(() =>
    createProp(props, "value", {
      bindable: true,
      fallback: () => 3,
      mode: "dom",
    }),
  ).toThrow("cannot be undefined");
  expect(calls).toBe(0);
  const server = createProp(props, "value", {
    bindable: true,
    fallback: () => 3,
    mode: "ssr",
  });
  expect([server.value, parent(), calls]).toEqual([3, 3, 1]);
  set(undefined);
  createProp(props, "value", {
    bindable: true,
    fallback: () => undefined,
    mode: "ssr",
  });
  expect(calls).toBe(1);
  const html = renderToString(() =>
    h(() => {
      const value = createProp(props, "value", {
        bindable: true,
        fallback: () => 4,
      });
      return h("p", null, value.value);
    }, null),
  );
  expect(html).toBe("<p>4</p>");
  expect([parent(), calls]).toEqual([4, 2]);
});

test("function prop values remain literal and inherited setters are not treated as bindings", () => {
  let invoked = 0;
  const initial = () => 1,
    next = () => {
      invoked++;
      return 2;
    };
  const value = createProp<() => number>({ value: initial }, "value");
  value.value = next;
  expect(value.value).toBe(next);
  expect(invoked).toBe(0);
  let writes = 0;
  const inherited = Object.create({
    set value(_value: number) {
      writes++;
    },
    get value() {
      return 1;
    },
  });
  const local = createProp<number>(inherited, "value", { bindable: true });
  local.value = 2;
  expect(local.value).toBe(2);
  expect(writes).toBe(0);
});

test("local overrides, parent bindings and lazy fallbacks match installed Svelte", async () => {
  type Api = {
    signal: (
      initial: number | undefined,
    ) => [() => number | undefined, (value: number | undefined) => void];
    prop: <T>(
      props: object,
      key: PropertyKey,
      options?: { bindable?: boolean; fallback?: () => T },
    ) => { value: T };
    root: <T>(fn: () => T) => T;
  };
  function exercise(api: Api) {
    return api.root(() => {
      const [parent, set] = api.signal(1);
      let writes = 0;
      const props = {
        get value() {
          return parent();
        },
        set value(next: number | undefined) {
          writes++;
          set(next);
        },
      };
      const local = api.prop<number>(props, "value"),
        bound = api.prop<number>(props, "value", { bindable: true });
      const values: unknown[] = [[local.value, bound.value, parent()]];
      local.value = 9;
      values.push([local.value, bound.value, parent()]);
      set(2);
      values.push([local.value, bound.value]);
      bound.value = 8;
      values.push([local.value, bound.value, parent(), writes]);
      const [input, setInput] = api.signal(1);
      let fallbackCalls = 0;
      const fallback = api.prop<number>(
        {
          get value() {
            return input();
          },
        },
        "value",
        {
          fallback: () => {
            fallbackCalls++;
            return 3;
          },
        },
      );
      const fallbacks = [fallback.value];
      setInput(undefined);
      fallbacks.push(fallback.value, fallback.value);
      fallback.value = 4;
      fallbacks.push(fallback.value);
      setInput(2);
      fallbacks.push(fallback.value);
      setInput(undefined);
      fallbacks.push(fallback.value);
      let badWrites = 0,
        failed = false;
      try {
        api.prop(
          {
            get value() {
              return undefined;
            },
            set value(_value: unknown) {
              badWrites++;
            },
          },
          "value",
          { bindable: true, fallback: () => 3 },
        );
      } catch {
        failed = true;
      }
      return { values, fallbacks, fallbackCalls, failed, badWrites };
    });
  }
  const pkg = Bun.resolveSync(
      "svelte/package.json",
      `${import.meta.dir}/../../../examples/svelte-adopt`,
    ),
    client = new URL("./src/internal/client/index.js", `file://${pkg}`)
      .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import{state,prop,get,set,push,pop,effect_root}from${JSON.stringify(client)};push({},true);try{const api={signal(initial){const node=state(initial);return[()=>get(node),next=>set(node,next)]},prop(props,key,options={}){const flags=7+(options.bindable?8:0)+(options.fallback?16:0);const value=prop(props,key,flags,options.fallback);return{get value(){return value()},set value(next){value(next)}}},root(fn){let result;const stop=effect_root(()=>{result=fn()});stop();return result}};console.log(JSON.stringify((${exercise.toString()})(api)));}finally{pop();}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, error).toBe(0);
  expect(error).toBe("");
  expect(
    exercise({
      signal: (initial) => {
        const [read, write] = createSignal(initial);
        return [read, write];
      },
      prop: createProp,
      root: (fn) =>
        createRoot((stop) => {
          try {
            return fn();
          } finally {
            stop();
          }
        }),
    }),
  ).toEqual(JSON.parse(output));
}, 30000);

test("unbound bindable replacements track nested mutations without changing caller data", () => {
  const initial = { nested: { count: 1 } },
    replacement = { nested: { count: 2 } };
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    const value = createProp<typeof initial>({ value: initial }, "value", {
      bindable: true,
    });
    expect(value.value).toBe(initial);
    value.value = replacement;
    createComputed(() => seen.push(value.value.nested.count));
    value.value.nested.count = 3;
    expect(seen).toEqual([2, 3]);
    expect(replacement.nested.count).toBe(2);
    return dispose;
  });
  stop();
  let forwarded: unknown;
  const bound = createProp<typeof replacement>(
    {
      get value() {
        return replacement;
      },
      set value(value) {
        forwarded = value;
      },
    },
    "value",
    { bindable: true },
  );
  bound.value = initial;
  expect(forwarded).toBe(initial);
});

test("historical prop fallbacks do not alter live fallback phase or local overrides", async () => {
  createRoot((stop) => {
    const parent = createState<number | undefined>(undefined);
    let calls = 0;
    const props = {
      get value() {
        return parent.value;
      },
    };
    const value = createProp<number>(props, "value", {
      fallback: () => ++calls,
    });
    expect(value.value).toBe(1);
    holdHistory();
    try {
      parent.value = 8;
      expect(value.value).toBe(8);
      withHistoryCleanup(() => expect(value.value).toBe(1));
      expect([value.value, calls]).toEqual([8, 1]);
    } finally {
      releaseHistory();
    }
    holdHistory();
    try {
      value.value = 12;
      withHistoryCleanup(() => expect(value.value).toBe(8));
      expect(value.value).toBe(12);
      parent.value = undefined;
      expect(value.value).toBe(1);
      expect(calls).toBe(1);
    } finally {
      releaseHistory();
      stop();
    }
  });
  await Promise.resolve();
});

test("bound prop historical reads preserve fallback cache without publishing parent writes", () => {
  createRoot((stop) => {
    const parent = createState<number | undefined>(undefined);
    let calls = 0,
      writes = 0;
    const props = {
      get value() {
        return parent.value;
      },
      set value(next: number | undefined) {
        writes++;
        parent.value = next;
      },
    };
    // SSR permits bound undefined fallback initialization; later reads use the
    // same callback protocol as DOM without an invalid initial binding.
    const value = createProp<number>(props, "value", {
      bindable: true,
      mode: "ssr",
      fallback: () => ++calls,
    });
    expect(value.value).toBe(1);
    holdHistory();
    try {
      parent.value = 8;
      expect(value.value).toBe(8);
      withHistoryCleanup(() => expect(value.value).toBe(1));
      expect([value.value, writes, calls]).toEqual([8, 1, 1]);
    } finally {
      releaseHistory();
      stop();
    }
  });
});
