/**
 * Host-free Angular platform, browser, transfer-state, sanitizer, bootstrap,
 * decorators, lifecycle, and common pipe primitives backed by the Moonshine reactive and DI graph.
 */
import {
  getOwner,
  onCleanup as domOnCleanup,
} from "@tschk/moonshine-dom/reactive";
import {
  applyInputValue,
  applyQueryValue,
  createEnvironmentInjector,
  DestroyRef,
  effect,
  ENVIRONMENT_INITIALIZER,
  EnvironmentInjector,
  type EnvironmentProviders,
  getCurrentInjector,
  getInputAlias,
  getQueryMetadata,
  HostAttributeToken,
  inject,
  InjectionToken,
  Injector,
  isInputSignal,
  isSignal,
  makeEnvironmentProviders,
  OutputEmitterRef,
  provideEnvironmentInitializer,
  type Provider,
  type ProviderToken,
  runInInjectionContext,
  type Signal,
  signal,
  type Subscribable,
  type Type,
  type Unsubscribable,
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

  bootstrap<C>(
    componentOrFactory: Type<C> | ((props?: any) => any),
  ): ComponentRef<C> {
    if (this.#destroyed) {
      throw new Error("Cannot bootstrap on a destroyed ApplicationRef");
    }
    const ResolvedClass = ((componentOrFactory as any)?.ɵClass ??
      componentOrFactory) as Type<C>;
    let instance!: C;
    runInInjectionContext(this.injector, () => {
      if (
        typeof componentOrFactory === "function" &&
        "ɵClass" in componentOrFactory
      ) {
        try {
          (componentOrFactory as any)({
            __onInstance: (inst: C) => {
              instance = inst;
            },
          });
        } catch {
          if (!instance) {
            instance = instantiateAngularComponent(ResolvedClass as any) as C;
          }
        }
      } else {
        instance = instantiateAngularComponent(ResolvedClass as any) as C;
      }
    });
    const destroyRef = this.injector.get(DestroyRef);
    const ref: ComponentRef<C> = {
      instance,
      componentType: ResolvedClass,
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

// ============================================================================
// Pipe Registry & `applyPipe` Helper
// ============================================================================

const BUILTIN_PIPES: Record<string, PipeTransform> = {
  uppercase: new UpperCasePipe(),
  lowercase: new LowerCasePipe(),
  titlecase: new TitleCasePipe(),
  slice: new SlicePipe(),
  json: new JsonPipe(),
  keyvalue: new KeyValuePipe(),
  number: new DecimalPipe(),
  decimal: new DecimalPipe(),
  percent: new PercentPipe(),
  currency: new CurrencyPipe(),
  date: new DatePipe(),
  i18nPlural: new I18nPluralPipe(),
  i18nSelect: new I18nSelectPipe(),
  async: new AsyncPipe(),
};

const customPipeRegistry = new Map<
  string,
  Type<PipeTransform> | PipeTransform
>();

export function registerPipe(
  name: string,
  pipeClassOrInstance: Type<PipeTransform> | PipeTransform,
): void {
  customPipeRegistry.set(name, pipeClassOrInstance);
}

export function applyPipe(value: any, name: string, ...args: any[]): any {
  const custom = customPipeRegistry.get(name);
  if (custom) {
    if (typeof custom === "function") {
      const inj = getCurrentInjector();
      const instance = inj
        ? runInInjectionContext(inj, () => new custom())
        : new custom();
      return instance.transform(value, ...args);
    }
    return custom.transform(value, ...args);
  }
  const builtin = BUILTIN_PIPES[name];
  if (builtin) {
    return builtin.transform(value, ...args);
  }
  throw new Error(`NG0302: The pipe '${name}' could not be found.`);
}

// ============================================================================
// Decorators, Metadata & Lifecycle Contracts (`@angular/core`)
// ============================================================================

export enum ChangeDetectionStrategy {
  OnPush = 0,
  Default = 1,
}

export enum ViewEncapsulation {
  Emulated = 0,
  None = 2,
  ShadowDom = 3,
}

export interface InputDecoratorConfig {
  alias?: string;
  required?: boolean;
  transform?: (value: any) => any;
}

export interface ComponentInputConfig extends InputDecoratorConfig {
  name: string;
}

export interface ComponentOptions {
  selector?: string;
  template?: string;
  templateUrl?: string;
  styles?: string | string[];
  styleUrl?: string;
  styleUrls?: string[];
  standalone?: boolean;
  imports?: Array<Type<any> | ReadonlyArray<any>>;
  providers?: Array<Provider | EnvironmentProviders>;
  viewProviders?: Array<Provider | EnvironmentProviders>;
  changeDetection?: ChangeDetectionStrategy;
  encapsulation?: ViewEncapsulation;
  inputs?: Array<string | ComponentInputConfig>;
  outputs?: string[];
  host?: Record<string, string>;
  exportAs?: string;
  schemas?: any[];
  preserveWhitespaces?: boolean;
}

export interface DirectiveOptions {
  selector?: string;
  standalone?: boolean;
  inputs?: Array<string | ComponentInputConfig>;
  outputs?: string[];
  providers?: Array<Provider | EnvironmentProviders>;
  host?: Record<string, string>;
  exportAs?: string;
}

export interface PipeOptions {
  name: string;
  standalone?: boolean;
  pure?: boolean;
}

export interface InjectableOptions {
  providedIn?: "root" | "platform" | "any" | Type<any> | null;
  useClass?: Type<any>;
  useFactory?: (...deps: any[]) => any;
  useExisting?: ProviderToken<any>;
  useValue?: any;
  deps?: any[];
}

export function Component(options: ComponentOptions = {}) {
  return function <T extends Type<any>>(target: T, _context?: unknown): T {
    if (Array.isArray(options.imports)) {
      for (const imp of options.imports.flat()) {
        const pipeMeta = (imp as any)?.ɵpipe;
        if (pipeMeta?.name) {
          registerPipe(pipeMeta.name, imp as Type<PipeTransform>);
        }
      }
    }
    Object.defineProperty(target, "ɵcmp", {
      value: {
        ...options,
        standalone: options.standalone ?? true,
        changeDetection:
          options.changeDetection ?? ChangeDetectionStrategy.Default,
        encapsulation: options.encapsulation ?? ViewEncapsulation.Emulated,
        type: target,
      },
      configurable: true,
      writable: true,
    });
    return target;
  };
}

export function Directive(options: DirectiveOptions = {}) {
  return function <T extends Type<any>>(target: T, _context?: unknown): T {
    Object.defineProperty(target, "ɵdir", {
      value: {
        ...options,
        standalone: options.standalone ?? true,
        type: target,
      },
      configurable: true,
      writable: true,
    });
    return target;
  };
}

export function Pipe(options: PipeOptions) {
  return function <T extends Type<PipeTransform>>(
    target: T,
    _context?: unknown,
  ): T {
    const meta = {
      name: options.name,
      standalone: options.standalone ?? true,
      pure: options.pure ?? true,
      type: target,
    };
    Object.defineProperty(target, "ɵpipe", {
      value: meta,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(target, "ɵprov", {
      value: {
        providedIn: "root" as const,
        factory: () => new target(),
      },
      configurable: true,
      writable: true,
    });
    registerPipe(options.name, target);
    return target;
  };
}

export function Injectable(options?: InjectableOptions) {
  return function <T extends Type<any>>(target: T, _context?: unknown): T {
    const providedIn =
      options?.providedIn === undefined ? null : options.providedIn;
    const factory = () => {
      if (options && "useValue" in options) {
        return options.useValue;
      }
      if (options?.useFactory) {
        const deps = (options.deps ?? []).map((d) => inject(d));
        return options.useFactory(...deps);
      }
      if (options?.useExisting) {
        return inject(options.useExisting);
      }
      if (options?.useClass) {
        const Ctor = options.useClass;
        const deps = (options.deps ?? []).map((d) => inject(d));
        return new Ctor(...deps);
      }
      return new target();
    };
    Object.defineProperty(target, "ɵprov", {
      value: {
        providedIn:
          typeof providedIn === "string" || providedIn === null
            ? providedIn
            : "root",
        factory,
      },
      configurable: true,
      writable: true,
    });
    return target;
  };
}

export function Input(aliasOrOptions?: string | InputDecoratorConfig) {
  const cfg: InputDecoratorConfig =
    typeof aliasOrOptions === "string"
      ? { alias: aliasOrOptions }
      : (aliasOrOptions ?? {});
  return function (target: any, propertyKey?: string | symbol | any): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "object" && target !== null ? target.constructor : null;
    if (ctor && propName) {
      const existing = (ctor.ɵinputs ?? {}) as Record<
        string,
        InputDecoratorConfig
      >;
      existing[propName] = cfg;
      ctor.ɵinputs = existing;
    }
  };
}

export function Output(alias?: string) {
  return function (target: any, propertyKey?: string | symbol | any): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "function"
        ? target
        : typeof target === "object" && target !== null
          ? target.constructor
          : null;
    if (ctor && propName) {
      const existing = (ctor.ɵoutputs ?? {}) as Record<string, string>;
      existing[propName] = alias ?? propName;
      ctor.ɵoutputs = existing;
    }
  };
}

export function ViewChild(
  selector: ProviderToken<any> | string,
  opts?: { read?: any; static?: boolean },
) {
  return function (target: any, propertyKey?: string | symbol | any): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "function"
        ? target
        : typeof target === "object" && target !== null
          ? target.constructor
          : null;
    if (ctor && propName) {
      const existing = (ctor.ɵviewQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: true, ...opts };
      ctor.ɵviewQueries = existing;
    }
  };
}

export function ViewChildren(
  selector: ProviderToken<any> | string,
  opts?: { read?: any },
) {
  return function (target: any, propertyKey?: string | symbol | any): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "function"
        ? target
        : typeof target === "object" && target !== null
          ? target.constructor
          : null;
    if (ctor && propName) {
      const existing = (ctor.ɵviewQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: false, ...opts };
      ctor.ɵviewQueries = existing;
    }
  };
}

export function ContentChild(
  selector: ProviderToken<any> | string,
  opts?: { read?: any; descendants?: boolean; static?: boolean },
) {
  return function (target: any, propertyKey?: string | symbol | any): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "function"
        ? target
        : typeof target === "object" && target !== null
          ? target.constructor
          : null;
    if (ctor && propName) {
      const existing = (ctor.ɵcontentQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: true, ...opts };
      ctor.ɵcontentQueries = existing;
    }
  };
}

