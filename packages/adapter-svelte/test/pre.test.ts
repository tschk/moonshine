import { test, expect } from "bun:test";
import {
  createRoot,
  createSignal,
  createRenderEffect,
  batch,
  onCleanup,
  getOwner,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import { Show, mapArray } from "@tschk/moonshine-dom/control";
import { withRuneScheduler, createRunePreEffect } from "../src/pre";
import { createRuneEffect } from "@tschk/moonshine-svelte/runes";
test("pre before render and post with deduplication", async () => {
  const [n, set] = createSignal(0);
  let dom = 0,
    stop!: () => void;
  const log: any[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRunePreEffect(() => {
        log.push(["pre", n(), dom]);
      });
      createRuneEffect(() => {
        log.push(["post", n(), dom]);
      });
      createRenderEffect(() => {
        dom = n();
        log.push(["render", dom]);
      });
    });
  });
  expect(log).toEqual([
    ["pre", 0, 0],
    ["render", 0],
  ]);
  await Promise.resolve();
  log.length = 0;
  batch(() => {
    set(1);
    set(2);
  });
  expect(log).toEqual([]);
  await Promise.resolve();
  expect(log).toEqual([
    ["pre", 2, 0],
    ["render", 2],
    ["post", 2, 2],
  ]);
  stop();
});
test("structural parent cancels child queued first", async () => {
  const [shown, hide] = createSignal(true),
    [n, set] = createSignal(0);
  let stop!: () => void;
  const log: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      const branch = Show({
        when: shown,
        children: () => {
          onCleanup(() => log.push("destroy"));
          createRenderEffect(() => {
            log.push("child:" + n());
          });
          return 1;
        },
      });
      createRenderEffect(() => {
        branch();
      });
    });
  });
  log.length = 0;
  batch(() => {
    set(1);
    hide(false);
  });
  await Promise.resolve();
  expect(log).toEqual(["destroy"]);
  stop();
});
test("reference: hidden child pre callback must be canceled before execution", async () => {
  const [n, set] = createSignal(0),
    [shown, show] = createSignal(true);
  let stop!: () => void;
  const trace: any[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRunePreEffect(() => trace.push(["parentpre", n(), shown()]));
      const child = Show({
        when: shown,
        children: () => {
          createRunePreEffect(() => trace.push(["childpre", n()]));
          onCleanup(() => trace.push(["destroy"]));
          return 1;
        },
      });
      createRenderEffect(() => {
        child();
      });
    });
  });
  trace.length = 0;
  batch(() => {
    set(1);
    show(false);
  });
  await Promise.resolve();
  expect(trace).toEqual([["parentpre", 1, false], ["destroy"]]);
  stop();
});
import { createComponent } from "@tschk/moonshine-dom/component";
test("nested components and siblings follow tree order despite reverse invalidation", async () => {
  const [a, setA] = createSignal(0),
    [b, setB] = createSignal(0);
  let stop!: () => void;
  const trace: string[] = [];
  const Leaf = ({ id, read }: { id: string; read: () => number }) => {
    createRunePreEffect(() => {
      trace.push("pre:" + id + ":" + read());
    });
    createRenderEffect(() => {
      trace.push("dom:" + id + ":" + read());
    });
    return null;
  };
  const Parent = () => {
    createRunePreEffect(() => {
      trace.push("pre:parent:" + a());
    });
    createComponent(Leaf, { id: "a", read: a }, "dom");
    createComponent(Leaf, { id: "b", read: b }, "dom");
    return null;
  };
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => createComponent(Parent, {}, "dom"));
  });
  trace.length = 0;
  batch(() => {
    setB(1);
    setA(1);
  });
  await Promise.resolve();
  expect(trace).toEqual([
    "pre:parent:1",
    "pre:a:1",
    "dom:a:1",
    "pre:b:1",
    "dom:b:1",
  ]);
  stop();
});
test("nested structural hiding cancels grandchild pre without canceling surviving sibling", async () => {
  const [n, set] = createSignal(0),
    [shown, show] = createSignal(true);
  let stop!: () => void;
  const trace: string[] = [];
  const Leaf = ({ id }: { id: string }) => {
    createRunePreEffect(() => trace.push("pre:" + id + ":" + n()));
    onCleanup(() => trace.push("destroy:" + id));
    createRenderEffect(() => {
      n();
      trace.push("dom:" + id);
    });
    return id;
  };
  const Parent = () => {
    createRunePreEffect(() => trace.push("pre:parent:" + n()));
    const branch = Show({
      when: shown,
      children: () => createComponent(Leaf, { id: "hidden" }, "dom"),
    });
    const stable = createComponent(Leaf, { id: "stable" }, "dom");
    createRenderEffect(() => {
      branch();
      void stable;
    });
    return null;
  };
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => createComponent(Parent, {}, "dom"));
  });
  trace.length = 0;
  batch(() => {
    set(1);
    show(false);
  });
  await Promise.resolve();
  expect(trace).toEqual([
    "pre:parent:1",
    "destroy:hidden",
    "pre:stable:1",
    "dom:stable",
  ]);
  stop();
});
test("default render effects stay synchronous and canceled opt-in work never runs", async () => {
  const [n, set] = createSignal(0);
  let stop!: () => void;
  let direct = 0,
    scheduledRuns = 0;
  createRoot((d) => {
    stop = d;
    createRenderEffect(() => {
      direct = n();
    });
    withRuneScheduler(() => {
      createRenderEffect(() => {
        n();
        scheduledRuns++;
      });
    });
  });
  set(1);
  expect(direct).toBe(1);
  expect(scheduledRuns).toBe(1);
  stop();
  await Promise.resolve();
  expect(scheduledRuns).toBe(1);
});
test("two opted instances deduplicate independently and dispose before queued work", async () => {
  const [n, set] = createSignal(0);
  let stopA!: () => void, stopB!: () => void;
  const trace: string[] = [];
  for (const id of ["a", "b"])
    createRoot((stop) => {
      if (id === "a") stopA = stop;
      else stopB = stop;
      withRuneScheduler(() => {
        createRunePreEffect(() => trace.push("pre:" + id + ":" + n()));
        createRenderEffect(() => {
          trace.push("dom:" + id + ":" + n());
        });
        createRuneEffect(() => {
          trace.push("post:" + id + ":" + n());
        });
      });
    });
  await Promise.resolve();
  trace.length = 0;
  set(1);
  set(2);
  stopA();
  await Promise.resolve();
  expect(trace).toEqual(["pre:b:2", "dom:b:2", "post:b:2"]);
  stopB();
});
import { createState } from "@tschk/moonshine-svelte/runes";
test("history spans whole pre/render/post cycle and clears afterwards", async () => {
  const state = createState(0);
  const trace: any[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRunePreEffect(() => {
        trace.push(["pre", state.value]);
        return () => trace.push(["cleanup-pre", state.value]);
      });
      createRenderEffect(() => {
        trace.push(["dom", state.value]);
      });
      createRuneEffect(() => {
        trace.push(["post", state.value]);
        return () => trace.push(["cleanup-post", state.value]);
      });
    });
  });
  await Promise.resolve();
  trace.length = 0;
  state.value = 1;
  state.value = 2;
  await Promise.resolve();
  expect(trace).toEqual([
    ["cleanup-pre", 0],
    ["pre", 2],
    ["dom", 2],
    ["cleanup-post", 0],
    ["post", 2],
  ]);
  trace.length = 0;
  stop();
  expect(trace).toEqual([
    ["cleanup-pre", 2],
    ["cleanup-post", 2],
  ]);
});
test("disposing the owner from initial pre setup does not subscribe or resurrect jobs", async () => {
  const [n, set] = createSignal(0);
  let runs = 0;
  createRoot((stop) =>
    withRuneScheduler(() => {
      createRunePreEffect(() => {
        n();
        runs++;
        stop();
      });
    }),
  );
  set(1);
  await Promise.resolve();
  expect(runs).toBe(1);
});
test("queued callback failure drains live pre/render/post peers before escaping", async () => {
  const code = `import{createRoot,createSignal,createRenderEffect}from'@tschk/moonshine-dom/reactive';import{createRuneEffect}from'@tschk/moonshine-svelte/runes';import{withRuneScheduler,createRunePreEffect}from ${JSON.stringify(import.meta.dir + "/../src/pre.ts")};const trace=[];let stop;const[n,set]=createSignal(0);createRoot(d=>{stop=d;withRuneScheduler(()=>{createRunePreEffect(()=>{if(n())throw Error('failure')});createRunePreEffect(()=>trace.push('pre:'+n()));createRenderEffect(()=>{trace.push('dom:'+n())});createRuneEffect(()=>{trace.push('post:'+n())})})});await Promise.resolve();trace.length=0;process.once('uncaughtException',e=>{trace.push(e.message)});set(1);setTimeout(()=>{stop();console.log(JSON.stringify(trace))},5);`;
  const p = Bun.spawn([process.execPath, "--eval", code], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(p.stdout).text(),
    err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
  expect(JSON.parse(out)).toEqual(["pre:1", "dom:1", "post:1", "failure"]);
});
import { ErrorBoundary } from "@tschk/moonshine-dom/control";
test("opted render callback failures route through native boundary after cleanup", async () => {
  const [n, set] = createSignal(0);
  let stop!: () => void;
  let view!: () => string | undefined;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      view = ErrorBoundary({
        children: () => {
          onCleanup(() => trace.push("child-clean"));
          createRenderEffect(() => {
            if (n()) throw Error("render");
          });
          return "child";
        },
        fallback: (e) => {
          trace.push("fallback:" + e.message);
          return "failed";
        },
      });
    });
  });
  set(1);
  expect(view()).toBe("child");
  await Promise.resolve();
  expect(view()).toBe("failed");
  expect(trace).toEqual(["child-clean", "fallback:render"]);
  stop();
});
import { createSignal as coreSignal } from "@tschk/moonshine";
import { collectDeps } from "@tschk/moonshine/tracking";
test("dynamic subscriptions release removed dependencies and all ownership on stop", async () => {
  const source = coreSignal(0),
    other = coreSignal(0);
  let active = 0;
  for (const read of [source, other]) {
    const signal = collectDeps(() => read())[0]!;
    const subscribe = signal.subscribe;
    signal.subscribe = (...args) => {
      active++;
      const stop = subscribe(...args);
      let closed = false;
      return () => {
        if (!closed) {
          closed = true;
          active--;
          stop();
        }
      };
    };
  }
  const [branch, setBranch] = createSignal(true);
  let stop!: () => void,
    runs = 0;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      createRunePreEffect(() => {
        runs++;
        if (branch()) source();
        else other();
      }),
    );
  });
  expect(active).toBe(1);
  setBranch(false);
  await Promise.resolve();
  expect(active).toBe(1);
  source.set(1);
  await Promise.resolve();
  expect(runs).toBe(2);
  stop();
  expect(active).toBe(0);
  other.set(1);
  await Promise.resolve();
  expect(runs).toBe(2);
});
test("cleanup writes stay live for render jobs and settle before post across instances", async () => {
  const a = createState(0),
    b = createState(0);
  let stopA!: () => void, stopB!: () => void;
  const trace: any[] = [];
  createRoot((d) => {
    stopA = d;
    withRuneScheduler(() => {
      createRunePreEffect(() => {
        trace.push(["pre", a.value]);
        return () => {
          trace.push(["cleanup", a.value, b.value]);
          b.value = 1;
        };
      });
      createRuneEffect(() => {
        trace.push(["post", a.value, b.value]);
      });
    });
  });
  createRoot((d) => {
    stopB = d;
    withRuneScheduler(() =>
      createRenderEffect(() => trace.push(["dom-other", b.value])),
    );
  });
  await Promise.resolve();
  trace.length = 0;
  a.value = 1;
  await Promise.resolve();
  expect(trace).toEqual([
    ["cleanup", 0, 0],
    ["pre", 1],
    ["dom-other", 1],
    ["post", 1, 1],
  ]);
  stopA();
  stopB();
});
test("disposal drains all subscriptions and callback cleanup after an unsubscribe throws", () => {
  const a = coreSignal(0),
    b = coreSignal(0);
  let closed = 0,
    cleanup = 0,
    stop!: () => void;
  for (const [read, index] of [
    [a, 0],
    [b, 1],
  ] as const) {
    const dep = collectDeps(() => read())[0]!,
      subscribe = dep.subscribe;
    dep.subscribe = (...args) => {
      const off = subscribe(...args);
      return () => {
        closed++;
        off();
        if (index === 0) throw Error("unsubscribe");
      };
    };
  }
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      createRunePreEffect(() => {
        a();
        b();
        return () => {
          cleanup++;
          throw Error("cleanup");
        };
      }),
    );
  });
  expect(stop).toThrow("unsubscribe");
  expect(closed).toBe(2);
  expect(cleanup).toBe(1);
  stop();
});
test("dynamic subscription failures release new, removed and retained dependencies while peers drain", async () => {
  for (const mode of ["subscribe", "unsubscribe"]) {
    const code = `import{createRoot,createSignal,createRenderEffect}from'@tschk/moonshine-dom/reactive';import{createSignal as source}from'@tschk/moonshine';import{collectDeps}from'@tschk/moonshine/tracking';import{withRuneScheduler,createRunePreEffect}from ${JSON.stringify(import.meta.dir + "/../src/pre.ts")};const[branch,setBranch]=createSignal(false);const signals=[source(0),source(0),source(0),source(0)];let active=0,cleanups=0,peer=0,stop;const mode=${JSON.stringify(mode)};for(const[index,read]of signals.entries()){const dep=collectDeps(()=>read())[0],original=dep.subscribe;dep.subscribe=(...args)=>{if(mode==='subscribe'&&index===3)throw Error('subscribe');active++;const off=original(...args);let closed=false;return()=>{if(!closed){closed=true;active--;off();if(mode==='unsubscribe'&&index===0)throw Error('unsubscribe')}}}}createRoot(d=>{stop=d;withRuneScheduler(()=>{createRunePreEffect(()=>{if(branch()){signals[2]();signals[3]()}else{signals[0]();signals[1]()}return()=>{cleanups++}});createRenderEffect(()=>{if(branch())peer++})})});const errors=[];process.once('uncaughtException',error=>errors.push(error.message));setBranch(true);setTimeout(()=>{stop();console.log(JSON.stringify({active,cleanups,peer,errors}))},10);`;
    const child = Bun.spawn([process.execPath, "--eval", code], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(child.stdout).text(),
      err = await new Response(child.stderr).text();
    expect(await child.exited, err).toBe(0);
    expect(JSON.parse(out)).toEqual({
      active: 0,
      cleanups: 2,
      peer: 1,
      errors: [mode],
    });
  }
});
test("cross-root invalidation order completes each root before the next root pre", async () => {
  const [a, setA] = createSignal(0),
    [b, setB] = createSignal(0);
  const trace: string[] = [];
  let stopA!: () => void, stopB!: () => void;
  for (const [id, read] of [
    ["a", a],
    ["b", b],
  ] as const)
    createRoot((stop) => {
      if (id === "a") stopA = stop;
      else stopB = stop;
      withRuneScheduler(() => {
        createRunePreEffect(() => trace.push("pre:" + id + ":" + read()));
        createRenderEffect(() => {
          trace.push("dom:" + id + ":" + read());
        });
      });
    });
  trace.length = 0;
  setB(1);
  setA(1);
  await Promise.resolve();
  expect(trace).toEqual(["pre:b:1", "dom:b:1", "pre:a:1", "dom:a:1"]);
  stopA();
  stopB();
});
test("routed failed render branches are not resubscribed before fallback disposal", async () => {
  const value = coreSignal(0),
    dep = collectDeps(() => value())[0]!,
    subscribe = dep.subscribe;
  let active = 0,
    reads = 0,
    stop!: () => void,
    view!: () => string | undefined;
  dep.subscribe = (...args) => {
    active++;
    const off = subscribe(...args);
    let closed = false;
    return () => {
      if (!closed) {
        closed = true;
        active--;
        off();
      }
    };
  };
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      view = ErrorBoundary({
        children: () => {
          createRenderEffect(() => {
            reads++;
            if (value()) throw Error("failed");
          });
          return "child";
        },
        fallback: () => "fallback",
      });
    });
  });
  expect(active).toBe(1);
  value.set(1);
  await Promise.resolve();
  expect(view()).toBe("fallback");
  expect(active).toBe(0);
  value.set(2);
  await Promise.resolve();
  expect(reads).toBe(2);
  stop();
});
test("reference: retained keyed branches follow their new list order for later pre/DOM work", async () => {
  const [n, set] = createSignal(0),
    [items, list] = createSignal(["a", "b"]);
  const trace: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      const rows = mapArray(items, (id) => {
        createRunePreEffect(() => trace.push("pre:" + id + ":" + n()));
        createRenderEffect(() => {
          trace.push("dom:" + id + ":" + n());
        });
        return id;
      });
      createRenderEffect(() => {
        rows();
      });
    });
  });
  list(["b", "a"]);
  await Promise.resolve();
  trace.length = 0;
  set(1);
  await Promise.resolve();
  try {
    expect(trace).toEqual(["pre:b:1", "dom:b:1", "pre:a:1", "dom:a:1"]);
  } finally {
    stop();
  }
});
test("duplicate keyed items retain distinct branch order after same-batch reorder", async () => {
  const [n, set] = createSignal(0),
    [items, list] = createSignal(["a", "a", "b"]);
  let stop!: () => void,
    serial = 0;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      const rows = mapArray(items, (id) => {
        const instance = id + ++serial;
        createRunePreEffect(() => trace.push("pre:" + instance + ":" + n()));
        createRenderEffect(() => {
          trace.push("dom:" + instance + ":" + n());
        });
        return instance;
      });
      createRenderEffect(() => {
        rows();
      });
    });
  });
  trace.length = 0;
  batch(() => {
    set(1);
    list(["a", "b", "a"]);
  });
  await Promise.resolve();
  expect(trace).toEqual([
    "pre:a1:1",
    "dom:a1:1",
    "pre:b3:1",
    "dom:b3:1",
    "pre:a2:1",
    "dom:a2:1",
  ]);
  expect(serial).toBe(3);
  stop();
});
test("nested keyed maps use both updated outer and inner indexes", async () => {
  const [n, set] = createSignal(0),
    [outer, setOuter] = createSignal(["a", "b"]),
    [inner, setInner] = createSignal([1, 2]);
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      const groups = mapArray(outer, (id) =>
        mapArray(inner, (key) => {
          createRunePreEffect(() => trace.push("pre:" + id + key + ":" + n()));
          createRenderEffect(() => {
            trace.push("dom:" + id + key + ":" + n());
          });
          return id + key;
        }),
      );
      createRenderEffect(() => groups().forEach((group) => group()));
    });
  });
  trace.length = 0;
  batch(() => {
    set(1);
    setOuter(["b", "a"]);
    setInner([2, 1]);
  });
  await Promise.resolve();
  expect(trace).toEqual([
    "pre:b2:1",
    "dom:b2:1",
    "pre:b1:1",
    "dom:b1:1",
    "pre:a2:1",
    "dom:a2:1",
    "pre:a1:1",
    "dom:a1:1",
  ]);
  stop();
});
test("ancestor hide cancels queued reorder and descendant pre work in the same batch", async () => {
  const [n, set] = createSignal(0),
    [shown, show] = createSignal(true),
    [items, list] = createSignal(["a", "b"]);
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      const branch = Show({
        when: shown,
        children: () =>
          mapArray(items, (id) => {
            createRunePreEffect(() => trace.push("pre:" + id + ":" + n()));
            onCleanup(() => trace.push("destroy:" + id));
            return id;
          }),
      });
      createRenderEffect(() => {
        const value = branch();
        value?.();
      });
    });
  });
  trace.length = 0;
  batch(() => {
    set(1);
    list(["b", "a", "c"]);
    show(false);
  });
  await Promise.resolve();
  expect(trace).toEqual(["destroy:a", "destroy:b"]);
  stop();
});
import {
  componentRef,
  exposeComponent,
} from "@tschk/moonshine-dom/component-instance";
import { onMount } from "@tschk/moonshine-svelte/svelte";
test("new child mount and post effects observe refs before ancestor post work", async () => {
  const [shown, show] = createSignal(false);
  const ref = createState<object | undefined | null>(undefined);
  const trace: any[] = [];
  let stop!: () => void;
  const Child = () => {
    exposeComponent({ read: () => 1 });
    onMount(() => trace.push(["mount", !!ref.value]));
    createRuneEffect(() => trace.push(["childpost", !!ref.value]));
    return "child";
  };
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRuneEffect(() => trace.push(["parentpost", shown(), !!ref.value]));
      const branch = Show({
        when: shown,
        children: () =>
          createComponent(
            Child,
            {
              [componentRef]: {
                get: () => ref.value,
                set: (value: object | null) => (ref.value = value),
              },
            },
            "dom",
          ),
      });
      createRenderEffect(() => {
        branch();
      });
    });
  });
  await Promise.resolve();
  trace.length = 0;
  show(true);
  await Promise.resolve();
  expect(trace).toEqual([
    ["mount", true],
    ["childpost", true],
    ["parentpost", true, true],
  ]);
  stop();
});
test("post-only roots retain first invalidation order", async () => {
  const [a, setA] = createSignal(0),
    [b, setB] = createSignal(0);
  let stopA!: () => void, stopB!: () => void;
  const trace: string[] = [];
  for (const [id, read] of [
    ["a", a],
    ["b", b],
  ] as const)
    createRoot((stop) => {
      if (id === "a") stopA = stop;
      else stopB = stop;
      withRuneScheduler(() =>
        createRuneEffect(() => {
          trace.push(id + ":" + read());
        }),
      );
    });
  await Promise.resolve();
  trace.length = 0;
  setB(1);
  setA(1);
  await Promise.resolve();
  expect(trace).toEqual(["b:1", "a:1"]);
  stopA();
  stopB();
});
test("retained keyed sibling post effects precede ancestor effects in updated row order", async () => {
  const [n, set] = createSignal(0),
    [items, list] = createSignal(["a", "b"]);
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRuneEffect(() => {
        trace.push("parent:" + n());
      });
      const rows = mapArray(items, (id) => {
        createRuneEffect(() => {
          trace.push(id + ":" + n());
        });
        return id;
      });
      createRenderEffect(() => rows());
    });
  });
  await Promise.resolve();
  list(["b", "a"]);
  await Promise.resolve();
  trace.length = 0;
  set(1);
  await Promise.resolve();
  expect(trace).toEqual(["b:1", "a:1", "parent:1"]);
  stop();
});
test("post-created post work and cleanup writes drain before releasing the cycle", async () => {
  const [n, set] = createSignal(0),
    [other, write] = createSignal(0);
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRuneEffect(() => {
        const value = n();
        trace.push("outer:" + value);
        createRuneEffect(() => {
          trace.push("nested:" + value);
        });
        return () => {
          write(value + 1);
        };
      });
      createRenderEffect(() => {
        trace.push("dom:" + other());
      });
    });
  });
  await Promise.resolve();
  trace.length = 0;
  set(1);
  await Promise.resolve();
  expect(trace).toEqual(["outer:1", "dom:1", "nested:1"]);
  stop();
});
import { getRenderScheduler } from "@tschk/moonshine-dom/reactive";
test("SSR component setup leaves scheduling disabled and pre callbacks suppressed", () => {
  let pre = 0,
    setup = 0;
  createRoot(() =>
    createComponent(
      () =>
        withRuneScheduler(() => {
          setup++;
          createRunePreEffect(() => {
            pre++;
          });
          expect(getRenderScheduler()).toBeUndefined();
          return "server";
        }),
      {},
      "ssr",
    ),
  );
  expect(setup).toBe(1);
  expect(pre).toBe(0);
});
test("more than 1000 distinct post effects drain without consuming a shared retry budget", async () => {
  const [n, set] = createSignal(0);
  let runs = 0,
    stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      for (let i = 0; i < 1001; i++)
        createRuneEffect(() => {
          n();
          runs++;
        });
    });
  });
  await Promise.resolve();
  expect(runs).toBe(1001);
  set(1);
  await Promise.resolve();
  expect(runs).toBe(2002);
  stop();
});
test("newly enqueued earlier branch invalidates an already consumed ordered batch", async () => {
  const [a, setA] = createSignal(0),
    [b, setB] = createSignal(0);
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createComponent(
        () => {
          createRunePreEffect(() => trace.push("pre:a:" + a()));
          createRenderEffect(() => {
            trace.push("dom:a:" + a());
          });
        },
        {},
        "dom",
      );
      createComponent(
        () => {
          createRunePreEffect(() => {
            trace.push("pre:b:" + b());
            if (b()) setA(1);
          });
          createRenderEffect(() => {
            trace.push("dom:b:" + b());
          });
        },
        {},
        "dom",
      );
    });
  });
  trace.length = 0;
  setB(1);
  await Promise.resolve();
  expect(trace).toEqual(["pre:b:1", "pre:a:1", "dom:a:1", "dom:b:1"]);
  stop();
});

test("scheduler rejects ownerless and disposed entry before creating work", async () => {
  const [read, write] = createSignal(0);
  let runs = 0;
  const setup = () =>
    withRuneScheduler(() => {
      createRunePreEffect(() => {
        read();
        runs++;
      });
      return 7;
    });
  expect(setup).toThrow("requires a live native owner");
  let stale!: ReturnType<typeof getOwner>;
  createRoot((stop) => {
    stale = getOwner();
    stop();
  });
  expect(() => runWithOwner(stale!, setup)).toThrow(
    "requires a live native owner",
  );
  write(1);
  await Promise.resolve();
  expect(runs).toBe(0);
  expect(stale!.children.size).toBe(0);
});
