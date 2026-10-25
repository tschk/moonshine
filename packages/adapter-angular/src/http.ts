/**
 * Host-free Angular HTTP client & reactive `httpResource` primitives backed by the
 * Moonshine signal graph and standard `fetch`.
 */
import { batch, untrack } from "@tschk/moonshine";
import {
  getOwner,
  onCleanup as domOnCleanup,
} from "@tschk/moonshine-dom/reactive";
import {
  computed,
  DestroyRef,
  effect,
  getCurrentInjector,
  inject,
  InjectionToken,
  type EnvironmentProviders,
  type Injector,
  type InteropObservable,
  makeEnvironmentProviders,
  type Observer,
  PendingTasks,
  type Provider,
  type Resource,
  type ResourceRef,
  type ResourceStatus,
  runInInjectionContext,
  signal,
  type Signal,
  type Subscribable,
  type SubscriptionCleanup,
  type Unsubscribable,
  untracked,
  type ValueEqualityFn,
} from "./signals";

const ObservableSymbol: symbol =
  (typeof Symbol === "function" &&
    (Symbol as { observable?: symbol }).observable) ||
  Symbol.for("observable");

export interface HttpParameterCodec {
  encodeKey(key: string): string;
  encodeValue(value: string): string;
  decodeKey(key: string): string;
  decodeValue(value: string): string;
}

function standardEncoding(v: string): string {
  return encodeURIComponent(v)
    .replace(/%40/gi, "@")
    .replace(/%3A/gi, ":")
    .replace(/%24/gi, "$")
    .replace(/%2C/gi, ",")
    .replace(/%3B/gi, ";")
    .replace(/%3D/gi, "=")
    .replace(/%3F/gi, "?")
    .replace(/%2F/gi, "/");
}

export class HttpUrlEncodingCodec implements HttpParameterCodec {
  encodeKey(key: string): string {
    return standardEncoding(key);
  }
  encodeValue(value: string): string {
    return standardEncoding(value);
  }
  decodeKey(key: string): string {
    return decodeURIComponent(key.replace(/\+/g, " "));
  }
  decodeValue(value: string): string {
    return decodeURIComponent(value.replace(/\+/g, " "));
  }
}

const DEFAULT_CODEC = new HttpUrlEncodingCodec();

/**
 * Immutable, case-insensitive HTTP header container matching `@angular/common/http`'s `HttpHeaders`.
 */
export class HttpHeaders {
  readonly #headers = new Map<string, { name: string; values: string[] }>();

  constructor(
    headers?:
      | string
      | { [name: string]: string | number | (string | number)[] }
      | Headers
      | Map<string, string | string[]>,
  ) {
    if (!headers) return;
    if (typeof headers === "string") {
      for (const rawLine of headers.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const idx = line.indexOf(":");
        if (idx <= 0) continue;
        const name = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        this.#appendMut(name, val);
      }
    } else if (typeof Headers !== "undefined" && headers instanceof Headers) {
      headers.forEach((value, name) => {
        this.#appendMut(name, value);
      });
    } else if (headers instanceof Map) {
      for (const [name, value] of headers.entries()) {
        this.#setMut(name, value);
      }
    } else if (typeof headers === "object") {
      for (const [name, value] of Object.entries(headers)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          this.#setMut(
            name,
            value.map((v) => String(v)),
          );
        } else {
          this.#setMut(name, String(value));
        }
      }
    }
  }

  #appendMut(name: string, value: string | string[]): void {
    const key = name.toLowerCase();
    const vals = Array.isArray(value) ? value.map(String) : [String(value)];
    const existing = this.#headers.get(key);
    if (existing) {
      existing.values.push(...vals);
    } else {
      this.#headers.set(key, { name, values: [...vals] });
    }
  }

  #setMut(name: string, value: string | string[]): void {
    const key = name.toLowerCase();
    const vals = Array.isArray(value) ? value.map(String) : [String(value)];
    this.#headers.set(key, { name, values: [...vals] });
  }

  #clone(): HttpHeaders {
    const next = new HttpHeaders();
    for (const [key, entry] of this.#headers.entries()) {
      next.#headers.set(key, {
        name: entry.name,
        values: [...entry.values],
      });
    }
    return next;
  }

  has(name: string): boolean {
    return this.#headers.has(name.toLowerCase());
  }

  get(name: string): string | null {
    const entry = this.#headers.get(name.toLowerCase());
    if (!entry || entry.values.length === 0) return null;
    return entry.values[0]!;
  }

  keys(): string[] {
    return Array.from(this.#headers.values(), (entry) => entry.name);
  }

  getAll(name: string): string[] | null {
    const entry = this.#headers.get(name.toLowerCase());
    return entry ? [...entry.values] : null;
  }

  append(name: string, value: string | string[]): HttpHeaders {
    const next = this.#clone();
    next.#appendMut(name, value);
    return next;
  }

  set(name: string, value: string | string[]): HttpHeaders {
    const next = this.#clone();
    next.#setMut(name, value);
    return next;
  }

  delete(name: string, value?: string | string[]): HttpHeaders {
    const next = this.#clone();
    const key = name.toLowerCase();
    if (value === undefined) {
      next.#headers.delete(key);
      return next;
    }
    const existing = next.#headers.get(key);
    if (!existing) return next;
    const toRemove = new Set(
      Array.isArray(value) ? value.map(String) : [String(value)],
    );
    const remaining = existing.values.filter((v) => !toRemove.has(v));
    if (remaining.length === 0) {
      next.#headers.delete(key);
    } else {
      existing.values = remaining;
    }
    return next;
  }

  toHeadersInit(): Record<string, string> {
    const init: Record<string, string> = {};
    for (const entry of this.#headers.values()) {
      init[entry.name] = entry.values.join(", ");
    }
    return init;
  }
}

export type HttpParamValue =
  string | number | boolean | ReadonlyArray<string | number | boolean>;

export interface HttpParamsOptions {
  fromString?: string;
  fromObject?: { [param: string]: HttpParamValue };
  encoder?: HttpParameterCodec;
}

/**
 * Immutable HTTP query parameter container matching `@angular/common/http`'s `HttpParams`.
 */
export class HttpParams {
  readonly #map = new Map<string, string[]>();
  readonly #encoder: HttpParameterCodec;

