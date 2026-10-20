/** Independent host-free Astro Actions runtime (defineAction, ActionError, ActionInputError). */
import { recordAstroActionResult, useAstro, type AstroGlobal } from "./context";

export const ACTION_ERROR_CODES = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  CONTENT_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_CONTENT: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NETWORK_AUTHENTICATION_REQUIRED: 511,
} as const;

export type ActionErrorCode = keyof typeof ACTION_ERROR_CODES;

const STATUS_TO_CODE = /* @__PURE__ */ new Map<number, ActionErrorCode>(
  Object.entries(ACTION_ERROR_CODES).map(([code, status]) => [
    status,
    code as ActionErrorCode,
  ]),
);

export class ActionError<
  TCode extends ActionErrorCode = ActionErrorCode,
> extends Error {
  readonly type: string = "AstroActionError";
  readonly code: TCode;
  readonly status: number;

  constructor(params: { code: TCode; message?: string; stack?: string }) {
    super(params.message ?? params.code);
    this.name = "ActionError";
    this.code = params.code;
    this.status = ActionError.codeToStatus(params.code);
    if (params.stack) {
      this.stack = params.stack;
    }
  }

  static codeToStatus(code: ActionErrorCode): number {
    return ACTION_ERROR_CODES[code] ?? 500;
  }

  static statusToCode(status: number): ActionErrorCode {
    return STATUS_TO_CODE.get(status) ?? "INTERNAL_SERVER_ERROR";
  }
}

export interface ActionInputIssue {
  message: string;
  path?: readonly (string | number)[];
  code?: string;
}

export type ErrorInferenceObject = Record<string, unknown>;

export class ActionInputError<
  TInput extends ErrorInferenceObject = ErrorInferenceObject,
> extends ActionError<"BAD_REQUEST"> {
  override readonly type = "AstroActionInputError";
  readonly issues: ActionInputIssue[];
  readonly fields: { [P in keyof TInput]?: string[] } & Record<
    string,
    string[] | undefined
  >;

  constructor(issues: ActionInputIssue[]) {
    super({
      code: "BAD_REQUEST",
      message: `Failed to validate: ${JSON.stringify(issues)}`,
    });
    this.name = "ActionInputError";
    this.issues = issues;
    const fieldMap: Record<string, string[] | undefined> = {};
    for (const issue of issues) {
      if (issue.path && issue.path.length > 0) {
        const key = String(issue.path[0]);
        let list = fieldMap[key];
        if (!list) {
          list = [];
          fieldMap[key] = list;
        }
        list.push(issue.message);
      }
    }
    this.fields = fieldMap as { [P in keyof TInput]?: string[] } & Record<
      string,
      string[] | undefined
    >;
  }
}

export function isActionError(error: unknown): error is ActionError {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { type?: unknown }).type === "AstroActionError" ||
      (error as { type?: unknown }).type === "AstroActionInputError" ||
      error instanceof ActionError)
  );
}

export function isInputError<
  TInput extends ErrorInferenceObject = ErrorInferenceObject,
>(error: unknown): error is ActionInputError<TInput> {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { type?: unknown }).type === "AstroActionInputError" ||
      error instanceof ActionInputError) &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

export type SafeResult<TInput, TOutput> =
  | { data: TOutput; error: undefined }
  | {
      data: undefined;
      error:
        | ActionError
        | ActionInputError<
            TInput extends ErrorInferenceObject ? TInput : ErrorInferenceObject
          >;
    };

export type ActionAPIContext = Pick<
  AstroGlobal,
  | "request"
  | "url"
  | "params"
  | "locals"
  | "cookies"
  | "session"
  | "site"
  | "generator"
  | "clientAddress"
  | "redirect"
  | "rewrite"
  | "originPathname"
  | "routePattern"
  | "isPrerendered"
  | "preferredLocale"
  | "preferredLocaleList"
  | "currentLocale"
  | "callAction"
  | "getActionResult"
>;

export type SchemaValidator<TInput> =
  | {
      safeParseAsync: (input: unknown) => Promise<
        | { success: true; data: TInput }
        | {
            success: false;
            error: { issues: readonly ActionInputIssue[] };
          }
      >;
    }
  | {
      safeParse: (input: unknown) =>
        | { success: true; data: TInput }
        | {
            success: false;
            error: { issues: readonly ActionInputIssue[] };
          };
    }
  | {
      parse: (input: unknown) => TInput | Promise<TInput>;
    }
  | ((input: unknown) => TInput | Promise<TInput>);

export type ActionAccept = "form" | "json" | undefined;

