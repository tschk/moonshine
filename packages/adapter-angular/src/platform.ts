/**
 * Host-free Angular platform, browser, transfer-state, sanitizer, bootstrap,
 * and common pipe primitives backed by the Moonshine reactive and DI graph.
 */
import {
  createEnvironmentInjector,
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  EnvironmentInjector,
  type EnvironmentProviders,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type Provider,
  runInInjectionContext,
  type Signal,
  signal,
  type Subscribable,
  type Type,
  type WritableSignal,
} from "./signals";

export { ENVIRONMENT_INITIALIZER, provideEnvironmentInitializer };

// ============================================================================
// Platform Tokens & Helpers (`@angular/common`)
// ============================================================================

export const PLATFORM_BROWSER_ID = "browser";
export const PLATFORM_SERVER_ID = "server";

export const PLATFORM_ID = new InjectionToken<unknown>("Platform ID", {
  providedIn: "root",
  factory: () =>
    typeof window !== "undefined" && typeof document !== "undefined"
      ? PLATFORM_BROWSER_ID
      : PLATFORM_SERVER_ID,
});

export function isPlatformBrowser(platformId: unknown): boolean {
  return platformId === PLATFORM_BROWSER_ID;
}

export function isPlatformServer(platformId: unknown): boolean {
  return platformId === PLATFORM_SERVER_ID;
}

export const DOCUMENT = new InjectionToken<Document>("DocumentToken", {
  providedIn: "root",
  factory: () =>
    typeof document !== "undefined" ? document : ({} as Document),
});

export const APP_ID = new InjectionToken<string>("AppId", {
  providedIn: "root",
  factory: () => "ng",
});

// ============================================================================
// `TransferState` & `makeStateKey` (`@angular/core`)
// ============================================================================

export type StateKey<T> = string & {
  readonly __not_a_string: never;
  readonly __value_type?: T;
};

export function makeStateKey<T = void>(key: string): StateKey<T> {
  return key as StateKey<T>;
}

export class TransferState {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new TransferState(),
  };

  readonly #store = new Map<string, unknown>();
  readonly #onSerializeCallbacks = new Map<string, () => unknown>();

  get<T>(key: StateKey<T>, defaultValue: T): T {
    if (this.#store.has(key)) {
      return this.#store.get(key) as T;
    }
    return defaultValue;
  }

  set<T>(key: StateKey<T>, value: T): void {
    this.#store.set(key, value);
  }

  remove<T>(key: StateKey<T>): void {
    this.#store.delete(key);
    this.#onSerializeCallbacks.delete(key);
  }

  hasKey<T>(key: StateKey<T>): boolean {
    return this.#store.has(key) || this.#onSerializeCallbacks.has(key);
  }

  get isEmpty(): boolean {
    return this.#store.size === 0 && this.#onSerializeCallbacks.size === 0;
  }

  onSerialize<T>(key: StateKey<T>, callback: () => T): void {
    this.#onSerializeCallbacks.set(key, callback);
  }

  toJson(): string {
    for (const [key, callback] of this.#onSerializeCallbacks.entries()) {
      try {
        this.#store.set(key, callback());
      } catch {
        // Ignore serialization callback failures
      }
    }
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.#store.entries()) {
      obj[k] = v;
    }
    return JSON.stringify(obj);
  }

  populateFromJson(json: string | Record<string, unknown>): void {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        this.#store.set(k, v);
      }
    }
  }
}

// ============================================================================
// `Title` & `Meta` (`@angular/platform-browser`)
// ============================================================================

export class Title {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new Title(),
  };

  readonly #titleSignal: WritableSignal<string> = signal(
    typeof document !== "undefined" && typeof document.title === "string"
      ? document.title
      : "",
  );

  get title(): Signal<string> {
    return this.#titleSignal.asReadonly();
  }

  getTitle(): string {
    if (typeof document !== "undefined" && typeof document.title === "string") {
      return document.title || this.#titleSignal();
    }
    return this.#titleSignal();
  }

  setTitle(newTitle: string): void {
    const normalized = String(newTitle ?? "");
    this.#titleSignal.set(normalized);
    if (typeof document !== "undefined" && "title" in document) {
      try {
        document.title = normalized;
      } catch {
        // Ignore readonly document mocks
      }
    }
  }
}

