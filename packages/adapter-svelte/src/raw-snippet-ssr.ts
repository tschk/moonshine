import {
  isRawSnippet,
  getRawSnippetFactory,
  type RawSnippet,
} from "./raw-snippet";
import { rawHTML } from "@tschk/moonshine-dom/ssr";
import {
  withComponentConsumer,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import {
  untrack,
  getOwner,
  runWithOwner,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import {
  captureSSRRenderAttempt,
  isSSRRenderAccepted,
} from "@tschk/moonshine-dom/ssr-attempt";
import { rawSSRRegistrar, type Registrar } from "./raw-ssr-lifecycle";
/** Internal invocation ABI: explicitly supplied authored consumer; source values, not DOM cells. */
export function invokeRawSSR<P extends unknown[]>(
  snippet: RawSnippet<P>,
  values: P,
  consumer: ComponentContext,
) {
  const factory = getRawSnippetFactory(snippet);
  const owner = getOwner();
  if (!owner || owner.disposed) throw Error("Live raw SSR invocation required");
  const consumerAttempt = runWithOwner(consumer.owner, captureSSRRenderAttempt),
    context = owner.context;
  owner.context = new Map(context);
  owner.context.set(rawSSRRegistrar, {
    consumer,
    register(fn) {
      runWithOwner(consumer.owner, () =>
        onCleanup(() => {
          if (isSSRRenderAccepted(consumerAttempt)) fn();
        }),
      );
    },
  } satisfies Registrar);
  try {
    return withComponentConsumer(consumer, () =>
      untrack(() =>
        rawHTML(
          factory(
            ...(values.map((value) => () => value) as {
              [K in keyof P]: () => P[K];
            }),
          )
            .render()
            .trim(),
        ),
      ),
    );
  } finally {
    owner.context = context;
  }
}
/** Internal @render dispatch: ordinary server snippets keep source value arguments. */
export function invokeSnippetSSR<P extends unknown[]>(
  snippet:
    | RawSnippet<P>
    | ((...values: P) => import("@tschk/moonshine-dom/ssr").SSRChild),
  values: P,
  consumer: ComponentContext,
): import("@tschk/moonshine-dom/ssr").SSRChild {
  if (isRawSnippet(snippet))
    return invokeRawSSR(snippet as RawSnippet<P>, values, consumer);
  return (
    snippet as (...values: P) => import("@tschk/moonshine-dom/ssr").SSRChild
  )(...values);
}
