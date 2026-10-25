/** Independent host-free Astro middleware primitives (`astro:middleware`). */
import {
  createAstroGlobal,
  withAstroContext,
  type AstroContextInit,
  type AstroGlobal,
} from "./context";

export type APIContext<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
> = AstroGlobal<Props, Params, Locals>;

export type MiddlewareNext = (
  rewritePayload?: string | URL | Request,
) => Promise<Response>;

export type MiddlewareHandler<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
> = (
  context: APIContext<Props, Params, Locals>,
  next: MiddlewareNext,
) => Promise<Response> | Response;

export function defineMiddleware<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
>(
  fn: MiddlewareHandler<Props, Params, Locals>,
): MiddlewareHandler<Props, Params, Locals> {
  return fn;
}

export function createContext<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
>(
  init: AstroContextInit<Props, Params, Locals> = {},
): APIContext<Props, Params, Locals> {
  return createAstroGlobal(init);
}

function applyRewritePayload(
  context: APIContext<any, any, any>,
  payload: string | URL | Request,
): void {
  if (typeof payload === "string") {
    const nextUrl = new URL(payload, context.url);
    context.url = nextUrl;
    context.request = new Request(nextUrl.href, context.request);
    return;
  }
  if (payload instanceof URL) {
    context.url = new URL(payload.href);
    context.request = new Request(payload.href, context.request);
    return;
  }
  context.url = new URL(payload.url);
  context.request = payload;
}

function attachCookiesToResponse(
  context: APIContext<any, any, any>,
  response: Response,
): Response {
  const cookieHeaders = Array.from(context.cookies.headers());
  if (cookieHeaders.length === 0) {
    return response;
  }
  const existing = response.headers.getSetCookie?.() ?? [];
  const missing = cookieHeaders.filter((h) => !existing.includes(h));
  if (missing.length === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const cookieHeader of missing) {
    headers.append("Set-Cookie", cookieHeader);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function sequence(
  ...handlers: Array<MiddlewareHandler<any, any, any> | undefined | null>
): MiddlewareHandler {
  const filtered = handlers.filter(
    (h): h is MiddlewareHandler<any, any, any> => typeof h === "function",
  );
  if (filtered.length === 0) {
    return defineMiddleware((context, next) =>
      withAstroContext(context, async () => {
        const res = await next();
        return attachCookiesToResponse(context, res);
      }),
    );
  }

  return defineMiddleware((context, finalNext) =>
    withAstroContext(context, async () => {
      const dispatch = async (
        index: number,
        rewritePayload?: string | URL | Request,
      ): Promise<Response> => {
        if (rewritePayload !== undefined) {
          applyRewritePayload(context, rewritePayload);
        }
        if (index >= filtered.length) {
          const terminalResponse = await finalNext(rewritePayload);
          return attachCookiesToResponse(context, terminalResponse);
        }
        const handler = filtered[index]!;
        const response = await handler(context, (nextRewrite) =>
          dispatch(index + 1, nextRewrite),
        );
        return attachCookiesToResponse(context, response);
      };

      return dispatch(0);
    }),
  );
}

function assertSerializableValue(
  value: unknown,
  path: string,
  seen: Set<unknown>,
): void {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(
      `locals.${path} cannot be serialized: unsupported type "${typeof value}".`,
    );
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new TypeError(
        `locals.${path} cannot be serialized: circular reference detected.`,
      );
    }
    if (value instanceof Date || value instanceof RegExp) {
      return;
    }
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          assertSerializableValue(value[i], `${path}[${i}]`, seen);
        }
        return;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== null && proto !== Object.prototype) {
        throw new TypeError(
          `locals.${path} cannot be serialized: only plain objects and arrays are supported.`,
        );
      }
      for (const [key, propValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        assertSerializableValue(propValue, path ? `${path}.${key}` : key, seen);
      }
    } finally {
      seen.delete(value);
    }
  }
}

export function trySerializeLocals(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("locals must be a non-null object.");
  }
  assertSerializableValue(value, "", new Set());
  return JSON.stringify(value);
}