export function ContentChildren(
  selector: ProviderToken<any> | string,
  opts?: { read?: any; descendants?: boolean },
) {
  return function (target: any, propertyKey?: string | symbol | any): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "function"
        ? target
        : typeof target === "object" && target !== null
          ? target.constructor
          : null;
    if (ctor && propName) {
      const existing = (ctor.ɵcontentQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: false, ...opts };
      ctor.ɵcontentQueries = existing;
    }
  };
}

export function HostBinding(hostPropertyName?: string) {
  return function (target: any, propertyKey?: string | symbol | any): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "function"
        ? target
        : typeof target === "object" && target !== null
          ? target.constructor
          : null;
    if (ctor && propName) {
      const existing = (ctor.ɵhostBindings ?? {}) as Record<string, string>;
      existing[propName] = hostPropertyName ?? propName;
      ctor.ɵhostBindings = existing;
    }
  };
}

export function HostListener(eventName: string, args?: string[]) {
  return function (
    target: any,
    propertyKey?: string | symbol | any,
    _descriptor?: PropertyDescriptor,
  ): void {
    const propName =
      typeof propertyKey === "object" && propertyKey !== null
        ? String(propertyKey.name)
        : String(propertyKey ?? "");
    const ctor =
      typeof target === "function"
        ? target
        : typeof target === "object" && target !== null
          ? target.constructor
          : null;
    if (ctor && propName) {
      const existing = (ctor.ɵhostListeners ?? {}) as Record<
        string,
        { eventName: string; args?: string[] }
      >;
      existing[propName] = { eventName, args };
      ctor.ɵhostListeners = existing;
    }
  };
}

export function Optional() {
  return function (
    _target: any,
    _propertyKey?: string | symbol,
    _parameterIndex?: number,
  ): void {};
}

export function Self() {
  return function (
    _target: any,
    _propertyKey?: string | symbol,
    _parameterIndex?: number,
  ): void {};
}

export function SkipSelf() {
  return function (
    _target: any,
    _propertyKey?: string | symbol,
    _parameterIndex?: number,
  ): void {};
}

export function Host() {
  return function (
    _target: any,
    _propertyKey?: string | symbol,
    _parameterIndex?: number,
  ): void {};
}

