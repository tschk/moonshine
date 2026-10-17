import { afterEach, expect, spyOn, test } from "bun:test";
import { h, render } from "@tschk/moonshine-dom/dom";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { createRuneEffect, createState } from "../src/runes";
import { createRunePreEffect, withRuneScheduler } from "../src/pre";
import { tick } from "../src/svelte";
import { tick as serverTick } from "../src/ssr";
import { queueTickWork, removeTickWork } from "../src/tick-queue";
import { withHistoryCleanup } from "../src/history";
import "../../react/test/dom";

let stop = () => {};
const container = document.createElement("main");
afterEach(() => {
  stop();
  container.replaceChildren();
});

test("server tick resolves in one microtask without draining browser work", async () => {
  let drained = false;
  const run = () => {
    drained = true;
  };
  queueTickWork(run, () => {});
  try {
    const trace: string[] = [];
    const pending = serverTick().then(() => trace.push("tick"));
    queueMicrotask(() => trace.push("microtask"));
    expect(trace).toEqual([]);
    await pending;
    expect(trace).toEqual(["tick", "microtask"]);
    expect(drained).toBe(false);
    await tick();
    expect(drained).toBe(true);
  } finally {
    removeTickWork(run);
  }
});

test("tick observers registered before a synchronous write see committed DOM", async () => {
  const state = createState(0);
  stop = render(
    () => withRuneScheduler(() => h("output", null, () => state.value)),
    container,
  );
  let observed: string | undefined;
  const pending = tick().then(() => {
    observed = container.textContent;
  });
  state.value = 1;
  expect(observed).toBeUndefined();
  expect(container.textContent).toBe("0");
  await pending;
  expect(observed).toBe("1");
  state.value = 2;
  await tick();
  expect(container.textContent).toBe("2");
});

test("tick waits for pre, render, post and synchronous post-triggered writes", async () => {
  const source = createState(0),
    followup = createState(0);
  const trace: unknown[][] = [];
  stop = render(
    () =>
      withRuneScheduler(() => {
        createRunePreEffect(() => {
          trace.push(["pre", source.value, container.textContent]);
        });
        createRuneEffect(() => {
          const value = source.value;
          trace.push(["post", value, container.textContent]);
          if (value === 1) followup.value = 2;
        });
        return h("output", null, () => source.value + "/" + followup.value);
      }),
    container,
  );
  await tick();
  trace.length = 0;
  const pending = tick().then(() => container.textContent);
  source.value = 1;
  expect(await pending).toBe("1/2");
  expect(trace).toEqual([
    ["pre", 1, "0/0"],
    ["post", 1, "1/0"],
  ]);
});

test("tick does not revive queued work after owner disposal", async () => {
  const source = createState(0);
  const trace: number[] = [];
  stop = render(
    () =>
      withRuneScheduler(() => {
        createRuneEffect(() => {
          trace.push(source.value);
        });
        return h("output", null, () => source.value);
      }),
    container,
  );
  await tick();
  const pending = tick().then(() => container.textContent);
  source.value = 1;
  stop();
  expect(await pending).toBe("");
  expect(trace).toEqual([0]);
});

test("tick preserves scheduler errors while independent post effects drain", async () => {
  const source = createState(0),
    failure = Error("post failure");
  const jobs: (() => void)[] = [],
    peers: number[] = [];
  const scheduling = spyOn(globalThis, "queueMicrotask").mockImplementation(
    (job) => {
      jobs.push(job);
    },
  );
  try {
    stop = render(
      () =>
        withRuneScheduler(() => {
          createRuneEffect(() => {
            if (source.value === 1) throw failure;
          });
          createRuneEffect(() => {
            peers.push(source.value);
          });
          return h("output", null, () => source.value);
        }),
      container,
    );
    jobs.shift()!();
    const pending = tick();
    source.value = 1;
    expect(() => jobs.shift()!()).toThrow(failure);
    await pending;
    expect(peers).toEqual([0, 1]);
    expect(container.textContent).toBe("1");
  } finally {
    scheduling.mockRestore();
  }
});

test("tick drains a post effect that writes to a separate opted-in render root", async () => {
  const trigger = createState(0),
    value = createState(0);
  const stopRender = render(
    () => withRuneScheduler(() => h("output", null, () => value.value)),
    container,
  );
  const stopEffect = createRoot((dispose) => {
    createRuneEffect(() => {
      if (trigger.value === 1) value.value = 1;
    });
    return dispose;
  });
  stop = () => {
    stopEffect();
    stopRender();
  };
  await tick();
  const pending = tick().then(() => container.textContent);
  trigger.value = 1;
  expect(await pending).toBe("1");
});

