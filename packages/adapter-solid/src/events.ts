/** Adapter-scoped events, independent of Solid's runtime. */
type Handler =
  EventListenerOrEventListenerObject | readonly [Function, unknown];
const delegated = new Set([
  "beforeinput",
  "click",
  "dblclick",
  "contextmenu",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
  "touchend",
  "touchmove",
  "touchstart",
]);
const handlers = new WeakMap<Node, Map<string, Handler>>();
const documents = new WeakMap<
  Document,
  Map<string, { count: number; listener: EventListener }>
>();
export const portalHosts = new WeakMap<Node, () => Node | null>();
function invoke(
  handler: Handler,
  node: Node,
  event: Event,
  isDelegated = false,
) {
  if (Array.isArray(handler))
    Reflect.apply(
      handler[0],
      node,
      isDelegated && handler[1] === undefined ? [event] : [handler[1], event],
    );
  else if (typeof handler === "function") Reflect.apply(handler, node, [event]);
  else (handler as EventListenerObject).handleEvent(event);
}
function dispatch(event: Event, document: Document) {
  const path = event.composedPath();
  let node: Node | null =
    path[0] instanceof Node ? path[0] : (event.target as Node);
  const originalTarget = event.target;
  Object.defineProperty(event, "currentTarget", {
    configurable: true,
    get: () => node ?? document,
  });
  if (node !== originalTarget)
    Object.defineProperty(event, "target", { configurable: true, value: node });
  try {
    while (node) {
      const handler = handlers.get(node)?.get(event.type);
      if (handler && !(node as HTMLButtonElement).disabled)
        invoke(handler, node, event, true);
      if (event.cancelBubble) break;
      // Ordinary shadow boundaries retarget; a portal keeps its logical target.
      if (
        node instanceof ShadowRoot &&
        !portalHosts.has(node.host) &&
        node.contains(event.target as Node)
      )
        Object.defineProperty(event, "target", {
          configurable: true,
          value: node.host,
        });
      node = portalHosts.has(node)
        ? portalHosts.get(node)!()
        : (node.parentNode ?? (node as ShadowRoot).host ?? null);
    }
  } finally {
    Object.defineProperty(event, "target", {
      configurable: true,
      value: originalTarget,
    });
  }
}
type Registration = (() => void) & { update?: (value: unknown) => boolean };
export function registerSolidEvent(
  element: Element,
  name: string,
  value: unknown,
): Registration {
  if (value == null) return () => {};
  const capture = name.startsWith("oncapture:");
  const direct = name.startsWith("on:");
  const type = capture
    ? name.slice(10)
    : direct
      ? name.slice(3)
      : name.slice(2).toLowerCase();
  if (
    typeof value !== "function" &&
    !(
      value &&
      typeof value === "object" &&
      typeof (value as EventListenerObject).handleEvent === "function"
    ) &&
    !(Array.isArray(value) && typeof value[0] === "function")
  )
    throw TypeError("Invalid Solid event handler");
  const object = typeof value === "object" && !Array.isArray(value);
  if (direct || capture || object || !delegated.has(type)) {
    const handler = Array.isArray(value)
      ? (event: Event) => invoke(value as unknown as Handler, element, event)
      : (value as EventListenerOrEventListenerObject);
    const input = object ? (value as AddEventListenerOptions) : undefined;
    const options = capture
      ? true
      : input
        ? {
            capture: !!input.capture,
            once: !!input.once,
            passive: !!input.passive,
            signal: input.signal,
          }
        : undefined;
    const registeredCapture =
      typeof options === "boolean" ? options : !!options?.capture;
    element.addEventListener(type, handler, options);
    return () => element.removeEventListener(type, handler, registeredCapture);
  }
  let own = handlers.get(element);
  if (!own) handlers.set(element, (own = new Map()));
  own.set(type, value as unknown as Handler);
  const release = acquireDocument(element.ownerDocument, type);
  let active = true;
  const dispose: Registration = () => {
    if (!active) return;
    active = false;
    own!.delete(type);
    release();
  };
  dispose.update = (next) => {
    if (
      !active ||
      !(
        typeof next === "function" ||
        (Array.isArray(next) && typeof next[0] === "function")
      )
    )
      return false;
    own!.set(type, next as Handler);
    return true;
  };
  return dispose;
}

function acquireDocument(document: Document, type: string): () => void {
  let counts = documents.get(document);
  if (!counts) documents.set(document, (counts = new Map()));
  let record = counts.get(type);
  if (!record) {
    record = { count: 0, listener: (event) => dispatch(event, document) };
    counts.set(type, record);
    document.addEventListener(type, record.listener);
  }
  record.count++;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (!--record!.count) {
      document.removeEventListener(type, record!.listener);
      counts!.delete(type);
    }
  };
}
export function acquirePortalDocument(document: Document): () => void {
  const releases = Array.from(delegated, (type) =>
    acquireDocument(document, type),
  );
  return () => {
    for (const release of releases) release();
  };
}
