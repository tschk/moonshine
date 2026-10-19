import { describe, expect, test } from "bun:test";
import { batch, createSignal as createMsSignal } from "@tschk/moonshine";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  afterNextRender,
  afterRender,
  applyInputValue,
  computed,
  createBridgedSignal,
  createDestroyRef,
  effect,
  fromMoonshineSignal,
  injectDestroyRef,
  input,
  isSignal,
  isWritableSignal,
  linkedSignal,
  model,
  output,
  outputFromObservable,
  outputToObservable,
  resource,
  signal,
  takeUntilDestroyed,
  toObservable,
  toSignal,
  untracked,
  type Subscribable,
} from "../src/signals";

describe("@tschk/moonshine-angular signals", () => {
  test("signal supports set, update, custom equal, and asReadonly", () => {
    const count = signal(1);
    expect(count()).toBe(1);
    expect(isSignal(count)).toBe(true);
    expect(isWritableSignal(count)).toBe(true);

    count.set(2);
    expect(count()).toBe(2);

    count.update((n) => n + 3);
    expect(count()).toBe(5);

    const ro = count.asReadonly();
    expect(ro).toBe(count.asReadonly());
    expect(ro()).toBe(5);
    expect(isSignal(ro)).toBe(true);
    expect(isWritableSignal(ro)).toBe(false);
    expect("set" in ro).toBe(false);
    expect("update" in ro).toBe(false);

    count.set(8);
    expect(ro()).toBe(8);

    const byId = signal(
      { id: 1, label: "first" },
      { equal: (a, b) => a.id === b.id },
    );
    let runs = 0;
    const label = computed(() => {
      runs++;
      return byId().label;
    });
    expect(label()).toBe("first");
    expect(runs).toBe(1);

    byId.set({ id: 1, label: "ignored" });
    expect(label()).toBe("first");
    expect(runs).toBe(1);

    byId.set({ id: 2, label: "second" });
    expect(label()).toBe("second");
    expect(runs).toBe(2);
  });

  test("fromMoonshineSignal and createBridgedSignal satisfy signal predicates and asReadonly", () => {
    const raw = createMsSignal(10);
    const bridged = fromMoonshineSignal(raw);
    const owned = createBridgedSignal("hello");

    expect(isSignal(bridged)).toBe(true);
    expect(isWritableSignal(bridged)).toBe(true);
    expect(isSignal(owned)).toBe(true);
    expect(isWritableSignal(owned)).toBe(true);
    expect(isSignal(() => 1)).toBe(false);
    expect(isWritableSignal(() => 1)).toBe(false);
    expect(isSignal(null)).toBe(false);

    const ro = bridged.asReadonly();
    expect(ro).toBe(bridged.asReadonly());
    expect(isSignal(ro)).toBe(true);
    expect(isWritableSignal(ro)).toBe(false);
    bridged.set(25);
    expect(ro()).toBe(25);
    expect(raw()).toBe(25);
  });

  test("computed is lazy, memoized, and supports custom equality", () => {
    let calls = 0;
    const base = signal(2);
    const doubled = computed(() => {
      calls++;
      return base() * 2;
    });

    expect(calls).toBe(0);
    expect(isSignal(doubled)).toBe(true);
    expect(isWritableSignal(doubled)).toBe(false);

    expect(doubled()).toBe(4);
    expect(doubled()).toBe(4);
    expect(calls).toBe(1);

    let parityCalls = 0;
    const parity = computed(
      () => {
        parityCalls++;
        return { even: doubled() % 2 === 0, value: doubled() };
      },
      { equal: (a, b) => a.even === b.even },
    );
    let downstreamCalls = 0;
    const summary = computed(() => {
      downstreamCalls++;
      return parity().even ? "even" : "odd";
    });

    expect(summary()).toBe("even");
    expect(parityCalls).toBe(1);
    expect(downstreamCalls).toBe(1);

    base.set(3);
    expect(summary()).toBe("even");
    expect(parityCalls).toBe(2);
    expect(downstreamCalls).toBe(1);
  });

  test("computed disallows writing to signals", () => {
    const a = signal(1);
    const b = signal(2);
    const bad = computed(() => {
      b.set(a() + 1);
      return a();
    });
    expect(() => bad()).toThrow(
      /Cannot write to signals inside a reactive computation/,
    );
  });

  test("shorthand linkedSignal supports manual overrides and resets when dependencies change", () => {
    const a = signal(1);
    const b = signal(2);
    let computeCount = 0;
    const total = linkedSignal(() => {
      computeCount++;
      return a() + b();
    });

    expect(computeCount).toBe(0);
    expect(isSignal(total)).toBe(true);
    expect(isWritableSignal(total)).toBe(true);
    expect(isSignal(total.asReadonly())).toBe(true);
    expect(isWritableSignal(total.asReadonly())).toBe(false);

    expect(total()).toBe(3);
    expect(computeCount).toBe(1);

    total.set(99);
    expect(total()).toBe(99);
    total.update((v) => v + 1);
    expect(total()).toBe(100);
    expect(computeCount).toBe(1);

    // Even when a() + b() recomputes to the same sum (3) after a manual override (100),
    // changing the tracked dependencies resets the linkedSignal back to 3.
    batch(() => {
      a.set(0);
      b.set(3);
    });
    expect(total()).toBe(3);
    expect(computeCount).toBe(2);
  });

  test("linkedSignal with explicit source and computation passes previous source and value", () => {
    const items = signal(["alpha", "beta", "gamma"]);
    const history: Array<{ source: string[]; value: string } | undefined> = [];
    const selected = linkedSignal({
      source: items,
      computation: (list, previous) => {
        history.push(previous);
        if (previous && list.includes(previous.value)) {
          return previous.value;
        }
        return list[0] ?? "none";
      },
    });

    expect(selected()).toBe("alpha");
    expect(history).toEqual([undefined]);

    selected.set("beta");
    expect(selected()).toBe("beta");

    items.set(["beta", "delta"]);
    expect(selected()).toBe("beta");
    expect(history).toEqual([
      undefined,
      { source: ["alpha", "beta", "gamma"], value: "beta" },
    ]);

    items.set(["delta", "epsilon"]);
    expect(selected()).toBe("delta");
    expect(history).toEqual([
      undefined,
      { source: ["alpha", "beta", "gamma"], value: "beta" },
      { source: ["beta", "delta"], value: "beta" },
    ]);
  });

  test("effect tracks signals, runs cleanups, batches updates, and respects manualCleanup", () => {
    const count = signal(0);
    const step = signal(1);
    const seen: number[] = [];
    const cleaned: number[] = [];

    const ref = effect((onCleanup) => {
      const value = count() + untracked(step);
      seen.push(value);
      onCleanup(() => {
        cleaned.push(value);
      });
    });

    expect(seen).toEqual([1]);
    expect(cleaned).toEqual([]);

    // step was read via untracked(), so updating step alone does not trigger the effect.
    step.set(10);
    expect(seen).toEqual([1]);

    batch(() => {
      count.set(2);
      count.set(5);
    });
    expect(cleaned).toEqual([1]);
    expect(seen).toEqual([1, 15]);

    ref.destroy();
    expect(cleaned).toEqual([1, 15]);

    count.set(20);
    expect(seen).toEqual([1, 15]);

    const autoSeen: number[] = [];
    const manualSeen: number[] = [];
    let manualRef!: ReturnType<typeof effect>;
    createRoot((dispose) => {
      effect(() => {
        autoSeen.push(count());
      });
      manualRef = effect(
        () => {
          manualSeen.push(count());
        },
        { manualCleanup: true },
      );
      dispose();
    });

    count.set(30);
    expect(autoSeen).toEqual([20]);
    expect(manualSeen).toEqual([20, 30]);
    manualRef.destroy();
    count.set(40);
    expect(manualSeen).toEqual([20, 30]);
  });

  test("effect supports signal writes by default, enforces allowSignalWrites: false, and skips SSR", () => {
    const count = signal(0);
    const ref = effect(() => {
      if (count() < 3) {
        count.set(count() + 1);
      }
    });
    expect(count()).toBe(3);
    ref.destroy();

    const target = signal(0);
    expect(() =>
      effect(
        () => {
          target.set(1);
        },
        { allowSignalWrites: false },
      ),
    ).toThrow(/Cannot write to signals inside a reactive computation/);

    let ssrRuns = 0;
    withSSRRendering(() => {
      const ssrRef = effect(() => {
        ssrRuns++;
      });
      ssrRef.destroy();
    });
    expect(ssrRuns).toBe(0);
  });

  test("toObservable and toSignal interoperate with synchronous and async streams, error propagation, and owner cleanup", () => {
    const count = signal(5);
    const obs = toObservable(count);
    const values: number[] = [];

    const sub = obs.subscribe((v) => values.push(v));
    expect(values).toEqual([5]);

    count.set(10);
    expect(values).toEqual([5, 10]);

    // Round-trip back via toSignal with requireSync: true
    const mirrored = toSignal(obs, { requireSync: true });
    expect(isSignal(mirrored)).toBe(true);
    expect(isWritableSignal(mirrored)).toBe(false);
    expect(mirrored()).toBe(10);

    count.set(15);
    expect(values).toEqual([5, 10, 15]);
    expect(mirrored()).toBe(15);

    sub.unsubscribe();
    count.set(20);
    expect(values).toEqual([5, 10, 15]);
    expect(mirrored()).toBe(20);

    // Async stream with initialValue, requireSync error, and owner disposal cleanup
    let emitNext: ((v: string) => void) | undefined;
    let emitError: ((e: unknown) => void) | undefined;
    let unsubscribed = 0;
    const asyncStream: Subscribable<string> = {
      subscribe(observerOrNext) {
        const obsObj =
          typeof observerOrNext === "function"
            ? { next: observerOrNext }
            : (observerOrNext ?? {});
        emitNext = (v) => obsObj.next?.(v);
        emitError = (e) => obsObj.error?.(e);
        return () => {
          unsubscribed++;
        };
      },
    };

    expect(() => toSignal(asyncStream, { requireSync: true })).toThrow(
      /requireSync: true/,
    );
    expect(unsubscribed).toBe(1);

    let sig!: ReturnType<typeof toSignal<string, string>>;
    createRoot((dispose) => {
      sig = toSignal(asyncStream, { initialValue: "pending" });
      expect(sig()).toBe("pending");
      emitNext?.("ready");
      expect(sig()).toBe("ready");
      emitError?.(new Error("stream boom"));
      expect(() => sig()).toThrow("stream boom");
      dispose();
    });
    expect(unsubscribed).toBe(2);
  });

  test("resource manages idle, loading, resolved, reloading, local, error, and abortSignal lifecycle", async () => {
    const userId = signal<number | undefined>(undefined);
    const abortedRequests: number[] = [];
    let resolvers = new Map<
      number,
      { resolve: (v: string) => void; reject: (e: unknown) => void }
    >();

    const userResource = resource({
      request: () => userId(),
      defaultValue: "anonymous",
      loader: ({ request, abortSignal }) => {
        abortSignal.addEventListener("abort", () => {
          abortedRequests.push(request);
        });
        return new Promise<string>((resolve, reject) => {
          resolvers.set(request, { resolve, reject });
        });
      },
    });

    // Starts idle because request() is undefined
    expect(userResource.status()).toBe("idle");
    expect(userResource.isLoading()).toBe(false);
    expect(userResource.value()).toBe("anonymous");
    expect(userResource.hasValue()).toBe(true);
    expect(userResource.reload()).toBe(false);

    // Transition to loading when request becomes 1
    userId.set(1);
    expect(userResource.status()).toBe("loading");
    expect(userResource.isLoading()).toBe(true);
    expect(userResource.value()).toBe("anonymous");

    // Supersede request 1 with request 2 -> aborts request 1
    userId.set(2);
    expect(abortedRequests).toEqual([1]);
    expect(userResource.status()).toBe("loading");

    // Resolve request 2
    resolvers.get(2)!.resolve("User #2");
    await Promise.resolve();
    expect(userResource.status()).toBe("resolved");
    expect(userResource.isLoading()).toBe(false);
    expect(userResource.value()).toBe("User #2");
    expect(userResource.hasValue()).toBe(true);

    // reload() transitions to "reloading" while preserving previous resolved value
    expect(userResource.reload()).toBe(true);
    expect(userResource.status()).toBe("reloading");
    expect(userResource.isLoading()).toBe(true);
    expect(userResource.value()).toBe("User #2");

    resolvers.get(2)!.resolve("User #2 (reloaded)");
    await Promise.resolve();
    expect(userResource.status()).toBe("resolved");
    expect(userResource.value()).toBe("User #2 (reloaded)");

    // Local override via set / update transitions status to "local"
    userResource.set("Local Override");
    expect(userResource.status()).toBe("local");
    expect(userResource.value()).toBe("Local Override");
    userResource.update((v) => `${v}!`);
    expect(userResource.value()).toBe("Local Override!");

    // Error handling
    userId.set(3);
    resolvers.get(3)!.reject(new Error("network failure"));
    await Promise.resolve();
    expect(userResource.status()).toBe("error");
    expect((userResource.error() as Error).message).toBe("network failure");
    expect(userResource.hasValue()).toBe(false);
    expect(userResource.value()).toBe("anonymous");

    userResource.destroy();
  });

  test("input, input.required, model, model.required, and applyInputValue support reactive reads, transforms, and output emission", () => {
    const optionalInput = input<string>();
    const defaultInput = input(10);
    const transformedInput = input(false, {
      alias: "disabled",
      transform: (v: boolean | string) =>
        v === "" || v === "true" || v === true,
    });
    const requiredInput = input.required<string>({ alias: "title" });

    expect(isSignal(optionalInput)).toBe(true);
    expect(isWritableSignal(optionalInput)).toBe(false);
    expect(optionalInput()).toBeUndefined();
    expect(defaultInput()).toBe(10);
    expect(transformedInput()).toBe(false);
    expect(() => requiredInput()).toThrow(
      'Input "title" is required, but no value is available yet.',
    );

    applyInputValue(optionalInput, "hello");
    applyInputValue(defaultInput, 25);
    applyInputValue(transformedInput, "");
    applyInputValue(requiredInput, "Dashboard");

    expect(optionalInput()).toBe("hello");
    expect(defaultInput()).toBe(25);
    expect(transformedInput()).toBe(true);
    expect(requiredInput()).toBe("Dashboard");

    const countModel = model(0);
    const requiredModel = model.required<string>({ alias: "username" });
    expect(isSignal(countModel)).toBe(true);
    expect(isWritableSignal(countModel)).toBe(true);
    expect(() => requiredModel()).toThrow(
      'Model "username" is required, but no value is available yet.',
    );

    const modelEmissions: number[] = [];
    const sub = countModel.subscribe((v) => modelEmissions.push(v));

    // Host input update via applyInputValue updates the signal without emitting an output event
    applyInputValue(countModel, 5);
    expect(countModel()).toBe(5);
    expect(modelEmissions).toEqual([]);

    // Component write via .set / .update updates the signal and emits to subscribers
    countModel.set(6);
    countModel.update((n) => n + 4);
    expect(countModel()).toBe(10);
    expect(modelEmissions).toEqual([6, 10]);
    sub.unsubscribe();

    applyInputValue(requiredModel, "ada");
    expect(requiredModel()).toBe("ada");
  });

  test("output, outputFromObservable, outputToObservable, DestroyRef, takeUntilDestroyed, afterNextRender, and afterRender manage subscriptions and lifecycle", async () => {
    const clicked = output<string>();
    const seen: string[] = [];
    const obs = outputToObservable(clicked);
    const sub = obs.subscribe((val) => seen.push(val));

    clicked.emit("first");
    clicked.emit("second");
    expect(seen).toEqual(["first", "second"]);
    sub.unsubscribe();
    clicked.emit("third");
    expect(seen).toEqual(["first", "second"]);

    const numSig = signal(1);
    const fromObsOut = outputFromObservable(toObservable(numSig));
    const fromObsSeen: number[] = [];
    const sub2 = fromObsOut.subscribe((n) => fromObsSeen.push(n));
    expect(fromObsSeen).toEqual([1]);
    numSig.set(2);
    expect(fromObsSeen).toEqual([1, 2]);
    sub2.unsubscribe();

    // DestroyRef + takeUntilDestroyed inside createRoot
    const streamSeen: number[] = [];
    let completed = false;
    let destroyCalled = 0;
    const stopRoot = createRoot((dispose) => {
      const destroyRef = injectDestroyRef();
      expect(injectDestroyRef()).toBe(destroyRef);
      destroyRef.onDestroy(() => {
        destroyCalled++;
      });
      const piped = takeUntilDestroyed<number>()(toObservable(numSig));
      piped.subscribe({
        next: (v) => streamSeen.push(v),
        complete: () => {
          completed = true;
        },
      });
      return dispose;
    });

    expect(streamSeen).toEqual([2]);
    numSig.set(3);
    expect(streamSeen).toEqual([2, 3]);
    expect(completed).toBe(false);

    stopRoot();
    expect(destroyCalled).toBe(1);
    expect(completed).toBe(true);
    numSig.set(4);
    expect(streamSeen).toEqual([2, 3]);

    // Standalone createDestroyRef
    const manualDestroy = createDestroyRef();
    expect(manualDestroy.destroyed).toBe(false);
    manualDestroy.destroy();
    expect(manualDestroy.destroyed).toBe(true);

    // afterNextRender & afterRender phases (and SSR suppression)
    const renderPhases: string[] = [];
    withSSRRendering(() => {
      afterNextRender(() => renderPhases.push("ssr-next"));
      afterRender(() => renderPhases.push("ssr-render"));
    });

    afterNextRender({
      earlyRead: () => {
        renderPhases.push("earlyRead");
        return 10;
      },
      write: (v) => {
        renderPhases.push(`write:${v}`);
        return v * 2;
      },
      mixedReadWrite: (v) => {
        renderPhases.push(`mixed:${v}`);
        return v + 1;
      },
      read: (v) => {
        renderPhases.push(`read:${v}`);
      },
    });
    afterRender(() => {
      renderPhases.push("afterRenderFn");
    });

    await Promise.resolve();
    expect(renderPhases).toEqual([
      "earlyRead",
      "write:10",
      "mixed:20",
      "read:21",
      "afterRenderFn",
    ]);
  });
});