test("tick drains other queues after an error and future updates recover", async () => {
  const bad = createState(0),
    value = createState(0),
    failure = Error("first failure");
  const peers: number[] = [];
  const stopEffect = createRoot((dispose) => {
    createRuneEffect(() => {
      if (bad.value === 1) throw failure;
    });
    return dispose;
  });
  const stopRender = render(
    () =>
      withRuneScheduler(() => {
        createRuneEffect(() => {
          peers.push(value.value);
        });
        return h("output", null, () => value.value);
      }),
    container,
  );
  stop = () => {
    stopEffect();
    stopRender();
  };
  await tick();
  const pending = tick();
  bad.value = 1;
  value.value = 1;
  await expect(pending).rejects.toBe(failure);
  expect(peers).toEqual([0, 1]);
  expect(container.textContent).toBe("1");
  bad.value = 0;
  value.value = 2;
  await tick();
  expect(peers).toEqual([0, 1, 2]);
});

test("a stale queued effect flush cannot release a newer history interval", async () => {
  const source = createState(0),
    seen: number[] = [],
    jobs: (() => void)[] = [];
  const scheduling = spyOn(globalThis, "queueMicrotask").mockImplementation(
    (job) => {
      jobs.push(job);
    },
  );
  try {
    stop = createRoot((dispose) => {
      createRuneEffect(() => {
        seen.push(source.value);
      });
      return dispose;
    });
    jobs.shift()!();
    const pending = tick();
    source.value = 1;
    await pending;
    source.value = 2;
    // The first queued job belongs to the flush that tick already drained.
    jobs.shift()!();
    expect(seen).toEqual([0, 1]);
    expect(withHistoryCleanup(() => source.value)).toBe(1);
    jobs.shift()!();
    expect(seen).toEqual([0, 1, 2]);
    expect(withHistoryCleanup(() => source.value)).toBe(2);
  } finally {
    scheduling.mockRestore();
  }
});

test("tick bounds alternating queue cycles, cancels them and permits recovery", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
import assert from 'node:assert/strict';
import {createRoot} from '@tschk/moonshine-dom/reactive';
import {createState,createRuneEffect} from './src/runes';
import {withRuneScheduler} from './src/pre';
import {tick} from './src/svelte';
import {withHistoryCleanup} from './src/history';
const left=createState(0),right=createState(0),peer=createState(0);let peers=0;
const first=createRoot(stop=>{createRuneEffect(()=>{const value=left.value;if(value>0)right.value=value});return stop});
const second=createRoot(stop=>{withRuneScheduler(()=>{createRuneEffect(()=>{const value=right.value;if(value>0)left.value=value+1});createRuneEffect(()=>{peer.value;peers++})});return stop});
await tick();
const pending=tick();left.value=1;peer.value=1;
await assert.rejects(pending,/Native tick update limit exceeded/);
assert.equal(peers,2);assert.ok(left.value>1000);
left.value=0;right.value=0;peer.value=2;
await tick();assert.equal(peers,3);assert.equal(withHistoryCleanup(()=>left.value),0);
first();second();await tick();console.log('bounded cycle and recovery passed');
`,
    ],
    { cwd: `${import.meta.dir}/..`, stdout: "pipe", stderr: "pipe" },
  );
  const timeout = setTimeout(() => child.kill(), 10_000);
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("bounded cycle and recovery passed");
  } finally {
    clearTimeout(timeout);
  }
}, 15_000);

test("tick settles multiple alternating queue waves before notifying its observer", async () => {
  const left = createState(0),
    right = createState(0);
  const trace: unknown[][] = [];
  const stopEffect = createRoot((dispose) => {
    createRuneEffect(() => {
      const value = left.value;
      trace.push(["default", value]);
      if (value > 0) right.value = value;
    });
    return dispose;
  });
  const stopRender = render(
    () =>
      withRuneScheduler(() => {
        createRuneEffect(() => {
          const value = right.value;
          trace.push(["opt-in", value]);
          if (value > 0 && value < 3) left.value = value + 1;
        });
        return h("output", null, () => left.value + "/" + right.value);
      }),
    container,
  );
  stop = () => {
    stopEffect();
    stopRender();
  };
  await tick();
  trace.length = 0;
  const pending = tick().then(() => container.textContent);
  left.value = 1;
  expect(await pending).toBe("3/3");
  expect(trace).toEqual([
    ["default", 1],
    ["opt-in", 1],
    ["default", 2],
    ["opt-in", 2],
    ["default", 3],
    ["opt-in", 3],
  ]);
});