  constructor(options: HttpParamsOptions = {}) {
    this.#encoder = options.encoder ?? DEFAULT_CODEC;
    if (options.fromString && options.fromObject) {
      throw new Error("Cannot specify both fromString and fromObject");
    }
    if (options.fromString) {
      const raw = options.fromString.replace(/^\?/, "");
      if (raw.length > 0) {
        for (const pair of raw.split("&")) {
          if (!pair) continue;
          const eqIdx = pair.indexOf("=");
          const k =
            eqIdx === -1
              ? this.#encoder.decodeKey(pair)
              : this.#encoder.decodeKey(pair.slice(0, eqIdx));
          const v =
            eqIdx === -1
              ? ""
              : this.#encoder.decodeValue(pair.slice(eqIdx + 1));
          this.#appendMut(k, v);
        }
      }
    } else if (options.fromObject) {
      for (const [k, v] of Object.entries(options.fromObject)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          for (const item of v) {
            this.#appendMut(k, String(item));
          }
        } else {
          this.#appendMut(k, String(v));
        }
      }
    }
  }

  #appendMut(param: string, value: string): void {
    const list = this.#map.get(param);
    if (list) {
      list.push(value);
    } else {
      this.#map.set(param, [value]);
    }
  }

  #clone(): HttpParams {
    const next = new HttpParams({ encoder: this.#encoder });
    for (const [k, vals] of this.#map.entries()) {
      next.#map.set(k, [...vals]);
    }
    return next;
  }

  has(param: string): boolean {
    return this.#map.has(param);
  }

  get(param: string): string | null {
    const list = this.#map.get(param);
    return list && list.length > 0 ? list[0]! : null;
  }

  getAll(param: string): string[] | null {
    const list = this.#map.get(param);
    return list ? [...list] : null;
  }

  keys(): string[] {
    return Array.from(this.#map.keys());
  }

  append(param: string, value: string | number | boolean): HttpParams {
    const next = this.#clone();
    next.#appendMut(param, String(value));
    return next;
  }

  appendAll(params: { [param: string]: HttpParamValue }): HttpParams {
    const next = this.#clone();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          next.#appendMut(k, String(item));
        }
      } else {
        next.#appendMut(k, String(v));
      }
    }
    return next;
  }

  set(param: string, value: string | number | boolean): HttpParams {
    const next = this.#clone();
    next.#map.set(param, [String(value)]);
    return next;
  }

  delete(param?: string, value?: string | number | boolean): HttpParams {
    const next = this.#clone();
    if (param === undefined) {
      next.#map.clear();
      return next;
    }
    if (value === undefined) {
      next.#map.delete(param);
      return next;
    }
    const existing = next.#map.get(param);
    if (!existing) return next;
    const strVal = String(value);
    const filtered = existing.filter((item) => item !== strVal);
    if (filtered.length === 0) {
      next.#map.delete(param);
    } else {
      next.#map.set(param, filtered);
    }
    return next;
  }

  toString(): string {
    const parts: string[] = [];
    for (const [k, vals] of this.#map.entries()) {
      const encodedKey = this.#encoder.encodeKey(k);
      for (const v of vals) {
        parts.push(`${encodedKey}=${this.#encoder.encodeValue(v)}`);
      }
    }
    return parts.join("&");
  }
}

/**
 * Typed key for storing per-request metadata in an `HttpContext`.
 */
export class HttpContextToken<T> {
  constructor(public readonly defaultValue: () => T) {}
}

/**
 * Mutable per-request metadata map passed through `HttpClient` and `HttpInterceptorFn`s.
 */
export class HttpContext {
  readonly #map = new Map<HttpContextToken<any>, any>();

  set<T>(token: HttpContextToken<T>, value: T): HttpContext {
    this.#map.set(token, value);
    return this;
  }

  get<T>(token: HttpContextToken<T>): T {
    if (!this.#map.has(token)) {
      this.#map.set(token, token.defaultValue());
    }
    return this.#map.get(token) as T;
  }

  delete(token: HttpContextToken<unknown>): HttpContext {
    this.#map.delete(token);
    return this;
  }

  has(token: HttpContextToken<unknown>): boolean {
    return this.#map.has(token);
  }

  keys(): IterableIterator<HttpContextToken<unknown>> {
    return this.#map.keys();
  }
}

export enum HttpEventType {
  Sent = 0,
  UploadProgress = 1,
  ResponseHeader = 2,
  DownloadProgress = 3,
  Response = 4,
  User = 5,
}

export enum HttpStatusCode {
  Continue = 100,
  SwitchingProtocols = 101,
  Ok = 200,
  Created = 201,
  Accepted = 202,
  NonAuthoritativeInformation = 203,
  NoContent = 204,
  ResetContent = 205,
  PartialContent = 206,
  MultipleChoices = 300,
  MovedPermanently = 301,
  Found = 302,
  SeeOther = 303,
  NotModified = 304,
  TemporaryRedirect = 307,
  PermanentRedirect = 308,
  BadRequest = 400,
  Unauthorized = 401,
  PaymentRequired = 402,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  RequestTimeout = 408,
  Conflict = 409,
  Gone = 410,
  PayloadTooLarge = 413,
  UnsupportedMediaType = 415,
  UnprocessableEntity = 422,
  TooManyRequests = 429,
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
}

export interface HttpSentEvent {
  type: HttpEventType.Sent;
}

export interface HttpProgressEvent {
  type: HttpEventType.DownloadProgress | HttpEventType.UploadProgress;
  loaded: number;
  total?: number;
}

export interface HttpDownloadProgressEvent extends HttpProgressEvent {
  type: HttpEventType.DownloadProgress;
  partialText?: string;
}

export interface HttpUploadProgressEvent extends HttpProgressEvent {
  type: HttpEventType.UploadProgress;
}

export interface HttpUserEvent<T> {
  type: HttpEventType.User;
  value?: T;
}

export abstract class HttpResponseBase {
  readonly headers: HttpHeaders;
  readonly status: number;
  readonly statusText: string;
  readonly url: string | null;
  readonly ok: boolean;
  abstract readonly type: HttpEventType.Response | HttpEventType.ResponseHeader;

  constructor(
    init: {
      headers?: HttpHeaders;
      status?: number;
      statusText?: string;
      url?: string;
    },
    defaultStatus: number = HttpStatusCode.Ok,
    defaultStatusText = "OK",
  ) {
    this.headers = init.headers ?? new HttpHeaders();
    this.status = init.status !== undefined ? init.status : defaultStatus;
    this.statusText = init.statusText ?? defaultStatusText;
    this.url = init.url ?? null;
    this.ok = this.status >= 200 && this.status < 300;
  }
}

export class HttpHeaderResponse extends HttpResponseBase {
  override readonly type = HttpEventType.ResponseHeader;