export interface MetaDefinition {
  charset?: string;
  content?: string;
  httpEquiv?: string;
  id?: string;
  itemprop?: string;
  name?: string;
  property?: string;
  scheme?: string;
  url?: string;
  [prop: string]: string | undefined;
}

export interface MetaTagRecord {
  attributes: Record<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

function createMetaRecord(tag: MetaDefinition): MetaTagRecord {
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(tag)) {
    if (v !== undefined) {
      attributes[k === "httpEquiv" ? "http-equiv" : k] = String(v);
    }
  }
  return {
    attributes,
    getAttribute(name: string) {
      const normalized = name === "httpEquiv" ? "http-equiv" : name;
      return attributes[normalized] ?? null;
    },
    setAttribute(name: string, value: string) {
      const normalized = name === "httpEquiv" ? "http-equiv" : name;
      attributes[normalized] = String(value);
    },
  };
}

function parseAttrSelector(
  selector: string,
): { key: string; value?: string } | null {
  const trimmed = selector.trim();
  const match = /^([A-Za-z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?$/.exec(
    trimmed,
  );
  if (!match) return null;
  const key = match[1] === "httpEquiv" ? "http-equiv" : match[1]!;
  const value = match[2] ?? match[3] ?? match[4];
  return { key, value };
}

function matchesSelector(record: MetaTagRecord, selector: string): boolean {
  const parsed = parseAttrSelector(selector);
  if (!parsed) return false;
  if (!(parsed.key in record.attributes)) return false;
  if (parsed.value === undefined) return true;
  return record.attributes[parsed.key] === parsed.value;
}

function getKeySelectorForTag(tag: MetaDefinition): string | null {
  if (tag.name) return `name="${tag.name}"`;
  if (tag.property) return `property="${tag.property}"`;
  if (tag.httpEquiv) return `http-equiv="${tag.httpEquiv}"`;
  if (tag.id) return `id="${tag.id}"`;
  if (tag.itemprop) return `itemprop="${tag.itemprop}"`;
  if (tag.charset) return "charset";
  return null;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class Meta {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new Meta(),
  };

  readonly #tags: MetaTagRecord[] = [];

  addTag(tag: MetaDefinition, forceCreation = false): HTMLMetaElement | null {
    if (!forceCreation) {
      const selector = getKeySelectorForTag(tag);
      if (selector) {
        const existing = this.getTag(selector);
        if (existing) {
          return this.updateTag(tag, selector);
        }
      }
    }
    const record = createMetaRecord(tag);
    this.#tags.push(record);
    return record as unknown as HTMLMetaElement;
  }

  addTags(tags: MetaDefinition[], forceCreation = false): HTMLMetaElement[] {
    const result: HTMLMetaElement[] = [];
    for (const tag of tags) {
      const added = this.addTag(tag, forceCreation);
      if (added) result.push(added);
    }
    return result;
  }

  getTag(attrSelector: string): HTMLMetaElement | null {
    const found = this.#tags.find((t) => matchesSelector(t, attrSelector));
    return (found as unknown as HTMLMetaElement) ?? null;
  }

  getTags(attrSelector: string): HTMLMetaElement[] {
    return this.#tags.filter((t) =>
      matchesSelector(t, attrSelector),
    ) as unknown as HTMLMetaElement[];
  }

  updateTag(tag: MetaDefinition, selector?: string): HTMLMetaElement | null {
    const effectiveSelector = selector ?? getKeySelectorForTag(tag);
    if (!effectiveSelector) {
      return this.addTag(tag, true);
    }
    const idx = this.#tags.findIndex((t) =>
      matchesSelector(t, effectiveSelector),
    );
    if (idx < 0) {
      return this.addTag(tag, true);
    }
    const updated = createMetaRecord(tag);
    this.#tags[idx] = updated;
    return updated as unknown as HTMLMetaElement;
  }

  removeTag(attrSelector: string): void {
    const idx = this.#tags.findIndex((t) => matchesSelector(t, attrSelector));
    if (idx >= 0) {
      this.#tags.splice(idx, 1);
    }
  }

  removeTagElement(meta: HTMLMetaElement): void {
    const idx = this.#tags.indexOf(meta as unknown as MetaTagRecord);
    if (idx >= 0) {
      this.#tags.splice(idx, 1);
    }
  }

  renderToString(): string {
    return this.#tags
      .map((t) => {
        const attrs = Object.entries(t.attributes)
          .map(([k, v]) => `${k}="${escapeHtmlAttr(v)}"`)
          .join(" ");
        return `<meta ${attrs}>`;
      })
      .join("");
  }
}