export type ActionHandler<TInput, TOutput> = (
  input: TInput,
  context: ActionAPIContext,
) => TOutput | Promise<TOutput>;

export interface ActionClient<
  TOutput,
  TAccept extends ActionAccept = undefined,
  TInput = undefined,
> {
  (
    ...args: undefined extends TInput
      ? [input?: TAccept extends "form" ? FormData | TInput : TInput]
      : [input: TAccept extends "form" ? FormData | TInput : TInput]
  ): Promise<SafeResult<TInput, Awaited<TOutput>>>;
  orThrow(
    ...args: undefined extends TInput
      ? [input?: TAccept extends "form" ? FormData | TInput : TInput]
      : [input: TAccept extends "form" ? FormData | TInput : TInput]
  ): Promise<Awaited<TOutput>>;
  readonly queryString: string;
  toString(): string;
}

function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (Object.hasOwn(obj, key)) {
      const existing = obj[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        obj[key] = [existing, value];
      }
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

async function validateInput<TInput>(
  validator: SchemaValidator<TInput>,
  rawInput: unknown,
): Promise<TInput> {
  try {
    if (typeof validator === "function") {
      return await validator(rawInput);
    }
    if (
      "safeParseAsync" in validator &&
      typeof validator.safeParseAsync === "function"
    ) {
      const res = await validator.safeParseAsync(rawInput);
      if (!res.success) {
        throw new ActionInputError([...res.error.issues]);
      }
      return res.data;
    }
    if ("safeParse" in validator && typeof validator.safeParse === "function") {
      const res = validator.safeParse(rawInput);
      if (!res.success) {
        throw new ActionInputError([...res.error.issues]);
      }
      return res.data;
    }
    if ("parse" in validator && typeof validator.parse === "function") {
      return await validator.parse(rawInput);
    }
    return rawInput as TInput;
  } catch (err) {
    if (isActionError(err)) throw err;
    if (
      typeof err === "object" &&
      err !== null &&
      Array.isArray((err as { issues?: unknown }).issues)
    ) {
      throw new ActionInputError(
        (err as { issues: ActionInputIssue[] }).issues,
      );
    }
    throw new ActionInputError([
      {
        message: err instanceof Error ? err.message : String(err),
      },
    ]);
  }
}

export function getActionQueryString(name: string): string {
  return `?_action=${encodeURIComponent(name)}`;
}

export function actionPathToString(path: readonly string[]): string {
  return path.join(".");
}

export type SerializedActionResult =
  | {
      type: "data";
      status: 200;
      contentType: "application/json";
      body: string;
    }
  | {
      type: "empty";
      status: 204;
    }
  | {
      type: "error";
      status: number;
      contentType: "application/json";
      body: string;
    };

export function serializeActionResult<TInput, TOutput>(
  res: SafeResult<TInput, TOutput>,
): SerializedActionResult {
  if (res.error) {
    const status = res.error.status ?? 500;
    return {
      type: "error",
      status,
      contentType: "application/json",
      body: JSON.stringify({
        type: res.error.type,
        code: res.error.code,
        message: res.error.message,
        issues: isInputError(res.error) ? res.error.issues : undefined,
      }),
    };
  }
  if (res.data === undefined) {
    return {
      type: "empty",
      status: 204,
    };
  }
  return {
    type: "data",
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(res.data),
  };
}

export function deserializeActionResult<TInput, TOutput>(
  res: SerializedActionResult,
): SafeResult<TInput, TOutput> {
  if (res.type === "empty") {
    return { data: undefined as unknown as TOutput, error: undefined };
  }
  if (res.type === "data") {
    return {
      data: JSON.parse(res.body) as TOutput,
      error: undefined,
    };
  }
  let parsed: {
    type?: string;
    code?: ActionErrorCode;
    message?: string;
    issues?: ActionInputIssue[];
  } = {};
  try {
    parsed = JSON.parse(res.body);
  } catch {
    // Fallback to status code below
  }
  if (parsed.type === "AstroActionInputError" && Array.isArray(parsed.issues)) {
    return {
      data: undefined,
      error: new ActionInputError(parsed.issues) as ActionInputError<
        TInput extends ErrorInferenceObject ? TInput : ErrorInferenceObject
      >,
    };
  }
  return {
    data: undefined,
    error: new ActionError({
      code: parsed.code ?? ActionError.statusToCode(res.status),
      message: parsed.message,
    }),
  };
}

export interface AstroActionContext {
  action?: {
    calledFrom: "form" | "rpc";
    name: string;
    handler: () => Promise<SafeResult<unknown, unknown>>;
  };
  setActionResult(actionName: string, result: SerializedActionResult): void;
  serializeActionResult: typeof serializeActionResult;
  deserializeActionResult: typeof deserializeActionResult;
}

const registeredActions = /* @__PURE__ */ new Map<
  string,
  ActionClient<unknown, ActionAccept, unknown>
>();

export function getActionContext(
  context?: Partial<ActionAPIContext>,
): AstroActionContext {
  const ctx = (context ?? useAstro()) as AstroGlobal;
  const url = ctx.url ?? new URL(ctx.request?.url ?? "http://localhost/");
  const queryAction = url.searchParams.get("_action");
  const rpcMatch = url.pathname.startsWith("/_actions/")
    ? decodeURIComponent(url.pathname.slice("/_actions/".length))
    : null;
  const actionName = queryAction ?? rpcMatch;
  const calledFrom: "form" | "rpc" = queryAction ? "form" : "rpc";

  let action: AstroActionContext["action"] = undefined;
  if (actionName && (ctx.request?.method ?? "POST").toUpperCase() === "POST") {
    const registered = registeredActions.get(actionName);
    action = {
      calledFrom,
      name: actionName,
      handler: async () => {
        if (!registered) {
          return {
            data: undefined,
            error: new ActionError({
              code: "NOT_FOUND",
              message: `Action "${actionName}" not found.`,
            }),
          };
        }
        let input: unknown = undefined;
        if (ctx.request) {
          const contentType =
            ctx.request.headers.get("content-type")?.toLowerCase() ?? "";
          if (
            contentType.includes("multipart/form-data") ||
            contentType.includes("application/x-www-form-urlencoded")
          ) {
            input = await ctx.request.clone().formData();
          } else if (contentType.includes("application/json")) {
            const text = await ctx.request.clone().text();
            input = text.length > 0 ? JSON.parse(text) : undefined;
          }
        }
        return await registered(input);
      },
    };
  }

  return {
    action,
    setActionResult(name: string, serialized: SerializedActionResult): void {
      const deserialized = deserializeActionResult(serialized);
      recordAstroActionResult(name, deserialized, ctx);
      const registered = registeredActions.get(name);
      if (registered) {
        recordAstroActionResult(
          registered as unknown as (...args: unknown[]) => unknown,
          deserialized,
          ctx,
        );
      }
    },
    serializeActionResult,
    deserializeActionResult,
  };
}

let actionIdCounter = 0;

export function defineAction<
  TOutput,
  TAccept extends ActionAccept = undefined,
  TInput = TAccept extends "form" ? FormData : undefined,
>(config: {
  accept?: TAccept;
  input?: SchemaValidator<TInput>;
  handler: ActionHandler<TInput, TOutput>;
  name?: string;
}): ActionClient<TOutput, TAccept, TInput> {
  const actionName = config.name ?? `action_${++actionIdCounter}`;
  const queryString = getActionQueryString(actionName);

  const executeOrThrow = async (
    rawInput?: unknown,
  ): Promise<Awaited<TOutput>> => {
    let preparedInput = rawInput;
    if (
      config.accept === "form" &&
      config.input &&
      rawInput instanceof FormData
    ) {
      preparedInput = formDataToObject(rawInput);
    }
    const parsedInput = config.input
      ? await validateInput(config.input, preparedInput)
      : (preparedInput as TInput);
    const context = useAstro();
    return await config.handler(parsedInput, context);
  };

  const client = async (
    ...args: unknown[]
  ): Promise<SafeResult<TInput, Awaited<TOutput>>> => {
    let result: SafeResult<TInput, Awaited<TOutput>>;
    try {
      const data = await executeOrThrow(args[0]);
      result = { data, error: undefined };
    } catch (err) {
      if (isInputError(err)) {
        result = {
          data: undefined,
          error: err as ActionInputError<
            TInput extends ErrorInferenceObject ? TInput : ErrorInferenceObject
          >,
        };
      } else if (isActionError(err)) {
        result = { data: undefined, error: err };
      } else {
        result = {
          data: undefined,
          error: new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          }),
        };
      }
    }
    recordAstroActionResult(
      actionClient as unknown as (...args: unknown[]) => unknown,
      result,
    );
    recordAstroActionResult(actionName, result);
    return result;
  };

  const actionClient = Object.assign(client, {
    orThrow: (...args: unknown[]) => executeOrThrow(args[0]),
    queryString,
    toString: () => queryString,
  }) as ActionClient<TOutput, TAccept, TInput>;

  registeredActions.set(
    actionName,
    actionClient as unknown as ActionClient<unknown, ActionAccept, unknown>,
  );

  return actionClient;
}

export { z } from "./content";
