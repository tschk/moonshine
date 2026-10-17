import { expect, test, spyOn } from "bun:test";
import {
  createRuneEffect,
  createRuneRoot,
  runeTracking as rootTracking,
} from "../src/effect";
import {
  createRoot,
  createSignal,
  batch,
  onCleanup,
  getOwner,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as serverH, renderToString } from "@tschk/moonshine-dom/ssr";
import { tick } from "../src/svelte";
import "../../react/test/dom";

test("rune effects run after DOM updates, batch repeated writes and cancel before first tick", async () => {
  const [value, set] = createSignal(0);
  const observed: string[] = [];
  const container = document.createElement("main");
  document.body.append(container);
  const stop = render(
    () =>
      h(() => {
        createRuneEffect(() => {
          void value();
          observed.push(container.textContent ?? "");
        });
        return h("p", null, value);
      }, null),
    container,
  );
  expect(observed).toEqual([]);
  set(1);
  set(2);
  await tick();
  expect(observed).toEqual(["2"]);
  batch(() => {
    set(3);
    set(4);
  });
  expect(observed).toEqual(["2"]);
  await tick();
  expect(observed).toEqual(["2", "4"]);
  stop();
  container.remove();
  let cancelled = 0;
  createRoot((dispose) => {
    createRuneEffect(() => {
      cancelled++;
    });
    dispose();
  });
  await tick();
  expect(cancelled).toBe(0);
});

test("effects recollect dynamic dependencies and teardown reads stay untracked", async () => {
  const [choose, setChoose] = createSignal(true),
    [a, setA] = createSignal(1),
    [b, setB] = createSignal(10),
    [incidental, setIncidental] = createSignal(0);
  const events: string[] = [];
  const stop = createRoot((dispose) => {
    createRuneEffect(() => {
      const value = choose() ? a() : b();
      events.push(`run:${value}`);
      return () => {
        incidental();
        events.push(`cleanup:${value}`);
      };
    });
    return dispose;
  });
  await tick();
  setB(11);
  setIncidental(1);
  await tick();
  expect(events).toEqual(["run:1"]);
  setChoose(false);
  await tick();
  expect(events).toEqual(["run:1", "cleanup:1", "run:11"]);
  setA(2);
  await tick();
  expect(events).toHaveLength(3);
  setB(12);
  await tick();
  expect(events.at(-1)).toBe("run:12");
  stop();
  expect(events.at(-1)).toBe("cleanup:12");
});

test("initial reentrant writes schedule latest values and nested effects belong to each run", async () => {
  const [value, set] = createSignal(0);
  const events: string[] = [];
  const stop = createRoot((dispose) => {
    createRuneEffect(() => {
      const current = value();
      events.push(`parent:${current}`);
      onCleanup(() => events.push(`owner:${current}`));
      createRuneEffect(() => {
        events.push(`child:${current}`);
        return () => events.push(`child-cleanup:${current}`);
      });
      if (current === 0) set(1);
      return () => events.push(`cleanup:${current}`);
    });
    return dispose;
  });
  await tick();
  expect(events).toContain("parent:0");
  expect(events).toContain("parent:1");
  expect(events).toContain("child:0");
  expect(events).toContain("child-cleanup:0");
  expect(events).toContain("child:1");
  expect(events).toContain("cleanup:0");
  stop();
  expect(events).toContain("child-cleanup:1");
  expect(events).toContain("owner:1");
});

test("SSR frames suppress effects even with DOM globals; invalid owners reject", async () => {
  let calls = 0;
  expect(() => createRuneEffect(() => {})).toThrow("live native owner");
  const html = renderToString(() =>
    serverH(() => {
      createRuneEffect(() => {
        calls++;
      });
      return serverH("p", null, "server");
    }, null),
  );
  expect(html).toBe("<p>server</p>");
  await tick();
  expect(calls).toBe(0);
});

test("queued callback failures drain peers, dispose failed work and recover on dependency changes", () => {
  const queued: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => {
    queued.push(fn);
  });
  let stop = () => {};
  try {
    const [value, set] = createSignal(0);
    let fail = true,
      cleaned = 0,
      peer = 0;
    stop = createRoot((dispose) => {
      createRuneEffect(() => {
        void value();
        onCleanup(() => cleaned++);
        if (fail) throw new Error("rune failure");
      });
      createRuneEffect(() => {
        peer++;
      });
      return dispose;
    });
    expect(queued).toHaveLength(1);
    expect(() => queued.shift()!()).toThrow("rune failure");
    expect([cleaned, peer]).toEqual([1, 1]);
    fail = false;
    set(1);
    expect(queued).toHaveLength(1);
    expect(() => queued.shift()!()).not.toThrow();
    stop();
    expect(cleaned).toBe(2);
  } finally {
    stop();
    spy.mockRestore();
  }
});