// ============================================================================
// `DomSanitizer` & `SecurityContext` (`@angular/platform-browser` & `@angular/core`)
// ============================================================================

export enum SecurityContext {
  NONE = 0,
  HTML = 1,
  STYLE = 2,
  SCRIPT = 3,
  URL = 4,
  RESOURCE_URL = 5,
}

const SAFE_VALUE_BRAND = Symbol.for("moonshine.angular.safeValue");

export interface SafeValue {
  readonly [SAFE_VALUE_BRAND]: SecurityContext;
  readonly changingThisBreaksApplicationSecurity: string;
}

export interface SafeHtml extends SafeValue {}
export interface SafeStyle extends SafeValue {}
export interface SafeScript extends SafeValue {}
export interface SafeUrl extends SafeValue {}
export interface SafeResourceUrl extends SafeValue {}

class SafeValueImpl implements SafeValue {
  readonly [SAFE_VALUE_BRAND]: SecurityContext;
  readonly changingThisBreaksApplicationSecurity: string;

  constructor(context: SecurityContext, value: string) {
    this[SAFE_VALUE_BRAND] = context;
    this.changingThisBreaksApplicationSecurity = String(value);
  }

  toString(): string {
    return this.changingThisBreaksApplicationSecurity;
  }
}

export function unwrapSafeValue(value: SafeValue | string): string {
  if (value && typeof value === "object" && SAFE_VALUE_BRAND in value) {
    return value.changingThisBreaksApplicationSecurity;
  }
  return String(value);
}