  constructor(
    init: {
      headers?: HttpHeaders;
      status?: number;
      statusText?: string;
      url?: string;
    } = {},
  ) {
    super(init);
  }

  clone(
    update: {
      headers?: HttpHeaders;
      status?: number;
      statusText?: string;
      url?: string;
    } = {},
  ): HttpHeaderResponse {
    return new HttpHeaderResponse({
      headers: update.headers ?? this.headers,
      status: update.status !== undefined ? update.status : this.status,
      statusText: update.statusText ?? this.statusText,
      url: update.url ?? this.url ?? undefined,
    });
  }
}

export class HttpResponse<T = unknown> extends HttpResponseBase {
  readonly body: T | null;
  override readonly type = HttpEventType.Response;

  constructor(
    init: {
      body?: T | null;
      headers?: HttpHeaders;
      status?: number;
      statusText?: string;
      url?: string;
    } = {},
  ) {
    super(init);
    this.body = init.body !== undefined ? init.body : null;
  }

  clone(): HttpResponse<T>;
  clone(update: {
    headers?: HttpHeaders;
    status?: number;
    statusText?: string;
    url?: string;
  }): HttpResponse<T>;
  clone<V>(update: {
    body?: V | null;
    headers?: HttpHeaders;
    status?: number;
    statusText?: string;
    url?: string;
  }): HttpResponse<V>;
  clone<V = T>(
    update: {
      body?: V | null;
      headers?: HttpHeaders;
      status?: number;
      statusText?: string;
      url?: string;
    } = {},
  ): HttpResponse<V> {
    return new HttpResponse<V>({
      body:
        update.body !== undefined ? update.body : (this.body as unknown as V),
      headers: update.headers ?? this.headers,
      status: update.status !== undefined ? update.status : this.status,
      statusText: update.statusText ?? this.statusText,
      url: update.url ?? this.url ?? undefined,
    });
  }
}

export class HttpErrorResponse extends HttpResponseBase implements Error {
  readonly name = "HttpErrorResponse";
  readonly message: string;
  readonly error: any;
  override readonly ok = false;
  override readonly type = HttpEventType.Response;

  constructor(init: {
    error?: any;
    headers?: HttpHeaders;
    status?: number;
    statusText?: string;
    url?: string;
  }) {
    super(init, 0, "Unknown Error");
    this.error = init.error !== undefined ? init.error : null;
    if (this.status >= 200 && this.status < 300) {
      this.message = `Http failure during parsing for ${init.url || "(unknown url)"}`;
    } else {
      this.message = `Http failure response for ${init.url || "(unknown url)"}: ${this.status} ${this.statusText}`;
    }
  }
}

export type HttpEvent<T> =
  | HttpSentEvent
  | HttpHeaderResponse
  | HttpResponse<T>
  | HttpProgressEvent
  | HttpUserEvent<T>;

export type HttpResponseType = "arraybuffer" | "blob" | "json" | "text";
export type HttpObserve = "body" | "events" | "response";

export interface HttpRequestInit {
  headers?: HttpHeaders;
  context?: HttpContext;
  reportProgress?: boolean;
  params?: HttpParams;
  responseType?: HttpResponseType;
  withCredentials?: boolean;
  transferCache?: { includeHeaders?: string[] } | boolean;
}

/**
 * Immutable outgoing HTTP request representation matching `@angular/common/http`'s `HttpRequest`.
 */
export class HttpRequest<T = unknown> {
  readonly body: T | null = null;
  readonly headers: HttpHeaders;
  readonly context: HttpContext;
  readonly reportProgress: boolean = false;
  readonly withCredentials: boolean = false;
  readonly responseType: HttpResponseType = "json";
  readonly method: string;
  readonly params: HttpParams;
  readonly urlWithParams: string;
  readonly transferCache?: { includeHeaders?: string[] } | boolean;

  constructor(
    method: "DELETE" | "GET" | "HEAD" | "JSONP" | "OPTIONS",
    url: string,
    init?: HttpRequestInit,
  );
  constructor(
    method: "POST" | "PUT" | "PATCH",
    url: string,
    body: T | null,
    init?: HttpRequestInit,
  );
  constructor(
    method: string,
    url: string,
    body: T | null,
    init?: HttpRequestInit,
  );
  constructor(
    method: string,
    public readonly url: string,
    third?: T | HttpRequestInit | null,
    fourth?: HttpRequestInit,
  ) {
    this.method = method.toUpperCase();
    let options: HttpRequestInit | undefined;
    if (
      ["POST", "PUT", "PATCH"].includes(this.method) ||
      fourth !== undefined
    ) {
      this.body = (third !== undefined ? third : null) as T | null;
      options = fourth;
    } else if (
      third &&
      typeof third === "object" &&
      ("headers" in third ||
        "params" in third ||
        "context" in third ||
        "reportProgress" in third ||
        "responseType" in third ||
        "withCredentials" in third ||
        "transferCache" in third)
    ) {
      options = third as HttpRequestInit;
    } else if (third !== undefined) {
      this.body = third as T | null;
    }

    this.headers = options?.headers ?? new HttpHeaders();
    this.context = options?.context ?? new HttpContext();
    this.params = options?.params ?? new HttpParams();
    this.reportProgress = Boolean(options?.reportProgress);
    this.withCredentials = Boolean(options?.withCredentials);
    this.responseType = options?.responseType ?? "json";
    this.transferCache = options?.transferCache;

    const query = this.params.toString();
    if (query.length === 0) {
      this.urlWithParams = url;
    } else {
      const qIdx = url.indexOf("?");
      const sep = qIdx === -1 ? "?" : qIdx < url.length - 1 ? "&" : "";
      this.urlWithParams = `${url}${sep}${query}`;
    }
  }

  serializeBody(): BodyInit | null {
    if (this.body === null || this.body === undefined) {
      return null;
    }
    if (
      typeof this.body === "string" ||
      this.body instanceof ArrayBuffer ||
      ArrayBuffer.isView(this.body) ||
      (typeof Blob !== "undefined" && this.body instanceof Blob) ||
      (typeof FormData !== "undefined" && this.body instanceof FormData) ||
      (typeof URLSearchParams !== "undefined" &&
        this.body instanceof URLSearchParams)
    ) {
      return this.body as unknown as BodyInit;
    }
    if (this.body instanceof HttpParams) {
      return this.body.toString();
    }
    if (
      typeof this.body === "object" ||
      typeof this.body === "boolean" ||
      typeof this.body === "number"
    ) {
      return JSON.stringify(this.body);
    }
    return String(this.body);
  }