test("effects disposed during their callback release returned cleanup and do not subscribe afterward", async () => {
  const [value, set] = createSignal(0);
  let calls = 0,
    cleaned = 0;
  let stop = () => {};
  createRoot((dispose) => {
    stop = dispose;
    createRuneEffect(() => {
      value();
      calls++;
      stop();
      return () => cleaned++;
    });
  });
  await tick();
  expect([calls, cleaned]).toEqual([1, 1]);
  set(1);
  await tick();
  expect([calls, cleaned]).toEqual([1, 1]);
  stop();
  expect(cleaned).toBe(1);
});

test("large independent effect cohorts run fully while feedback limits remain per effect", () => {
  const queued: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation((fn) =>
    queued.push(fn),
  );
  let stop = () => {};
  try {
    let calls = 0;
    stop = createRoot((dispose) => {
      for (let index = 0; index < 1001; index++)
        createRuneEffect(() => {
          calls++;
        });
      return dispose;
    });
    expect(() => queued.shift()!()).not.toThrow();
    expect(calls).toBe(1001);
    stop();
    const [value, set] = createSignal(0);
    let peer = 0;
    stop = createRoot((dispose) => {
      createRuneEffect(() => {
        const current = value();
        set(current + 1);
      });
      createRuneEffect(() => {
        peer++;
      });
      return dispose;
    });
    expect(() => queued.shift()!()).toThrow("update limit");
    expect(peer).toBe(1);
    expect(value()).toBe(1000);
    stop();
  } finally {
    stop();
    spy.mockRestore();
  }
});

test("runeTracking distinguishes component setup, events, render/derived/effects and untrack", async () => {
  const { runeTracking } = await import("../src/runes");
  const { createDerived } = await import("../src/derived");
  const { untrack } = await import("@tschk/moonshine-dom/reactive");
  const trace: Record<string, boolean> = { outside: runeTracking() };
  const container = document.createElement("main");
  document.body.append(container);
  const stop = render(
    () =>
      h(() => {
        trace.setup = runeTracking();
        const value = createDerived(() => {
          trace.derived = runeTracking();
          return "ready";
        });
        createRuneEffect(() => {
          trace.effect = runeTracking();
          trace.untracked = untrack(runeTracking);
          try {
            untrack(() => {
              throw new Error("restore");
            });
          } catch {}
          trace.restored = runeTracking();
        });
        return h(
          "button",
          {
            onClick: () => {
              trace.event = runeTracking();
            },
          },
          () => {
            trace.render = runeTracking();
            return value.value;
          },
        );
      }, null),
    container,
  );
  await tick();
  container.querySelector("button")!.click();
  trace.after = runeTracking();
  expect(trace).toEqual({
    outside: false,
    setup: false,
    derived: true,
    effect: true,
    untracked: false,
    restored: true,
    render: true,
    event: false,
    after: false,
  });
  stop();
  container.remove();
});