const SAFE_URL_PATTERN =
  /^(?:(?:https?|mailto|ftp|tel|file|sms):|[^&:/?#]*(?:[/?#]|$))/i;
const DATA_URL_PATTERN =
  /^data:(?:image\/(?:bmp|gif|jpeg|jpg|png|tiff|webp)|video\/(?:mpeg|mp4|ogg|webm)|audio\/(?:mp3|oga|ogg|opus));base64,[a-z0-9+/]+=*$/i;

function sanitizeHtml(input: string): string {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "unsafe:javascript:");
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (SAFE_URL_PATTERN.test(trimmed) || DATA_URL_PATTERN.test(trimmed)) {
    return url;
  }
  return `unsafe:${url}`;
}

export class DomSanitizer {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new DomSanitizer(),
  };

  sanitize(
    context: SecurityContext,
    value: SafeValue | string | null,
  ): string | null {
    if (value == null) return null;
    if (typeof value === "object" && SAFE_VALUE_BRAND in value) {
      if (value[SAFE_VALUE_BRAND] === context) {
        return value.changingThisBreaksApplicationSecurity;
      }
      throw new Error(
        `Required a safe ${SecurityContext[context]} value, got ${SecurityContext[value[SAFE_VALUE_BRAND]]}`,
      );
    }
    const str = String(value);
    switch (context) {
      case SecurityContext.NONE:
        return str;
      case SecurityContext.HTML:
        return sanitizeHtml(str);
      case SecurityContext.STYLE:
        return str.replace(/expression\s*\(|javascript\s*:/gi, "");
      case SecurityContext.URL:
        return sanitizeUrl(str);
      case SecurityContext.SCRIPT:
        throw new Error("unsafe value used in a script context");
      case SecurityContext.RESOURCE_URL:
        throw new Error("unsafe value used in a resource URL context");
      default:
        return str;
    }
  }

  bypassSecurityTrustHtml(value: string): SafeHtml {
    return new SafeValueImpl(SecurityContext.HTML, value);
  }

  bypassSecurityTrustStyle(value: string): SafeStyle {
    return new SafeValueImpl(SecurityContext.STYLE, value);
  }

  bypassSecurityTrustScript(value: string): SafeScript {
    return new SafeValueImpl(SecurityContext.SCRIPT, value);
  }

  bypassSecurityTrustUrl(value: string): SafeUrl {
    return new SafeValueImpl(SecurityContext.URL, value);
  }

  bypassSecurityTrustResourceUrl(value: string): SafeResourceUrl {
    return new SafeValueImpl(SecurityContext.RESOURCE_URL, value);
  }
}

// ============================================================================
// Application Config, Hydration Providers & Bootstrap (`@angular/platform-browser`)
// ============================================================================

export const APP_INITIALIZER = new InjectionToken<
  ReadonlyArray<() => unknown | Promise<unknown>>
>("Application Initializer");

export function provideAppInitializer(
  initializerFn: () => unknown | Promise<unknown>,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      useValue: initializerFn,
      multi: true,
    },
  ]);
}

export interface ApplicationConfig {
  providers: Array<Provider | EnvironmentProviders>;
}

export function mergeApplicationConfig(
  ...configs: ApplicationConfig[]
): ApplicationConfig {
  const providers: Array<Provider | EnvironmentProviders> = [];
  for (const cfg of configs) {
    if (cfg?.providers) {
      providers.push(...cfg.providers);
    }
  }
  return { providers };
}

export enum HydrationFeatureKind {
  NoHttpTransferCache = 0,
  HttpTransferCacheOptions = 1,
  I18nSupport = 2,
  EventReplay = 3,
  IncrementalHydration = 4,
}

export interface HydrationFeature<
  KindT extends HydrationFeatureKind = HydrationFeatureKind,
> {
  ɵkind: KindT;
  ɵproviders: Array<Provider | EnvironmentProviders>;
}

export interface HttpTransferCacheOptions {
  filter?: (req: unknown) => boolean;
  includeHeaders?: string[];
  includePostRequests?: boolean;
  includeRequestsWithAuthHeaders?: boolean;
}

export const HYDRATION_FEATURES = new InjectionToken<
  ReadonlyArray<HydrationFeatureKind>
>("HYDRATION_FEATURES");

export const HTTP_TRANSFER_CACHE_OPTIONS =
  new InjectionToken<HttpTransferCacheOptions>("HTTP_TRANSFER_CACHE_OPTIONS");

export function withNoHttpTransferCache(): HydrationFeature<HydrationFeatureKind.NoHttpTransferCache> {
  return {
    ɵkind: HydrationFeatureKind.NoHttpTransferCache,
    ɵproviders: [
      {
        provide: HYDRATION_FEATURES,
        useValue: HydrationFeatureKind.NoHttpTransferCache,
        multi: true,
      },
    ],
  };
}

export function withHttpTransferCacheOptions(
  options: HttpTransferCacheOptions,
): HydrationFeature<HydrationFeatureKind.HttpTransferCacheOptions> {
  return {
    ɵkind: HydrationFeatureKind.HttpTransferCacheOptions,
    ɵproviders: [
      {
        provide: HYDRATION_FEATURES,
        useValue: HydrationFeatureKind.HttpTransferCacheOptions,
        multi: true,
      },
      {
        provide: HTTP_TRANSFER_CACHE_OPTIONS,
        useValue: options,
      },
    ],
  };
}

