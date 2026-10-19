import { describe, expect, test } from "bun:test";
import {
  createEnvironmentInjector,
  inject,
  provideEnvironmentInitializer,
  signal,
  toObservable,
} from "../src/signals";
import {
  APP_ID,
  AsyncPipe,
  bootstrapApplication,
  COMMON_PIPES,
  createApplication,
  CurrencyPipe,
  DatePipe,
  DecimalPipe,
  DOCUMENT,
  DomSanitizer,
  HTTP_TRANSFER_CACHE_OPTIONS,
  HYDRATION_FEATURES,
  HydrationFeatureKind,
  I18nPluralPipe,
  I18nSelectPipe,
  isPlatformBrowser,
  isPlatformServer,
  JsonPipe,
  KeyValuePipe,
  LowerCasePipe,
  makeStateKey,
  mergeApplicationConfig,
  Meta,
  PercentPipe,
  PLATFORM_BROWSER_ID,
  PLATFORM_ID,
  PLATFORM_SERVER_ID,
  provideAppInitializer,
  provideClientHydration,
  provideExperimentalZonelessChangeDetection,
  provideProtractorTestingSupport,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  SecurityContext,
  SlicePipe,
  Title,
  TitleCasePipe,
  TransferState,
  unwrapSafeValue,
  UpperCasePipe,
  withEventReplay,
  withHttpTransferCacheOptions,
  withI18nSupport,
  withIncrementalHydration,
  withNoHttpTransferCache,
} from "../src/platform";