export function Inject(_token: any) {
  return function (
    _target: any,
    _propertyKey?: string | symbol,
    _parameterIndex?: number,
  ): void {};
}

export function Attribute(_attributeName: string) {
  return function (
    _target: any,
    _propertyKey?: string | symbol,
    _parameterIndex?: number,
  ): void {};
}

export class EventEmitter<T = any> extends OutputEmitterRef<T> {
  readonly isAsync: boolean;

  constructor(isAsync = false) {
    super();
    this.isAsync = isAsync;
  }

  override emit(value?: T): void {
    if (this.isAsync) {
      queueMicrotask(() => {
        if (!this.destroyed) {
          super.emit(value as T);
        }
      });
    } else {
      super.emit(value as T);
    }
  }

  override subscribe(
    nextOrObserver?:
      | ((value: T) => void)
      | {
          next?: (value: T) => void;
          error?: (err: any) => void;
          complete?: () => void;
        },
    _error?: (error: any) => void,
    _complete?: () => void,
  ): Unsubscribable {
    const callback =
      typeof nextOrObserver === "function"
        ? nextOrObserver
        : (value: T) => nextOrObserver?.next?.(value);
    return super.subscribe(callback);
  }
}

export class SimpleChange<T = any> {
  constructor(
    public previousValue: T,
    public currentValue: T,
    public firstChange: boolean,
  ) {}

  isFirstChange(): boolean {
    return this.firstChange;
  }
}

export type SimpleChanges = Record<string, SimpleChange<any>>;

export interface OnInit {
  ngOnInit(): void;
}

export interface OnDestroy {
  ngOnDestroy(): void;
}

export interface OnChanges {
  ngOnChanges(changes: SimpleChanges): void;
}

export interface DoCheck {
  ngDoCheck(): void;
}

export interface AfterContentInit {
  ngAfterContentInit(): void;
}

export interface AfterContentChecked {
  ngAfterContentChecked(): void;
}

export interface AfterViewInit {
  ngAfterViewInit(): void;
}

export interface AfterViewChecked {
  ngAfterViewChecked(): void;
}

export function booleanAttribute(value: unknown): boolean {
  return typeof value === "boolean"
    ? value
    : value !== null && value !== undefined && value !== "false";
}

export function numberAttribute(value: unknown, fallbackValue = NaN): number {
  const isEmpty = value === null || value === undefined || value === "";
  const num = isEmpty ? NaN : Number(value);
  return Number.isNaN(num) ? fallbackValue : num;
}

const FORWARD_REF_BRAND = Symbol.for("moonshine.angular.forwardRef");

export function forwardRef<T>(forwardRefFn: () => T): Type<any> {
  (forwardRefFn as any)[FORWARD_REF_BRAND] = true;
  return forwardRefFn as unknown as Type<any>;
}

export function resolveForwardRef<T>(type: T): T {
  if (typeof type === "function" && (type as any)[FORWARD_REF_BRAND]) {
    return (type as unknown as () => T)();
  }
  return type;
}

export class Version {
  readonly full: string;
  readonly major: string;
  readonly minor: string;
  readonly patch: string;

  constructor(full: string) {
    this.full = full;
    const parts = full.split("-")[0]!.split(".");
    this.major = parts[0] ?? "0";
    this.minor = parts[1] ?? "0";
    this.patch = parts[2] ?? "0";
  }
}

export const VERSION = new Version("19.0.0-moonshine");

let devModeFlag = true;

export function isDevMode(): boolean {
  return devModeFlag;
}

export function enableProdMode(): void {
  devModeFlag = false;
}

// ============================================================================
// Core Runtime Services (`ElementRef`, `ChangeDetectorRef`, `NgZone`, `ErrorHandler`, `Renderer2`)
// ============================================================================

export class ElementRef<T = any> {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new ElementRef(null),
  };

  nativeElement: T;

  constructor(nativeElement: T = null as unknown as T) {
    this.nativeElement = nativeElement;
  }
}

export class ChangeDetectorRef {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new ChangeDetectorRef(),
  };

  #detached = false;

  markForCheck(): void {}

  detach(): void {
    this.#detached = true;
  }

  reattach(): void {
    this.#detached = false;
  }

  detectChanges(): void {}

  checkNoChanges(): void {}

  get detached(): boolean {
    return this.#detached;
  }
}

export class NgZone {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new NgZone(),
  };

  static isInAngularZone(): boolean {
    return true;
  }

  static assertInAngularZone(): void {}

  static assertNotInAngularZone(): void {}

  readonly hasPendingMicrotasks = false;
  readonly hasPendingMacrotasks = false;
  readonly isStable = true;
  readonly onUnstable = new EventEmitter<any>();
  readonly onMicrotaskEmpty = new EventEmitter<any>();
  readonly onStable = new EventEmitter<any>();
  readonly onError = new EventEmitter<any>();

  run<T>(fn: (...args: any[]) => T, applyThis?: any, applyArgs?: any[]): T {
    return fn.apply(applyThis, applyArgs ?? []);
  }

  runTask<T>(fn: (...args: any[]) => T, applyThis?: any, applyArgs?: any[]): T {
    return fn.apply(applyThis, applyArgs ?? []);
  }

  runGuarded<T>(
    fn: (...args: any[]) => T,
    applyThis?: any,
    applyArgs?: any[],
  ): T {
    try {
      return fn.apply(applyThis, applyArgs ?? []);
    } catch (err) {
      this.onError.emit(err);
      throw err;
    }
  }

  runOutsideAngular<T>(fn: (...args: any[]) => T): T {
    return fn();
  }
}

export class ErrorHandler {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new ErrorHandler(),
  };

  handleError(error: any): void {
    console.error("ERROR", error);
  }
}

export class ApplicationInitStatus {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () =>
      new ApplicationInitStatus(
        inject(APP_INITIALIZER, { optional: true }) ?? [],
      ),
  };

  #done = false;
  readonly donePromise: Promise<any>;

  constructor(
    initializers: ReadonlyArray<() => unknown | Promise<unknown>> = [],
  ) {
    if (initializers.length === 0) {
      this.#done = true;
      this.donePromise = Promise.resolve();
    } else {
      this.donePromise = Promise.all(initializers.map((fn) => fn())).then(
        () => {
          this.#done = true;
        },
      );
    }
  }

  get done(): boolean {
    return this.#done;
  }
}

export enum RendererStyleFlags2 {
  Important = 1,
  DashCase = 2,
}