export function withEventReplay(): HydrationFeature<HydrationFeatureKind.EventReplay> {
  return {
    ɵkind: HydrationFeatureKind.EventReplay,
    ɵproviders: [
      {
        provide: HYDRATION_FEATURES,
        useValue: HydrationFeatureKind.EventReplay,
        multi: true,
      },
    ],
  };
}

export function withIncrementalHydration(): HydrationFeature<HydrationFeatureKind.IncrementalHydration> {
  return {
    ɵkind: HydrationFeatureKind.IncrementalHydration,
    ɵproviders: [
      {
        provide: HYDRATION_FEATURES,
        useValue: HydrationFeatureKind.IncrementalHydration,
        multi: true,
      },
    ],
  };
}

export function withI18nSupport(): HydrationFeature<HydrationFeatureKind.I18nSupport> {
  return {
    ɵkind: HydrationFeatureKind.I18nSupport,
    ɵproviders: [
      {
        provide: HYDRATION_FEATURES,
        useValue: HydrationFeatureKind.I18nSupport,
        multi: true,
      },
    ],
  };
}

export function provideClientHydration(
  ...features: HydrationFeature[]
): EnvironmentProviders {
  const providers: Array<Provider | EnvironmentProviders> = [];
  for (const feature of features) {
    providers.push(...feature.ɵproviders);
  }
  return makeEnvironmentProviders(providers);
}

export function provideZoneChangeDetection(_options?: {
  eventCoalescing?: boolean;
  runCoalescing?: boolean;
  ignoreChangesOutsideZone?: boolean;
}): EnvironmentProviders {
  return makeEnvironmentProviders([]);
}

export function provideExperimentalZonelessChangeDetection(): EnvironmentProviders {
  return makeEnvironmentProviders([]);
}

export function provideZonelessChangeDetection(): EnvironmentProviders {
  return makeEnvironmentProviders([]);
}

export function provideProtractorTestingSupport(): EnvironmentProviders {
  return makeEnvironmentProviders([]);
}

export interface ComponentRef<C = any> {
  readonly instance: C;
  readonly componentType: Type<C>;
  readonly injector: EnvironmentInjector;
  readonly destroyRef: DestroyRef;
  destroy(): void;
}

export class ApplicationRef {
  readonly injector: EnvironmentInjector;
  readonly components: ComponentRef<any>[] = [];
  #destroyed = false;

  constructor(injector: EnvironmentInjector) {
    this.injector = injector;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  bootstrap<C>(componentOrFactory: Type<C>): ComponentRef<C> {
    if (this.#destroyed) {
      throw new Error("Cannot bootstrap on a destroyed ApplicationRef");
    }
    const instance = runInInjectionContext(
      this.injector,
      () => new componentOrFactory(),
    );
    const destroyRef = this.injector.get(DestroyRef);
    const ref: ComponentRef<C> = {
      instance,
      componentType: componentOrFactory,
      injector: this.injector,
      destroyRef,
      destroy: () => {
        const idx = this.components.indexOf(ref);
        if (idx >= 0) this.components.splice(idx, 1);
      },
    };
    this.components.push(ref);
    return ref;
  }

  tick(): void {
    // Synchronous signal graph requires no dirty-check loop
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.components.length = 0;
    this.injector.destroy();
  }
}

export async function createApplication(
  appConfig?: ApplicationConfig,
): Promise<ApplicationRef> {
  const providers = appConfig?.providers ?? [];
  const injector = createEnvironmentInjector(providers);
  const appInits = injector.get(APP_INITIALIZER, []);
  for (const init of appInits) {
    await runInInjectionContext(injector, init);
  }
  return new ApplicationRef(injector);
}

export async function bootstrapApplication<C>(
  rootComponent: Type<C>,
  options?: ApplicationConfig,
): Promise<ApplicationRef> {
  const appRef = await createApplication(options);
  appRef.bootstrap(rootComponent);
  return appRef;
}

// ============================================================================
// Built-in Angular Common Pipes (`@angular/common`)
// ============================================================================

export interface PipeTransform {
  transform(value: any, ...args: any[]): any;
}

export class UpperCasePipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new UpperCasePipe(),
  };

  transform(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (typeof value !== "string") {
      throw new Error(
        `InvalidPipeArgument: '${value}' for pipe 'UpperCasePipe'`,
      );
    }
    return value.toUpperCase();
  }
}