describe("@tschk/moonshine-angular/platform", () => {
  test("PLATFORM_ID, isPlatformBrowser, isPlatformServer, APP_ID, and DOCUMENT work via DI", () => {
    const serverEnv = createEnvironmentInjector([
      { provide: PLATFORM_ID, useValue: PLATFORM_SERVER_ID },
      { provide: APP_ID, useValue: "moonshine-app" },
    ]);
    expect(isPlatformServer(serverEnv.get(PLATFORM_ID))).toBe(true);
    expect(isPlatformBrowser(serverEnv.get(PLATFORM_ID))).toBe(false);
    expect(serverEnv.get(APP_ID)).toBe("moonshine-app");
    expect(serverEnv.get(DOCUMENT)).toBeDefined();
    serverEnv.destroy();

    const browserEnv = createEnvironmentInjector([
      { provide: PLATFORM_ID, useValue: PLATFORM_BROWSER_ID },
    ]);
    expect(isPlatformBrowser(browserEnv.get(PLATFORM_ID))).toBe(true);
    expect(isPlatformServer(browserEnv.get(PLATFORM_ID))).toBe(false);
    browserEnv.destroy();
  });

  test("TransferState and makeStateKey store, serialize, and hydrate state", () => {
    const env = createEnvironmentInjector([]);
    const state = env.get(TransferState);
    expect(state.isEmpty).toBe(true);

    const userKey = makeStateKey<{ id: number; name: string }>("user");
    const lazyKey = makeStateKey<string[]>("lazy-tags");

    expect(state.get(userKey, { id: 0, name: "guest" })).toEqual({
      id: 0,
      name: "guest",
    });

    state.set(userKey, { id: 7, name: "Ada" });
    state.onSerialize(lazyKey, () => ["signals", "ssr"]);

    expect(state.hasKey(userKey)).toBe(true);
    expect(state.hasKey(lazyKey)).toBe(true);
    expect(state.isEmpty).toBe(false);

    const serialized = state.toJson();
    expect(JSON.parse(serialized)).toEqual({
      user: { id: 7, name: "Ada" },
      "lazy-tags": ["signals", "ssr"],
    });

    const clientState = new TransferState();
    clientState.populateFromJson(serialized);
    expect(clientState.get(userKey, { id: 0, name: "guest" })).toEqual({
      id: 7,
      name: "Ada",
    });
    expect(clientState.get(lazyKey, [])).toEqual(["signals", "ssr"]);

    clientState.remove(userKey);
    expect(clientState.hasKey(userKey)).toBe(false);
    env.destroy();
  });

  test("Title and Meta manage reactive document title and meta tags", () => {
    const env = createEnvironmentInjector([]);
    const title = env.get(Title);
    const meta = env.get(Meta);

    title.setTitle("Moonshine Angular");
    expect(title.getTitle()).toBe("Moonshine Angular");
    expect(title.title()).toBe("Moonshine Angular");

    meta.addTags([
      { name: "description", content: "Fast signals" },
      { property: "og:title", content: "Moonshine" },
    ]);
    expect(meta.getTag('name="description"')?.getAttribute("content")).toBe(
      "Fast signals",
    );

    meta.updateTag({ name: "description", content: "Updated signals" });
    expect(meta.getTag('name="description"')?.getAttribute("content")).toBe(
      "Updated signals",
    );
    expect(meta.renderToString()).toBe(
      '<meta name="description" content="Updated signals"><meta property="og:title" content="Moonshine">',
    );

    meta.removeTag('property="og:title"');
    expect(meta.getTag('property="og:title"')).toBeNull();
    expect(meta.renderToString()).toBe(
      '<meta name="description" content="Updated signals">',
    );
    env.destroy();
  });

  test("DomSanitizer sanitizes untrusted inputs and unwraps trusted SafeValue instances", () => {
    const sanitizer = new DomSanitizer();

    expect(
      sanitizer.sanitize(
        SecurityContext.HTML,
        '<p onclick="evil()">Hello<script>alert(1)</script></p>',
      ),
    ).toBe("<p>Hello</p>");

    expect(sanitizer.sanitize(SecurityContext.URL, "javascript:alert(1)")).toBe(
      "unsafe:javascript:alert(1)",
    );
    expect(
      sanitizer.sanitize(SecurityContext.URL, "https://example.com/page"),
    ).toBe("https://example.com/page");

    expect(() =>
      sanitizer.sanitize(SecurityContext.SCRIPT, "alert(1)"),
    ).toThrow(/unsafe value used in a script context/);

    const safeHtml = sanitizer.bypassSecurityTrustHtml("<b>Trusted</b>");
    expect(sanitizer.sanitize(SecurityContext.HTML, safeHtml)).toBe(
      "<b>Trusted</b>",
    );
    expect(unwrapSafeValue(safeHtml)).toBe("<b>Trusted</b>");

    expect(() => sanitizer.sanitize(SecurityContext.SCRIPT, safeHtml)).toThrow(
      /Required a safe SCRIPT value, got HTML/,
    );
  });

  test("createApplication, bootstrapApplication, mergeApplicationConfig, and hydration providers", async () => {
    const order: string[] = [];

    const cfg1 = {
      providers: [
        provideEnvironmentInitializer(() => {
          order.push("env-init");
        }),
        provideAppInitializer(async () => {
          await Promise.resolve();
          order.push("app-init");
        }),
      ],
    };

    const cfg2 = {
      providers: [
        provideClientHydration(
          withEventReplay(),
          withIncrementalHydration(),
          withI18nSupport(),
          withHttpTransferCacheOptions({ includePostRequests: true }),
          withNoHttpTransferCache(),
        ),
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideExperimentalZonelessChangeDetection(),
        provideZonelessChangeDetection(),
        provideProtractorTestingSupport(),
      ],
    };

    class AppRoot {
      readonly title = inject(Title);
      constructor() {
        order.push("component-construct");
        this.title.setTitle("Bootstrapped");
      }
    }

    const appRef = await bootstrapApplication(
      AppRoot,
      mergeApplicationConfig(cfg1, cfg2),
    );

    expect(order).toEqual(["env-init", "app-init", "component-construct"]);
    expect(appRef.components).toHaveLength(1);
    expect(appRef.components[0]!.instance).toBeInstanceOf(AppRoot);
    expect(appRef.injector.get(Title).getTitle()).toBe("Bootstrapped");
    expect(appRef.injector.get(HYDRATION_FEATURES)).toEqual([
      HydrationFeatureKind.EventReplay,
      HydrationFeatureKind.IncrementalHydration,
      HydrationFeatureKind.I18nSupport,
      HydrationFeatureKind.HttpTransferCacheOptions,
      HydrationFeatureKind.NoHttpTransferCache,
    ]);
    expect(appRef.injector.get(HTTP_TRANSFER_CACHE_OPTIONS)).toEqual({
      includePostRequests: true,
    });

    appRef.tick();
    appRef.destroy();
    expect(appRef.destroyed).toBe(true);
  });

  test("built-in Angular common pipes transform values accurately", async () => {
    expect(COMMON_PIPES.length).toBe(13);
    expect(new UpperCasePipe().transform("moonshine")).toBe("MOONSHINE");
    expect(new LowerCasePipe().transform("MOONSHINE")).toBe("moonshine");
    expect(new TitleCasePipe().transform("hello angular world")).toBe(
      "Hello Angular World",
    );
    expect(new SlicePipe().transform([10, 20, 30, 40], 1, 3)).toEqual([20, 30]);
    expect(new SlicePipe().transform("abcdef", 2, 5)).toBe("cde");
    expect(new JsonPipe().transform({ a: 1 })).toBe('{\n  "a": 1\n}');

    const kv = new KeyValuePipe();
    expect(kv.transform({ b: 2, a: 1 })).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);

    expect(new DecimalPipe("en-US").transform(1234.5, "1.2-2")).toBe(
      "1,234.50",
    );
    expect(new PercentPipe("en-US").transform(0.256, "1.1-1")).toBe("25.6%");
    expect(
      new CurrencyPipe("en-US").transform(42.5, "USD", "symbol", "1.2-2"),
    ).toBe("$42.50");
    expect(
      new DatePipe("en-US").transform(
        new Date("2026-01-15T00:00:00.000Z"),
        "iso",
      ),
    ).toBe("2026-01-15T00:00:00.000Z");

    const plural = new I18nPluralPipe();
    const mapping = {
      "=0": "No messages",
      "=1": "One message",
      other: "# messages",
    };
    expect(plural.transform(0, mapping)).toBe("No messages");
    expect(plural.transform(1, mapping)).toBe("One message");
    expect(plural.transform(5, mapping)).toBe("5 messages");

    const select = new I18nSelectPipe();
    expect(
      select.transform("female", {
        male: "Invite him",
        female: "Invite her",
        other: "Invite them",
      }),
    ).toBe("Invite her");

    // AsyncPipe with Observable & Promise
    const app = await createApplication();
    const count = signal(7);
    const obs = toObservable(count);
    const asyncPipe = app.injector.runInContext(() => new AsyncPipe());
    expect(asyncPipe.transform(obs)).toBe(7);
    count.set(19);
    expect(asyncPipe.transform(obs)).toBe(19);

    const p = Promise.resolve("async-done");
    expect(asyncPipe.transform(p)).toBeNull();
    await p;
    expect(asyncPipe.transform(p)).toBe("async-done");

    app.destroy();
  });
});