export class Renderer2 {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new Renderer2(),
  };

  readonly data: { [key: string]: any } = Object.create(null);
  destroyNode: ((node: any) => void) | null = null;

  destroy(): void {}

  createElement(name: string, namespace?: string | null): any {
    if (typeof document !== "undefined") {
      return namespace
        ? document.createElementNS(namespace, name)
        : document.createElement(name);
    }
    return {
      tagName: name.toUpperCase(),
      namespaceURI: namespace ?? null,
      attributes: {} as Record<string, string>,
      style: {} as Record<string, string>,
      classList: new Set<string>(),
      children: [] as any[],
      parentNode: null as any,
    };
  }

  createComment(value: string): any {
    if (typeof document !== "undefined") {
      return document.createComment(value);
    }
    return { nodeType: 8, data: value, parentNode: null };
  }

  createText(value: string): any {
    if (typeof document !== "undefined") {
      return document.createTextNode(value);
    }
    return { nodeType: 3, data: value, parentNode: null };
  }

  appendChild(parent: any, newChild: any): void {
    if (!parent || !newChild) return;
    if (typeof parent.appendChild === "function") {
      parent.appendChild(newChild);
    } else if (Array.isArray(parent.children)) {
      parent.children.push(newChild);
      newChild.parentNode = parent;
    }
  }

  insertBefore(
    parent: any,
    newChild: any,
    refChild: any,
    _isMove?: boolean,
  ): void {
    if (!parent || !newChild) return;
    if (typeof parent.insertBefore === "function") {
      parent.insertBefore(newChild, refChild);
    } else if (Array.isArray(parent.children)) {
      const idx = parent.children.indexOf(refChild);
      if (idx >= 0) {
        parent.children.splice(idx, 0, newChild);
      } else {
        parent.children.push(newChild);
      }
      newChild.parentNode = parent;
    }
  }

  removeChild(parent: any, oldChild: any, _isHostElement?: boolean): void {
    if (!oldChild) return;
    const targetParent = parent ?? oldChild.parentNode;
    if (targetParent && typeof targetParent.removeChild === "function") {
      targetParent.removeChild(oldChild);
    } else if (targetParent && Array.isArray(targetParent.children)) {
      const idx = targetParent.children.indexOf(oldChild);
      if (idx >= 0) targetParent.children.splice(idx, 1);
      oldChild.parentNode = null;
    }
  }

  selectRootElement(
    selectorOrNode: string | any,
    _preserveContent?: boolean,
  ): any {
    if (typeof selectorOrNode === "string" && typeof document !== "undefined") {
      return document.querySelector(selectorOrNode);
    }
    return selectorOrNode;
  }

  parentNode(node: any): any {
    return node?.parentNode ?? null;
  }

  nextSibling(node: any): any {
    return node?.nextSibling ?? null;
  }

  setAttribute(
    el: any,
    name: string,
    value: string,
    namespace?: string | null,
  ): void {
    if (!el) return;
    if (typeof el.setAttribute === "function") {
      if (namespace) {
        el.setAttributeNS(namespace, name, value);
      } else {
        el.setAttribute(name, value);
      }
    } else if (el.attributes) {
      el.attributes[name] = String(value);
    }
  }

  removeAttribute(el: any, name: string, namespace?: string | null): void {
    if (!el) return;
    if (typeof el.removeAttribute === "function") {
      if (namespace) {
        el.removeAttributeNS(namespace, name);
      } else {
        el.removeAttribute(name);
      }
    } else if (el.attributes) {
      delete el.attributes[name];
    }
  }

  addClass(el: any, name: string): void {
    if (!el) return;
    if (el.classList && typeof el.classList.add === "function") {
      el.classList.add(name);
    }
  }

  removeClass(el: any, name: string): void {
    if (!el) return;
    if (el.classList && typeof el.classList.remove === "function") {
      el.classList.remove(name);
    } else if (el.classList && typeof el.classList.delete === "function") {
      el.classList.delete(name);
    }
  }

  setStyle(
    el: any,
    style: string,
    value: any,
    _flags?: RendererStyleFlags2,
  ): void {
    if (!el?.style) return;
    if (typeof el.style.setProperty === "function") {
      el.style.setProperty(style, String(value));
    } else {
      el.style[style] = String(value);
    }
  }

  removeStyle(el: any, style: string, _flags?: RendererStyleFlags2): void {
    if (!el?.style) return;
    if (typeof el.style.removeProperty === "function") {
      el.style.removeProperty(style);
    } else {
      delete el.style[style];
    }
  }

  setProperty(el: any, name: string, value: any): void {
    if (!el) return;
    el[name] = value;
  }

  setValue(node: any, value: string): void {
    if (!node) return;
    if ("nodeValue" in node) {
      node.nodeValue = value;
    } else {
      node.data = value;
    }
  }

  listen(
    target: "window" | "document" | "body" | any,
    eventName: string,
    callback: (event: any) => boolean | void,
  ): () => void {
    const resolvedTarget =
      target === "window" && typeof window !== "undefined"
        ? window
        : target === "document" && typeof document !== "undefined"
          ? document
          : target === "body" && typeof document !== "undefined"
            ? document.body
            : target;
    if (
      resolvedTarget &&
      typeof resolvedTarget.addEventListener === "function"
    ) {
      const handler = (event: any) => {
        const res = callback(event);
        if (res === false && typeof event?.preventDefault === "function") {
          event.preventDefault();
        }
      };
      resolvedTarget.addEventListener(eventName, handler);
      return () => {
        resolvedTarget.removeEventListener(eventName, handler);
      };
    }
    return () => {};
  }
}

export class RendererFactory2 {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new RendererFactory2(),
  };

  createRenderer(_hostElement: any, _type: any): Renderer2 {
    return new Renderer2();
  }
}

export class TemplateRef<C = any> {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new TemplateRef(),
  };

  readonly elementRef: ElementRef;

  constructor(elementRef: ElementRef = new ElementRef(null)) {
    this.elementRef = elementRef;
  }

  createEmbeddedView(context: C, _injector?: Injector): any {
    return {
      context,
      rootNodes: [],
      destroyed: false,
      destroy() {
        this.destroyed = true;
      },
      detectChanges() {},
      markForCheck() {},
    };
  }
}

