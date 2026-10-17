/* oxlint-disable unicorn/no-thenable -- Await branch descriptors and intentional thenables exercise this API. */
import { test, expect } from "bun:test";
import {
  createRoot,
  createRenderEffect,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import { createState } from "../src/state";
import { withRuneScheduler, flushRuneWork } from "../src/pre";
import { awaitBlock } from "../src/await";
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test("branches retain same state, replace setup before cleanup and reject with original value", async () => {
  const input = createState<unknown>(1),
    trace: unknown[] = [];
  let stop!: () => void;
  let current: any;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      const view = awaitBlock(() => input.value, {
        pending: () => {
          trace.push("pending");
          onCleanup(() => trace.push("clean-pending"));
          return "pending";
        },
        then: (value) => {
          trace.push("then");
          onCleanup(() => trace.push("clean-then"));
          return value;
        },
        catch: (error) => {
          trace.push("catch");
          return error;
        },
      });
      createRenderEffect(() => (current = view()[0]));
    });
  });
  await Promise.resolve();
  expect(trace).toEqual(["then"]);
  input.value = 2;
  flushRuneWork();
  expect(trace).toEqual(["then"]);
  expect(current()).toBe(2);
  const first = deferred(),
    second = deferred();
  input.value = first.promise;
  flushRuneWork();
  await Promise.resolve();
  expect(trace).toEqual(["then", "pending", "clean-then"]);
  input.value = second.promise;
  flushRuneWork();
  await Promise.resolve();
  first.resolve("stale");
  await Promise.resolve();
  expect(current).toBe("pending");
  const reason = { detail: "literal" };
  second.reject(reason);
  await Promise.resolve();
  expect(current()).toBe(reason);
  expect(trace.slice(-2)).toEqual(["catch", "clean-pending"]);
  stop();
});
test("resolved promises bypass pending and dispose cancels later completion", async () => {
  const input = createState<unknown>(0),
    trace: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      awaitBlock(() => input.value, {
        pending: () => {
          trace.push("pending");
          return 0;
        },
        then: (value) => {
          trace.push("then");
          return value;
        },
      }),
    );
  });
  await Promise.resolve();
  input.value = Promise.resolve(1);
  flushRuneWork();
  await Promise.resolve();
  expect(trace).toEqual(["then"]);
  const late = deferred();
  input.value = late.promise;
  flushRuneWork();
  stop();
  late.resolve("late");
  await Promise.resolve();
  expect(trace).toEqual(["then"]);
});
test("sync thenables preserve repeated callback order and function values literally", async () => {
  const fn = () => 3;
  const source = {
    then(resolve: any) {
      resolve(1);
      resolve(fn);
    },
  };
  let value: any, stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      const result = awaitBlock(() => source as any, {
        then: (read) => {
          value = read;
          return read;
        },
      });
      result();
    });
  });
  expect(value()).toBe(fn);
  await Promise.resolve();
  expect(value()).toBe(fn);
  stop();
});
test("SSR chooses pending for promises including rejected and then for null false values", async () => {
  for (const input of [
    null,
    false,
    Promise.resolve("resolved"),
    Promise.reject("rejected"),
  ]) {
    const trace: string[] = [];
    const output = renderToString(() =>
      awaitBlock(() => input, {
        pending: () => {
          trace.push("pending");
          return h("b", null, "pending");
        },
        then: (read) => {
          trace.push("then");
          return h("i", null, String(read()));
        },
        catch: () => {
          trace.push("catch");
          return h("s");
        },
      })(),
    );
    expect(trace).toEqual([input instanceof Promise ? "pending" : "then"]);
    expect(output).toBe(
      input instanceof Promise ? "<b>pending</b>" : `<i>${String(input)}</i>`,
    );
  }
  await Promise.resolve();
});
test("native handlers consume callback failures while other render peers drain", async () => {
  const { catchError } = await import("@tschk/moonshine-dom/reactive");
  const pending = deferred<number>();
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      catchError(
        () =>
          awaitBlock(() => pending.promise, {
            then: (value) => {
              createRenderEffect(() => {
                value();
                trace.push("throw");
                throw Error("handled");
              });
              createRenderEffect(() => trace.push("peer"));
              return 0;
            },
          }),
        (error) => trace.push("caught:" + error.message),
      ),
    );
  });
  await Promise.resolve();
  pending.resolve(1);
  await Promise.resolve();
  expect(trace).toEqual(["throw", "peer", "caught:handled"]);
  stop();
});
test("own promise callback failures escape original through microtask without orphan rejection", async () => {
  const code = `import{createRoot,createRenderEffect}from'@tschk/moonshine-dom/reactive';import{withRuneScheduler}from'@tschk/moonshine-svelte/pre';import{awaitBlock}from'@tschk/moonshine-svelte/await';const original={code:'raw'},errors=[],unhandled=[];let resolve,stop;const pending=new Promise(r=>resolve=r);process.on('uncaughtException',error=>errors.push(error===original));process.on('unhandledRejection',error=>unhandled.push(error));createRoot(d=>{stop=d;withRuneScheduler(()=>awaitBlock(()=>pending,{then:()=>{throw original}}))});await Promise.resolve();resolve(1);setTimeout(()=>{stop();console.log(JSON.stringify({errors,unhandled}))},10);`;
  const p = Bun.spawn([process.execPath, "--no-install", "--eval", code], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(p.stdout).text(),
    err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
  expect(JSON.parse(out)).toEqual({ errors: [true], unhandled: [] });
});
test("tracked expression reruns reattach identical thenable instead of identity-skipping", async () => {
  const noise = createState(0);
  let calls = 0,
    stop!: () => void;
  const input = {
    then(resolve: any) {
      calls++;
      resolve(calls);
    },
  };
  let value: any;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      awaitBlock(
        () => {
          void noise.value;
          return input as any;
        },
        {
          then: (read) => {
            value = read;
            return read;
          },
        },
      ),
    );
  });
  expect(calls).toBe(1);
  expect(value()).toBe(1);
  noise.value = 1;
  flushRuneWork();
  expect(calls).toBe(2);
  expect(value()).toBe(2);
  await Promise.resolve();
  stop();
});
test("missing catch rejection routes through owner handler with original cause", async () => {
  const { catchError } = await import("@tschk/moonshine-dom/reactive");
  const pending = deferred();
  const reason = { detail: "raw-rejection" },
    seen: unknown[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      catchError(
        () => awaitBlock(() => pending.promise, { pending: () => 0 }),
        (error) => seen.push(error.cause),
      ),
    );
  });
  await Promise.resolve();
  pending.reject(reason);
  await Promise.resolve();
  expect(seen).toEqual([reason]);
  stop();
});
test("throwing source read invalidates previous pending generation before reporting failure", async () => {
  const { catchError } = await import("@tschk/moonshine-dom/reactive");
  const pending = deferred(),
    broken = createState(false);
  const trace: unknown[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      catchError(
        () =>
          awaitBlock(
            () => {
              if (broken.value) throw Error("read");
              return pending.promise;
            },
            {
              pending: () => {
                trace.push("pending");
                return 0;
              },
              then: (value) => {
                trace.push("then");
                return value;
              },
            },
          ),
        (error) => trace.push(error.message),
      ),
    );
  });
  await Promise.resolve();
  broken.value = true;
  flushRuneWork();
  expect(trace).toEqual(["pending", "read"]);
  pending.resolve("obsolete");
  await Promise.resolve();
  expect(trace).toEqual(["pending", "read"]);
  stop();
});
test("then getter and method body dependencies reattach identical input without expression reads", async () => {
  const getter = createState(0),
    body = createState(0);
  let calls = 0,
    gets = 0,
    stop!: () => void;
  const input = {
    get then() {
      void getter.value;
      gets++;
      return (resolve: any) => {
        void body.value;
        calls++;
        resolve(calls);
      };
    },
  };
  let value: any;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      awaitBlock(() => input as any, {
        then: (read) => {
          value = read;
          return read;
        },
      }),
    );
  });
  expect([gets, calls, value()]).toEqual([2, 1, 1]);
  body.value = 1;
  flushRuneWork();
  expect([gets, calls, value()]).toEqual([4, 2, 2]);
  getter.value = 1;
  flushRuneWork();
  expect([gets, calls, value()]).toEqual([6, 3, 3]);
  await Promise.resolve();
  stop();
});
test("missing catch without owner handler escapes original rejection once without orphan chain", async () => {
  const code = `import{createRoot}from'@tschk/moonshine-dom/reactive';import{withRuneScheduler}from'@tschk/moonshine-svelte/pre';import{awaitBlock}from'@tschk/moonshine-svelte/await';const original={code:'raw'},errors=[],unhandled=[];let reject,stop;const promise=new Promise((_,no)=>reject=no);process.on('uncaughtException',error=>errors.push(error===original));process.on('unhandledRejection',error=>unhandled.push(error));createRoot(d=>{stop=d;withRuneScheduler(()=>awaitBlock(()=>promise,{}))});await Promise.resolve();reject(original);setTimeout(()=>{stop();console.log(JSON.stringify({errors,unhandled}))},10);`;
  const p = Bun.spawn([process.execPath, "--no-install", "--eval", code], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(p.stdout).text(),
    err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
  expect(JSON.parse(out)).toEqual({ errors: [true], unhandled: [] });
});
test("sync thenable construction under retained owner does not drain unrelated posts mid-setup", async () => {
  const { getOwner, runWithOwner } =
    await import("@tschk/moonshine-dom/reactive");
  const { createRuneEffect } = await import("@tschk/moonshine-svelte/runes");
  let owner: any, stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      owner = getOwner();
      createRuneEffect(() => trace.push("post"));
    });
  });
  runWithOwner(owner, () => {
    awaitBlock(
      () =>
        ({
          then(resolve: any) {
            resolve(1);
          },
        }) as any,
      {
        then: () => {
          trace.push("branch");
          return 0;
        },
      },
    );
    trace.push("returned");
  });
  expect(trace).toEqual(["branch", "returned"]);
  await Promise.resolve();
  expect(trace).toEqual(["branch", "returned", "post"]);
  stop();
});

