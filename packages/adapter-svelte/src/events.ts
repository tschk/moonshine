/** Independent host-free Svelte 5 DOM event helper (`svelte/events`). */

export type EventListenerWithTarget<
  Target extends EventTarget,
  E extends Event,
> = (this: Target, event: E & { currentTarget: Target }) => any;

export function on<
  K extends keyof WindowEventMap,
  Target extends Window = Window,
>(
  window: Target,
  type: K,
  handler: EventListenerWithTarget<Target, WindowEventMap[K]>,
  options?: AddEventListenerOptions | boolean,
): () => void;
export function on<
  K extends keyof DocumentEventMap,
  Target extends Document = Document,
>(
  document: Target,
  type: K,
  handler: EventListenerWithTarget<Target, DocumentEventMap[K]>,
  options?: AddEventListenerOptions | boolean,
): () => void;
export function on<
  K extends keyof HTMLElementEventMap,
  Target extends HTMLElement = HTMLElement,
>(
  element: Target,
  type: K,
  handler: EventListenerWithTarget<Target, HTMLElementEventMap[K]>,
  options?: AddEventListenerOptions | boolean,
): () => void;
export function on<
  K extends keyof MediaQueryListEventMap,
  Target extends MediaQueryList = MediaQueryList,
>(
  target: Target,
  type: K,
  handler: EventListenerWithTarget<Target, MediaQueryListEventMap[K]>,
  options?: AddEventListenerOptions | boolean,
): () => void;
export function on<Target extends EventTarget, E extends Event = Event>(
  element: Target,
  type: string,
  handler: EventListenerWithTarget<Target, E>,
  options?: AddEventListenerOptions | boolean,
): () => void;
export function on(
  element: EventTarget,
  type: string,
  handler: EventListenerWithTarget<EventTarget, Event>,
  options?: AddEventListenerOptions | boolean,
): () => void {
  if (
    !element ||
    typeof element.addEventListener !== "function" ||
    typeof element.removeEventListener !== "function"
  ) {
    throw new TypeError("on() requires an EventTarget");
  }
  if (typeof handler !== "function") {
    throw new TypeError("on() requires a callback function");
  }
  const listener: EventListener = (event) => {
    return handler.call(
      element,
      event as Event & { currentTarget: EventTarget },
    );
  };
  element.addEventListener(type, listener, options);
  return () => {
    element.removeEventListener(type, listener, options);
  };
}
