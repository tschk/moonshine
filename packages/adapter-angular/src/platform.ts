/**
 * Host-free Angular platform, browser, transfer-state, sanitizer, bootstrap,
 * decorators, lifecycle, and common pipe primitives backed by the Moonshine reactive and DI graph.
 */
import {
  createRoot,
  getOwner,
  onCleanup as domOnCleanup,
} from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
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
  readonly ɵrendered?: unknown;
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
    let rendered: unknown;
    const destroyRef = this.injector.get(DestroyRef);
    let rootDispose: (() => void) | undefined;
    const isServer = isPlatformServer(
      this.injector.get(PLATFORM_ID, PLATFORM_BROWSER_ID),
    );
    runInInjectionContext(this.injector, () => {
      if (
        typeof componentOrFactory === "function" &&
        "ɵClass" in componentOrFactory
      ) {
        const invokeFactory = () =>
          createRoot((dispose) => {
            rootDispose = dispose;
            return (componentOrFactory as any)({
              __onInstance: (inst: C) => {
                instance = inst;
              },
            });
          });
        try {
          rendered = isServer
            ? withSSRRendering(invokeFactory)
            : invokeFactory();
        } catch {
          try {
            rendered = withSSRRendering(invokeFactory);
          } catch {
            if (!instance) {
              instance = instantiateAngularComponent(ResolvedClass as any) as C;
            }
          }
        }
      } else {
        instance = instantiateAngularComponent(ResolvedClass as any) as C;
        if (typeof (ResolvedClass as any)?.ɵRender === "function") {
          rendered = (ResolvedClass as any).ɵRender(instance);
        }
      }
    });
    if (rootDispose) {
      destroyRef.onDestroy(rootDispose);
    }
    const ref: ComponentRef<C> = {
      instance,
      componentType: ResolvedClass,
      injector: this.injector,
      destroyRef,
      ɵrendered: rendered,
      destroy: () => {
        rootDispose?.();
        rootDispose = undefined;
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
  rootComponent: Type<C> | ((props?: any) => any),
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

let lastActiveAngularInjector: Injector | null = null;

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
      const currentInj = getCurrentInjector();
      const fallbackInj =
        lastActiveAngularInjector &&
        !(
          lastActiveAngularInjector instanceof EnvironmentInjector &&
          lastActiveAngularInjector.destroyed
        )
          ? lastActiveAngularInjector
          : null;
      const inj = currentInj ?? fallbackInj;
      const pipeMeta = (custom as any).ɵpipe;
      if (inj && pipeMeta?.pure !== false && (custom as any).ɵprov) {
        const instance = inj.get(custom as Type<PipeTransform>);
        return instance.transform(value, ...args);
      }
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

function attachMemberMetadata(
  target: any,
  propertyKey: any,
  applyToCtor: (ctor: any, propName: string) => void,
): any {
  const isStage3 = typeof propertyKey === "object" && propertyKey !== null;
  const propName = isStage3
    ? String(propertyKey.name ?? "")
    : String(propertyKey ?? "");
  if (!propName) return;

  if (isStage3) {
    if (typeof propertyKey.addInitializer === "function") {
      propertyKey.addInitializer(function (this: any) {
        const instanceCtor =
          typeof this === "function" ? this : this?.constructor;
        if (instanceCtor) {
          applyToCtor(instanceCtor, propName);
        }
      });
    }
    if (propertyKey.kind === "field") {
      return function (this: any, initialValue: any) {
        const instanceCtor =
          typeof this === "function" ? this : this?.constructor;
        if (instanceCtor) {
          applyToCtor(instanceCtor, propName);
        }
        return initialValue;
      };
    }
    return;
  }

  const ctor =
    typeof target === "function"
      ? target
      : typeof target === "object" && target !== null
        ? target.constructor
        : null;
  if (ctor) {
    applyToCtor(ctor, propName);
  }
}

export function Input(aliasOrOptions?: string | InputDecoratorConfig) {
  const cfg: InputDecoratorConfig =
    typeof aliasOrOptions === "string"
      ? { alias: aliasOrOptions }
      : (aliasOrOptions ?? {});
  return function (target: any, propertyKey?: string | symbol | any): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵinputs ?? {}) as Record<
        string,
        InputDecoratorConfig
      >;
      existing[propName] = cfg;
      ctor.ɵinputs = existing;
    });
  };
}

export function Output(alias?: string) {
  return function (target: any, propertyKey?: string | symbol | any): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵoutputs ?? {}) as Record<string, string>;
      existing[propName] = alias ?? propName;
      ctor.ɵoutputs = existing;
    });
  };
}

export function ViewChild(
  selector: ProviderToken<any> | string,
  opts?: { read?: any; static?: boolean },
) {
  return function (target: any, propertyKey?: string | symbol | any): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵviewQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: true, ...opts };
      ctor.ɵviewQueries = existing;
    });
  };
}

export function ViewChildren(
  selector: ProviderToken<any> | string,
  opts?: { read?: any },
) {
  return function (target: any, propertyKey?: string | symbol | any): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵviewQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: false, ...opts };
      ctor.ɵviewQueries = existing;
    });
  };
}

export function ContentChild(
  selector: ProviderToken<any> | string,
  opts?: { read?: any; descendants?: boolean; static?: boolean },
) {
  return function (target: any, propertyKey?: string | symbol | any): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵcontentQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: true, ...opts };
      ctor.ɵcontentQueries = existing;
    });
  };
}

export function ContentChildren(
  selector: ProviderToken<any> | string,
  opts?: { read?: any; descendants?: boolean },
) {
  return function (target: any, propertyKey?: string | symbol | any): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵcontentQueries ?? {}) as Record<string, any>;
      existing[propName] = { selector, first: false, ...opts };
      ctor.ɵcontentQueries = existing;
    });
  };
}

export function HostBinding(hostPropertyName?: string) {
  return function (target: any, propertyKey?: string | symbol | any): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵhostBindings ?? {}) as Record<string, string>;
      existing[propName] = hostPropertyName ?? propName;
      ctor.ɵhostBindings = existing;
    });
  };
}

