import {
  renderSchedulerKey,
  type RenderScheduler,
} from "@tschk/moonshine-dom/render-scheduler";
import {
  isRawSnippet,
  getRawSnippetFactory,
  type RawSnippet,
} from "./raw-snippet";
import { insertedNode } from "@tschk/moonshine-dom/dom";
import { rawHTML } from "@tschk/moonshine-dom/html";
import {
  withComponentConsumer,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import {
  createRoot,
  getOwner,
  onCleanup,
  onBeforeDispose,
  runWithOwner,
  untrack,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
type Cell<T> = { readonly value: T };
export function invokeRawDOM<P extends unknown[]>(
  snippet: RawSnippet<P>,
  cells: { [K in keyof P]: Cell<P[K]> },
  frame: ComponentContext,
  initial: boolean,
  consumerScheduler: RenderScheduler | undefined,
) {
  const factory = getRawSnippetFactory(snippet);
  const invocation = getOwner();
  if (!invocation || invocation.disposed || frame.owner.disposed)
    throw Error("Raw snippet requires live authored consumer");
  const lifetime = initial ? frame.owner : invocation;
  let work: Owner | undefined,
    stopWork: () => void = () => {},
    element: Element | undefined,
    done = false,
    branchClosed = false,
    returned: (() => void) | undefined;
  const activate = <T>(fn: () => T): T =>
    withComponentConsumer(frame, () => untrack(fn));
  const finish = () => {
    branchClosed = true;
    element?.remove();
    const cleanup = returned;
    returned = undefined;
    try {
      cleanup?.();
    } finally {
      if (!done) stopWork();
    }
  };
  onCleanup(finish);
  const result = createRoot((stop) => {
    stopWork = stop;
    work = getOwner()!;
    if (initial) {
      // Initial setup effects belong to the consumer's post group, not this branch.
      work.context = new Map(work.context);
      if (consumerScheduler)
        work.context.set(renderSchedulerKey, consumerScheduler);
      else work.context.delete(renderSchedulerKey);
      runWithOwner(lifetime, () => onCleanup(stopWork));
    }
    const rendered = activate(() =>
      factory(
        ...(cells.map((cell) => () => cell.value) as {
          [K in keyof P]: () => P[K];
        }),
      ),
    );
    const html = activate(() => rendered.render().trim()),
      nodes = rawHTML(() => html)();
    if (nodes.length !== 1 || !(nodes[0] instanceof Element))
      throw TypeError("Raw snippet render requires one element");
    element = nodes[0];
    onBeforeDispose(() => element?.remove());
    Object.defineProperty(element, insertedNode, {
      configurable: true,
      value: () => {
        if (invocation.disposed || lifetime.disposed || work!.disposed) {
          element!.remove();
          stopWork();
          return;
        }
        if (!initial) {
          work!.parent = lifetime;
          lifetime.children.add(work!);
        }
        try {
          const cleanup = runWithOwner(work!, () =>
            activate(() => rendered.setup?.(element!)),
          );
          done = true;
          if (typeof cleanup === "function") {
            if (branchClosed || invocation.disposed || lifetime.disposed)
              cleanup();
            else returned = cleanup as () => void;
          }
        } catch (error) {
          try {
            stopWork();
          } catch {}
          throw error;
        }
      },
    });
    return element;
  });
  return result;
}
/** Internal @render dispatch: ordinary compiled snippets keep their cell ABI. */
export function invokeSnippetDOM<P extends unknown[]>(
  snippet:
    | RawSnippet<P>
    | ((
        ...cells: { [K in keyof P]: Cell<P[K]> }
      ) => import("@tschk/moonshine-dom/dom").DOMChild),
  cells: { [K in keyof P]: Cell<P[K]> },
  consumer: ComponentContext,
  initial: boolean,
  consumerScheduler: RenderScheduler | undefined,
): import("@tschk/moonshine-dom/dom").DOMChild {
  if (isRawSnippet(snippet))
    return invokeRawDOM(
      snippet as RawSnippet<P>,
      cells,
      consumer,
      initial,
      consumerScheduler,
    );
  return (
    snippet as (
      ...cells: { [K in keyof P]: Cell<P[K]> }
    ) => import("@tschk/moonshine-dom/dom").DOMChild
  )(...cells);
}

/** Internal compiler bridge: one queue/commit marker per rendered snippet slot. */
export function createRawSnippetSlot() {
  const pending = new Set<() => void>(),
    marker = document.createComment("");
  function drain() {
    let failed = false,
      failure: unknown;
    const stops = [...pending];
    pending.clear();
    for (const stop of stops)
      try {
        untrack(stop);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    if (failed) throw failure;
  }
  onCleanup(drain);
  return {
    deferRemoved(stop: () => void) {
      pending.add(stop);
    },
    render(fn: () => import("@tschk/moonshine-dom/dom").DOMChild) {
      let value: import("@tschk/moonshine-dom/dom").DOMChild;
      try {
        value = fn();
      } catch (error) {
        try {
          drain();
        } catch {}
        throw error;
      }
      if (value instanceof Node) {
        const setup = (value as Node & { [insertedNode]?: () => void })[
          insertedNode
        ];
        if (setup)
          Object.defineProperty(value, insertedNode, {
            configurable: true,
            value() {
              let failed = false,
                failure: unknown;
              try {
                setup();
              } catch (error) {
                failure = error;
                failed = true;
              }
              try {
                drain();
              } catch (error) {
                if (!failed) failure = error;
                failed = true;
              }
              if (failed) throw failure;
            },
          });
      }
      return value;
    },
    commit(
      value: import("@tschk/moonshine-dom/dom").DOMChild,
    ): import("@tschk/moonshine-dom/dom").DOMChild {
      Object.defineProperty(marker, insertedNode, {
        configurable: true,
        value: drain,
      });
      return [value, marker];
    },
  };
}