export class LowerCasePipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new LowerCasePipe(),
  };

  transform(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (typeof value !== "string") {
      throw new Error(
        `InvalidPipeArgument: '${value}' for pipe 'LowerCasePipe'`,
      );
    }
    return value.toLowerCase();
  }
}

export class TitleCasePipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new TitleCasePipe(),
  };

  transform(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (typeof value !== "string") {
      throw new Error(
        `InvalidPipeArgument: '${value}' for pipe 'TitleCasePipe'`,
      );
    }
    return value.replace(
      /\S+/g,
      (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase(),
    );
  }
}

export class SlicePipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new SlicePipe(),
  };

  transform<T>(value: ReadonlyArray<T>, start: number, end?: number): Array<T>;
  transform(value: string, start: number, end?: number): string;
  transform(value: null | undefined, start: number, end?: number): null;
  transform(
    value: ReadonlyArray<any> | string | null | undefined,
    start: number,
    end?: number,
  ): Array<any> | string | null {
    if (value == null) return null;
    if (typeof value === "string" || Array.isArray(value)) {
      return value.slice(start, end);
    }
    throw new Error(`InvalidPipeArgument: '${value}' for pipe 'SlicePipe'`);
  }
}

export class JsonPipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new JsonPipe(),
  };

  transform(value: any): string {
    return JSON.stringify(value, null, 2);
  }
}

export interface KeyValue<K, V> {
  key: K;
  value: V;
}

export function defaultKeyValueDiffersCompare<K, V>(
  a: KeyValue<K, V>,
  b: KeyValue<K, V>,
): number {
  const ak = a.key;
  const bk = b.key;
  if (ak === bk) return 0;
  if (ak === undefined) return 1;
  if (bk === undefined) return -1;
  if (ak === null) return 1;
  if (bk === null) return -1;
  if (typeof ak === "string" && typeof bk === "string") {
    return ak < bk ? -1 : 1;
  }
  if (typeof ak === "number" && typeof bk === "number") {
    return ak - bk;
  }
  if (typeof ak === "boolean" && typeof bk === "boolean") {
    return ak < bk ? -1 : 1;
  }
  const aStr = String(ak);
  const bStr = String(bk);
  return aStr === bStr ? 0 : aStr < bStr ? -1 : 1;
}

export class KeyValuePipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new KeyValuePipe(),
  };

  transform<K, V>(
    input: ReadonlyMap<K, V> | Record<string, V> | null | undefined,
    compareFn:
      | ((a: KeyValue<any, V>, b: KeyValue<any, V>) => number)
      | null = defaultKeyValueDiffersCompare,
  ): Array<KeyValue<any, V>> | null {
    if (input == null) return null;
    const pairs: Array<KeyValue<any, V>> = [];
    if (input instanceof Map) {
      for (const [key, value] of input.entries()) {
        pairs.push({ key, value });
      }
    } else if (typeof input === "object") {
      for (const [key, value] of Object.entries(input)) {
        pairs.push({ key, value: value as V });
      }
    } else {
      throw new Error(
        `InvalidPipeArgument: '${input}' for pipe 'KeyValuePipe'`,
      );
    }
    if (compareFn) {
      pairs.sort(compareFn);
    }
    return pairs;
  }
}