  detectContentTypeHeader(): string | null {
    if (this.body === null || this.body === undefined) return null;
    if (typeof FormData !== "undefined" && this.body instanceof FormData) {
      return null;
    }
    if (typeof Blob !== "undefined" && this.body instanceof Blob) {
      return this.body.type || null;
    }
    if (this.body instanceof ArrayBuffer || ArrayBuffer.isView(this.body)) {
      return null;
    }
    if (typeof this.body === "string") {
      return "text/plain";
    }
    if (
      this.body instanceof HttpParams ||
      (typeof URLSearchParams !== "undefined" &&
        this.body instanceof URLSearchParams)
    ) {
      return "application/x-www-form-urlencoded;charset=UTF-8";
    }
    if (
      typeof this.body === "object" ||
      typeof this.body === "number" ||
      typeof this.body === "boolean"
    ) {
      return "application/json";
    }
    return null;
  }

  clone<V = T>(
    update: {
      headers?: HttpHeaders;
      context?: HttpContext;
      reportProgress?: boolean;
      params?: HttpParams;
      responseType?: HttpResponseType;
      withCredentials?: boolean;
      transferCache?: { includeHeaders?: string[] } | boolean;
      body?: V | null;
      method?: string;
      url?: string;
      setHeaders?: { [name: string]: string | string[] };
      setParams?: { [param: string]: string };
    } = {},
  ): HttpRequest<V> {
    const method = update.method ?? this.method;
    const url = update.url ?? this.url;
    const responseType = update.responseType ?? this.responseType;
    const body =
      update.body !== undefined ? update.body : (this.body as unknown as V);
    const withCredentials =
      update.withCredentials !== undefined
        ? update.withCredentials
        : this.withCredentials;
    const reportProgress =
      update.reportProgress !== undefined
        ? update.reportProgress
        : this.reportProgress;
    const transferCache =
      update.transferCache !== undefined
        ? update.transferCache
        : this.transferCache;
    let headers = update.headers ?? this.headers;
    let params = update.params ?? this.params;
    const context = update.context ?? this.context;

    if (update.setHeaders) {
      for (const [k, v] of Object.entries(update.setHeaders)) {
        headers = headers.set(k, v);
      }
    }
    if (update.setParams) {
      for (const [k, v] of Object.entries(update.setParams)) {
        params = params.set(k, v);
      }
    }

    return new HttpRequest<V>(method, url, body, {
      headers,
      context,
      params,
      responseType,
      withCredentials,
      reportProgress,
      transferCache,
    });
  }
}

export type OperatorFn<T, R> = (source: HttpObservable<T>) => HttpObservable<R>;

/**
 * Cold `Subscribable<T>` + `InteropObservable<T>` + `PromiseLike<T>` returned by `HttpClient`.
 * Compatible with `toSignal()`, `rxResource()`, RxJS `from()`, and `await`.
 */
export class HttpObservable<T>
  implements Subscribable<T>, InteropObservable<T>, PromiseLike<T>
{
  readonly #producer: (observer: Observer<T>) => SubscriptionCleanup;

  constructor(producer: (observer: Observer<T>) => SubscriptionCleanup) {
    this.#producer = producer;
    (this as unknown as Record<PropertyKey, unknown>)[ObservableSymbol] = () =>
      this;
    (this as unknown as Record<PropertyKey, unknown>)["@@observable"] = () =>
      this;
  }

  subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): Unsubscribable {
    let closed = false;
    const observer: Observer<T> =
      typeof observerOrNext === "function"
        ? {
            next: (v) => {
              if (!closed) observerOrNext(v);
            },
            error: (e) => {
              if (!closed) {
                closed = true;
                if (error) error(e);
              }
            },
            complete: () => {
              if (!closed) {
                closed = true;
                if (complete) complete();
              }
            },
          }
        : {
            next: (v) => {
              if (!closed) observerOrNext?.next?.(v);
            },
            error: (e) => {
              if (!closed) {
                closed = true;
                observerOrNext?.error?.(e);
              }
            },
            complete: () => {
              if (!closed) {
                closed = true;
                observerOrNext?.complete?.();
              }
            },
          };

    const cleanup = this.#producer(observer);
    return {
      unsubscribe() {
        if (closed) return;
        closed = true;
        if (typeof cleanup === "function") {
          cleanup();
        } else if (cleanup && typeof cleanup.unsubscribe === "function") {
          cleanup.unsubscribe();
        }
      },
    };
  }

  pipe(): HttpObservable<T>;
  pipe<A>(op1: OperatorFn<T, A>): HttpObservable<A>;
  pipe<A, B>(op1: OperatorFn<T, A>, op2: OperatorFn<A, B>): HttpObservable<B>;
  pipe<A, B, C>(
    op1: OperatorFn<T, A>,
    op2: OperatorFn<A, B>,
    op3: OperatorFn<B, C>,
  ): HttpObservable<C>;
  pipe(...operations: OperatorFn<any, any>[]): HttpObservable<any> {
    return operations.reduce(
      (prev, fn) => fn(prev),
      this as HttpObservable<any>,
    );
  }

  // oxlint-disable-next-line unicorn/no-thenable
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?:
      ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return new Promise<T>((resolve, reject) => {
      let lastVal: T | undefined;
      let hasVal = false;
      this.subscribe({
        next(v) {
          lastVal = v;
          hasVal = true;
        },
        error(err) {
          reject(err);
        },
        complete() {
          resolve((hasVal ? lastVal : undefined) as T);
        },
      });
    }).then(onfulfilled, onrejected);
  }
}

function toHttpObservable<T>(source: Subscribable<T>): HttpObservable<T> {
  if (source instanceof HttpObservable) return source;
  return new HttpObservable<T>((observer) => source.subscribe(observer));
}

export abstract class HttpHandler {
  abstract handle(req: HttpRequest<any>): Subscribable<HttpEvent<any>>;
}

export abstract class HttpBackend implements HttpHandler {
  abstract handle(req: HttpRequest<any>): Subscribable<HttpEvent<any>>;
}

export interface HttpInterceptor {
  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Subscribable<HttpEvent<any>>;
}

export type HttpHandlerFn = (
  req: HttpRequest<unknown>,
) => HttpObservable<HttpEvent<unknown>>;

export type HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => Subscribable<HttpEvent<unknown>>;

export const HTTP_INTERCEPTORS = new InjectionToken<readonly HttpInterceptor[]>(
  "HTTP_INTERCEPTORS",
);

export const HTTP_INTERCEPTOR_FNS = new InjectionToken<
  readonly HttpInterceptorFn[]
>("HTTP_INTERCEPTOR_FNS");