export class ViewContainerRef {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new ViewContainerRef(),
  };

  readonly #views: any[] = [];

  get length(): number {
    return this.#views.length;
  }

  clear(): void {
    for (const v of this.#views.splice(0)) {
      v?.destroy?.();
    }
  }

  get(index: number): any {
    return this.#views[index] ?? null;
  }

  insert(viewRef: any, index?: number): any {
    if (index === undefined || index >= this.#views.length) {
      this.#views.push(viewRef);
    } else {
      this.#views.splice(index, 0, viewRef);
    }
    return viewRef;
  }

  remove(index?: number): void {
    const targetIdx = index ?? this.#views.length - 1;
    if (targetIdx >= 0 && targetIdx < this.#views.length) {
      const [removed] = this.#views.splice(targetIdx, 1);
      removed?.destroy?.();
    }
  }
}

// ============================================================================
// ============================================================================
// Common Directives & `CommonModule` (`@angular/common`)
// ============================================================================

export class NgIf<T = unknown> {
  static readonly ɵdir = {
    selector: "[ngIf]",
    standalone: true,
    inputs: ["ngIf", "ngIfThen", "ngIfElse"],
  };
  ngIf: T = undefined as unknown as T;
  ngIfThen: TemplateRef<any> | null = null;
  ngIfElse: TemplateRef<any> | null = null;
}

export class NgForOf<T = unknown, U extends Iterable<T> = Iterable<T>> {
  static readonly ɵdir = {
    selector: "[ngFor][ngForOf]",
    standalone: true,
    inputs: ["ngForOf", "ngForTrackBy", "ngForTemplate"],
  };
  ngForOf: U | undefined | null = null;
  ngForTrackBy?: (index: number, item: T) => any;
  ngForTemplate?: TemplateRef<any>;
}

export { NgForOf as NgFor };

export class NgSwitch<T = unknown> {
  static readonly ɵdir = {
    selector: "[ngSwitch]",
    standalone: true,
    inputs: ["ngSwitch"],
  };
  ngSwitch: T = undefined as unknown as T;
}

export class NgSwitchCase<T = unknown> {
  static readonly ɵdir = {
    selector: "[ngSwitchCase]",
    standalone: true,
    inputs: ["ngSwitchCase"],
  };
  ngSwitchCase: T = undefined as unknown as T;
}

export class NgSwitchDefault {
  readonly ɵkind = "NgDirective";
  static readonly ɵdir = {
    selector: "[ngSwitchDefault]",
    standalone: true,
  };
}

export class NgClass {
  static readonly ɵdir = {
    selector: "[ngClass]",
    standalone: true,
    inputs: ["klass", "ngClass"],
  };
  klass = "";
  ngClass:
    | string
    | string[]
    | Set<string>
    | { [klass: string]: any }
    | null
    | undefined = null;
}

export class NgStyle {
  static readonly ɵdir = {
    selector: "[ngStyle]",
    standalone: true,
    inputs: ["ngStyle"],
  };
  ngStyle: { [styleKlim: string]: any } | null | undefined = null;
}

export class NgTemplateOutlet<C = unknown> {
  static readonly ɵdir = {
    selector: "[ngTemplateOutlet]",
    standalone: true,
    inputs: [
      "ngTemplateOutlet",
      "ngTemplateOutletContext",
      "ngTemplateOutletInjector",
    ],
  };
  ngTemplateOutlet: TemplateRef<C> | null = null;
  ngTemplateOutletContext: C | null = null;
  ngTemplateOutletInjector: Injector | null = null;
}

export const COMMON_DIRECTIVES = [
  NgClass,
  NgForOf,
  NgIf,
  NgTemplateOutlet,
  NgStyle,
  NgSwitch,
  NgSwitchCase,
  NgSwitchDefault,
] as const;

export class CommonModule {
  readonly ɵkind = "NgModule";
  static readonly ɵmod = {
    id: "CommonModule",
    declarations: [],
    imports: [...COMMON_DIRECTIVES, ...COMMON_PIPES],
    exports: [...COMMON_DIRECTIVES, ...COMMON_PIPES],
  };
  static readonly exports = [...COMMON_DIRECTIVES, ...COMMON_PIPES];
}

function camelToKebabCss(prop: string): string {
  if (prop.startsWith("--")) return prop;
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function normalizeNgClass(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeNgClass(item))
      .filter(Boolean)
      .join(" ");
  }
  if (value instanceof Set) {
    return Array.from(value)
      .map((item) => normalizeNgClass(item))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof value === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const resolved = isSignal(v) ? (v as Signal<any>)() : v;
      if (resolved) {
        out.push(k.trim());
      }
    }
    return out.filter(Boolean).join(" ");
  }
  return "";
}