test("inline branch scheduling waits for its template consumer before replacing owners", async () => {
  const input = createState<string | PromiseLike<string>>("first");
  const trace: string[] = [];
  let stop!: () => void;
  let pull!: () => string[];
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      const view = awaitBlock(
        () => input.value,
        {
          then: (read) => {
            trace.push("then");
            onCleanup(() => trace.push("clean-then"));
            return read;
          },
          pending: () => {
            trace.push("pending");
            onCleanup(() => trace.push("clean-pending"));
            return () => "pending";
          },
        },
        (read) => read,
      );
      pull = () => view().map((read) => read!());
      expect(trace).toEqual([]);
      expect(pull()).toEqual(["first"]);
    });
  });
  input.value = "second";
  flushRuneWork();
  expect(pull()).toEqual(["second"]);
  expect(trace).toEqual(["then"]);
  const next = deferred<string>();
  input.value = next.promise;
  flushRuneWork();
  await Promise.resolve();
  expect(trace).toEqual(["then"]);
  expect(pull()).toEqual(["pending"]);
  expect(trace).toEqual(["then", "pending", "clean-then"]);
  next.resolve("resolved");
  await Promise.resolve();
  expect(trace).toEqual(["then", "pending", "clean-then"]);
  expect(pull()).toEqual(["resolved"]);
  stop();
  expect(trace.slice(-3)).toEqual(["then", "clean-pending", "clean-then"]);
});