export const HTTP_FETCH_FN = new InjectionToken<typeof fetch>("HTTP_FETCH_FN");

/**
 * Standard `fetch`-backed `HttpBackend` implementation.
 */
export class FetchBackend implements HttpBackend {
  static ɵprov = {
    token: FetchBackend,
    providedIn: "root" as const,
    factory: () => {
      const customFetch = inject(HTTP_FETCH_FN, { optional: true });
      const pendingTasks = inject(PendingTasks, { optional: true });
      return new FetchBackend(
        customFetch ?? undefined,
        pendingTasks ?? undefined,
      );
    },
  };

  readonly #fetchImpl?: typeof fetch;
  readonly #pendingTasks?: PendingTasks;

  constructor(fetchImpl?: typeof fetch, pendingTasks?: PendingTasks) {
    this.#fetchImpl = fetchImpl;
    this.#pendingTasks = pendingTasks;
  }

  handle(req: HttpRequest<any>): HttpObservable<HttpEvent<any>> {
    return new HttpObservable<HttpEvent<any>>((observer) => {
      const controller = new AbortController();
      const removeTask = this.#pendingTasks?.add();
      let aborted = false;

      const finishTask = () => {
        removeTask?.();
      };

      void (async () => {
        try {
          observer.next?.({ type: HttpEventType.Sent });
          const fetchFn = this.#fetchImpl ?? globalThis.fetch;
          if (typeof fetchFn !== "function") {
            throw new Error(
              "Global fetch is not available in this environment.",
            );
          }

          let headers = req.headers;
          const serializedBody = req.serializeBody();
          if (serializedBody !== null && !headers.has("Content-Type")) {
            const detected = req.detectContentTypeHeader();
            if (detected) {
              headers = headers.set("Content-Type", detected);
            }
          }
          if (!headers.has("Accept")) {
            headers = headers.set(
              "Accept",
              "application/json, text/plain, */*",
            );
          }

          const response = await fetchFn(req.urlWithParams, {
            method: req.method,
            headers: headers.toHeadersInit(),
            body:
              req.method === "GET" || req.method === "HEAD"
                ? undefined
                : serializedBody,
            credentials: req.withCredentials ? "include" : "same-origin",
            signal: controller.signal,
          });

          if (aborted) return;

          const responseHeaders = new HttpHeaders(response.headers);
          const status = response.status;
          const statusText = response.statusText || "OK";
          const url = response.url || req.urlWithParams;

          if (req.reportProgress) {
            observer.next?.(
              new HttpHeaderResponse({
                headers: responseHeaders,
                status,
                statusText,
                url,
              }),
            );
          }

          let parsedBody: unknown = null;
          if (req.method !== "HEAD" && status !== HttpStatusCode.NoContent) {
            if (req.responseType === "arraybuffer") {
              const buf = await response.arrayBuffer();
              if (req.reportProgress) {
                observer.next?.({
                  type: HttpEventType.DownloadProgress,
                  loaded: buf.byteLength,
                  total: buf.byteLength,
                });
              }
              parsedBody = buf;
            } else if (req.responseType === "blob") {
              const blob = await response.blob();
              if (req.reportProgress) {
                observer.next?.({
                  type: HttpEventType.DownloadProgress,
                  loaded: blob.size,
                  total: blob.size,
                });
              }
              parsedBody = blob;
            } else if (req.responseType === "text") {
              const text = await response.text();
              if (req.reportProgress) {
                observer.next?.({
                  type: HttpEventType.DownloadProgress,
                  loaded: text.length,
                  total: text.length,
                });
              }
              parsedBody = text;
            } else {
              const text = await response.text();
              if (req.reportProgress) {
                observer.next?.({
                  type: HttpEventType.DownloadProgress,
                  loaded: text.length,
                  total: text.length,
                });
              }
              if (text.length > 0) {
                try {
                  parsedBody = JSON.parse(text);
                } catch (parseError) {
                  if (response.ok) {
                    throw new HttpErrorResponse({
                      error: { error: parseError, text },
                      headers: responseHeaders,
                      status,
                      statusText,
                      url,
                    });
                  }
                  parsedBody = text;
                }
              }
            }
          }

          if (aborted) return;

          if (!response.ok) {
            throw new HttpErrorResponse({
              error: parsedBody,
              headers: responseHeaders,
              status,
              statusText,
              url,
            });
          }

          observer.next?.(
            new HttpResponse({
              body: parsedBody,
              headers: responseHeaders,
              status,
              statusText,
              url,
            }),
          );
          observer.complete?.();
        } catch (err) {
          if (aborted) return;
          if (err instanceof HttpErrorResponse) {
            observer.error?.(err);
          } else {
            observer.error?.(
              new HttpErrorResponse({
                error: err,
                status: 0,
                statusText: "Unknown Error",
                url: req.urlWithParams,
              }),
            );
          }
        } finally {
          finishTask();
        }
      })();

      return () => {
        aborted = true;
        controller.abort();
        finishTask();
      };
    });
  }
}

export interface HttpRequestOptions {
  headers?:
    HttpHeaders | { [header: string]: string | number | (string | number)[] };
  context?: HttpContext;
  observe?: HttpObserve;
  params?: HttpParams | { [param: string]: HttpParamValue };
  reportProgress?: boolean;
  responseType?: HttpResponseType;
  withCredentials?: boolean;
  transferCache?: { includeHeaders?: string[] } | boolean;
  body?: any;
}

function normalizeHeaders(
  headers?:
    HttpHeaders | { [header: string]: string | number | (string | number)[] },
): HttpHeaders | undefined {
  if (!headers) return undefined;
  return headers instanceof HttpHeaders ? headers : new HttpHeaders(headers);
}

function normalizeParams(
  params?: HttpParams | { [param: string]: HttpParamValue },
): HttpParams | undefined {
  if (!params) return undefined;
  return params instanceof HttpParams
    ? params
    : new HttpParams({ fromObject: params });
}

class DefaultHttpHandler implements HttpHandler {
  readonly #backend: HttpBackend;
  readonly #injector?: Injector;
  readonly #fns: readonly HttpInterceptorFn[];
  readonly #legacy: readonly HttpInterceptor[];

  constructor(
    backend: HttpBackend,
    injector?: Injector,
    fns: readonly HttpInterceptorFn[] = [],
    legacy: readonly HttpInterceptor[] = [],
  ) {
    this.#backend = backend;
    this.#injector = injector;
    this.#fns = fns;
    this.#legacy = legacy;
  }