function parseDigitsInfo(digitsInfo?: string): {
  minimumIntegerDigits?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
} {
  if (!digitsInfo) return {};
  const match = /^(\d+)?\.(?:(\d+)(?:-(\d+))?)?$/.exec(digitsInfo.trim());
  if (!match) {
    throw new Error(`Invalid digitsInfo: '${digitsInfo}'`);
  }
  const minInt = match[1] !== undefined ? Number(match[1]) : undefined;
  const minFrac = match[2] !== undefined ? Number(match[2]) : undefined;
  const maxFrac = match[3] !== undefined ? Number(match[3]) : minFrac;
  return {
    minimumIntegerDigits: minInt,
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  };
}

export class DecimalPipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new DecimalPipe(),
  };

  readonly #defaultLocale: string;

  constructor(defaultLocale = "en-US") {
    this.#defaultLocale = defaultLocale;
  }

  transform(
    value: number | string | null | undefined,
    digitsInfo?: string,
    locale?: string,
  ): string | null {
    if (value == null || value === "") return null;
    const num = Number(value);
    if (Number.isNaN(num)) {
      throw new Error(`InvalidPipeArgument: '${value}' for pipe 'DecimalPipe'`);
    }
    const digits = parseDigitsInfo(digitsInfo);
    return new Intl.NumberFormat(locale ?? this.#defaultLocale, {
      style: "decimal",
      ...digits,
    }).format(num);
  }
}

export class PercentPipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new PercentPipe(),
  };

  readonly #defaultLocale: string;

  constructor(defaultLocale = "en-US") {
    this.#defaultLocale = defaultLocale;
  }

  transform(
    value: number | string | null | undefined,
    digitsInfo?: string,
    locale?: string,
  ): string | null {
    if (value == null || value === "") return null;
    const num = Number(value);
    if (Number.isNaN(num)) {
      throw new Error(`InvalidPipeArgument: '${value}' for pipe 'PercentPipe'`);
    }
    const digits = parseDigitsInfo(digitsInfo);
    return new Intl.NumberFormat(locale ?? this.#defaultLocale, {
      style: "percent",
      ...digits,
    }).format(num);
  }
}

export class CurrencyPipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new CurrencyPipe(),
  };

  readonly #defaultLocale: string;

  constructor(defaultLocale = "en-US") {
    this.#defaultLocale = defaultLocale;
  }

  transform(
    value: number | string | null | undefined,
    currencyCode = "USD",
    display: "code" | "symbol" | "symbol-narrow" | string | boolean = "symbol",
    digitsInfo?: string,
    locale?: string,
  ): string | null {
    if (value == null || value === "") return null;
    const num = Number(value);
    if (Number.isNaN(num)) {
      throw new Error(
        `InvalidPipeArgument: '${value}' for pipe 'CurrencyPipe'`,
      );
    }
    const digits = parseDigitsInfo(digitsInfo);
    const currencyDisplay =
      display === true || display === "symbol"
        ? "symbol"
        : display === false || display === "code"
          ? "code"
          : display === "symbol-narrow"
            ? "narrowSymbol"
            : "symbol";
    return new Intl.NumberFormat(locale ?? this.#defaultLocale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay,
      ...digits,
    }).format(num);
  }
}

export class DatePipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new DatePipe(),
  };

  readonly #defaultLocale: string;

  constructor(defaultLocale = "en-US") {
    this.#defaultLocale = defaultLocale;
  }

  transform(
    value: Date | string | number | null | undefined,
    format = "mediumDate",
    timezone?: string,
    locale?: string,
  ): string | null {
    if (value == null || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`InvalidPipeArgument: '${value}' for pipe 'DatePipe'`);
    }
    if (format === "iso") {
      return date.toISOString();
    }
    const loc = locale ?? this.#defaultLocale;
    const opts: Intl.DateTimeFormatOptions = {};
    if (timezone) opts.timeZone = timezone;
    switch (format) {
      case "short":
        opts.dateStyle = "short";
        opts.timeStyle = "short";
        break;
      case "medium":
        opts.dateStyle = "medium";
        opts.timeStyle = "medium";
        break;
      case "long":
        opts.dateStyle = "long";
        opts.timeStyle = "long";
        break;
      case "full":
        opts.dateStyle = "full";
        opts.timeStyle = "full";
        break;
      case "shortDate":
        opts.dateStyle = "short";
        break;
      case "mediumDate":
        opts.dateStyle = "medium";
        break;
      case "longDate":
        opts.dateStyle = "long";
        break;
      case "fullDate":
        opts.dateStyle = "full";
        break;
      case "shortTime":
        opts.timeStyle = "short";
        break;
      case "mediumTime":
        opts.timeStyle = "medium";
        break;
      default:
        opts.dateStyle = "medium";
        break;
    }
    return new Intl.DateTimeFormat(loc, opts).format(date);
  }
}