test("tracking contexts match actual installed Svelte internal tracking query", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
      .pathname,
    effects = new URL(
      "./src/internal/client/reactivity/effects.js",
      `file://${pkg}`,
    ).pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import{effect_tracking as tracking,effect_root,push,pop,user_effect,render_effect,derived,get,untrack}from${JSON.stringify(client)};import{branch}from${JSON.stringify(effects)};const trace={outside:tracking()};const stop=effect_root(()=>branch(()=>{push({},true);trace.setup=tracking();const value=derived(()=>{trace.derived=tracking();return 1;});render_effect(()=>{trace.render=tracking();get(value);});user_effect(()=>{trace.effect=tracking();trace.untracked=untrack(tracking);try{untrack(()=>{throw Error('restore')})}catch{}trace.restored=tracking();});pop();}));await Promise.resolve();await Promise.resolve();trace.event=tracking();stop();trace.after=tracking();console.log(JSON.stringify(trace));`,
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
  expect(JSON.parse(output)).toEqual({
    outside: false,
    setup: false,
    derived: true,
    effect: true,
    untracked: false,
    restored: true,
    render: true,
    event: false,
    after: false,
  });
}, 30000);

test("manual rune roots run setup untracked and outlive their enclosing owner", async () => {
  const [value, set] = createSignal(0);
  const trace: string[] = [];
  let stopManual!: () => void;
  const stopOuter = createRoot((stop) => {
    stopManual = createRuneRoot(() => {
      expect(rootTracking()).toBe(false);
      value();
      trace.push("setup");
      createRuneEffect(() => {
        trace.push(`effect:${value()}`);
        return () => {
          trace.push("effect-clean");
        };
      });
      return () => {
        trace.push("root-clean");
      };
    });
    return stop;
  });
  expect(trace).toEqual(["setup"]);
  await tick();
  stopOuter();
  set(1);
  await tick();
  expect(trace).toEqual(["setup", "effect:0", "effect-clean", "effect:1"]);
  stopManual();
  stopManual();
  set(2);
  await tick();
  expect(trace.slice(-2)).toEqual(["effect-clean", "root-clean"]);
});

test("manual roots cancel pending children and clean failed setup preserving its error", async () => {
  let calls = 0,
    cleaned = 0;
  const stop = createRuneRoot(() => {
    createRuneEffect(() => {
      calls++;
    });
    return () => {
      cleaned++;
    };
  });
  stop();
  stop();
  await tick();
  expect([calls, cleaned]).toEqual([0, 1]);
  const error = new Error("setup failed");
  expect(() =>
    createRuneRoot(() => {
      onCleanup(() => {
        cleaned++;
        throw new Error("cleanup failed");
      });
      createRuneEffect(() => {
        calls++;
      });
      throw error;
    }),
  ).toThrow(error);
  await tick();
  expect([calls, cleaned]).toEqual([0, 2]);
});

test("nested manual roots survive parent-effect reruns and remain independently stoppable", async () => {
  const [value, set] = createSignal(0);
  const stops: Array<() => void> = [];
  const trace: number[] = [];
  const stop = createRuneRoot(() => {
    createRuneEffect(() => {
      const current = value();
      stops.push(
        createRuneRoot(() => {
          createRuneEffect(() => {
            trace.push(current);
          });
        }),
      );
    });
  });
  await tick();
  set(1);
  await tick();
  stop();
  expect(trace).toEqual([0, 1]);
  for (const dispose of stops) dispose();
});

test("manual rune roots suppress SSR callbacks and release inherited carrier after manual stop", () => {
  let calls = 0;
  let stop!: () => void;
  expect(
    renderToString(() =>
      serverH(() => {
        stop = createRuneRoot(() => {
          calls++;
        });
        return serverH("p", null, "server");
      }, {}),
    ),
  ).toBe("<p>server</p>");
  stop();
  stop();
  expect(calls).toBe(0);
  let scope: ReturnType<typeof getOwner>;
  const dispose = createRuneRoot(() => {
    scope = getOwner();
  });
  dispose();
  expect(scope!.disposed).toBe(true);
});

test("manual root nesting and teardown match pinned Svelte", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import{effect_root,user_effect,effect_tracking}from${JSON.stringify(client)};const trace=[];let inner;const outer=effect_root(()=>{trace.push('outer:'+effect_tracking());inner=effect_root(()=>{trace.push('inner:'+effect_tracking());user_effect(()=>{trace.push('effect');return()=>trace.push('effect-clean')});return()=>trace.push('root-clean')});return()=>trace.push('outer-clean')});await Promise.resolve();await Promise.resolve();outer();trace.push('after-outer');inner();inner();console.log(JSON.stringify(trace));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  const trace: string[] = [];
  let inner!: () => void;
  const outer = createRuneRoot(() => {
    trace.push(`outer:${rootTracking()}`);
    inner = createRuneRoot(() => {
      trace.push(`inner:${rootTracking()}`);
      createRuneEffect(() => {
        trace.push("effect");
        return () => {
          trace.push("effect-clean");
        };
      });
      return () => {
        trace.push("root-clean");
      };
    });
    return () => {
      trace.push("outer-clean");
    };
  });
  await tick();
  outer();
  trace.push("after-outer");
  inner();
  inner();
  expect(trace).toEqual(JSON.parse(output));
});

test("rune teardown reads the first pre-write state across a queued flush", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const reference = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `
import{effect_root,user_effect,proxy}from${JSON.stringify(client)};
const value=proxy({a:0,b:10}),trace=[];
const stop=effect_root(()=>user_effect(()=>{void value.a;return()=>trace.push({a:value.a,bUndefined:value.b===undefined,bType:typeof value.b})}));
await Promise.resolve();await Promise.resolve();value.b=11;value.a=1;value.a=2;value.b=12;await Promise.resolve();await Promise.resolve();console.log(JSON.stringify(trace));stop();
`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [referenceOutput, referenceError, referenceCode] = await Promise.all([
    new Response(reference.stdout).text(),
    new Response(reference.stderr).text(),
    reference.exited,
  ]);
  expect(referenceError).toBe("");
  expect(referenceCode).toBe(0);
  expect(JSON.parse(referenceOutput)).toEqual([
    { a: 0, bUndefined: true, bType: "undefined" },
  ]);
  const { createState } = await import("../src/state");
  const state = createState({ a: 0, b: 10 });
  const trace: unknown[] = [];
  const stop = createRuneRoot(() => {
    createRuneEffect(() => {
      trace.push(["run", state.value.a]);
      onCleanup(() => trace.push(["owned", state.value.a, state.value.b]));
      return () => trace.push(["cleanup", state.value.a, state.value.b]);
    });
  });
  await tick();
  state.value.b = 11; // Its earlier clear timer must respect the pending flush.
  state.value.a = 1;
  state.value.a = 2;
  state.value.b = 12;
  await tick();
  expect(trace).toEqual([
    ["run", 0],
    ["owned", 0, undefined],
    ["cleanup", 0, undefined],
    ["run", 2],
  ]);
  stop();
  expect(trace.slice(-2)).toEqual([
    ["owned", 2, 12],
    ["cleanup", 2, 12],
  ]);
});

test("manual stop uses pending history and restores live reads after disposal", async () => {
  const { createState } = await import("../src/state");
  const state = createState(0);
  const seen: number[] = [];
  const stop = createRuneRoot(() => {
    createRuneEffect(() => {
      void state.value;
      return () => {
        seen.push(state.value);
      };
    });
    return () => {
      seen.push(state.value);
    };
  });
  await tick();
  state.value = 1;
  state.value = 2;
  stop();
  stop();
  expect(seen).toEqual([0, 0]);
  expect(state.value).toBe(2);
  await tick();
  expect(state.value).toBe(2);
});

test("cleanup writes keep native synchronous consumers live and restore context on error", async () => {
  const { createState } = await import("../src/state");
  const { createComputed } = await import("@tschk/moonshine-dom/reactive");
  const state = createState({ a: 0, b: 0 });
  const seen: number[] = [];
  const stopNative = createRoot((stop) => {
    createComputed(() => {
      seen.push(state.value.b);
    });
    return stop;
  });
  let fail = true;
  const stop = createRuneRoot(() => {
    createRuneEffect(() => {
      void state.value.a;
      return () => {
        state.value.b = 3;
        if (fail) throw new Error("cleanup failed");
      };
    });
  });
  await tick();
  state.value.b = 1;
  state.value.a = 1;
  expect(stop).toThrow("cleanup failed");
  expect(seen).toEqual([0, 1, 3]);
  expect(state.value.b).toBe(3);
  fail = false;
  await tick();
  expect(state.value.b).toBe(3);
  stopNative();
});

test("first-write teardown history matches installed Svelte 5.57.1", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  expect((await Bun.file(pkg).json()).version).toBe("5.57.1");
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `
import{effect_root,user_effect,state,get,set}from${JSON.stringify(client)};
const a=state(0),b=state(10),trace=[];
const stop=effect_root(()=>{user_effect(()=>{trace.push(['run',get(a)]);return()=>trace.push(['cleanup',get(a),get(b)])});return()=>trace.push(['root',get(a),get(b)])});
await Promise.resolve();await Promise.resolve();
set(b,11);set(a,1);set(a,2);set(b,12);
await Promise.resolve();await Promise.resolve();
set(a,3);set(a,4);stop();
await Promise.resolve();await Promise.resolve();
trace.push(['live',get(a),get(b)]);console.log(JSON.stringify(trace));
`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  const { createState } = await import("../src/state");
  const a = createState(0),
    b = createState(10),
    trace: unknown[] = [];
  const stop = createRuneRoot(() => {
    createRuneEffect(() => {
      trace.push(["run", a.value]);
      return () => {
        trace.push(["cleanup", a.value, b.value]);
      };
    });
    return () => {
      trace.push(["root", a.value, b.value]);
    };
  });
  await tick();
  b.value = 11;
  a.value = 1;
  a.value = 2;
  b.value = 12;
  await tick();
  a.value = 3;
  a.value = 4;
  stop();
  await tick();
  trace.push(["live", a.value, b.value]);
  expect(trace).toEqual(JSON.parse(output));
});

test("history survives error peers and feedback until the whole effect queue drains", async () => {
  const { createState } = await import("../src/state");
  const { withHistoryCleanup } = await import("../src/history");
  const state = createState(0);
  const queue: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => {
    queue.push(fn);
  });
  const trace: number[] = [];
  let stop = () => {};
  try {
    stop = createRuneRoot(() => {
      createRuneEffect(() => {
        const value = state.value;
        return () => {
          trace.push(state.value);
          if (value === 0) throw new Error("old cleanup");
        };
      });
      createRuneEffect(() => {
        const value = state.value;
        if (value === 1) state.value = 2;
        return () => {
          trace.push(state.value);
        };
      });
    });
    queue.shift()!();
    state.value = 1;
    expect(() => queue.shift()!()).toThrow("old cleanup");
    // Both the first peer and its feedback teardown still see the flush origin.
    expect(trace).toEqual([0, 0, 0]);
    expect(withHistoryCleanup(() => state.value)).toBe(2);
    while (queue.length) queue.shift()!();
  } finally {
    stop();
    spy.mockRestore();
  }
});

test("tracked cleanup self-writes retain the extra rerun without subscribing cleanup-only reads", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `
import{effect_root,user_effect,state,get,set}from${JSON.stringify(client)};
const output=[];
for(const tracked of [true,false]){
const a=state(0),b=state(10),trace=[];let once=false;
const stop=effect_root(()=>user_effect(()=>{trace.push(['run',get(a)]);return()=>{trace.push(['cleanup',get(a),get(b)]);if(!once){once=true;set(tracked?a:b,5);trace.push(['write',get(a),get(b)])}}}));
await Promise.resolve();await Promise.resolve();set(a,1);await Promise.resolve();await Promise.resolve();output.push(trace.slice());stop();
}console.log(JSON.stringify(output));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  const { createState } = await import("../src/state");
  const actual: unknown[] = [];
  for (const tracked of [true, false]) {
    const a = createState(0),
      b = createState(10),
      trace: unknown[] = [];
    let once = false;
    const stop = createRuneRoot(() => {
      createRuneEffect(() => {
        trace.push(["run", a.value]);
        return () => {
          trace.push(["cleanup", a.value, b.value]);
          if (!once) {
            once = true;
            (tracked ? a : b).value = 5;
            trace.push(["write", a.value, b.value]);
          }
        };
      });
    });
    await tick();
    a.value = 1;
    await tick();
    actual.push(trace.slice());
    stop();
  }
  expect(actual).toEqual(JSON.parse(output));
});

test("cleanup writes retain their rerun even when setup discards the written dependency", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `
import{effect_root,user_effect,state,get,set}from${JSON.stringify(client)};
const a=state(0),choose=state(true),trace=[];let once=false;
const stop=effect_root(()=>user_effect(()=>{trace.push(['run',get(choose)?get(a):'off']);return()=>{trace.push(['cleanup',get(a)]);if(!once){once=true;set(a,5)}}}));
await Promise.resolve();await Promise.resolve();set(choose,false);await Promise.resolve();await Promise.resolve();console.log(JSON.stringify(trace));stop();
`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  const { createState } = await import("../src/state");
  const a = createState(0),
    choose = createState(true),
    trace: unknown[] = [];
  let once = false;
  const stop = createRuneRoot(() => {
    createRuneEffect(() => {
      trace.push(["run", choose.value ? a.value : "off"]);
      return () => {
        trace.push(["cleanup", a.value]);
        if (!once) {
          once = true;
          a.value = 5;
        }
      };
    });
  });
  await tick();
  choose.value = false;
  await tick();
  expect(trace).toEqual(JSON.parse(output));
  stop();
});
