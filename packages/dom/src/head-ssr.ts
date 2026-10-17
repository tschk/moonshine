/** Optional synchronous SSR head collector; no browser, host or async-SSR support. */
import {
  h,
  getOwner,
  renderToString,
  serializeSSRChild,
  type SSRChild,
} from "./ssr";
import { isSSRRendering, getSSRRenderScope } from "./ssr-owner";
import {
  captureActiveSSRRenderAttempt,
  isSSRRenderAccepted,
  type SSRRenderAttempt,
} from "./ssr-attempt";

type Entry = {
  html: string;
  title: boolean;
  scope?: Entry;
  attempt: SSRRenderAttempt | undefined;
};
type Collector = { entries: Entry[]; scope?: Entry; request?: object };

const collectorKey = /* @__PURE__ */ Symbol("moonshine.ssr.head");

function activeCollector(name: string): Collector {
  const owner = getOwner();
  const collector = owner?.context?.get(collectorKey) as Collector | undefined;
  if (
    !isSSRRendering() ||
    !owner ||
    owner.disposed ||
    !collector ||
    collector.request !== getSSRRenderScope()
  )
    throw new Error(
      `${name}() requires an active renderWithHead() server scope`,
    );
  return collector;
}

function reserve(collector: Collector, isTitle: boolean): Entry {
  const entry: Entry = {
    html: "",
    title: isTitle,
    attempt: captureActiveSSRRenderAttempt(),
  };
  collector.entries.push(entry);
  return entry;
}

function release(collector: Collector, entry: Entry): void {
  const index = collector.entries.indexOf(entry);
  if (index >= 0) collector.entries.splice(index);
}

export function renderWithHead(fn: () => SSRChild): {
  body: string;
  head: string;
} {
  const collector: Collector = { entries: [] };
  const body = renderToString(() => {
    collector.request = getSSRRenderScope();
    const owner = getOwner()!;
    owner.context = new Map(owner.context);
    owner.context.set(collectorKey, collector);
    return fn();
  });
  let headHTML = "";
  let titleHTML = "";
  const titled = new Set<Entry>();
  for (const entry of collector.entries) {
    if (!isSSRRenderAccepted(entry.attempt)) continue;
    if (entry.title) {
      if (entry.scope && titled.has(entry.scope)) continue;
      if (entry.scope) titled.add(entry.scope);
      titleHTML = entry.html;
    } else headHTML += entry.html;
  }
  return { body, head: headHTML + titleHTML };
}

export function head(render: () => SSRChild): undefined {
  const collector = activeCollector("head");
  const entry = reserve(collector, false);
  const previous = collector.scope;
  collector.scope = entry;
  try {
    entry.html = serializeSSRChild(render());
  } catch (error) {
    release(collector, entry);
    throw error;
  } finally {
    collector.scope = previous;
  }
}

export function title(read: () => SSRChild): undefined {
  const collector = activeCollector("title");
  const entry = reserve(collector, true);
  entry.scope = collector.scope;
  try {
    entry.html = serializeSSRChild(h("title", null, read()));
  } catch (error) {
    release(collector, entry);
    throw error;
  }
}