export class I18nPluralPipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new I18nPluralPipe(),
  };

  transform(
    value: number | null | undefined,
    pluralMap: Record<string, string>,
    locale = "en-US",
  ): string {
    if (value == null) return "";
    if (!pluralMap || typeof pluralMap !== "object") {
      throw new Error(
        `InvalidPipeArgument: '${pluralMap}' for pipe 'I18nPluralPipe'`,
      );
    }
    const exactKey = `=${value}`;
    let template = pluralMap[exactKey];
    if (template === undefined) {
      const category = new Intl.PluralRules(locale).select(value);
      template = pluralMap[category] ?? pluralMap.other ?? "";
    }
    return template.replace(/#/g, String(value));
  }
}

export class I18nSelectPipe implements PipeTransform {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new I18nSelectPipe(),
  };

  transform(
    value: string | null | undefined,
    mapping: Record<string, string>,
  ): string {
    if (value == null) return "";
    if (!mapping || typeof mapping !== "object") {
      throw new Error(
        `InvalidPipeArgument: '${mapping}' for pipe 'I18nSelectPipe'`,
      );
    }
    return mapping[value] ?? mapping.other ?? "";
  }
}

export class AsyncPipe implements PipeTransform {
  #latestValue: any = null;
  #trackedSource: PromiseLike<any> | Subscribable<any> | null = null;
  #unsubscribe: (() => void) | null = null;

  constructor() {
    try {
      const destroyRef = inject(DestroyRef, { optional: true });
      destroyRef?.onDestroy(() => {
        this.ngOnDestroy();
      });
    } catch {
      // Allowed outside injection context
    }
  }

  ngOnDestroy(): void {
    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
    this.#trackedSource = null;
    this.#latestValue = null;
  }

  transform<T>(
    obj: PromiseLike<T> | Subscribable<T> | null | undefined,
  ): T | null {
    if (obj == null) {
      this.ngOnDestroy();
      return null;
    }
    if (obj !== this.#trackedSource) {
      this.ngOnDestroy();
      this.#trackedSource = obj;
      if ("subscribe" in obj && typeof obj.subscribe === "function") {
        const sub = obj.subscribe({
          next: (val: T) => {
            this.#latestValue = val;
          },
        });
        this.#unsubscribe = () => {
          if (typeof sub === "function") {
            sub();
          } else if (sub && typeof sub.unsubscribe === "function") {
            sub.unsubscribe();
          }
        };
      } else if ("then" in obj && typeof obj.then === "function") {
        const currentObj = obj;
        obj.then((val: T) => {
          if (this.#trackedSource === currentObj) {
            this.#latestValue = val;
          }
        });
      } else {
        throw new Error(`InvalidPipeArgument: '${obj}' for pipe 'AsyncPipe'`);
      }
    }
    return this.#latestValue;
  }
}

export const COMMON_PIPES = [
  AsyncPipe,
  UpperCasePipe,
  LowerCasePipe,
  TitleCasePipe,
  SlicePipe,
  JsonPipe,
  KeyValuePipe,
  DecimalPipe,
  PercentPipe,
  CurrencyPipe,
  DatePipe,
  I18nPluralPipe,
  I18nSelectPipe,
] as const;