export function HostListener(eventName: string, args?: string[]) {
  return function (
    target: any,
    propertyKey?: string | symbol | any,
    _descriptor?: PropertyDescriptor,
  ): any {
    return attachMemberMetadata(target, propertyKey, (ctor, propName) => {
      const existing = (ctor.ɵhostListeners ?? {}) as Record<
        string,
        { eventName: string; args?: string[] }
      >;
      existing[propName] = { eventName, args };
      ctor.ɵhostListeners = existing;
    });
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

export interface EmbeddedViewRef<C = any> {
  context: C;
  rootNodes: any[];
  readonly destroyed: boolean;
  destroy(): void;
  detectChanges(): void;
  markForCheck(): void;
  onDestroy(callback: () => void): void;
}

export class TemplateRef<C = any> {
  static readonly ɵprov = {
    providedIn: "root" as const,
    factory: () => new TemplateRef(),
  };

  readonly elementRef: ElementRef;
  readonly #renderFn?: (context: C, injector?: Injector) => any;

  constructor(
    elementRefOrRenderFn:
      ElementRef | ((context: C, injector?: Injector) => any) = new ElementRef(
      null,
    ),
    renderFn?: (context: C, injector?: Injector) => any,
  ) {
    if (typeof elementRefOrRenderFn === "function") {
      this.elementRef = new ElementRef(null);
      this.#renderFn = elementRefOrRenderFn;
    } else {
      this.elementRef = elementRefOrRenderFn;
      this.#renderFn = renderFn;
    }
  }

  render(context: C = {} as C, injector?: Injector): any {
    if (!this.#renderFn) return null;
    const effectiveInjector = injector ?? getCurrentInjector();
    if (effectiveInjector) {
      return runInInjectionContext(effectiveInjector, () =>
        this.#renderFn!(context, effectiveInjector),
      );
    }
    return this.#renderFn(context, effectiveInjector);
  }

  createEmbeddedView(
    context: C = {} as C,
    injector?: Injector,
  ): EmbeddedViewRef<C> {
    const rendered = this.render(context, injector);
    const rootNodes =
      rendered === null || rendered === undefined
        ? []
        : Array.isArray(rendered)
          ? rendered
          : [rendered];
    const destroyCallbacks: Array<() => void> = [];
    let isDestroyed = false;
    return {
      context,
      rootNodes,
      get destroyed() {
        return isDestroyed;
      },
      destroy() {
        if (isDestroyed) return;
        isDestroyed = true;
        for (const cb of destroyCallbacks.splice(0)) {
          try {
            cb();
          } catch {
            // Ignore cleanup errors
          }
        }
      },
      detectChanges() {},
      markForCheck() {},
      onDestroy(callback: () => void) {
        if (isDestroyed) {
          callback();
        } else {
          destroyCallbacks.push(callback);
        }
      },
    };
  }
}

export function createAngularTemplateRef<C = any>(
  renderFn: (context: C, injector?: Injector) => any,
): TemplateRef<C>;
export function createAngularTemplateRef<C = any>(
  instance: unknown,
  refNames: string | readonly string[],
  renderFn: (context: C, injector?: Injector) => any,
): TemplateRef<C>;
export function createAngularTemplateRef<C = any>(
  renderFnOrInstance: ((context: C, injector?: Injector) => any) | unknown,
  refNames?: string | readonly string[],
  renderFn?: (context: C, injector?: Injector) => any,
): TemplateRef<C> {
  if (typeof renderFnOrInstance === "function" && renderFn === undefined) {
    return new TemplateRef<C>(
      new ElementRef(null),
      renderFnOrInstance as (context: C, injector?: Injector) => any,
    );
  }
  const tpl = new TemplateRef<C>(new ElementRef(null), renderFn);
  if (
    renderFnOrInstance &&
    typeof renderFnOrInstance === "object" &&
    refNames
  ) {
    const list = Array.isArray(refNames) ? refNames : [refNames];
    for (const name of list) {
      if (name) {
        registerViewChild(renderFnOrInstance, name, tpl);
      }
    }
  }
  return tpl;
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

  createEmbeddedView<C = any>(
    templateRef: TemplateRef<C>,
    context?: C,
    options?: { index?: number; injector?: Injector } | number,
  ): EmbeddedViewRef<C> {
    const idx = typeof options === "number" ? options : options?.index;
    const inj = typeof options === "object" ? options?.injector : undefined;
    const viewRef = templateRef.createEmbeddedView(
      (context ?? ({} as C)) as C,
      inj,
    );
    this.insert(viewRef, idx);
    return viewRef;
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

// ============================================================================
// `NgOptimizedImage` & Image Loaders (`@angular/common`)
// ============================================================================

export interface ImageConfig {
  breakpoints?: number[];
  disableOptimizedSrcset?: boolean;
  placeholderResolution?: number;
}

export const DEFAULT_IMAGE_CONFIG: Required<ImageConfig> = {
  breakpoints: [
    16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
    3840,
  ],
  disableOptimizedSrcset: false,
  placeholderResolution: 30,
};

export const IMAGE_CONFIG = new InjectionToken<ImageConfig>("IMAGE_CONFIG", {
  providedIn: "root",
  factory: () => DEFAULT_IMAGE_CONFIG,
});

export interface ImageLoaderConfig {
  src: string;
  width?: number;
  loaderParams?: Record<string, any>;
  isPlaceholder?: boolean;
}

export type ImageLoader = (config: ImageLoaderConfig) => string;

export interface ImageLoaderInfo {
  path: string;
  placeholder?: boolean;
}

export const defaultImageLoader: ImageLoader = (config: ImageLoaderConfig) =>
  config.src;

export const IMAGE_LOADER = new InjectionToken<ImageLoader>("ImageLoader", {
  providedIn: "root",
  factory: () => defaultImageLoader,
});

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, "");
}

function trimLeadingSlash(src: string): string {
  return src.replace(/^\/+/, "");
}

export function provideImgixLoader(path: string): Provider[] {
  const base = trimTrailingSlash(path);
  const loader: ImageLoader = (config: ImageLoaderConfig) => {
    const cleanSrc = trimLeadingSlash(config.src);
    const params = new URLSearchParams();
    params.set("auto", "format");
    if (config.width) {
      params.set("w", String(config.width));
    }
    if (config.isPlaceholder) {
      params.set("q", "20");
      params.set("blur", "15");
    }
    if (config.loaderParams) {
      for (const [k, v] of Object.entries(config.loaderParams)) {
        if (v !== undefined && v !== null) {
          params.set(k, String(v));
        }
      }
    }
    return `${base}/${cleanSrc}?${params.toString()}`;
  };
  return [{ provide: IMAGE_LOADER, useValue: loader }];
}

export function provideCloudinaryLoader(path: string): Provider[] {
  const base = trimTrailingSlash(path);
  const loader: ImageLoader = (config: ImageLoaderConfig) => {
    const cleanSrc = trimLeadingSlash(config.src);
    const transforms = [
      "f_auto",
      config.isPlaceholder ? "q_auto:low" : "q_auto",
    ];
    if (config.width) {
      transforms.push(`w_${config.width}`);
    }
    if (config.loaderParams?.rounded) {
      transforms.push("r_max");
    }
    return `${base}/${transforms.join(",")}/${cleanSrc}`;
  };
  return [{ provide: IMAGE_LOADER, useValue: loader }];
}

export function provideCloudflareLoader(path: string): Provider[] {
  const base = trimTrailingSlash(path);
  const loader: ImageLoader = (config: ImageLoaderConfig) => {
    const cleanSrc = trimLeadingSlash(config.src);
    const opts = ["format=auto"];
    if (config.width) {
      opts.push(`width=${config.width}`);
    }
    if (config.isPlaceholder) {
      opts.push("quality=20");
    }
    return `${base}/cdn-cgi/image/${opts.join(",")}/${cleanSrc}`;
  };
  return [{ provide: IMAGE_LOADER, useValue: loader }];
}

export function provideNetlifyLoader(path?: string): Provider[] {
  const base = path ? trimTrailingSlash(path) : "";
  const loader: ImageLoader = (config: ImageLoaderConfig) => {
    const srcParam = config.src.startsWith("/") ? config.src : `/${config.src}`;
    const params = new URLSearchParams();
    params.set("url", srcParam);
    if (config.width) {
      params.set("w", String(config.width));
    }
    if (config.isPlaceholder) {
      params.set("q", "20");
    }
    return `${base}/.netlify/images?${params.toString()}`;
  };
  return [{ provide: IMAGE_LOADER, useValue: loader }];
}

export interface ImagePlaceholderConfig {
  blur?: boolean;
}

export class NgOptimizedImage {
  static readonly ɵdir = {
    selector: "img[ngSrc]",
    standalone: true,
    inputs: [
      "ngSrc",
      "ngSrcset",
      "sizes",
      "width",
      "height",
      "loading",
      "priority",
      "loaderParams",
      "disableOptimizedSrcset",
      "fill",
      "placeholder",
      "placeholderConfig",
    ],
  };

  ngSrc = "";
  ngSrcset?: string;
  sizes?: string;
  width?: number | string;
  height?: number | string;
  loading?: "lazy" | "eager" | "auto";
  priority = false;
  loaderParams?: Record<string, any>;
  disableOptimizedSrcset = false;
  fill = false;
  placeholder?: string | boolean;
  placeholderConfig?: ImagePlaceholderConfig;
}

export interface NgOptimizedImageBindingConfig {
  ngSrc: () => unknown;
  ngSrcset?: () => unknown;
  sizes?: () => unknown;
  width?: () => unknown;
  height?: () => unknown;
  loading?: () => unknown;
  priority?: () => unknown;
  fill?: () => unknown;
  loaderParams?: () => Record<string, any> | undefined;
  disableOptimizedSrcset?: () => unknown;
  placeholder?: () => unknown;
  placeholderConfig?: () => ImagePlaceholderConfig | undefined;
}

function readMaybeSignal(value: unknown): any {
  if (isSignal(value)) {
    return (value as Signal<any>)();
  }
  return value;
}

export function resolveNgOptimizedImageProps(
  instance: any,
  config: NgOptimizedImageBindingConfig,
  baseProps?: Record<string, any> | null,
): Record<string, any> {
  const injector = getAngularInstanceInjector(instance) ?? getCurrentInjector();
  const loader =
    injector?.get(IMAGE_LOADER, defaultImageLoader, { optional: true }) ??
    defaultImageLoader;
  const imgConfig: Required<ImageConfig> = {
    ...DEFAULT_IMAGE_CONFIG,
    ...(injector?.get(IMAGE_CONFIG, DEFAULT_IMAGE_CONFIG, { optional: true }) ??
      DEFAULT_IMAGE_CONFIG),
  };

  const out: Record<string, any> = { ...baseProps };

  const resolveNumber = (raw: unknown): number | undefined => {
    const val = readMaybeSignal(raw);
    if (val === undefined || val === null || val === "") return undefined;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const resolveBool = (raw: unknown): boolean => {
    const val = readMaybeSignal(raw);
    return val === "" || Boolean(val && val !== "false");
  };

  const getWidth = () => {
    if (config.width) return resolveNumber(config.width());
    if (baseProps && "width" in baseProps) {
      const bp =
        typeof baseProps.width === "function"
          ? baseProps.width()
          : baseProps.width;
      return resolveNumber(bp);
    }
    return undefined;
  };

  const getHeight = () => {
    if (config.height) return resolveNumber(config.height());
    if (baseProps && "height" in baseProps) {
      const bp =
        typeof baseProps.height === "function"
          ? baseProps.height()
          : baseProps.height;
      return resolveNumber(bp);
    }
    return undefined;
  };

  const getPriority = () =>
    config.priority ? resolveBool(config.priority()) : false;
  const getFill = () => (config.fill ? resolveBool(config.fill()) : false);
  const getLoaderParams = () =>
    config.loaderParams ? readMaybeSignal(config.loaderParams()) : undefined;

  out["ng-img"] = "true";

  out.src = () => {
    const rawSrc = String(readMaybeSignal(config.ngSrc()) ?? "");
    if (!rawSrc) return "";
    return loader({
      src: rawSrc,
      width: getWidth(),
      loaderParams: getLoaderParams(),
    });
  };

  out.srcset = () => {
    const rawSrc = String(readMaybeSignal(config.ngSrc()) ?? "");
    if (!rawSrc) return undefined;
    const disabled =
      (config.disableOptimizedSrcset
        ? resolveBool(config.disableOptimizedSrcset())
        : false) || imgConfig.disableOptimizedSrcset;
    if (disabled) return undefined;

    const explicitSrcset = config.ngSrcset
      ? String(readMaybeSignal(config.ngSrcset()) ?? "").trim()
      : "";
    const loaderParams = getLoaderParams();
    const baseWidth = getWidth();

    if (explicitSrcset) {
      const parts = explicitSrcset
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const built: string[] = [];
      for (const part of parts) {
        if (part.endsWith("w")) {
          const w = Number.parseInt(part.slice(0, -1), 10);
          if (Number.isFinite(w) && w > 0) {
            built.push(
              `${loader({ src: rawSrc, width: w, loaderParams })} ${w}w`,
            );
          }
        } else if (part.endsWith("x")) {
          const density = Number.parseFloat(part.slice(0, -1));
          const w =
            baseWidth && Number.isFinite(density)
              ? Math.round(baseWidth * density)
              : undefined;
          built.push(
            `${loader({ src: rawSrc, width: w, loaderParams })} ${part}`,
          );
        }
      }
      return built.length > 0 ? built.join(", ") : undefined;
    }

    if (loader === defaultImageLoader) {
      return undefined;
    }

    const sizesVal = config.sizes
      ? readMaybeSignal(config.sizes())
      : baseProps?.sizes;
    const isResponsive = Boolean(sizesVal) || getFill();
    if (isResponsive) {
      const bps = imgConfig.breakpoints ?? DEFAULT_IMAGE_CONFIG.breakpoints;
      return bps
        .map(
          (bp) => `${loader({ src: rawSrc, width: bp, loaderParams })} ${bp}w`,
        )
        .join(", ");
    }

    if (baseWidth) {
      const url1x = loader({ src: rawSrc, width: baseWidth, loaderParams });
      const url2x = loader({ src: rawSrc, width: baseWidth * 2, loaderParams });
      return `${url1x} 1x, ${url2x} 2x`;
    }

    return undefined;
  };

  if (config.width || (baseProps && "width" in baseProps)) {
    out.width = () => (getFill() ? undefined : getWidth());
  }
  if (config.height || (baseProps && "height" in baseProps)) {
    out.height = () => (getFill() ? undefined : getHeight());
  }

  out.sizes = () => {
    const rawSizes = config.sizes
      ? readMaybeSignal(config.sizes())
      : typeof baseProps?.sizes === "function"
        ? baseProps.sizes()
        : baseProps?.sizes;
    if (rawSizes) return String(rawSizes);
    if (getFill()) return "100vw";
    return undefined;
  };

  out.loading = () => {
    if (config.loading) {
      const explicit = readMaybeSignal(config.loading());
      if (explicit) return String(explicit);
    }
    return getPriority() ? "eager" : "lazy";
  };

  out.fetchpriority = () => (getPriority() ? "high" : "auto");
  out.decoding = () => (getPriority() ? "sync" : "async");

  const existingStyle = out.style;
  if (config.fill || config.placeholder || existingStyle !== undefined) {
    out.style = () => {
      const baseSt =
        typeof existingStyle === "function" ? existingStyle() : existingStyle;
      const extra: Record<string, any> = {};
      if (getFill()) {
        extra.position = "absolute";
        extra.width = "100%";
        extra.height = "100%";
        extra.inset = "0px";
      }
      if (config.placeholder) {
        const ph = readMaybeSignal(config.placeholder());
        const rawSrc = String(readMaybeSignal(config.ngSrc()) ?? "");
        if (ph) {
          const bgUrl =
            typeof ph === "string" &&
            (ph.startsWith("data:") ||
              ph.startsWith("http") ||
              ph.startsWith("/"))
              ? ph
              : loader({
                  src: rawSrc,
                  width: imgConfig.placeholderResolution,
                  loaderParams: getLoaderParams(),
                  isPlaceholder: true,
                });
          extra["background-size"] = "cover";
          extra["background-position"] = "50% 50%";
          extra["background-repeat"] = "no-repeat";
          extra["background-image"] = `url(${bgUrl})`;
          const phCfg = config.placeholderConfig
            ? readMaybeSignal(config.placeholderConfig())
            : undefined;
          if (phCfg?.blur !== false) {
            extra.filter = "blur(15px)";
          }
        }
      }
      const merged = normalizeNgStyle(baseSt, extra);
      return merged || undefined;
    };
  }

  return out;
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
  NgOptimizedImage,
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
const DEFERRED_NG_REF = Symbol.for("moonshine.angular.deferredNgRef");
const INSTANCE_INJECTOR = Symbol.for("moonshine.angular.instanceInjector");
const NG_REF_NAMES = Symbol.for("moonshine.angular.refNames");
const NG_COMPONENT_INSTANCE = Symbol.for("moonshine.angular.componentInstance");
const NG_DIRECTIVE_INSTANCES = Symbol.for(
  "moonshine.angular.directiveInstances",
);
const NG_HOST_ELEMENT = Symbol.for("moonshine.angular.hostElement");
const PENDING_DIRECTIVES = Symbol.for("moonshine.angular.pendingDirectives");

export function getAngularInstanceInjector(
  instance: any,
): Injector | undefined {
  return instance?.[INSTANCE_INJECTOR] as Injector | undefined;
}

function addRefNameMeta(target: any, refName: string): void {
  if (!target || typeof target !== "object" || !refName) return;
  let refs = target[NG_REF_NAMES] as Set<string> | undefined;
  if (!refs) {
    refs = new Set<string>();
    try {
      Object.defineProperty(target, NG_REF_NAMES, {
        value: refs,
        configurable: true,
        enumerable: false,
      });
    } catch {
      return;
    }
  }
  refs.add(refName);
}

function addDirectiveInstanceMeta(target: any, dirInstance: any): void {
  if (!target || typeof target !== "object" || !dirInstance) return;
  let dirs = target[NG_DIRECTIVE_INSTANCES] as Set<any> | undefined;
  if (!dirs) {
    dirs = new Set<any>();
    try {
      Object.defineProperty(target, NG_DIRECTIVE_INSTANCES, {
        value: dirs,
        configurable: true,
        enumerable: false,
      });
    } catch {
      return;
    }
  }
  dirs.add(dirInstance);
}

function resolveQueryReadValue(
  matchedTarget: any,
  hostNode: any,
  readToken?: any,
): any {
  const isTemplateRef = matchedTarget instanceof TemplateRef;
  const isCompOrDir = Boolean(
    matchedTarget &&
    typeof matchedTarget === "object" &&
    matchedTarget.constructor &&
    ("ɵcmp" in matchedTarget.constructor ||
      "ɵdir" in matchedTarget.constructor),
  );
  const effectiveNode =
    hostNode ??
    (matchedTarget && typeof matchedTarget === "object"
      ? matchedTarget[NG_HOST_ELEMENT]
      : undefined) ??
    matchedTarget;

  if (readToken === TemplateRef) {
    return isTemplateRef ? matchedTarget : undefined;
  }
  if (readToken === ElementRef) {
    if (isTemplateRef) return matchedTarget.elementRef;
    if (matchedTarget instanceof ElementRef) return matchedTarget;
    return effectiveNode instanceof ElementRef
      ? effectiveNode
      : new ElementRef(effectiveNode);
  }
  if (readToken === ViewContainerRef) {
    return (
      getAngularInstanceInjector(matchedTarget)?.get(ViewContainerRef, null, {
        optional: true,
      }) ?? new ViewContainerRef()
    );
  }
  if (
    readToken !== undefined &&
    (typeof readToken === "function" || readToken instanceof InjectionToken)
  ) {
    const ResolvedRead = (readToken as any).ɵClass ?? readToken;
    if (
      typeof ResolvedRead === "function" &&
      (matchedTarget instanceof ResolvedRead ||
        matchedTarget?.constructor === ResolvedRead)
    ) {
      return matchedTarget;
    }
    const compInst = effectiveNode?.[NG_COMPONENT_INSTANCE];
    if (
      typeof ResolvedRead === "function" &&
      compInst &&
      (compInst instanceof ResolvedRead ||
        compInst.constructor === ResolvedRead)
    ) {
      return compInst;
    }
    const dirSet = (effectiveNode?.[NG_DIRECTIVE_INSTANCES] ??
      matchedTarget?.[NG_DIRECTIVE_INSTANCES]) as Set<any> | undefined;
    if (typeof ResolvedRead === "function" && dirSet) {
      for (const d of dirSet) {
        if (d instanceof ResolvedRead || d?.constructor === ResolvedRead) {
          return d;
        }
      }
    }
    const inj =
      getAngularInstanceInjector(matchedTarget) ??
      getAngularInstanceInjector(compInst);
    if (inj) {
      const fromInj = inj.get(readToken, null, { optional: true });
      if (fromInj !== null && fromInj !== undefined) {
        return fromInj;
      }
    }
    return undefined;
  }
  if (isTemplateRef || isCompOrDir) {
    return matchedTarget;
  }
  return matchedTarget instanceof ElementRef
    ? matchedTarget
    : new ElementRef(matchedTarget);
}

/**
 * Registers a template reference variable (`#ref`) or child component/directive on `instance`,
 * updating matching `viewChild()` / `viewChildren()` signal queries and `@ViewChild` / `@ViewChildren` properties.
 */
export function registerViewChild(
  instance: any,
  refName: string,
  target: any,
  elementProps?: Record<string, any> | null,
): any {
  if (!instance || typeof instance !== "object" || !target) {
    return target;
  }
  const isTemplateRef = target instanceof TemplateRef;
  const isComponentInstance = Boolean(
    target &&
    typeof target === "object" &&
    target.constructor &&
    ("ɵcmp" in target.constructor || "ɵdir" in target.constructor),
  );
  if (
    typeof target === "object" &&
    !isComponentInstance &&
    !isTemplateRef &&
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

  if (
    elementProps &&
    typeof elementProps === "object" &&
    PENDING_DIRECTIVES in elementProps
  ) {
    const pendingDirs = (elementProps as any)[PENDING_DIRECTIVES] as
      any[] | undefined;
    if (Array.isArray(pendingDirs)) {
      for (const dirInst of pendingDirs) {
        addDirectiveInstanceMeta(target, dirInst);
        try {
          Object.defineProperty(dirInst, NG_HOST_ELEMENT, {
            value: target,
            configurable: true,
            enumerable: false,
          });
        } catch {
          // Ignore frozen directive instances
        }
        const dirInj = getAngularInstanceInjector(dirInst);
        const dirElRef = dirInj?.get(ElementRef, null, { optional: true });
        if (dirElRef && typeof dirElRef === "object") {
          (dirElRef as { nativeElement: any }).nativeElement = target;
        }
        registerViewChild(instance, "", dirInst);
      }
    }
  }

  if (refName) {
    addRefNameMeta(target, refName);
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
  }

  const matchesLocator = (locator: unknown) => {
    if (typeof locator === "string") {
      if (!refName) return false;
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
      if (
        Resolved === ElementRef &&
        !isComponentInstance &&
        !isTemplateRef &&
        Boolean(refName)
      ) {
        return true;
      }
      if (Resolved === TemplateRef && isTemplateRef) {
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
        if (meta.kind === "viewChild") {
          const resolved = resolveQueryReadValue(target, undefined, meta.read);
          if (resolved !== undefined) {
            applyQueryValue(fieldVal, resolved);
          }
        } else if (meta.kind === "viewChildren") {
          const current = (fieldVal() as readonly any[]) ?? [];
          const nextItem = resolveQueryReadValue(target, undefined, meta.read);
          if (nextItem !== undefined && !current.includes(nextItem)) {
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
      const resolved = resolveQueryReadValue(target, undefined, q.read);
      if (resolved === undefined) continue;
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

function collectProjectedQueryNodes(
  children: unknown,
  descendants: boolean,
  out: any[] = [],
): any[] {
  if (
    children === null ||
    children === undefined ||
    typeof children === "boolean" ||
    typeof children === "string" ||
    typeof children === "number"
  ) {
    return out;
  }
  if (
    typeof children === "function" &&
    !isSignal(children) &&
    !("ɵcmp" in children) &&
    !("ɵdir" in children) &&
    children.length === 0
  ) {
    try {
      return collectProjectedQueryNodes(children(), descendants, out);
    } catch {
      return out;
    }
  }
  if (Array.isArray(children)) {
    for (const item of children) {
      collectProjectedQueryNodes(item, descendants, out);
    }
    return out;
  }
  if (typeof children === "object") {
    out.push(children);
    if (descendants) {
      const anyNode = children as any;
      if (Array.isArray(anyNode.children)) {
        for (const c of anyNode.children) {
          collectProjectedQueryNodes(c, true, out);
        }
      } else if (
        anyNode.childNodes &&
        Symbol.iterator in Object(anyNode.childNodes)
      ) {
        for (const c of anyNode.childNodes as Iterable<any>) {
          collectProjectedQueryNodes(c, true, out);
        }
      }
    }
  }
  return out;
}

function matchProjectedNodeForQuery(
  node: any,
  locator: unknown,
  readToken?: any,
): any[] {
  if (!node || typeof node !== "object") return [];
  const results: any[] = [];
  const compInst =
    node[NG_COMPONENT_INSTANCE] ??
    (node.constructor &&
    ("ɵcmp" in node.constructor || "ɵdir" in node.constructor)
      ? node
      : undefined);
  const dirSet = node[NG_DIRECTIVE_INSTANCES] as Set<any> | undefined;
  const nodeRefs = node[NG_REF_NAMES] as Set<string> | undefined;

  if (typeof locator === "string") {
    const names = locator
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (dirSet) {
      for (const dir of dirSet) {
        const dirRefs = dir?.[NG_REF_NAMES] as Set<string> | undefined;
        if (dirRefs && names.some((n) => dirRefs.has(n))) {
          const resolved = resolveQueryReadValue(dir, node, readToken);
          if (resolved !== undefined) results.push(resolved);
        }
      }
    }
    if (
      results.length === 0 &&
      nodeRefs &&
      names.some((n) => nodeRefs.has(n))
    ) {
      const primary = compInst ?? node;
      const resolved = resolveQueryReadValue(primary, node, readToken);
      if (resolved !== undefined) results.push(resolved);
    }
    return results;
  }

  if (typeof locator === "function") {
    const Resolved = (locator as any).ɵClass ?? locator;
    if (
      compInst &&
      (compInst instanceof Resolved || compInst.constructor === Resolved)
    ) {
      const resolved = resolveQueryReadValue(compInst, node, readToken);
      if (resolved !== undefined) results.push(resolved);
    }
    if (dirSet) {
      for (const dir of dirSet) {
        if (dir instanceof Resolved || dir?.constructor === Resolved) {
          const resolved = resolveQueryReadValue(dir, node, readToken);
          if (resolved !== undefined && !results.includes(resolved)) {
            results.push(resolved);
          }
        }
      }
    }
    if (
      results.length === 0 &&
      Resolved === ElementRef &&
      !(node instanceof TemplateRef)
    ) {
      const resolved = resolveQueryReadValue(
        node,
        node,
        readToken ?? ElementRef,
      );
      if (resolved !== undefined) results.push(resolved);
    }
    if (
      results.length === 0 &&
      Resolved === TemplateRef &&
      node instanceof TemplateRef
    ) {
      const resolved = resolveQueryReadValue(
        node,
        node,
        readToken ?? TemplateRef,
      );
      if (resolved !== undefined) results.push(resolved);
    }
    if (results.length === 0 && compInst) {
      const compInj = getAngularInstanceInjector(compInst);
      const fromInj = compInj?.get(locator as any, null, { optional: true });
      if (fromInj !== null && fromInj !== undefined) {
        const resolved =
          readToken !== undefined
            ? resolveQueryReadValue(compInst, node, readToken)
            : fromInj;
        if (resolved !== undefined) results.push(resolved);
      }
    }
    return results;
  }

  if (locator instanceof InjectionToken && compInst) {
    const compInj = getAngularInstanceInjector(compInst);
    const fromInj = compInj?.get(locator, null, { optional: true });
    if (fromInj !== null && fromInj !== undefined) {
      const resolved =
        readToken !== undefined
          ? resolveQueryReadValue(compInst, node, readToken)
          : fromInj;
      if (resolved !== undefined) results.push(resolved);
    }
  }

  return results;
}

/**
 * Resolves `contentChild`, `contentChild.required`, `contentChildren`, `@ContentChild`,
 * and `@ContentChildren` queries on `instance` against projected `children` prior to `ngAfterContentInit`.
 */
export function resolveAngularContentQueries(
  instance: any,
  children: unknown,
): void {
  if (!instance || typeof instance !== "object") return;

  for (const key of Object.keys(instance)) {
    const fieldVal = instance[key];
    if (typeof fieldVal === "function") {
      const meta = getQueryMetadata(fieldVal);
      if (
        meta &&
        (meta.kind === "contentChild" || meta.kind === "contentChildren")
      ) {
        const descendants =
          meta.descendants ?? meta.kind === "contentChild";
        const nodes = collectProjectedQueryNodes(children, descendants);
        const matched: any[] = [];
        for (const node of nodes) {
          for (const item of matchProjectedNodeForQuery(
            node,
            meta.locator,
            meta.read,
          )) {
            if (!matched.includes(item)) {
              matched.push(item);
            }
          }
          if (meta.kind === "contentChild" && matched.length > 0) {
            break;
          }
        }
        if (meta.kind === "contentChild") {
          if (matched.length > 0) {
            applyQueryValue(fieldVal, matched[0]);
          }
        } else {
          applyQueryValue(fieldVal, matched);
        }
      }
    }
  }

  const ctor = instance.constructor;
  const contentQueries = (ctor?.ɵcontentQueries ?? {}) as Record<
    string,
    { selector: any; first: boolean; read?: any; descendants?: boolean }
  >;
  for (const [propName, q] of Object.entries(contentQueries)) {
    const descendants = q.descendants ?? !!q.first;
    const nodes = collectProjectedQueryNodes(children, descendants);
    const matched: any[] = [];
    for (const node of nodes) {
      for (const item of matchProjectedNodeForQuery(node, q.selector, q.read)) {
        if (!matched.includes(item)) {
          matched.push(item);
        }
      }
      if (q.first && matched.length > 0) {
        break;
      }
    }
    if (q.first) {
      if (matched.length > 0) {
        instance[propName] = matched[0];
      }
    } else {
      instance[propName] = matched;
    }
  }
}

export function resolveViewChild(instance: any, refName: string): any {
  const refMap = instance?.[VIEW_REF_MAP] as Map<string, any[]> | undefined;
  return refMap?.get(refName)?.[0];
}

function readMaybeGetterOrSignal(value: unknown): any {
  if (typeof value === "function") {
    return (value as () => any)();
  }
  return readMaybeSignal(value);
}

/**
 * Renders a `TemplateRef` (or resolves a `#ref` name on `instance`) with optional
 * `$implicit` / named context variables and custom `Injector` for `[ngTemplateOutlet]` and `*ngTemplateOutlet`.
 */
export function renderNgTemplateOutlet(
  instanceOrTemplate: any,
  templateRefOrContext?: unknown,
  contextOrInjector?: Record<string, any> | Injector | null,
  maybeInjector?: Injector | null,
): any {
  let instance: any;
  let templateRefOrName: unknown;
  let context: unknown;
  let injector: unknown;

  if (
    instanceOrTemplate === null ||
    instanceOrTemplate === undefined ||
    instanceOrTemplate instanceof TemplateRef ||
    typeof instanceOrTemplate === "function"
  ) {
    instance = null;
    templateRefOrName = instanceOrTemplate;
    context = templateRefOrContext;
    injector = contextOrInjector;
  } else {
    instance = instanceOrTemplate;
    templateRefOrName = templateRefOrContext;
    context = contextOrInjector;
    injector = maybeInjector;
  }

  let rawTpl = readMaybeGetterOrSignal(templateRefOrName);
  const tpl =
    typeof rawTpl === "string" ? resolveViewChild(instance, rawTpl) : rawTpl;
  if (!tpl) return null;
  const rawCtx = (readMaybeGetterOrSignal(context) ?? {}) as Record<
    string,
    any
  >;
  const rawInj =
    (readMaybeGetterOrSignal(injector) as Injector | null | undefined) ??
    getAngularInstanceInjector(instance) ??
    getCurrentInjector();
  if (tpl instanceof TemplateRef) {
    return tpl.render(rawCtx, rawInj);
  }
  if (typeof tpl === "function") {
    const res = rawInj
      ? runInInjectionContext(rawInj, () => tpl(rawCtx, rawInj))
      : tpl(rawCtx, rawInj);
    if (res instanceof TemplateRef) {
      return res.render(rawCtx, rawInj);
    }
    return res;
  }
  return null;
}

interface ParsedElementDescriptor {
  tagName: string;
  attributes: Map<string, string>;
  classes: Set<string>;
}

function inspectProjectedNode(node: unknown): ParsedElementDescriptor | null {
  const resolved =
    typeof node === "function" ? (node as () => unknown)() : node;
  if (!resolved || typeof resolved !== "object") return null;

  // DOM Element or virtual { tag / tagName, props / attributes } check
  const rawTag =
    typeof (resolved as any).tagName === "string"
      ? (resolved as any).tagName
      : typeof (resolved as any).tag === "string"
        ? (resolved as any).tag
        : null;
  if (rawTag) {
    const el = resolved as any;
    const tagName = String(rawTag).toLowerCase();
    const attributes = new Map<string, string>();
    const classes = new Set<string>();
    const applyAttrObj = (obj: Record<string, any>) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v === false || v === null || v === undefined) continue;
        const lowerKey = k.toLowerCase();
        const strVal = v === true ? "" : String(v);
        attributes.set(lowerKey, strVal);
        if (lowerKey === "class" || lowerKey === "classname") {
          for (const c of strVal.split(/\s+/).filter(Boolean)) {
            classes.add(c);
          }
        }
      }
    };
    if (el.props && typeof el.props === "object") {
      applyAttrObj(el.props);
    }
    if (el.attributes) {
      if (typeof el.getAttributeNames === "function") {
        for (const name of el.getAttributeNames()) {
          attributes.set(
            String(name).toLowerCase(),
            String(el.getAttribute(name) ?? ""),
          );
        }
      } else if (
        Array.isArray(el.attributes) ||
        Symbol.iterator in Object(el.attributes)
      ) {
        for (const attr of el.attributes as Iterable<any>) {
          if (attr && typeof attr.name === "string") {
            attributes.set(attr.name.toLowerCase(), String(attr.value ?? ""));
          }
        }
      } else if (typeof el.attributes === "object") {
        applyAttrObj(el.attributes);
      }
    }
    if (typeof el.id === "string" && el.id) {
      attributes.set("id", el.id);
    }
    const clsAttr =
      typeof el.className === "string"
        ? el.className
        : (attributes.get("class") ?? "");
    for (const c of clsAttr.split(/\s+/).filter(Boolean)) {
      classes.add(c);
    }
    if (el.classList && Symbol.iterator in Object(el.classList)) {
      for (const c of el.classList as Iterable<string>) {
        if (c) classes.add(c);
      }
    }
    return { tagName, attributes, classes };
  }

  // SSR HTML object check
  const html = serializeAngularRenderedOutput(resolved, false).trimStart();
  if (
    !html.startsWith("<") ||
    html.startsWith("<!--") ||
    html.startsWith("</")
  ) {
    return null;
  }
  const openEnd = html.indexOf(">");
  if (openEnd < 0) return null;
  const openTag = html.slice(1, openEnd).replace(/\/$/, "").trim();
  const spaceIdx = openTag.search(/\s/);
  const tagName = (
    spaceIdx < 0 ? openTag : openTag.slice(0, spaceIdx)
  ).toLowerCase();
  if (!tagName) return null;

  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  const attrStr = spaceIdx < 0 ? "" : openTag.slice(spaceIdx + 1);
  const attrRegex =
    /([A-Za-z0-9_:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    const key = match[1]!.toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(key, val);
    if (key === "class") {
      for (const c of val.split(/\s+/).filter(Boolean)) {
        classes.add(c);
      }
    }
  }
  return { tagName, attributes, classes };
}

function matchesSingleCompoundSelector(
  desc: ParsedElementDescriptor,
  compound: string,
): boolean {
  let rem = compound.trim();
  if (!rem) return false;
  if (rem === "*") return true;

  // Match attribute selectors `[attr]` or `[attr=val]`
  const attrPattern =
    /\[\s*([A-Za-z0-9_:@.-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]]*?))\s*)?\]/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrPattern.exec(rem)) !== null) {
    const attrName = attrMatch[1]!.toLowerCase();
    const expectedVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4]?.trim();
    if (!desc.attributes.has(attrName)) return false;
    if (
      expectedVal !== undefined &&
      desc.attributes.get(attrName) !== expectedVal
    ) {
      return false;
    }
  }
  rem = rem.replace(attrPattern, "").trim();

  // Match ID selectors `#id`
  const idPattern = /#([A-Za-z0-9_-]+)/g;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = idPattern.exec(rem)) !== null) {
    const expectedId = idMatch[1]!;
    if (desc.attributes.get("id") !== expectedId) return false;
  }
  rem = rem.replace(idPattern, "").trim();

  // Match class selectors `.class`
  const classPattern = /\.([A-Za-z0-9_-]+)/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classPattern.exec(rem)) !== null) {
    const expectedClass = classMatch[1]!;
    if (!desc.classes.has(expectedClass)) return false;
  }
  rem = rem.replace(classPattern, "").trim();

  // Remaining token, if any, is a tag name selector
  if (rem) {
    if (desc.tagName !== rem.toLowerCase()) return false;
  }
  return true;
}

export function matchesNgContentSelector(
  node: unknown,
  selectorList: string,
): boolean {
  const desc = inspectProjectedNode(node);
  if (!desc) return false;
  const parts = selectorList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.some((part) => matchesSingleCompoundSelector(desc, part));
}

function flattenProjectedChildren(
  children: unknown,
  out: unknown[] = [],
): unknown[] {
  if (
    children === null ||
    children === undefined ||
    typeof children === "boolean"
  ) {
    return out;
  }
  if (Array.isArray(children)) {
    for (const item of children) {
      flattenProjectedChildren(item, out);
    }
    return out;
  }
  out.push(children);
  return out;
}

/**
 * Partitions `children` across `<ng-content select="...">` and default `<ng-content>` slots
 * using Angular's first-matching-slot rule in both DOM and SSR targets.
 */
export function projectAngularContent(
  children: unknown,
  select: string | null | undefined,
  allSelectors: readonly string[] = [],
  fallbackFactory?: (() => any) | any,
): any {
  const items = flattenProjectedChildren(children);
  const normalizedSelect = select?.trim() || null;

  const matched: unknown[] = [];
  for (const item of items) {
    // Ignore pure whitespace text nodes when matching named slots
    if (
      typeof item === "string" &&
      item.trim() === "" &&
      normalizedSelect !== null
    ) {
      continue;
    }
    const firstMatchingSelector = allSelectors.find((sel) =>
      matchesNgContentSelector(item, sel),
    );
    if (normalizedSelect !== null) {
      if (
        firstMatchingSelector === normalizedSelect ||
        (!firstMatchingSelector &&
          matchesNgContentSelector(item, normalizedSelect))
      ) {
        matched.push(item);
      }
    } else if (!firstMatchingSelector) {
      matched.push(item);
    }
  }

  const hasMeaningfulContent = matched.some(
    (item) => !(typeof item === "string" && item.trim() === ""),
  );
  if (!hasMeaningfulContent) {
    return typeof fallbackFactory === "function"
      ? fallbackFactory()
      : (fallbackFactory ?? null);
  }
  return matched;
}

export function completeAngularViewInit<T>(instance: any, root: T): T {
  if (instance && typeof instance === "object") {
    try {
      Object.defineProperty(instance, NG_HOST_ELEMENT, {
        value: root,
        configurable: true,
        enumerable: false,
      });
    } catch {
      // Ignore frozen instances
    }
    if (root && typeof root === "object") {
      try {
        Object.defineProperty(root, NG_COMPONENT_INSTANCE, {
          value: instance,
          configurable: true,
          enumerable: false,
        });
      } catch {
        // Ignore frozen roots
      }
      const instRefs = instance[NG_REF_NAMES] as Set<string> | undefined;
      if (instRefs) {
        for (const r of instRefs) {
          addRefNameMeta(root, r);
        }
      }
      const instDirs = instance[NG_DIRECTIVE_INSTANCES] as Set<any> | undefined;
      if (instDirs) {
        for (const d of instDirs) {
          addDirectiveInstanceMeta(root, d);
          try {
            Object.defineProperty(d, NG_HOST_ELEMENT, {
              value: root,
              configurable: true,
              enumerable: false,
            });
          } catch {
            // Ignore frozen directive
          }
          const dirInj = getAngularInstanceInjector(d);
          const dirElRef = dirInj?.get(ElementRef, null, { optional: true });
          if (dirElRef && typeof dirElRef === "object") {
            (dirElRef as { nativeElement: any }).nativeElement = root;
          }
        }
      }
    }
    const deferredRef = instance[DEFERRED_NG_REF] as
      ((inst: any) => void) | undefined;
    if (typeof deferredRef === "function") {
      delete instance[DEFERRED_NG_REF];
      deferredRef(instance);
    }
  }
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
  if (
    baseProps &&
    typeof baseProps === "object" &&
    PENDING_DIRECTIVES in baseProps
  ) {
    Object.defineProperty(out, PENDING_DIRECTIVES, {
      value: (baseProps as any)[PENDING_DIRECTIVES],
      configurable: true,
      enumerable: false,
    });
  }
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

const STANDARD_HTML_ATTRIBUTES = new Set([
  "id",
  "class",
  "style",
  "title",
  "role",
  "type",
  "name",
  "value",
  "checked",
  "disabled",
  "readonly",
  "required",
  "placeholder",
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "width",
  "height",
  "tabindex",
  "hidden",
  "draggable",
  "contenteditable",
  "spellcheck",
  "dir",
  "lang",
  "for",
  "min",
  "max",
  "step",
  "pattern",
  "minlength",
  "maxlength",
  "multiple",
  "selected",
  "rows",
  "cols",
  "autocomplete",
]);

function collectConsumedDirectiveKeys(
  dirInstance: any,
  DirectiveClass: Type<any>,
): Set<string> {
  const consumed = new Set<string>();
  const ResolvedClass = ((DirectiveClass as any)?.ɵClass ??
    DirectiveClass) as any;
  const dirMeta = (ResolvedClass?.ɵdir ?? (DirectiveClass as any)?.ɵdir) as
    DirectiveOptions | undefined;

  const maybeAddInput = (propKey: string) => {
    const lower = propKey.toLowerCase();
    if (
      !STANDARD_HTML_ATTRIBUTES.has(lower) &&
      !lower.startsWith("aria-") &&
      !lower.startsWith("data-")
    ) {
      consumed.add(propKey);
    }
  };

  for (const key of Object.keys(dirInstance ?? {})) {
    const fieldVal = dirInstance[key];
    if (isInputSignal(fieldVal)) {
      const alias = getInputAlias(fieldVal) ?? key;
      maybeAddInput(alias);
      maybeAddInput(key);
      if (typeof (fieldVal as any).subscribe === "function") {
        consumed.add(`${alias}Change`);
        consumed.add(`on:${alias}Change`);
        consumed.add(`${key}Change`);
        consumed.add(`on:${key}Change`);
      }
    }
    if (fieldVal instanceof OutputEmitterRef) {
      const decoratedOutputs = (ResolvedClass?.ɵoutputs ?? {}) as Record<
        string,
        string
      >;
      const alias = fieldVal.alias ?? decoratedOutputs[key] ?? key;
      consumed.add(alias);
      consumed.add(`on:${alias}`);
      consumed.add(key);
      consumed.add(`on:${key}`);
    }
  }

  const decoratedInputs = (ResolvedClass?.ɵinputs ?? {}) as Record<
    string,
    InputDecoratorConfig
  >;
  for (const [propName, cfg] of Object.entries(decoratedInputs)) {
    maybeAddInput(cfg.alias ?? propName);
    maybeAddInput(propName);
  }

  const decoratedOutputs = (ResolvedClass?.ɵoutputs ?? {}) as Record<
    string,
    string
  >;
  for (const [propName, alias] of Object.entries(decoratedOutputs)) {
    const eff = alias || propName;
    consumed.add(eff);
    consumed.add(`on:${eff}`);
    consumed.add(propName);
    consumed.add(`on:${propName}`);
  }

  if (Array.isArray(dirMeta?.inputs)) {
    for (const entry of dirMeta.inputs) {
      if (typeof entry === "string") {
        maybeAddInput(entry);
      } else if (entry && typeof entry === "object") {
        maybeAddInput(entry.alias ?? entry.name);
        maybeAddInput(entry.name);
      }
    }
  }

  return consumed;
}

/**
 * Instantiates an Angular `@Directive` on a host element or component, binds its inputs
 * and outputs from `baseProps`, merges its `@HostBinding`, `@HostListener`, and `host`
 * metadata into the element's props, and registers the directive for `#ref="exportAs"`,
 * `viewChild`, and `contentChild` queries.
 */
export function bindAngularDirective<T extends object>(
  hostComponentInstance: any,
  DirectiveClass: Type<T>,
  baseProps?: Record<string, any> | null,
  extraHostPropsFactory?: ((dirInstance: T) => Record<string, any>) | null,
  onRegisterDirective?: ((dirInstance: T) => void) | null,
): Record<string, any> {
  const parentInj =
    getAngularInstanceInjector(hostComponentInstance) ?? getCurrentInjector();
  const placeholderEl = {};
  const dirInstance = parentInj
    ? runInInjectionContext(parentInj, () =>
        instantiateAngularComponent(
          DirectiveClass,
          baseProps ?? {},
          placeholderEl,
          false,
        ),
      )
    : instantiateAngularComponent(
        DirectiveClass,
        baseProps ?? {},
        placeholderEl,
        false,
      );

  if (typeof onRegisterDirective === "function") {
    onRegisterDirective(dirInstance);
  } else if (
    hostComponentInstance &&
    typeof hostComponentInstance === "object"
  ) {
    registerViewChild(hostComponentInstance, "", dirInstance);
  }

  const consumedKeys = collectConsumedDirectiveKeys(
    dirInstance,
    DirectiveClass,
  );
  const cleanedBase: Record<string, any> = {};
  if (baseProps && typeof baseProps === "object") {
    for (const [k, v] of Object.entries(baseProps)) {
      if (consumedKeys.has(k) && typeof v === "function") {
        continue;
      }
      cleanedBase[k] = v;
    }
  }

  const extraHostProps =
    typeof extraHostPropsFactory === "function"
      ? extraHostPropsFactory(dirInstance)
      : null;
  const merged =
    mergeAngularHostProps(dirInstance, cleanedBase, extraHostProps) ??
    cleanedBase;

  const existingPending =
    baseProps &&
    typeof baseProps === "object" &&
    Array.isArray((baseProps as any)[PENDING_DIRECTIVES])
      ? ((baseProps as any)[PENDING_DIRECTIVES] as any[])
      : [];
  Object.defineProperty(merged, PENDING_DIRECTIVES, {
    value: [...existingPending, dirInstance],
    configurable: true,
    enumerable: false,
  });

  return merged;
}

const isReactivePropGetter = (val: unknown): val is () => any =>
  typeof val === "function" &&
  !isSignal(val) &&
  !("ɵcmp" in val) &&
  !("ɵdir" in val) &&
  !("ɵpipe" in val) &&
  val.length === 0;

const readPropValue = (raw: unknown) => {
  if (isSignal(raw)) {
    return (raw as Signal<any>)();
  }
  if (isReactivePropGetter(raw)) {
    return raw();
  }
  return raw;
};

/**
 * Instantiates an Angular `@Component` or `@Directive` class within an active `EnvironmentInjector`,
 * binds incoming `props` onto `input()`, `model()`, and `@Input()` properties,
 * subscribes `output()`, `model()`, and `@Output()` `OutputEmitterRef` callbacks,
 * and invokes `ngOnChanges`, `ngOnInit`, `ngAfterContentInit`, `ngAfterViewInit`, and `ngOnDestroy`.
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
    (ComponentClass as any).ɵcmp ??
    (ResolvedClass as any).ɵdir ??
    (ComponentClass as any).ɵdir) as ComponentOptions | undefined;
  const isHostInjector = hostElement instanceof Injector;
  const parentInjector = isHostInjector ? hostElement : getCurrentInjector();
  const componentProviders: Array<Provider | EnvironmentProviders> = [
    ...(cmpMeta?.providers ?? []),
    ...(cmpMeta?.viewProviders ?? []),
  ];
  if (hostElement !== undefined && !isHostInjector) {
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

  lastActiveAngularInjector = injector;

  const instance = runInInjectionContext(injector, () => new ResolvedClass());
  try {
    Object.defineProperty(instance, INSTANCE_INJECTOR, {
      value: injector,
      configurable: true,
      enumerable: false,
    });
  } catch {
    // Ignore frozen instances
  }
  if (
    props &&
    typeof props === "object" &&
    Array.isArray((props as any)[PENDING_DIRECTIVES])
  ) {
    for (const dirInst of (props as any)[PENDING_DIRECTIVES]) {
      addDirectiveInstanceMeta(instance, dirInst);
    }
  }
  if (typeof props?.__onInstance === "function") {
    props.__onInstance(instance);
  }
  if (typeof props?.__ngRef === "function") {
    if (deferViewLifecycle) {
      try {
        Object.defineProperty(instance, DEFERRED_NG_REF, {
          value: props.__ngRef,
          configurable: true,
          enumerable: false,
        });
      } catch {
        props.__ngRef(instance);
      }
    } else {
      props.__ngRef(instance);
    }
  }
  const destroyRef = injector.get(DestroyRef, null, { optional: true });

  // Bind inputs and outputs from `props`
  const decoratedInputs = {
    ...(((instance?.constructor as any)?.ɵinputs ?? {}) as Record<
      string,
      InputDecoratorConfig
    >),
    ...(((ResolvedClass as any)?.ɵinputs ?? {}) as Record<
      string,
      InputDecoratorConfig
    >),
  };
  const decoratedOutputs = {
    ...(((instance?.constructor as any)?.ɵoutputs ?? {}) as Record<
      string,
      string
    >),
    ...(((ResolvedClass as any)?.ɵoutputs ?? {}) as Record<string, string>),
  };

  const changes: SimpleChanges = {};
  let hasChanges = false;

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
        if (
          descriptor?.get ||
          isSignal(props[propKey]) ||
          isReactivePropGetter(props[propKey])
        ) {
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
          props[`on:${changeAlias}`] ??
          props[`on${capChangeAlias}`] ??
          props[keyChange] ??
          props[`on:${keyChange}`] ??
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
        props[`on:${alias}`] ??
        props[`on${capitalized}`] ??
        props[key] ??
        props[`on:${key}`] ??
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
      if (
        descriptor?.get ||
        isSignal(props[propKey]) ||
        isReactivePropGetter(props[propKey])
      ) {
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
        props[`on:${alias}`] ??
        props[`on${capitalized}`] ??
        props[propName] ??
        props[`on:${propName}`] ??
        props[`on${propName.charAt(0).toUpperCase() + propName.slice(1)}`];
      if (typeof handler === "function") {
        const sub = fieldVal.subscribe((val: any) => handler(val));
        destroyRef?.onDestroy(() => sub?.unsubscribe?.());
      }
    }
  }

  // Also bind any remaining plain properties passed in props that correspond to decorated/declared inputs in @Component/@Directive({ inputs: [...] })
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
        const descriptor = Object.getOwnPropertyDescriptor(props, propKey);
        const applyDeclared = () => {
          const raw = descriptor?.get
            ? descriptor.get.call(props)
            : props[propKey];
          const unwrapped = readPropValue(raw);
          const nextVal = transform ? transform(unwrapped) : unwrapped;
          (instance as any)[name] = nextVal;
          return nextVal;
        };
        const prev = (instance as any)[name];
        const nextVal = applyDeclared();
        changes[name] = new SimpleChange(prev, nextVal, true);
        hasChanges = true;
        if (
          descriptor?.get ||
          isSignal(props[propKey]) ||
          isReactivePropGetter(props[propKey])
        ) {
          effect(
            () => {
              applyDeclared();
            },
            { injector, allowSignalWrites: true },
          );
        }
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
  if (props && "children" in props) {
    resolveAngularContentQueries(instance, props.children);
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

// ============================================================================
// Server-Side Rendering & Hybrid Routing (`@angular/ssr` & `@angular/platform-server`)
// ============================================================================

export interface AngularServerResponseInit extends ResponseInit {
  status?: number;
  statusText?: string;
  headers: Headers;
}

export interface AngularServerContext {
  readonly request: Request;
  readonly requestContext?: unknown;
  readonly responseInit: AngularServerResponseInit;
}

export interface AngularServerContextInit {
  request: Request | string | URL;
  requestContext?: unknown;
  responseInit?: ResponseInit;
}

const serverContextStack: AngularServerContext[] = [];

export function peekAngularServerContext(): AngularServerContext | undefined {
  return serverContextStack[serverContextStack.length - 1];
}

export function withAngularServerContext<T>(
  init: AngularServerContextInit,
  fn: (ctx: AngularServerContext) => T,
): T {
  const request =
    init.request instanceof Request
      ? init.request
      : new Request(String(init.request));
  const headers = new Headers(init.responseInit?.headers);
  const responseInit: AngularServerResponseInit = {
    status: init.responseInit?.status ?? 200,
    statusText: init.responseInit?.statusText ?? "",
    headers,
  };
  const ctx: AngularServerContext = {
    request,
    requestContext: init.requestContext,
    responseInit,
  };
  serverContextStack.push(ctx);
  let isAsync = false;
  try {
    const result = fn(ctx);
    if (
      result !== null &&
      typeof result === "object" &&
      typeof (result as any).then === "function"
    ) {
      isAsync = true;
      return Promise.resolve(result).finally(() => {
        const idx = serverContextStack.lastIndexOf(ctx);
        if (idx >= 0) serverContextStack.splice(idx, 1);
      }) as unknown as T;
    }
    return result;
  } finally {
    if (!isAsync) {
      const idx = serverContextStack.lastIndexOf(ctx);
      if (idx >= 0) serverContextStack.splice(idx, 1);
    }
  }
}

export const REQUEST = new InjectionToken<Request | null>("REQUEST", {
  providedIn: "root",
  factory: () => peekAngularServerContext()?.request ?? null,
});

export const REQUEST_CONTEXT = new InjectionToken<unknown>("REQUEST_CONTEXT", {
  providedIn: "root",
  factory: () => peekAngularServerContext()?.requestContext,
});

export const RESPONSE_INIT =
  new InjectionToken<AngularServerResponseInit | null>("RESPONSE_INIT", {
    providedIn: "root",
    factory: () => peekAngularServerContext()?.responseInit ?? null,
  });

export enum RenderMode {
  Server = 0,
  Client = 1,
  Prerender = 2,
}

export enum PrerenderFallback {
  Server = 0,
  Client = 1,
  None = 2,
}

export interface ServerRouteCommon {
  path: string;
  headers?: Record<string, string>;
  status?: number;
}

export interface ServerRouteClient extends ServerRouteCommon {
  renderMode: RenderMode.Client;
}

export interface ServerRouteServer extends ServerRouteCommon {
  renderMode: RenderMode.Server;
}

export interface ServerRoutePrerender extends ServerRouteCommon {
  renderMode: RenderMode.Prerender;
  fallback?: PrerenderFallback;
}

export interface ServerRoutePrerenderWithParams extends ServerRoutePrerender {
  getPrerenderParams: () => Promise<Array<Record<string, string>>>;
}

export type ServerRoute =
  | ServerRouteClient
  | ServerRouteServer
  | ServerRoutePrerender
  | ServerRoutePrerenderWithParams;

export const SERVER_ROUTES_CONFIG = new InjectionToken<ServerRoute[]>(
  "SERVER_ROUTES_CONFIG",
  {
    providedIn: "root",
    factory: () => [],
  },
);

export const APP_SHELL_COMPONENT = new InjectionToken<
  Type<unknown> | ((props?: any) => any) | null
>("APP_SHELL_COMPONENT", {
  providedIn: "root",
  factory: () => null,
});

export enum ServerRouterFeatureKind {
  AppShell = 0,
  ServerRoutes = 1,
}

export interface ServerRouterFeature<
  KindT extends ServerRouterFeatureKind = ServerRouterFeatureKind,
> {
  readonly ɵkind: KindT;
  readonly ɵproviders: Provider[];
}

export function withAppShell(
  component: Type<unknown> | ((props?: any) => any),
): ServerRouterFeature<ServerRouterFeatureKind.AppShell> {
  return {
    ɵkind: ServerRouterFeatureKind.AppShell,
    ɵproviders: [{ provide: APP_SHELL_COMPONENT, useValue: component }],
  };
}

export function withRoutes(
  routes: ServerRoute[],
): ServerRouterFeature<ServerRouterFeatureKind.ServerRoutes> {
  return {
    ɵkind: ServerRouterFeatureKind.ServerRoutes,
    ɵproviders: [{ provide: SERVER_ROUTES_CONFIG, useValue: [...routes] }],
  };
}

export function provideServerRouting(
  routes: ServerRoute[],
  ...features: ServerRouterFeature[]
): EnvironmentProviders {
  const providers: Provider[] = [
    { provide: PLATFORM_ID, useValue: PLATFORM_SERVER_ID },
    { provide: SERVER_ROUTES_CONFIG, useValue: [...routes] },
  ];
  for (const feat of features) {
    providers.push(...feat.ɵproviders);
  }
  return makeEnvironmentProviders(providers);
}

export function provideServerRoutesConfig(
  routes: ServerRoute[],
  ...features: ServerRouterFeature[]
): EnvironmentProviders {
  return provideServerRouting(routes, ...features);
}

export function matchServerRoute(
  routes: readonly ServerRoute[],
  pathname: string,
): { route: ServerRoute; params: Record<string, string> } | null {
  const cleanActual = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  for (const route of routes) {
    const cleanPattern = route.path
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);

    if (cleanPattern.length === 1 && cleanPattern[0] === "**") {
      return { route, params: {} };
    }

    const params: Record<string, string> = {};
    let matched = true;
    let i = 0;
    for (; i < cleanPattern.length; i++) {
      const pSeg = cleanPattern[i]!;
      if (pSeg === "**") {
        return { route, params };
      }
      if (i >= cleanActual.length) {
        matched = false;
        break;
      }
      const aSeg = cleanActual[i]!;
      if (pSeg.startsWith(":")) {
        params[pSeg.slice(1)] = decodeURIComponent(aSeg);
      } else if (pSeg !== aSeg) {
        matched = false;
        break;
      }
    }
    if (matched && i === cleanActual.length) {
      return { route, params };
    }
  }
  return null;
}

export interface PlatformConfig {
  document?: string;
  url?: string;
  useAbsoluteUrl?: boolean;
}

export const INITIAL_CONFIG = new InjectionToken<PlatformConfig>(
  "Server.INITIAL_CONFIG",
);

export const BEFORE_APP_SERIALIZED = new InjectionToken<
  ReadonlyArray<() => void | Promise<void>>
>("Server.RENDER_MODULE_HOOK");

export const ENABLE_DOM_EMULATION = new InjectionToken<boolean>(
  "ENABLE_DOM_EMULATION",
  {
    providedIn: "root",
    factory: () => true,
  },
);

export const SERVER_CONTEXT = new InjectionToken<string>("SERVER_CONTEXT", {
  providedIn: "root",
  factory: () => "other",
});

export function provideServerRendering(
  ...features: Array<ServerRouterFeature | EnvironmentProviders>
): EnvironmentProviders {
  const providers: Array<Provider | EnvironmentProviders> = [
    { provide: PLATFORM_ID, useValue: PLATFORM_SERVER_ID },
  ];
  for (const feature of features) {
    if (
      feature &&
      "ɵproviders" in feature &&
      Array.isArray(feature.ɵproviders)
    ) {
      providers.push(...feature.ɵproviders);
    } else if (feature) {
      providers.push(feature as EnvironmentProviders);
    }
  }
  return makeEnvironmentProviders(providers);
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function serializeAngularRenderedOutput(
  value: unknown,
  topLevel = true,
): string {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  if (typeof value === "string") {
    return topLevel ? value : escapeHtmlText(value);
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return escapeHtmlText(String(value));
  }
  if (typeof value === "function") {
    return serializeAngularRenderedOutput((value as () => unknown)(), false);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => serializeAngularRenderedOutput(item, false))
      .join("");
  }
  if (typeof value === "object") {
    for (const sym of Object.getOwnPropertySymbols(value)) {
      if (
        sym.description === "moonshine server HTML" &&
        typeof (value as any)[sym] === "function"
      ) {
        return String((value as any)[sym]());
      }
      if (sym.description === "moonshine SSR owner" && "child" in value) {
        return serializeAngularRenderedOutput((value as any).child, false);
      }
    }
    if (typeof (value as any).outerHTML === "string") {
      return (value as any).outerHTML;
    }
    if (typeof (value as any).innerHTML === "string") {
      return (value as any).innerHTML;
    }
  }
  return "";
}

const DEFAULT_SERVER_DOCUMENT =
  "<!DOCTYPE html><html><head></head><body><app-root></app-root></body></html>";

async function serializeBootstrappedApplication(
  appRef: ApplicationRef,
  documentTemplate: string = DEFAULT_SERVER_DOCUMENT,
): Promise<string> {
  try {
    const beforeHooks = appRef.injector.get(BEFORE_APP_SERIALIZED, null, {
      optional: true,
    });
    if (Array.isArray(beforeHooks)) {
      for (const hook of beforeHooks) {
        if (typeof hook === "function") {
          await runInInjectionContext(appRef.injector, hook);
        }
      }
    }

    let html = documentTemplate || DEFAULT_SERVER_DOCUMENT;

    for (const compRef of appRef.components) {
      const renderedMarkup = runInInjectionContext(appRef.injector, () =>
        withSSRRendering(() =>
          serializeAngularRenderedOutput(compRef.ɵrendered),
        ),
      );
      if (!renderedMarkup) continue;
      const selector =
        (compRef.componentType as any)?.ɵcmp?.selector || "app-root";
      const tagPattern = new RegExp(
        `<(${selector})(\\b[^>]*)>[\\s\\S]*?<\\/\\1>`,
        "i",
      );
      if (tagPattern.test(html)) {
        html = html.replace(tagPattern, `<$1$2>${renderedMarkup}</$1>`);
      } else if (/<app-root(\b[^>]*)>[\s\S]*?<\/app-root>/i.test(html)) {
        html = html.replace(
          /<(app-root)(\b[^>]*)>[\s\S]*?<\/\1>/i,
          `<$1$2>${renderedMarkup}</$1>`,
        );
      } else if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${renderedMarkup}</body>`);
      } else {
        html += renderedMarkup;
      }
    }

    const titleSvc = appRef.injector.get(Title, null, { optional: true });
    const titleText = titleSvc?.getTitle() ?? "";
    if (titleText) {
      const escapedTitle = escapeHtmlText(titleText);
      if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
        html = html.replace(
          /<title\b[^>]*>[\s\S]*?<\/title>/i,
          `<title>${escapedTitle}</title>`,
        );
      } else if (/<\/head>/i.test(html)) {
        html = html.replace(
          /<\/head>/i,
          `<title>${escapedTitle}</title></head>`,
        );
      }
    }

    const metaSvc = appRef.injector.get(Meta, null, { optional: true });
    const metaMarkup = metaSvc?.renderToString() ?? "";
    if (metaMarkup) {
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, `${metaMarkup}</head>`);
      } else {
        html = `${metaMarkup}${html}`;
      }
    }

    const transferState = appRef.injector.get(TransferState, null, {
      optional: true,
    });
    if (transferState && !transferState.isEmpty) {
      const appId =
        appRef.injector.get(APP_ID, "ng", { optional: true }) || "ng";
      const safeJson = transferState
        .toJson()
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e");
      const scriptTag = `<script id="${escapeHtmlAttr(appId)}-state" type="application/json">${safeJson}</script>`;
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${scriptTag}</body>`);
      } else {
        html += scriptTag;
      }
    }

    return html;
  } finally {
    appRef.destroy();
  }
}

export interface RenderApplicationOptions {
  document?: string;
  url?: string;
  platformProviders?: Array<Provider | EnvironmentProviders>;
}

export async function renderApplication(
  bootstrap: () => Promise<ApplicationRef>,
  options?: RenderApplicationOptions,
): Promise<string> {
  const url = options?.url ?? "http://localhost/";
  const fullUrl = url.startsWith("http")
    ? url
    : `http://localhost${url.startsWith("/") ? "" : "/"}${url}`;
  return withAngularServerContext(
    { request: new Request(fullUrl) },
    async () => {
      const appRef = await bootstrap();
      return serializeBootstrappedApplication(appRef, options?.document);
    },
  );
}

export interface AngularAppEngineOptions {
  bootstrap?:
    (() => Promise<ApplicationRef>) | Type<unknown> | ((props?: any) => any);
  routes?: ServerRoute[];
  appShell?: Type<unknown> | ((props?: any) => any);
  document?: string;
  providers?: Array<Provider | EnvironmentProviders>;
}

export class AngularAppEngine {
  static ɵallowStaticRouteRender = true;

  readonly #options: AngularAppEngineOptions;

  constructor(options: AngularAppEngineOptions = {}) {
    this.#options = options;
  }

  async handle(
    request: Request,
    requestContext?: unknown,
  ): Promise<Response | null> {
    const parsedUrl = new URL(request.url);
    const configuredRoutes = this.#options.routes ?? [];
    const matched =
      configuredRoutes.length > 0
        ? matchServerRoute(configuredRoutes, parsedUrl.pathname)
        : null;

    const initialHeaders = new Headers({
      "content-type": "text/html; charset=utf-8",
    });
    if (matched?.route.headers) {
      for (const [hk, hv] of Object.entries(matched.route.headers)) {
        initialHeaders.set(hk, hv);
      }
    }
    const initialStatus = matched?.route.status ?? 200;

    return withAngularServerContext(
      {
        request,
        requestContext,
        responseInit: { status: initialStatus, headers: initialHeaders },
      },
      async (serverCtx) => {
        const providers: Array<Provider | EnvironmentProviders> = [
          provideServerRendering(),
          ...(this.#options.providers ?? []),
        ];
        if (configuredRoutes.length > 0) {
          providers.push({
            provide: SERVER_ROUTES_CONFIG,
            useValue: [...configuredRoutes],
          });
        }
        if (this.#options.appShell) {
          providers.push({
            provide: APP_SHELL_COMPONENT,
            useValue: this.#options.appShell,
          });
        }

        const isClientMode = matched?.route.renderMode === RenderMode.Client;

        let appRef: ApplicationRef | null = null;
        if (isClientMode) {
          const shellComp = this.#options.appShell;
          if (!shellComp) {
            const doc = this.#options.document ?? DEFAULT_SERVER_DOCUMENT;
            return new Response(doc, {
              status: serverCtx.responseInit.status ?? 200,
              statusText: serverCtx.responseInit.statusText,
              headers: serverCtx.responseInit.headers,
            });
          }
          appRef = await bootstrapApplication(shellComp, { providers });
        } else if (this.#options.bootstrap) {
          const boot = this.#options.bootstrap;
          if (
            typeof boot === "function" &&
            !("ɵcmp" in boot) &&
            !("ɵClass" in boot) &&
            (!boot.prototype || boot.prototype.constructor !== boot)
          ) {
            appRef = await (boot as () => Promise<ApplicationRef>)();
          } else {
            appRef = await bootstrapApplication(boot as any, { providers });
          }
        } else {
          appRef = await createApplication({ providers });
        }

        // Check if SERVER_ROUTES_CONFIG was provided via DI when not passed to constructor
        if (!matched) {
          const diRoutes = appRef.injector.get(SERVER_ROUTES_CONFIG, [], {
            optional: true,
          });
          if (diRoutes && diRoutes.length > 0) {
            const diMatch = matchServerRoute(diRoutes, parsedUrl.pathname);
            if (diMatch?.route.status) {
              serverCtx.responseInit.status = diMatch.route.status;
            }
            if (diMatch?.route.headers) {
              for (const [hk, hv] of Object.entries(diMatch.route.headers)) {
                serverCtx.responseInit.headers.set(hk, hv);
              }
            }
          }
        }

        const html = await serializeBootstrappedApplication(
          appRef,
          this.#options.document,
        );
        return new Response(html, {
          status: serverCtx.responseInit.status ?? 200,
          statusText: serverCtx.responseInit.statusText,
          headers: serverCtx.responseInit.headers,
        });
      },
    );
  }
}

export interface CommonEngineOptions {
  bootstrap?:
    (() => Promise<ApplicationRef>) | Type<unknown> | ((props?: any) => any);
  providers?: Array<Provider | EnvironmentProviders>;
  enablePerformanceProfiler?: boolean;
}

export interface CommonEngineRenderOptions extends CommonEngineOptions {
  url?: string;
  document?: string;
  documentFilePath?: string;
  inlineCriticalCss?: boolean;
  publicPath?: string;
  serverContext?: string;
}

export class CommonEngine {
  readonly #options: CommonEngineOptions;

  constructor(options: CommonEngineOptions = {}) {
    this.#options = options;
  }

  async render(opts: CommonEngineRenderOptions = {}): Promise<string> {
    const url = opts.url ?? "http://localhost/";
    const fullUrl = url.startsWith("http")
      ? url
      : `http://localhost${url.startsWith("/") ? "" : "/"}${url}`;
    const boot = opts.bootstrap ?? this.#options.bootstrap;
    const providers: Array<Provider | EnvironmentProviders> = [
      provideServerRendering(),
      ...(this.#options.providers ?? []),
      ...(opts.providers ?? []),
    ];
    if (opts.serverContext) {
      providers.push({ provide: SERVER_CONTEXT, useValue: opts.serverContext });
    }
    if (opts.document || opts.url) {
      providers.push({
        provide: INITIAL_CONFIG,
        useValue: { document: opts.document, url: opts.url },
      });
    }

    return withAngularServerContext(
      { request: new Request(fullUrl) },
      async () => {
        let appRef: ApplicationRef;
        if (
          typeof boot === "function" &&
          !("ɵcmp" in boot) &&
          !("ɵClass" in boot) &&
          (!boot.prototype || boot.prototype.constructor !== boot)
        ) {
          appRef = await (boot as () => Promise<ApplicationRef>)();
        } else if (boot) {
          appRef = await bootstrapApplication(boot as any, { providers });
        } else {
          appRef = await createApplication({ providers });
        }
        return serializeBootstrappedApplication(appRef, opts.document);
      },
    );
  }
}
