import { describe, expect, test } from "bun:test";
import { batch, createSignal as createMsSignal } from "@tschk/moonshine";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  EnvironmentInjector,
  ExperimentalPendingTasks,
  HostAttributeToken,
  InjectionToken,
  Injector,
  PendingTasks,
  afterNextRender,
  afterRender,
  afterRenderEffect,
  applyInputValue,
  applyQueryValue,
  assertInInjectionContext,
  assertNotInReactiveContext,
  computed,
  contentChild,
  contentChildren,
  createBridgedSignal,
  createDestroyRef,
  createEnvironmentInjector,
  createPendingTasks,
  effect,
  fromMoonshineSignal,
  getCurrentInjector,
  getQueryMetadata,
  inject,
  injectDestroyRef,
  input,
  isSignal,
  isWritableSignal,
  linkedSignal,
  makeEnvironmentProviders,
  model,
  output,
  outputFromObservable,
  outputToObservable,
  provideEnvironmentInitializer,
  resource,
  runInInjectionContext,
  rxResource,
  signal,
  takeUntilDestroyed,
  toObservable,
  toSignal,
  untracked,
  viewChild,
  viewChildren,
  type Observer,
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

  test("InjectionToken, Injector, EnvironmentInjector, runInInjectionContext, assertInInjectionContext, inject, and provideEnvironmentInitializer", () => {
    expect(getCurrentInjector()).toBeUndefined();
    expect(() => assertInInjectionContext(function myHelper() {})).toThrow(
      "NG0203: myHelper() must be called from an injection context",
    );
    expect(() => inject(DestroyRef)).toThrow("NG0203");

    const API_URL = new InjectionToken<string>("API_URL", {
      factory: () => "https://api.example.com",
    });
    const MULTI_PLUGINS = new InjectionToken<string[]>("MULTI_PLUGINS");
    const ALIAS_URL = new InjectionToken<string>("ALIAS_URL");
    const MISSING_TOKEN = new InjectionToken<string>("MISSING_TOKEN");
    const ROLE_ATTR = new HostAttributeToken("role");

    class LoggerService {
      logs: string[] = [];
      log(msg: string) {
        this.logs.push(msg);
      }
    }

    class ApiService {
      readonly url = inject(API_URL);
      readonly logger = inject(LoggerService);
      readonly destroyRef = inject(DestroyRef);
      readonly role = inject(ROLE_ATTR, { optional: true });
      destroyed = false;

      constructor() {
        this.destroyRef.onDestroy(() => {
          this.destroyed = true;
        });
      }
    }

    const initCalls: string[] = [];
    const parentInjector = createEnvironmentInjector(
      [
        LoggerService,
        { provide: MULTI_PLUGINS, useValue: "plugin-a", multi: true },
        { provide: MULTI_PLUGINS, useFactory: () => "plugin-b", multi: true },
        makeEnvironmentProviders([
          { provide: ALIAS_URL, useExisting: API_URL },
          { provide: ROLE_ATTR, useValue: "main" },
        ]),
        provideEnvironmentInitializer(() => {
          const logger = inject(LoggerService);
          logger.log("initialized");
          initCalls.push(inject(API_URL));
        }),
      ],
      undefined,
      "ParentEnv",
    );

    expect(initCalls).toEqual(["https://api.example.com"]);
    expect(parentInjector.get(ENVIRONMENT_INITIALIZER)).toHaveLength(1);
    expect(parentInjector.get(LoggerService).logs).toEqual(["initialized"]);
    expect(parentInjector.get(MULTI_PLUGINS)).toEqual(["plugin-a", "plugin-b"]);
    expect(parentInjector.get(ALIAS_URL)).toBe("https://api.example.com");
    expect(parentInjector.get(MISSING_TOKEN, "fallback")).toBe("fallback");
    expect(
      parentInjector.get(MISSING_TOKEN, undefined, { optional: true }),
    ).toBeNull();
    expect(() => parentInjector.get(MISSING_TOKEN)).toThrow(
      "NG0201: No provider for InjectionToken MISSING_TOKEN found!",
    );

    const childInjector = Injector.create({
      name: "ChildEnv",
      parent: parentInjector,
      providers: [
        { provide: API_URL, useValue: "https://child.example.com" },
        { provide: ApiService, useClass: ApiService },
      ],
    });

    const api = childInjector.get(ApiService);
    expect(api.url).toBe("https://child.example.com");
    expect(api.logger).toBe(parentInjector.get(LoggerService));
    expect(api.role).toBe("main");
    expect(api.destroyed).toBe(false);

    // skipSelf & self options
    expect(childInjector.get(EnvironmentInjector)).toBe(childInjector);
    const fromSkipSelf = runInInjectionContext(childInjector, () => {
      assertInInjectionContext(function checkCtx() {});
      expect(getCurrentInjector()).toBe(childInjector);
      expect(inject(LoggerService, { self: true, optional: true })).toBeNull();
      return inject(API_URL, { skipSelf: true });
    });
    expect(fromSkipSelf).toBe("https://api.example.com");

    // Circular dependency detection
    const TOKEN_A = new InjectionToken<unknown>("TOKEN_A");
    const TOKEN_B = new InjectionToken<unknown>("TOKEN_B");
    const cyclicInjector = createEnvironmentInjector([
      { provide: TOKEN_A, useFactory: () => inject(TOKEN_B) },
      { provide: TOKEN_B, useFactory: () => inject(TOKEN_A) },
    ]);
    expect(() => cyclicInjector.get(TOKEN_A)).toThrow(
      "NG0200: Circular dependency in DI detected",
    );

    // Effect & toObservable bound via { injector: childInjector }
    const counter = signal(1);
    const seenEffect: number[] = [];
    const seenObs: number[] = [];
    let obsCompleted = false;
    effect(
      () => {
        seenEffect.push(counter());
      },
      { injector: childInjector },
    );
    toObservable(counter, { injector: childInjector }).subscribe({
      next: (v) => seenObs.push(v),
      complete: () => {
        obsCompleted = true;
      },
    });
    expect(seenEffect).toEqual([1]);
    expect(seenObs).toEqual([1]);

    counter.set(2);
    expect(seenEffect).toEqual([1, 2]);
    expect(seenObs).toEqual([1, 2]);

    childInjector.destroy();
    expect(childInjector.destroyed).toBe(true);
    expect(api.destroyed).toBe(true);
    expect(obsCompleted).toBe(true);

    counter.set(3);
    expect(seenEffect).toEqual([1, 2]);
    expect(seenObs).toEqual([1, 2]);
    expect(() => childInjector.runInContext(() => {})).toThrow("NG0205");
  });

  test("viewChild, viewChild.required, viewChildren, contentChild, contentChild.required, contentChildren, and applyQueryValue", () => {
    class HeaderWidget {
      title = "Header";
    }
    class TabItem {
      constructor(public label: string) {}
    }

    const optionalHeader = viewChild(HeaderWidget);
    const requiredInputEl = viewChild.required<
      string,
      { nativeElement: string }
    >("searchBox", { read: "ElementRef" });
    const allTabs = viewChildren(TabItem);
    const projectedFooter = contentChild<string>("footerSlot", {
      descendants: false,
    });
    const requiredProjected = contentChild.required(HeaderWidget);
    const projectedItems = contentChildren(TabItem, { descendants: true });

    expect(isSignal(optionalHeader)).toBe(true);
    expect(isSignal(requiredInputEl)).toBe(true);
    expect(isSignal(allTabs)).toBe(true);
    expect(isSignal(projectedFooter)).toBe(true);
    expect(isSignal(requiredProjected)).toBe(true);
    expect(isSignal(projectedItems)).toBe(true);

    expect(getQueryMetadata(optionalHeader)).toEqual({
      kind: "viewChild",
      locator: HeaderWidget,
      read: undefined,
      descendants: true,
      required: false,
    });
    expect(getQueryMetadata(requiredInputEl)).toEqual({
      kind: "viewChild",
      locator: "searchBox",
      read: "ElementRef",
      descendants: true,
      required: true,
    });
    expect(getQueryMetadata(projectedFooter)?.descendants).toBe(false);
    expect(getQueryMetadata(projectedItems)?.descendants).toBe(true);

    expect(optionalHeader()).toBeUndefined();
    expect(allTabs()).toEqual([]);
    expect(Object.isFrozen(allTabs())).toBe(true);
    expect(projectedFooter()).toBeUndefined();
    expect(projectedItems()).toEqual([]);
    expect(() => requiredInputEl()).toThrow(
      "NG0951: Child query result is required",
    );
    expect(() => requiredProjected()).toThrow(
      "NG0951: Child query result is required",
    );

    const tabCount = computed(() => allTabs().length + projectedItems().length);
    expect(tabCount()).toBe(0);

    const headerInstance = new HeaderWidget();
    applyQueryValue(optionalHeader, headerInstance);
    applyQueryValue(requiredInputEl, { nativeElement: "<input>" });
    applyQueryValue(allTabs, [new TabItem("Home"), new TabItem("Settings")]);
    applyQueryValue(projectedFooter, "Footer Content");
    applyQueryValue(requiredProjected, headerInstance);
    applyQueryValue(projectedItems, [new TabItem("Extra")]);

    expect(optionalHeader()).toBe(headerInstance);
    expect(requiredInputEl()).toEqual({ nativeElement: "<input>" });
    expect(allTabs().map((t) => t.label)).toEqual(["Home", "Settings"]);
    expect(Object.isFrozen(allTabs())).toBe(true);
    expect(projectedFooter()).toBe("Footer Content");
    expect(requiredProjected()).toBe(headerInstance);
    expect(tabCount()).toBe(3);

    expect(() => applyQueryValue(signal(1), 2)).toThrow(
      "Target is not an Angular signal query",
    );
  });

  test("rxResource streams multi-emission Observables, unsubscribes on request change, and supports reload/local state", () => {
    const query = signal<string | undefined>(undefined);
    let activeUnsubscribed = 0;
    let lastObserver: Partial<Observer<string>> | undefined;

    const requested: string[] = [];
    const res = rxResource({
      request: () => query(),
      defaultValue: "initial",
      loader: ({ request }) => {
        requested.push(request);
        return {
          subscribe(observerOrNext) {
            lastObserver =
              typeof observerOrNext === "function"
                ? { next: observerOrNext }
                : observerOrNext;
            return {
              unsubscribe() {
                activeUnsubscribed++;
              },
            };
          },
        };
      },
    });

    expect(res.status()).toBe("idle");
    expect(res.value()).toBe("initial");

    query.set("alpha");
    expect(res.status()).toBe("loading");
    expect(res.isLoading()).toBe(true);

    // Emit multiple streaming values
    lastObserver?.next?.("alpha:chunk-1");
    expect(res.status()).toBe("resolved");
    expect(res.value()).toBe("alpha:chunk-1");
    expect(res.hasValue()).toBe(true);

    lastObserver?.next?.("alpha:chunk-2");
    expect(res.value()).toBe("alpha:chunk-2");

    // Changing request unsubscribes previous stream
    query.set("beta");
    expect(activeUnsubscribed).toBe(1);
    expect(res.status()).toBe("loading");

    lastObserver?.error?.(new Error("stream-failed"));
    expect(res.status()).toBe("error");
    expect((res.error() as Error).message).toBe("stream-failed");
    expect(res.value()).toBe("initial");

    // Local override and reload
    res.set("manual");
    expect(res.status()).toBe("local");
    expect(res.value()).toBe("manual");

    expect(res.reload()).toBe(true);
    expect(res.status()).toBe("reloading");
    lastObserver?.next?.("beta:reloaded");
    expect(res.status()).toBe("resolved");
    expect(res.value()).toBe("beta:reloaded");

    res.destroy();
    expect(activeUnsubscribed).toBe(2);
  });

  test("PendingTasks tracks pending async work and resolves via DI", async () => {
    expect(ExperimentalPendingTasks).toBe(PendingTasks);
    const env = createEnvironmentInjector([]);
    const tasks = env.runInContext(() => inject(PendingTasks));
    expect(tasks).toBeInstanceOf(PendingTasks);
    expect(tasks.hasPendingTasks()).toBe(false);

    const remove1 = tasks.add();
    expect(tasks.hasPendingTasks()).toBe(true);
    remove1();
    // Idempotent removal
    remove1();
    expect(tasks.hasPendingTasks()).toBe(false);

    let resolveTask!: (v: string) => void;
    const promise = tasks.run(
      () =>
        new Promise<string>((resolve) => {
          resolveTask = resolve;
        }),
    );
    expect(tasks.hasPendingTasks()).toBe(true);
    resolveTask("done");
    expect(await promise).toBe("done");
    expect(tasks.hasPendingTasks()).toBe(false);

    const standaloneTasks = createPendingTasks();
    standaloneTasks.add();
    expect(standaloneTasks.hasPendingTasks()).toBe(true);
    standaloneTasks.destroy();
    expect(standaloneTasks.hasPendingTasks()).toBe(false);
    env.destroy();
  });

  test("afterRenderEffect runs reactive phases and assertNotInReactiveContext guards reactive scopes", () => {
    const width = signal(100);
    const derivedLabel = signal("init");
    const log: string[] = [];
    const cleanups: string[] = [];

    function outsideOnlyHelper() {
      assertNotInReactiveContext(outsideOnlyHelper, "Call it during setup.");
    }

    outsideOnlyHelper();

    const c = computed(() => {
      expect(() => outsideOnlyHelper()).toThrow(
        "NG0602: outsideOnlyHelper() cannot be called from within a reactive context. Call it during setup.",
      );
      // Inside untracked(), reactive context is suspended
      untracked(() => outsideOnlyHelper());
      return width() * 2;
    });
    expect(c()).toBe(200);

    const ref = afterRenderEffect({
      earlyRead: (onCleanup) => {
        onCleanup(() => cleanups.push("earlyRead"));
        expect(() => derivedLabel.set("illegal")).toThrow(
          "Cannot write to signals inside a reactive computation",
        );
        const w = width();
        log.push(`earlyRead:${w}`);
        return w * 2;
      },
      write: (doubled, onCleanup) => {
        onCleanup(() => cleanups.push("write"));
        derivedLabel.set(`px:${doubled}`);
        log.push(`write:${doubled}`);
        return `label=${doubled}`;
      },
      mixedReadWrite: (formatted, onCleanup) => {
        onCleanup(() => cleanups.push("mixed"));
        log.push(`mixed:${formatted}`);
        return formatted.toUpperCase();
      },
      read: (upper, onCleanup) => {
        onCleanup(() => cleanups.push("read"));
        expect(() => derivedLabel.set("illegal")).toThrow(
          "Cannot write to signals inside a reactive computation",
        );
        log.push(`read:${upper}`);
      },
    });

    expect(derivedLabel()).toBe("px:200");
    expect(log).toEqual([
      "earlyRead:100",
      "write:200",
      "mixed:label=200",
      "read:LABEL=200",
    ]);

    width.set(150);
    expect(cleanups).toEqual(["earlyRead", "write", "mixed", "read"]);
    expect(derivedLabel()).toBe("px:300");
    expect(log.slice(4)).toEqual([
      "earlyRead:150",
      "write:300",
      "mixed:label=300",
      "read:LABEL=300",
    ]);

    ref.destroy();

    // SSR no-op
    const ssrLog: string[] = [];
    withSSRRendering(() => {
      afterRenderEffect(() => {
        ssrLog.push("ran");
      });
    });
    expect(ssrLog).toEqual([]);
  });
});