  handle(req: HttpRequest<any>): HttpObservable<HttpEvent<any>> {
    let terminal: HttpHandlerFn = (r) =>
      toHttpObservable(this.#backend.handle(r));

    for (let i = this.#legacy.length - 1; i >= 0; i--) {
      const interceptor = this.#legacy[i]!;
      const nextHandler = terminal;
      terminal = (r) =>
        toHttpObservable(
          interceptor.intercept(r, {
            handle: (nextReq) => nextHandler(nextReq),
          }),
        );
    }

    for (let i = this.#fns.length - 1; i >= 0; i--) {
      const fn = this.#fns[i]!;
      const nextHandler = terminal;
      terminal = (r) => {
        const invoke = () => toHttpObservable(fn(r, nextHandler));
        return this.#injector
          ? runInInjectionContext(this.#injector, invoke)
          : invoke();
      };
    }

    return terminal(req);
  }
}

/**
 * Host-free Angular `HttpClient` service with functional & class-based interceptor support.
 */
export interface HttpMethodNoBody {
  <T = any>(
    url: string,
    options?: HttpRequestOptions & { observe?: "body" },
  ): HttpObservable<T>;
  <T = any>(
    url: string,
    options: HttpRequestOptions & { observe: "response" },
  ): HttpObservable<HttpResponse<T>>;
  <T = any>(
    url: string,
    options: HttpRequestOptions & { observe: "events" },
  ): HttpObservable<HttpEvent<T>>;
  <_T = any>(url: string, options?: HttpRequestOptions): HttpObservable<any>;
}

export interface HttpMethodWithBody {
  <T = any>(
    url: string,
    body: any,
    options?: HttpRequestOptions & { observe?: "body" },
  ): HttpObservable<T>;
  <T = any>(
    url: string,
    body: any,
    options: HttpRequestOptions & { observe: "response" },
  ): HttpObservable<HttpResponse<T>>;
  <T = any>(
    url: string,
    body: any,
    options: HttpRequestOptions & { observe: "events" },
  ): HttpObservable<HttpEvent<T>>;
  <_T = any>(
    url: string,
    body: any,
    options?: HttpRequestOptions,
  ): HttpObservable<any>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface HttpClient {
  get: HttpMethodNoBody;
  delete: HttpMethodNoBody;
  head: HttpMethodNoBody;
  options: HttpMethodNoBody;

  post: HttpMethodWithBody;
  put: HttpMethodWithBody;
  patch: HttpMethodWithBody;
}

export class HttpClient {
  static ɵprov = {
    token: HttpClient,
    providedIn: "root" as const,
    factory: () => {
      const handler = inject(HttpHandler, { optional: true });
      if (handler) return new HttpClient(handler);
      const backend =
        inject(HttpBackend, { optional: true }) ?? inject(FetchBackend);
      const fns =
        inject(HTTP_INTERCEPTOR_FNS, { optional: true }) ??
        ([] as readonly HttpInterceptorFn[]);
      const legacy =
        inject(HTTP_INTERCEPTORS, { optional: true }) ??
        ([] as readonly HttpInterceptor[]);
      const injector = getCurrentInjector();
      return new HttpClient(
        new DefaultHttpHandler(backend, injector, fns.flat(), legacy),
      );
    },
  };

  readonly #handler: HttpHandler;

  constructor(handler?: HttpHandler) {
    this.#handler = handler ?? new FetchBackend();
  }

  request<R = any>(req: HttpRequest<any>): HttpObservable<HttpEvent<R>>;
  request<R = any>(
    method: string,
    url: string,
    options?: HttpRequestOptions & { observe?: "body" },
  ): HttpObservable<R>;
  request<R = any>(
    method: string,
    url: string,
    options: HttpRequestOptions & { observe: "response" },
  ): HttpObservable<HttpResponse<R>>;
  request<R = any>(
    method: string,
    url: string,
    options: HttpRequestOptions & { observe: "events" },
  ): HttpObservable<HttpEvent<R>>;
  request(
    first: string | HttpRequest<any>,
    url?: string,
    options: HttpRequestOptions = {},
  ): HttpObservable<any> {
    let req: HttpRequest<any>;
    let observe: HttpObserve = "body";

    if (first instanceof HttpRequest) {
      req = first;
      observe = "events";
    } else {
      observe = options.observe ?? "body";
      req = new HttpRequest(first, url!, options.body ?? null, {
        headers: normalizeHeaders(options.headers),
        context: options.context,
        params: normalizeParams(options.params),
        reportProgress: options.reportProgress,
        responseType: options.responseType ?? "json",
        withCredentials: options.withCredentials,
        transferCache: options.transferCache,
      });
    }

    const events$ = toHttpObservable(this.#handler.handle(req));
    if (observe === "events") {
      return events$;
    }

    return new HttpObservable<any>((observer) => {
      return events$.subscribe({
        next(event) {
          if (event.type === HttpEventType.Response) {
            if (observe === "response") {
              observer.next?.(event);
            } else {
              observer.next?.(event.body);
            }
          }
        },
        error(err) {
          observer.error?.(err);
        },
        complete() {
          observer.complete?.();
        },
      });
    });
  }
}

for (const method of ["GET", "DELETE", "HEAD", "OPTIONS"] as const) {
  (HttpClient.prototype as any)[method.toLowerCase()] = function (
    this: HttpClient,
    url: string,
    options?: HttpRequestOptions,
  ) {
    return this.request(method, url, options as any);
  };
}

for (const method of ["POST", "PUT", "PATCH"] as const) {
  (HttpClient.prototype as any)[method.toLowerCase()] = function (
    this: HttpClient,
    url: string,
    body: any,
    options?: HttpRequestOptions,
  ) {
    return this.request(method, url, { ...options, body } as any);
  };
}

export type HttpFeatureKind = "interceptors" | "legacy_interceptors" | "fetch";

export interface HttpFeature<KindT extends HttpFeatureKind = HttpFeatureKind> {
  readonly ɵkind: KindT;
  readonly ɵproviders: Provider[];
}

export function withInterceptors(
  interceptorFns: readonly HttpInterceptorFn[],
): HttpFeature<"interceptors"> {
  return {
    ɵkind: "interceptors",
    ɵproviders: [
      {
        provide: HTTP_INTERCEPTOR_FNS,
        useValue: [...interceptorFns],
        multi: true,
      },
    ],
  };
}

export function withInterceptorsFromDi(): HttpFeature<"legacy_interceptors"> {
  return {
    ɵkind: "legacy_interceptors",
    ɵproviders: [],
  };
}

export function withFetch(customFetch?: typeof fetch): HttpFeature<"fetch"> {
  const providers: Provider[] = [
    {
      provide: HttpBackend,
      useExisting: FetchBackend,
    },
  ];
  if (customFetch) {
    providers.push({
      provide: HTTP_FETCH_FN,
      useValue: customFetch,
    });
  }
  return {
    ɵkind: "fetch",
    ɵproviders: providers,
  };
}

export function provideHttpClient(
  ...features: HttpFeature[]
): EnvironmentProviders {
  let includeLegacy = false;
  const featureProviders: Provider[] = [];

  for (const feature of features) {
    if (feature.ɵkind === "legacy_interceptors") {
      includeLegacy = true;
    }
    featureProviders.push(...feature.ɵproviders);
  }

  return makeEnvironmentProviders([
    FetchBackend,
    { provide: HttpBackend, useExisting: FetchBackend },
    ...featureProviders,
    {
      provide: HttpHandler,
      useFactory: () => {
        const backend = inject(HttpBackend);
        const rawFns = inject(HTTP_INTERCEPTOR_FNS, { optional: true });
        const fns: HttpInterceptorFn[] = Array.isArray(rawFns)
          ? rawFns.flat()
          : [];
        const legacy = includeLegacy
          ? (inject(HTTP_INTERCEPTORS, { optional: true }) ?? [])
          : [];
        const injector = getCurrentInjector();
        return new DefaultHttpHandler(backend, injector, fns, legacy);
      },
    },
    {
      provide: HttpClient,
      useFactory: () => new HttpClient(inject(HttpHandler)),
    },
  ]);
}

export interface HttpResourceRequest {
  url: string;
  method?: string;
  body?: unknown;
  params?: HttpParams | { [param: string]: HttpParamValue };
  headers?:
    HttpHeaders | { [header: string]: string | number | (string | number)[] };
  context?: HttpContext;
  reportProgress?: boolean;
  withCredentials?: boolean;
  transferCache?: boolean | { includeHeaders?: string[] };
}

export interface HttpResourceOptions<TResult, TRaw = unknown> {
  defaultValue?: NoInfer<TResult>;
  parse?: (value: TRaw) => TResult;
  injector?: Injector;
  equal?: ValueEqualityFn<TResult>;
}

export interface HttpResource<T> extends Resource<T> {
  readonly headers: Signal<HttpHeaders | undefined>;
  readonly statusCode: Signal<number | undefined>;
  readonly progress: Signal<HttpProgressEvent | undefined>;
  hasValue(): this is HttpResource<Exclude<T, undefined>>;
}

export interface HttpResourceRef<T> extends ResourceRef<T>, HttpResource<T> {
  readonly headers: Signal<HttpHeaders | undefined>;
  readonly statusCode: Signal<number | undefined>;
  readonly progress: Signal<HttpProgressEvent | undefined>;
  hasValue(): this is HttpResourceRef<Exclude<T, undefined>>;
  asReadonly(): HttpResource<T>;
}

function createHttpResourceImpl<TResult, TRaw>(
  request: () => string | HttpResourceRequest | undefined,
  responseType: HttpResponseType,
  options: HttpResourceOptions<TResult, TRaw> = {},
): HttpResourceRef<TResult | undefined> {
  const defaultValue = options.defaultValue;
  const equal = options.equal ?? Object.is;
  const parse = options.parse ?? ((raw: TRaw) => raw as unknown as TResult);

  const activeInjector = options.injector ?? getCurrentInjector();
  let client: HttpClient | undefined;
  if (activeInjector) {
    client =
      activeInjector.get(HttpClient, null, { optional: true }) ?? undefined;
  } else if (getOwner()) {
    try {
      client = inject(HttpClient, { optional: true }) ?? undefined;
    } catch {
      client = undefined;
    }
  }
  const resolvedClient = client ?? new HttpClient();

  const valueSig = signal<TResult | undefined>(defaultValue, {
    equal: (a, b) =>
      a === undefined || b === undefined ? Object.is(a, b) : equal(a, b),
  });
  const statusSig = signal<ResourceStatus>("idle");
  const errorSig = signal<unknown>(undefined);
  const headersSig = signal<HttpHeaders | undefined>(undefined);
  const statusCodeSig = signal<number | undefined>(undefined);
  const progressSig = signal<HttpProgressEvent | undefined>(undefined);

  const isLoadingSig = computed(() => {
    const s = statusSig();
    return s === "loading" || s === "reloading";
  });

  let currentSub: Unsubscribable | undefined;
  let activeLoadId = 0;
  let destroyed = false;

  const abortPending = () => {
    if (currentSub) {
      const sub = currentSub;
      currentSub = undefined;
      sub.unsubscribe();
    }
  };

  const startLoad = (
    spec: string | HttpResourceRequest,
    nextStatus: "loading" | "reloading",
  ) => {
    abortPending();
    const loadId = ++activeLoadId;

    const reqObj: HttpResourceRequest =
      typeof spec === "string" ? { url: spec, method: "GET" } : spec;
    const httpReq = new HttpRequest(
      reqObj.method ?? "GET",
      reqObj.url,
      reqObj.body !== undefined ? reqObj.body : null,
      {
        headers: normalizeHeaders(reqObj.headers),
        params: normalizeParams(reqObj.params),
        context: reqObj.context,
        reportProgress: reqObj.reportProgress,
        withCredentials: reqObj.withCredentials,
        transferCache: reqObj.transferCache,
        responseType,
      },
    );

    untrack(() => {
      batch(() => {
        if (nextStatus === "loading") {
          valueSig.set(defaultValue);
          headersSig.set(undefined);
          statusCodeSig.set(undefined);
        }
        progressSig.set(undefined);
        errorSig.set(undefined);
        statusSig.set(nextStatus);
      });
    });

    currentSub = untrack(() =>
      resolvedClient.request<TRaw>(httpReq).subscribe({
        next(event) {
          if (destroyed || loadId !== activeLoadId) return;
          if (
            event.type === HttpEventType.DownloadProgress ||
            event.type === HttpEventType.UploadProgress
          ) {
            progressSig.set(event);
          } else if (event.type === HttpEventType.ResponseHeader) {
            batch(() => {
              headersSig.set(event.headers);
              statusCodeSig.set(event.status);
            });
          } else if (event.type === HttpEventType.Response) {
            let finalValue: TResult;
            try {
              finalValue = parse(event.body as TRaw);
            } catch (parseErr) {
              currentSub = undefined;
              batch(() => {
                headersSig.set(event.headers);
                statusCodeSig.set(event.status);
                valueSig.set(defaultValue);
                errorSig.set(parseErr);
                statusSig.set("error");
              });
              return;
            }
            batch(() => {
              headersSig.set(event.headers);
              statusCodeSig.set(event.status);
              valueSig.set(finalValue);
              errorSig.set(undefined);
              statusSig.set("resolved");
            });
          }
        },
        error(err) {
          if (destroyed || loadId !== activeLoadId) return;
          currentSub = undefined;
          batch(() => {
            if (err instanceof HttpErrorResponse) {
              headersSig.set(err.headers);
              statusCodeSig.set(err.status);
            }
            valueSig.set(defaultValue);
            errorSig.set(err);
            statusSig.set("error");
          });
        },
        complete() {
          if (destroyed || loadId !== activeLoadId) return;
          currentSub = undefined;
        },
      }),
    );
  };

  let lastSpec: string | HttpResourceRequest | undefined;
  const watcher = effect(
    () => {
      if (destroyed) return;
      const spec = request();
      lastSpec = spec;
      if (spec === undefined) {
        activeLoadId++;
        abortPending();
        untrack(() => {
          batch(() => {
            valueSig.set(defaultValue);
            headersSig.set(undefined);
            statusCodeSig.set(undefined);
            progressSig.set(undefined);
            errorSig.set(undefined);
            statusSig.set("idle");
          });
        });
        return;
      }
      startLoad(spec, "loading");
    },
    { manualCleanup: true },
  );

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    activeLoadId++;
    abortPending();
    watcher.destroy();
  };

  if (getOwner()) {
    domOnCleanup(destroy);
  }
  activeInjector
    ?.get(DestroyRef, undefined, { optional: true })
    ?.onDestroy(destroy);

  const hasValueMemo = computed(() => {
    const s = statusSig();
    const v = valueSig();
    if (s === "error") return false;
    if (s === "resolved" || s === "local" || s === "reloading") {
      return v !== undefined;
    }
    return defaultValue !== undefined && v !== undefined;
  });

  const readonlyView: HttpResource<TResult | undefined> = {
    value: valueSig.asReadonly(),
    status: statusSig.asReadonly(),
    error: errorSig.asReadonly(),
    isLoading: isLoadingSig,
    headers: headersSig.asReadonly(),
    statusCode: statusCodeSig.asReadonly(),
    progress: progressSig.asReadonly(),
    hasValue(): this is HttpResource<Exclude<TResult | undefined, undefined>> {
      return hasValueMemo();
    },
  };

  const ref: HttpResourceRef<TResult | undefined> = {
    value: valueSig,
    status: statusSig.asReadonly(),
    error: errorSig.asReadonly(),
    isLoading: isLoadingSig,
    headers: headersSig.asReadonly(),
    statusCode: statusCodeSig.asReadonly(),
    progress: progressSig.asReadonly(),
    hasValue(): this is HttpResourceRef<
      Exclude<TResult | undefined, undefined>
    > {
      return hasValueMemo();
    },
    set(newValue: TResult | undefined) {
      activeLoadId++;
      abortPending();
      batch(() => {
        valueSig.set(newValue);
        errorSig.set(undefined);
        statusSig.set("local");
      });
    },
    update(updater: (value: TResult | undefined) => TResult | undefined) {
      const current = untracked(valueSig);
      const next = untracked(() => updater(current));
      ref.set(next);
    },
    asReadonly() {
      return readonlyView;
    },
    reload(): boolean {
      if (destroyed) return false;
      const currentStatus = untracked(statusSig);
      if (
        currentStatus === "idle" ||
        currentStatus === "loading" ||
        currentStatus === "reloading"
      ) {
        return false;
      }
      const spec = lastSpec ?? untracked(request);
      if (spec === undefined) return false;
      const nextStatus =
        currentStatus === "resolved" || currentStatus === "local"
          ? "reloading"
          : "loading";
      startLoad(spec, nextStatus);
      return true;
    },
    destroy,
  };

  return ref;
}

export interface HttpResourceSubFactory<TRaw> {
  <TResult = TRaw>(
    request: () => string | HttpResourceRequest | undefined,
    options: HttpResourceOptions<TResult, TRaw> & {
      defaultValue: NoInfer<TResult>;
    },
  ): HttpResourceRef<TResult>;
  <TResult = TRaw>(
    request: () => string | HttpResourceRequest | undefined,
    options?: HttpResourceOptions<TResult, TRaw>,
  ): HttpResourceRef<TResult | undefined>;
}

export interface HttpResourceFn {
  <TResult = unknown>(
    request: () => string | HttpResourceRequest | undefined,
    options: HttpResourceOptions<TResult, unknown> & {
      defaultValue: NoInfer<TResult>;
    },
  ): HttpResourceRef<TResult>;
  <TResult = unknown>(
    request: () => string | HttpResourceRequest | undefined,
    options?: HttpResourceOptions<TResult, unknown>,
  ): HttpResourceRef<TResult | undefined>;
  readonly text: HttpResourceSubFactory<string>;
  readonly blob: HttpResourceSubFactory<Blob>;
  readonly arrayBuffer: HttpResourceSubFactory<ArrayBuffer>;
}

/**
 * Angular 19.2+ reactive `httpResource` primitive backed by `HttpClient` and Moonshine signals.
 */
export const httpResource: HttpResourceFn = Object.assign(
  function httpResourceRoot<TResult = unknown>(
    request: () => string | HttpResourceRequest | undefined,
    options?: HttpResourceOptions<TResult, unknown>,
  ): HttpResourceRef<TResult | undefined> {
    return createHttpResourceImpl<TResult, unknown>(request, "json", options);
  },
  {
    text: (<TResult = string>(
      request: () => string | HttpResourceRequest | undefined,
      options?: HttpResourceOptions<TResult, string>,
    ) =>
      createHttpResourceImpl<TResult, string>(
        request,
        "text",
        options,
      )) as HttpResourceSubFactory<string>,
    blob: (<TResult = Blob>(
      request: () => string | HttpResourceRequest | undefined,
      options?: HttpResourceOptions<TResult, Blob>,
    ) =>
      createHttpResourceImpl<TResult, Blob>(
        request,
        "blob",
        options,
      )) as HttpResourceSubFactory<Blob>,
    arrayBuffer: (<TResult = ArrayBuffer>(
      request: () => string | HttpResourceRequest | undefined,
      options?: HttpResourceOptions<TResult, ArrayBuffer>,
    ) =>
      createHttpResourceImpl<TResult, ArrayBuffer>(
        request,
        "arraybuffer",
        options,
      )) as HttpResourceSubFactory<ArrayBuffer>,
  },
) as HttpResourceFn;
