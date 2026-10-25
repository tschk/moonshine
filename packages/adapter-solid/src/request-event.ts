/**
 * Host-free Solid `getRequestEvent` / `RequestEvent` / `PageEvent` context
 * shared across `@tschk/moonshine-solid/web`, `@tschk/moonshine-solid/ssr`,
 * and `@tschk/moonshine-solid/start`.
 */

export interface ResponseStub {
  status?: number;
  statusText?: string;
  headers: Headers;
}

export interface RequestEvent {
  request: Request;
  response: ResponseStub;
  clientAddress?: string;
  locals: Record<string, any>;
  fetch: typeof globalThis.fetch;
  nativeEvent?: any;
}

export const FETCH_EVENT_TYPE = /* @__PURE__ */ Symbol.for(
  "moonshine.solid.fetchEvent",
);

export interface PageEvent extends RequestEvent {
  prevUrl?: string | null;
  mutation?: boolean;
  $type: symbol;
  [FETCH_EVENT_TYPE]?: true;
}

export interface SolidRequestEventInit {
  request?: Request | string | URL;
  url?: string | URL;
  method?: string;
  headers?: HeadersInit;
  response?: {
    status?: number;
    statusText?: string;
    headers?: HeadersInit;
  };
  responseHeaders?: HeadersInit;
  status?: number;
  statusText?: string;
  clientAddress?: string;
  locals?: Record<string, any>;
  fetch?: typeof globalThis.fetch;
  prevUrl?: string | null;
  mutation?: boolean;
  nativeEvent?: any;
}

const requestEventStack: PageEvent[] = [];

export function createSolidRequestEvent(
  init: SolidRequestEventInit = {},
): PageEvent {
  const rawReqUrl =
    init.request instanceof Request
      ? init.request.url
      : init.request instanceof URL
        ? init.request.href
        : typeof init.request === "string"
          ? new URL(init.request, "http://localhost").href
          : undefined;
  const resolvedUrl =
    init.url instanceof URL
      ? init.url.href
      : typeof init.url === "string"
        ? new URL(init.url, "http://localhost").href
        : (rawReqUrl ?? "http://localhost/");
  const request =
    init.request instanceof Request
      ? init.request
      : new Request(resolvedUrl, {
          method: init.method ?? "GET",
          headers: init.headers,
        });
  const response: ResponseStub = {
    status: init.response?.status ?? init.status ?? 200,
    statusText: init.response?.statusText ?? init.statusText ?? "",
    headers: new Headers(init.response?.headers ?? init.responseHeaders),
  };
  return {
    request,
    response,
    clientAddress:
      init.clientAddress ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "127.0.0.1",
    locals: init.locals ? { ...init.locals } : {},
    fetch: init.fetch ?? globalThis.fetch,
    prevUrl: init.prevUrl ?? null,
    mutation: init.mutation ?? request.method !== "GET",
    nativeEvent: init.nativeEvent,
    $type: FETCH_EVENT_TYPE,
    [FETCH_EVENT_TYPE]: true,
  };
}

export function withSolidRequestEvent<T>(
  eventOrInit: RequestEvent | SolidRequestEventInit,
  fn: (event: PageEvent) => T,
): T {
  const event: PageEvent =
    (eventOrInit as PageEvent).$type === FETCH_EVENT_TYPE
      ? (eventOrInit as PageEvent)
      : "request" in eventOrInit &&
          eventOrInit.request instanceof Request &&
          "response" in eventOrInit &&
          eventOrInit.response &&
          eventOrInit.response.headers instanceof Headers
        ? ({
            ...eventOrInit,
            $type: FETCH_EVENT_TYPE,
            [FETCH_EVENT_TYPE]: true,
          } as PageEvent)
        : createSolidRequestEvent(eventOrInit as SolidRequestEventInit);

  requestEventStack.push(event);
  let isAsync = false;
  try {
    const result = fn(event);
    if (
      result &&
      typeof (result as unknown as Promise<unknown>).then === "function"
    ) {
      isAsync = true;
      return (result as unknown as Promise<unknown>).finally(() => {
        const idx = requestEventStack.lastIndexOf(event);
        if (idx !== -1) requestEventStack.splice(idx, 1);
      }) as unknown as T;
    }
    return result;
  } finally {
    if (!isAsync) {
      const idx = requestEventStack.lastIndexOf(event);
      if (idx !== -1) requestEventStack.splice(idx, 1);
    }
  }
}

export function getRequestEvent(): PageEvent | undefined {
  return requestEventStack[requestEventStack.length - 1];
}