export function normalizeNgStyle(
  baseStyle?: Record<string, any> | string | null,
  extraEntries?: Record<string, any> | null,
): string {
  const declarations = new Map<string, string>();
  const applyRawString = (cssText: string) => {
    for (const chunk of cssText.split(";")) {
      const idx = chunk.indexOf(":");
      if (idx > 0) {
        const key = chunk.slice(0, idx).trim();
        const val = chunk.slice(idx + 1).trim();
        if (key && val) declarations.set(key, val);
      }
    }
  };
  const applyEntry = (rawKey: string, rawVal: unknown) => {
    const val = isSignal(rawVal) ? (rawVal as Signal<any>)() : rawVal;
    let propName = rawKey;
    let unit = "";
    const dotIdx = rawKey.indexOf(".");
    if (dotIdx > 0) {
      propName = rawKey.slice(0, dotIdx);
      unit = rawKey.slice(dotIdx + 1);
    }
    const cssProp = camelToKebabCss(propName);
    if (val === null || val === undefined || val === false || val === "") {
      declarations.delete(cssProp);
      return;
    }
    const formatted =
      unit &&
      (typeof val === "number" || /^[-+]?\d+(\.\d+)?$/.test(String(val)))
        ? `${val}${unit}`
        : String(val);
    declarations.set(cssProp, formatted);
  };

  if (typeof baseStyle === "string") {
    applyRawString(baseStyle);
  } else if (baseStyle && typeof baseStyle === "object") {
    for (const [k, v] of Object.entries(baseStyle)) {
      applyEntry(k, v);
    }
  }
  if (extraEntries && typeof extraEntries === "object") {
    for (const [k, v] of Object.entries(extraEntries)) {
      applyEntry(k, v);
    }
  }
  if (declarations.size === 0) return "";
  return Array.from(declarations.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

// ============================================================================
// Component Instantiation, Host Bindings, View Queries & Lifecycle Binding
// ============================================================================

const VIEW_REF_MAP = Symbol.for("moonshine.angular.viewRefMap");
const DEFERRED_VIEW_INIT = Symbol.for("moonshine.angular.deferredViewInit");

/**
 * Registers a template reference variable (`#ref`) or child component on `instance`,
 * updating matching `viewChild()` / `viewChildren()` signal queries and `@ViewChild` / `@ViewChildren` properties.
 */
export function registerViewChild(
  instance: any,
  refName: string,
  target: any,
  elementProps?: Record<string, any> | null,
): any {
  if (!instance || typeof instance !== "object" || !target) {
    return undefined;
  }
  const isComponentInstance = Boolean(
    target &&
    typeof target === "object" &&
    target.constructor &&
    ("ɵcmp" in target.constructor || "ɵdir" in target.constructor),
  );
  if (
    typeof target === "object" &&
    !isComponentInstance &&
    !("nativeElement" in target)
  ) {
    try {
      Object.defineProperty(target, "nativeElement", {
        value: target,
        configurable: true,
        enumerable: false,
      });
      const propsSource = elementProps ?? target.props;
      if (propsSource && typeof propsSource === "object") {
        for (const [pk, pv] of Object.entries(propsSource)) {
          if (!(pk in target) && !pk.startsWith("on:")) {
            Object.defineProperty(target, pk, {
              get: () => (typeof pv === "function" ? pv() : pv),
              configurable: true,
              enumerable: false,
            });
          }
        }
      }
    } catch {
      // Ignore frozen targets
    }
  }

  let refMap = instance[VIEW_REF_MAP] as Map<string, any[]> | undefined;
  if (!refMap) {
    refMap = new Map<string, any[]>();
    Object.defineProperty(instance, VIEW_REF_MAP, {
      value: refMap,
      configurable: true,
      enumerable: false,
    });
  }
  const list = refMap.get(refName) ?? [];
  if (!list.includes(target)) {
    list.push(target);
  }
  refMap.set(refName, list);

  const resolveForRead = (item: any, readToken?: any) => {
    if (readToken === ElementRef) {
      return item instanceof ElementRef ? item : new ElementRef(item);
    }
    if (isComponentInstance) {
      return item;
    }
    return item instanceof ElementRef ? item : new ElementRef(item);
  };

  const matchesLocator = (locator: unknown) => {
    if (typeof locator === "string") {
      return locator
        .split(",")
        .map((s) => s.trim())
        .includes(refName);
    }
    if (typeof locator === "function") {
      const Resolved = (locator as any).ɵClass ?? locator;
      if (target instanceof Resolved || target?.constructor === Resolved) {
        return true;
      }
      if (Resolved === ElementRef && !isComponentInstance) {
        return true;
      }
    }
    return false;
  };

  // Update signal queries (`viewChild` / `viewChildren`)
  for (const key of Object.keys(instance)) {
    const fieldVal = instance[key];
    if (typeof fieldVal === "function") {
      const meta = getQueryMetadata(fieldVal);
      if (meta && matchesLocator(meta.locator)) {
        if (meta.kind === "viewChild" || meta.kind === "contentChild") {
          applyQueryValue(fieldVal, resolveForRead(target, meta.read));
        } else if (
          meta.kind === "viewChildren" ||
          meta.kind === "contentChildren"
        ) {
          const current = (fieldVal() as readonly any[]) ?? [];
          const nextItem = resolveForRead(target, meta.read);
          if (!current.includes(nextItem)) {
            applyQueryValue(fieldVal, [...current, nextItem]);
          }
        }
      }
    }
  }

  // Update decorator queries (`@ViewChild` / `@ViewChildren`)
  const ctor = instance.constructor;
  const viewQueries = (ctor?.ɵviewQueries ?? {}) as Record<
    string,
    { selector: any; first: boolean; read?: any }
  >;
  for (const [propName, q] of Object.entries(viewQueries)) {
    if (matchesLocator(q.selector)) {
      const resolved = resolveForRead(target, q.read);
      if (q.first) {
        instance[propName] = resolved;
      } else {
        const prev = Array.isArray(instance[propName])
          ? instance[propName]
          : [];
        if (!prev.includes(resolved)) {
          instance[propName] = [...prev, resolved];
        }
      }
    }
  }

  return target;
}

export function resolveViewChild(instance: any, refName: string): any {
  const refMap = instance?.[VIEW_REF_MAP] as Map<string, any[]> | undefined;
  return refMap?.get(refName)?.[0];
}

export function completeAngularViewInit<T>(instance: any, root: T): T {
  const runner = instance?.[DEFERRED_VIEW_INIT] as (() => void) | undefined;
  if (typeof runner === "function") {
    delete instance[DEFERRED_VIEW_INIT];
    runner();
  }
  return root;
}

/**
 * Merges component root template props with `@HostBinding`, `@HostListener`, and `@Component({ host })` bindings.
 */
export function mergeAngularHostProps(
  instance: any,
  baseProps?: Record<string, any> | null,
  extraHostProps?: Record<string, any> | null,
): Record<string, any> | null {
  const ctor = instance?.constructor;
  const hostBindings = (ctor?.ɵhostBindings ?? {}) as Record<string, string>;
  const hostListeners = (ctor?.ɵhostListeners ?? {}) as Record<
    string,
    { eventName: string; args?: string[] }
  >;
  const hasHostBindings = Object.keys(hostBindings).length > 0;
  const hasHostListeners = Object.keys(hostListeners).length > 0;
  const hasExtraHost =
    extraHostProps !== null &&
    extraHostProps !== undefined &&
    Object.keys(extraHostProps).length > 0;

  if (!hasHostBindings && !hasHostListeners && !hasExtraHost) {
    return baseProps ?? null;
  }

  const out: Record<string, any> = { ...baseProps };
  const classGetters: Array<() => string> = [];
  const styleGetters: Array<() => Record<string, any> | string | null> = [];

  if (out.class !== undefined) {
    const existingClass = out.class;
    classGetters.push(() =>
      normalizeNgClass(
        typeof existingClass === "function" ? existingClass() : existingClass,
      ),
    );
  }
  if (out.style !== undefined) {
    const existingStyle = out.style;
    styleGetters.push(() =>
      typeof existingStyle === "function" ? existingStyle() : existingStyle,
    );
  }

  const readMemberValue = (propKey: string) => {
    const raw = instance?.[propKey];
    if (isSignal(raw)) return (raw as Signal<any>)();
    return raw;
  };

  const applyHostEntry = (hostTarget: string, readFn: () => any) => {
    const cleaned =
      hostTarget.startsWith("[") && hostTarget.endsWith("]")
        ? hostTarget.slice(1, -1)
        : hostTarget;
    if (cleaned === "class" || cleaned === "ngClass") {
      classGetters.push(() => normalizeNgClass(readFn()));
      return;
    }
    if (cleaned.startsWith("class.")) {
      const clsName = cleaned.slice("class.".length);
      if (clsName) {
        classGetters.push(() => (readFn() ? clsName : ""));
      }
      return;
    }
    if (cleaned === "style" || cleaned === "ngStyle") {
      styleGetters.push(() => readFn());
      return;
    }
    if (cleaned.startsWith("style.")) {
      const styleKey = cleaned.slice("style.".length);
      if (styleKey) {
        styleGetters.push(() => ({ [styleKey]: readFn() }));
      }
      return;
    }
    const attrName = cleaned.startsWith("attr.")
      ? cleaned.slice("attr.".length)
      : cleaned;
    out[attrName] = () => readFn();
  };

  const attachHostListener = (
    eventName: string,
    handler: ($event: any) => any,
  ) => {
    const key = eventName.startsWith("on:") ? eventName : `on:${eventName}`;
    const prev = out[key];
    if (typeof prev === "function") {
      out[key] = ($event: any) => {
        prev($event);
        return handler($event);
      };
    } else {
      out[key] = handler;
    }
  };

  if (hasExtraHost && extraHostProps) {
    for (const [k, v] of Object.entries(extraHostProps)) {
      if (k.startsWith("on:")) {
        if (typeof v === "function") {
          attachHostListener(k, v);
        }
      } else {
        applyHostEntry(k, typeof v === "function" ? v : () => v);
      }
    }
  }

  for (const [propKey, hostProp] of Object.entries(hostBindings)) {
    applyHostEntry(hostProp, () => readMemberValue(propKey));
  }

  for (const [methodKey, listenerMeta] of Object.entries(hostListeners)) {
    const rawEvent = listenerMeta.eventName.includes(":")
      ? listenerMeta.eventName.split(":").slice(1).join(":")
      : listenerMeta.eventName;
    attachHostListener(rawEvent, ($event: any) => {
      const fn = instance?.[methodKey];
      if (typeof fn !== "function") return undefined;
      const argExprs = listenerMeta.args ?? [];
      if (argExprs.length === 0) {
        return fn.call(instance, $event);
      }
      const resolvedArgs = argExprs.map((expr) => {
        const trimmed = expr.trim();
        if (trimmed === "$event") return $event;
        if (trimmed.startsWith("$event.")) {
          const path = trimmed.slice("$event.".length).split(".");
          let cur: any = $event;
          for (const seg of path) cur = cur?.[seg];
          return cur;
        }
        return instance?.[trimmed];
      });
      return fn.apply(instance, resolvedArgs);
    });
  }

  if (classGetters.length > 0) {
    out.class = () =>
      classGetters
        .map((fn) => fn())
        .filter(Boolean)
        .join(" ");
  }

  if (styleGetters.length > 0) {
    out.style = () => {
      let combined = "";
      for (const fn of styleGetters) {
        const piece = fn();
        if (typeof piece === "string") {
          combined = normalizeNgStyle(combined, null);
          const next = normalizeNgStyle(piece, null);
          combined = [combined, next].filter(Boolean).join("; ");
        } else if (piece && typeof piece === "object") {
          combined = normalizeNgStyle(combined, piece);
        }
      }
      return combined;
    };
  }

  return out;
}

/**
 * Instantiates an Angular `@Component` class within an active `EnvironmentInjector`,
 * binds incoming `props` onto `input()`, `model()`, and `@Input()` properties,
 * subscribes `output()`, `model()`, and `@Output()` `OutputEmitterRef` callbacks,
 * and invokes `ngOnChanges`, `ngOnInit`, and `ngOnDestroy`.
 */
export function instantiateAngularComponent<T extends object>(
  ComponentClass: Type<T> | ((props?: any) => any),
  props: Record<string, any> = {},
  hostElement?: any,
  deferViewLifecycle = false,
): T {
  const ResolvedClass = ((ComponentClass as any)?.ɵClass ??
    ComponentClass) as Type<T>;
  const cmpMeta = ((ResolvedClass as any).ɵcmp ??
    (ComponentClass as any).ɵcmp) as ComponentOptions | undefined;
  const parentInjector = getCurrentInjector();
  const componentProviders: Array<Provider | EnvironmentProviders> = [
    ...(cmpMeta?.providers ?? []),
    ...(cmpMeta?.viewProviders ?? []),
  ];
  if (hostElement !== undefined) {
    componentProviders.push({
      provide: ElementRef,
      useValue: new ElementRef(hostElement),
    });
  }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      componentProviders.push({
        provide: new HostAttributeToken(k),
        useValue: String(v),
      });
    }
  }

  const injector =
    componentProviders.length > 0 || !parentInjector
      ? createEnvironmentInjector(
          componentProviders,
          parentInjector,
          ResolvedClass.name || "ComponentInjector",
        )
      : parentInjector;

  const instance = runInInjectionContext(injector, () => new ResolvedClass());
  if (typeof props?.__onInstance === "function") {
    props.__onInstance(instance);
  }
  if (typeof props?.__ngRef === "function") {
    props.__ngRef(instance);
  }
  const destroyRef = injector.get(DestroyRef, null, { optional: true });

  // Bind inputs and outputs from `props`
  const decoratedInputs = ((ResolvedClass as any).ɵinputs ?? {}) as Record<
    string,
    InputDecoratorConfig
  >;
  const decoratedOutputs = ((ResolvedClass as any).ɵoutputs ?? {}) as Record<
    string,
    string
  >;

  const changes: SimpleChanges = {};
  let hasChanges = false;

  const readPropValue = (raw: unknown) => {
    if (isSignal(raw)) {
      return (raw as Signal<any>)();
    }
    return raw;
  };

  for (const key of Object.keys(instance as Record<string, any>)) {
    const fieldVal = (instance as Record<string, any>)[key];

    if (isInputSignal(fieldVal)) {
      const alias = getInputAlias(fieldVal) ?? key;
      const propKey = alias in props ? alias : key in props ? key : undefined;
      if (propKey !== undefined) {
        const descriptor = Object.getOwnPropertyDescriptor(props, propKey);
        const applyOnce = () => {
          const raw = descriptor?.get
            ? descriptor.get.call(props)
            : props[propKey];
          const unwrapped = readPropValue(raw);
          applyInputValue(fieldVal, unwrapped);
          return unwrapped;
        };
        const initial = applyOnce();
        changes[key] = new SimpleChange(undefined, initial, true);
        hasChanges = true;
        if (descriptor?.get || isSignal(props[propKey])) {
          effect(
            () => {
              applyOnce();
            },
            { injector, allowSignalWrites: true },
          );
        }
      }
      if (typeof (fieldVal as any).subscribe === "function") {
        const changeAlias = `${alias}Change`;
        const capChangeAlias =
          changeAlias.charAt(0).toUpperCase() + changeAlias.slice(1);
        const keyChange = `${key}Change`;
        const capKeyChange =
          keyChange.charAt(0).toUpperCase() + keyChange.slice(1);
        const handler =
          props[changeAlias] ??
          props[`on${capChangeAlias}`] ??
          props[keyChange] ??
          props[`on${capKeyChange}`];
        if (typeof handler === "function") {
          const sub = (fieldVal as any).subscribe((val: any) => handler(val));
          destroyRef?.onDestroy(() => sub.unsubscribe());
        }
      }
    }

    if (fieldVal instanceof OutputEmitterRef) {
      const alias = fieldVal.alias ?? decoratedOutputs[key] ?? key;
      const capitalized = alias.charAt(0).toUpperCase() + alias.slice(1);
      const handler =
        props[alias] ??
        props[`on${capitalized}`] ??
        props[key] ??
        props[`on${key.charAt(0).toUpperCase() + key.slice(1)}`];
      if (typeof handler === "function") {
        const sub = fieldVal.subscribe((val: any) => handler(val));
        destroyRef?.onDestroy(() => sub.unsubscribe());
      }
    }
  }

  for (const [propName, inputCfg] of Object.entries(decoratedInputs)) {
    const alias = inputCfg.alias ?? propName;
    const propKey =
      alias in props ? alias : propName in props ? propName : undefined;
    if (propKey !== undefined && !isInputSignal((instance as any)[propName])) {
      const descriptor = Object.getOwnPropertyDescriptor(props, propKey);
      const applyDecorated = () => {
        const raw = descriptor?.get
          ? descriptor.get.call(props)
          : props[propKey];
        const unwrapped = readPropValue(raw);
        const transformed = inputCfg.transform
          ? inputCfg.transform(unwrapped)
          : unwrapped;
        (instance as any)[propName] = transformed;
        return transformed;
      };
      const prev = (instance as any)[propName];
      const transformed = applyDecorated();
      changes[propName] = new SimpleChange(prev, transformed, true);
      hasChanges = true;
      if (descriptor?.get || isSignal(props[propKey])) {
        effect(
          () => {
            applyDecorated();
          },
          { injector, allowSignalWrites: true },
        );
      }
    }
  }

  for (const [propName, outputAlias] of Object.entries(decoratedOutputs)) {
    const fieldVal = (instance as any)[propName];
    if (fieldVal instanceof OutputEmitterRef) continue;
    if (fieldVal && typeof fieldVal.subscribe === "function") {
      const alias = outputAlias || propName;
      const capitalized = alias.charAt(0).toUpperCase() + alias.slice(1);
      const handler =
        props[alias] ??
        props[`on${capitalized}`] ??
        props[propName] ??
        props[`on${propName.charAt(0).toUpperCase() + propName.slice(1)}`];
      if (typeof handler === "function") {
        const sub = fieldVal.subscribe((val: any) => handler(val));
        destroyRef?.onDestroy(() => sub?.unsubscribe?.());
      }
    }
  }

  // Also bind any remaining plain properties passed in props that correspond to decorated/declared inputs in @Component({ inputs: [...] })
  if (Array.isArray(cmpMeta?.inputs)) {
    for (const entry of cmpMeta.inputs) {
      const name = typeof entry === "string" ? entry : entry.name;
      const alias =
        typeof entry === "string" ? entry : (entry.alias ?? entry.name);
      const transform = typeof entry === "object" ? entry.transform : undefined;
      const propKey = alias in props ? alias : name in props ? name : undefined;
      if (
        propKey !== undefined &&
        !isInputSignal((instance as any)[name]) &&
        !(name in changes)
      ) {
        const raw = readPropValue(props[propKey]);
        const nextVal = transform ? transform(raw) : raw;
        const prev = (instance as any)[name];
        (instance as any)[name] = nextVal;
        changes[name] = new SimpleChange(prev, nextVal, true);
        hasChanges = true;
      }
    }
  }

  const anyInstance = instance as Record<string, any>;
  if (hasChanges && typeof anyInstance.ngOnChanges === "function") {
    runInInjectionContext(injector, () => anyInstance.ngOnChanges(changes));
  }
  if (typeof anyInstance.ngOnInit === "function") {
    runInInjectionContext(injector, () => anyInstance.ngOnInit());
  }
  if (typeof anyInstance.ngDoCheck === "function") {
    runInInjectionContext(injector, () => anyInstance.ngDoCheck());
  }
  if (typeof anyInstance.ngAfterContentInit === "function") {
    runInInjectionContext(injector, () => anyInstance.ngAfterContentInit());
  }
  if (typeof anyInstance.ngAfterContentChecked === "function") {
    runInInjectionContext(injector, () => anyInstance.ngAfterContentChecked());
  }

  const runViewInit = () => {
    if (typeof anyInstance.ngAfterViewInit === "function") {
      runInInjectionContext(injector, () => anyInstance.ngAfterViewInit());
    }
    if (typeof anyInstance.ngAfterViewChecked === "function") {
      runInInjectionContext(injector, () => anyInstance.ngAfterViewChecked());
    }
  };

  if (deferViewLifecycle) {
    Object.defineProperty(instance, DEFERRED_VIEW_INIT, {
      value: runViewInit,
      configurable: true,
      enumerable: false,
    });
  } else {
    runViewInit();
  }

  const cleanup = () => {
    if (typeof anyInstance.ngOnDestroy === "function") {
      try {
        anyInstance.ngOnDestroy();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (
      injector !== parentInjector &&
      injector instanceof EnvironmentInjector
    ) {
      injector.destroy();
    }
  };

  if (getOwner()) {
    domOnCleanup(cleanup);
  } else {
    destroyRef?.onDestroy(cleanup);
  }

  return instance;
}
