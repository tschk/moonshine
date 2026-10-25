import { describe, expect, test } from "bun:test";
import {
  contentChild,
  contentChildren,
  createEnvironmentInjector,
  inject,
  provideEnvironmentInitializer,
  signal,
  toObservable,
  viewChild,
  viewChildren,
} from "../src/signals";
import {
  APP_ID,
  ApplicationInitStatus,
  applyPipe,
  AsyncPipe,
  Attribute,
  bindAngularDirective,
  booleanAttribute,
  bootstrapApplication,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  COMMON_PIPES,
  Component,
  ContentChild,
  ContentChildren,
  createApplication,
  CurrencyPipe,
  DatePipe,
  DecimalPipe,
  Directive,
  DOCUMENT,
  DomSanitizer,
  ElementRef,
  enableProdMode,
  ErrorHandler,
  EventEmitter,
  forwardRef,
  Host,
  HostBinding,
  HostListener,
  HTTP_TRANSFER_CACHE_OPTIONS,
  HYDRATION_FEATURES,
  HydrationFeatureKind,
  I18nPluralPipe,
  I18nSelectPipe,
  Inject,
  Injectable,
  Input,
  instantiateAngularComponent,
  isDevMode,
  isPlatformBrowser,
  isPlatformServer,
  JsonPipe,
  KeyValuePipe,
  LowerCasePipe,
  makeStateKey,
  mergeApplicationConfig,
  Meta,
  NgZone,
  numberAttribute,
  Optional,
  Output,
  PercentPipe,
  Pipe,
  PLATFORM_BROWSER_ID,
  PLATFORM_ID,
  PLATFORM_SERVER_ID,
  provideAppInitializer,
  provideClientHydration,
  provideExperimentalZonelessChangeDetection,
  provideProtractorTestingSupport,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  registerPipe,
  Renderer2,
  RendererFactory2,
  RendererStyleFlags2,
  resolveForwardRef,
  SecurityContext,
  Self,
  SimpleChange,
  SkipSelf,
  SlicePipe,
  TemplateRef,
  Title,
  TitleCasePipe,
  TransferState,
  unwrapSafeValue,
  UpperCasePipe,
  VERSION,
  Version,
  ViewChild,
  ViewChildren,
  ViewContainerRef,
  ViewEncapsulation,
  withEventReplay,
  withHttpTransferCacheOptions,
  withI18nSupport,
  withIncrementalHydration,
  withNoHttpTransferCache,
  COMMON_DIRECTIVES,
  CommonModule,
  completeAngularViewInit,
  mergeAngularHostProps,
  NgClass,
  NgFor,
  NgForOf,
  NgIf,
  NgStyle,
  NgSwitch,
  NgSwitchCase,
  NgSwitchDefault,
  NgTemplateOutlet,
  normalizeNgClass,
  normalizeNgStyle,
  registerViewChild,
  resolveViewChild,
  AngularAppEngine,
  APP_SHELL_COMPONENT,
  BEFORE_APP_SERIALIZED,
  CommonEngine,
  DEFAULT_IMAGE_CONFIG,
  defaultImageLoader,
  ENABLE_DOM_EMULATION,
  IMAGE_CONFIG,
  IMAGE_LOADER,
  INITIAL_CONFIG,
  matchServerRoute,
  NgOptimizedImage,
  PrerenderFallback,
  provideCloudflareLoader,
  provideCloudinaryLoader,
  provideImgixLoader,
  provideNetlifyLoader,
  provideServerRendering,
  provideServerRoutesConfig,
  provideServerRouting,
  renderApplication,
  RenderMode,
  REQUEST,
  REQUEST_CONTEXT,
  resolveNgOptimizedImageProps,
  RESPONSE_INIT,
  SERVER_CONTEXT,
  SERVER_ROUTES_CONFIG,
  type ServerRoute,
  withAngularServerContext,
  withAppShell,
  withRoutes,
  createAngularTemplateRef,
  matchesNgContentSelector,
  projectAngularContent,
  renderNgTemplateOutlet,
} from "../src/platform";
import {
  provideRouter,
  ROUTER_CONFIGURATION,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  withComponentInputBinding,
  withRouterConfig,
} from "../src/router";
import { input, model, output } from "../src/signals";

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

  test("decorators, EventEmitter, SimpleChange, transforms, forwardRef, services, applyPipe, and instantiateAngularComponent", () => {
    expect(ChangeDetectionStrategy.OnPush).toBe(0);
    expect(ViewEncapsulation.Emulated).toBe(0);
    expect(booleanAttribute("")).toBe(true);
    expect(booleanAttribute("false")).toBe(false);
    expect(numberAttribute("42", 0)).toBe(42);
    expect(numberAttribute("invalid", -1)).toBe(-1);

    const fwd = forwardRef(() => CustomService);
    class CustomService {
      readonly tag = "svc";
    }
    Injectable({ providedIn: "root" })(CustomService);
    expect(resolveForwardRef(fwd)).toBe(CustomService);

    expect(VERSION).toBeInstanceOf(Version);
    expect(VERSION.major).toBe("19");
    expect(typeof isDevMode()).toBe("boolean");
    enableProdMode();
    expect(isDevMode()).toBe(false);

    class ExclaimPipe {
      transform(v: unknown, suffix = "!") {
        return `${String(v)}${suffix}`;
      }
    }
    Pipe({ name: "exclaim", standalone: true })(ExclaimPipe);
    registerPipe("exclaim", ExclaimPipe);
    expect(applyPipe("moonshine", "uppercase")).toBe("MOONSHINE");
    expect(applyPipe("hi", "exclaim", "!!")).toBe("hi!!");

    // Decorators & instantiateAngularComponent lifecycle + signal/decorator binding
    const events: string[] = [];
    class WidgetComponent {
      label = input("default", { alias: "widgetLabel" });
      count = model(1);
      clicked = output<number>({ alias: "widgetClicked" });
      step = 2;
      changed = new EventEmitter<number>();

      ngOnChanges(changes: Record<string, SimpleChange>) {
        events.push(`changes:${Object.keys(changes).toSorted().join(",")}`);
      }
      ngOnInit() {
        events.push(`init:${this.label()}:${this.step}`);
      }
      ngDoCheck() {
        events.push("check");
      }
      ngAfterContentInit() {
        events.push("contentInit");
      }
      ngAfterContentChecked() {
        events.push("contentChecked");
      }
      ngAfterViewInit() {
        events.push("viewInit");
      }
      ngAfterViewChecked() {
        events.push("viewChecked");
      }
    }
    Component({
      selector: "app-widget",
      standalone: true,
      template: "<div>{{ label() }}</div>",
    })(WidgetComponent);
    Input({ alias: "stepInput", transform: numberAttribute })(
      WidgetComponent.prototype,
      "step",
    );
    Output("stepChanged")(WidgetComponent.prototype, "changed");
    Directive({ selector: "[appDir]" })(
      class Dir {
        active = true;
      },
    );
    ViewChild("box")(WidgetComponent.prototype, "box");
    ViewChildren("items")(WidgetComponent.prototype, "items");
    ContentChild("projected")(WidgetComponent.prototype, "projected");
    ContentChildren("projectedAll")(WidgetComponent.prototype, "projectedAll");
    HostBinding("class.active")(WidgetComponent.prototype, "active");
    HostListener("click")(WidgetComponent.prototype, "onClick");
    Optional()(WidgetComponent, undefined, 0);
    Self()(WidgetComponent, undefined, 0);
    SkipSelf()(WidgetComponent, undefined, 0);
    Host()(WidgetComponent, undefined, 0);
    Inject(PLATFORM_ID)(WidgetComponent, undefined, 0);
    Attribute("role")(WidgetComponent, undefined, 0);

    const emitted: number[] = [];
    const stepEmitted: number[] = [];
    const modelChanges: number[] = [];
    const instance = instantiateAngularComponent(WidgetComponent, {
      widgetLabel: "Hello",
      stepInput: "5",
      count: 10,
      countChange: (v: number) => modelChanges.push(v),
      widgetClicked: (v: number) => emitted.push(v),
      stepChanged: (v: number) => stepEmitted.push(v),
    });

    expect(instance.label()).toBe("Hello");
    expect(instance.step).toBe(5);
    expect(instance.count()).toBe(10);
    expect(events).toEqual([
      "changes:count,label,step",
      "init:Hello:5",
      "check",
      "contentInit",
      "contentChecked",
      "viewInit",
      "viewChecked",
    ]);

    instance.count.set(20);
    instance.clicked.emit(42);
    instance.changed.emit(99);
    expect(modelChanges).toEqual([20]);
    expect(emitted).toEqual([42]);
    expect(stepEmitted).toEqual([99]);

    // DI services: ElementRef, ChangeDetectorRef, NgZone, ErrorHandler, ApplicationInitStatus, Renderer2, TemplateRef, ViewContainerRef
    const env = createEnvironmentInjector([]);
    expect(env.get(ElementRef)).toBeInstanceOf(ElementRef);
    const cdr = env.get(ChangeDetectorRef);
    cdr.markForCheck();
    cdr.detectChanges();
    const zone = env.get(NgZone);
    expect(zone.run(() => 7)).toBe(7);
    expect(zone.runOutsideAngular(() => 9)).toBe(9);
    expect(env.get(ErrorHandler)).toBeInstanceOf(ErrorHandler);
    expect(env.get(ApplicationInitStatus).done).toBe(true);
    const renderer = env.get(RendererFactory2).createRenderer(null, null);
    expect(renderer).toBeInstanceOf(Renderer2);
    const div = renderer.createElement("div") as Record<string, unknown>;
    renderer.setAttribute(div, "id", "box");
    renderer.addClass(div, "card");
    renderer.setStyle(div, "color", "red", RendererStyleFlags2.Important);
    expect(env.get(TemplateRef)).toBeInstanceOf(TemplateRef);
    const vcr = env.get(ViewContainerRef);
    expect(vcr.length).toBe(0);
    env.destroy();
  });

  test("provideRouter merges multiple ROUTER_CONFIGURATION features and exports RouterOutlet, RouterLink, and RouterLinkActive", () => {
    const env = createEnvironmentInjector([
      provideRouter(
        [{ path: "home" }],
        withComponentInputBinding(),
        withRouterConfig({
          paramsInheritanceStrategy: "always",
          onSameUrlNavigation: "reload",
        }),
      ),
    ]);
    const cfg = env.get(ROUTER_CONFIGURATION);
    expect(cfg.bindToComponentInputs).toBe(true);
    expect(cfg.paramsInheritanceStrategy).toBe("always");
    expect(cfg.onSameUrlNavigation).toBe("reload");

    expect(typeof RouterOutlet).toBe("function");
    expect(typeof RouterLink).toBe("function");
    expect(typeof RouterLinkActive).toBe("function");
    const rla = env.runInContext(() => new RouterLinkActive());
    expect(rla.isActive).toBe(false);
    env.destroy();
  });

  test("CommonModule, COMMON_DIRECTIVES, normalizeNgClass, and normalizeNgStyle", () => {
    expect(COMMON_DIRECTIVES).toEqual([
      NgClass,
      NgForOf,
      NgIf,
      NgTemplateOutlet,
      NgStyle,
      NgSwitch,
      NgSwitchCase,
      NgSwitchDefault,
      NgOptimizedImage,
    ]);
    expect(NgFor).toBe(NgForOf);
    expect(CommonModule.ɵmod.exports.length).toBe(
      COMMON_DIRECTIVES.length + COMMON_PIPES.length,
    );

    expect(
      normalizeNgClass([
        "card",
        { active: true, disabled: false, "badge pill": 1 },
        new Set(["featured"]),
      ]),
    ).toBe("card active badge pill featured");

    expect(
      normalizeNgStyle("color: red", {
        fontSize: "14px",
        "padding.px": 8,
        margin: null,
      }),
    ).toBe("color: red; font-size: 14px; padding: 8px");
  });

  test("registerViewChild, resolveViewChild, completeAngularViewInit, and mergeAngularHostProps", () => {
    const lifecycleOrder: string[] = [];
    class HostPanelComponent {
      open = signal(true);
      accent = signal("teal");
      clicks = 0;
      boxSignal = viewChild("boxRef");
      itemsSignal = viewChildren("itemRef");
      boxDecorator?: ElementRef;
      ngOnInit() {
        lifecycleOrder.push(
          `onInit:${Boolean(this.boxDecorator)}:${Boolean(this.boxSignal())}`,
        );
      }
      ngAfterViewInit() {
        lifecycleOrder.push(
          `afterViewInit:${Boolean(this.boxDecorator)}:${Boolean(this.boxSignal())}`,
        );
      }
      handleClick(target: string) {
        this.clicks += 1;
        lifecycleOrder.push(`click:${target}`);
      }
    }
    Component({ selector: "app-host-panel", standalone: true })(
      HostPanelComponent,
    );
    ViewChild("boxRef")(HostPanelComponent, "boxDecorator");
    HostBinding("class.is-open")(HostPanelComponent, "open");
    HostBinding("style.color")(HostPanelComponent, "accent");
    HostListener("click", ["$event.type"])(HostPanelComponent, "handleClick");

    const inst = instantiateAngularComponent(
      HostPanelComponent,
      {},
      undefined,
      true,
    );
    expect(lifecycleOrder).toEqual(["onInit:false:false"]);

    const fakeEl = { id: "box-1", value: "typed" };
    const returned = registerViewChild(inst, "boxRef", fakeEl);
    expect(returned).toBe(fakeEl);
    registerViewChild(inst, "itemRef", { id: "i1" });
    registerViewChild(inst, "itemRef", { id: "i2" });
    expect(resolveViewChild(inst, "boxRef")).toBe(fakeEl);
    expect(inst.boxSignal()?.nativeElement).toBe(fakeEl);
    expect(inst.boxDecorator?.nativeElement).toBe(fakeEl);
    expect(inst.itemsSignal().length).toBe(2);

    completeAngularViewInit(inst, fakeEl);
    expect(lifecycleOrder).toEqual([
      "onInit:false:false",
      "afterViewInit:true:true",
    ]);

    const merged = mergeAngularHostProps(
      inst,
      { class: "base-panel", style: "display: block" },
      { role: "region", "[attr.data-open]": () => String(inst.open()) },
    )!;
    expect(merged.role()).toBe("region");
    expect(merged["data-open"]()).toBe("true");
    expect(merged.class()).toBe("base-panel is-open");
    expect(merged.style()).toBe("display: block; color: teal");
    merged["on:click"]({ type: "click" });
    expect(inst.clicks).toBe(1);
    expect(lifecycleOrder[2]).toBe("click:click");
  });

  test("ReactiveFormsModule, FormsModule, value accessors, directives, bindAngularFormControl, and bindAngularFormGroup", async () => {
    const forms = await import("../src/forms");
    expect(forms.ReactiveFormsModule.ɵmod.exports).toEqual(
      forms.REACTIVE_DRIVEN_DIRECTIVES,
    );
    expect(forms.FormsModule.ɵmod.exports).toEqual(
      forms.TEMPLATE_DRIVEN_DIRECTIVES,
    );
    expect(
      forms.ReactiveFormsModule.withConfig({ callSetDisabledState: "always" })
        .ngModule,
    ).toBe(forms.ReactiveFormsModule);
    expect(
      forms.FormsModule.withConfig({ callSetDisabledState: "always" }).ngModule,
    ).toBe(forms.FormsModule);

    const dva = new forms.DefaultValueAccessor();
    dva.writeValue("initial");
    expect(dva.value).toBe("initial");
    dva.setDisabledState(true);
    expect(dva.disabled).toBe(true);

    const cva = new forms.CheckboxControlValueAccessor();
    cva.writeValue(1);
    expect(cva.checked).toBe(true);

    const nva = new forms.NumberValueAccessor();
    nva.writeValue(42);
    expect(nva.value).toBe(42);

    const sva = new forms.SelectControlValueAccessor();
    sva.writeValue("opt-a");
    expect(sva.value).toBe("opt-a");

    const group = new forms.FormGroup({
      username: new forms.FormControl("ada", [forms.Validators.required]),
      subscribed: new forms.FormControl(false),
      age: new forms.FormControl<number | null>(30),
      address: new forms.FormGroup({
        city: new forms.FormControl("London"),
      }),
    });

    expect(forms.resolveAngularFormControl(group, "username")).toBe(
      group.controls.username,
    );
    expect(forms.resolveAngularFormControl(() => group, "address.city")).toBe(
      group.controls.address.controls.city,
    );

    const usernameProps = forms.bindAngularFormControl(
      () => group.controls.username,
      { class: "field" },
      "text",
    );
    expect(usernameProps.value()).toBe("ada");
    expect(usernameProps.class()).toBe(
      "field ng-untouched ng-pristine ng-valid",
    );
    expect(usernameProps.disabled()).toBe(false);

    usernameProps["on:input"]({ currentTarget: { value: "" } });
    expect(group.controls.username.value).toBe("");
    expect(group.controls.username.dirty).toBe(true);
    expect(group.controls.username.invalid).toBe(true);
    expect(usernameProps.class()).toBe(
      "field ng-untouched ng-dirty ng-invalid",
    );

    usernameProps["on:blur"]({});
    expect(group.controls.username.touched).toBe(true);
    expect(usernameProps.class()).toBe("field ng-touched ng-dirty ng-invalid");

    const checkboxProps = forms.bindAngularFormControl(
      () => group.controls.subscribed,
      null,
      "checkbox",
    );
    expect(checkboxProps.checked()).toBe(false);
    checkboxProps["on:change"]({ currentTarget: { checked: true } });
    expect(group.controls.subscribed.value).toBe(true);
    expect(checkboxProps.checked()).toBe(true);

    const numberProps = forms.bindAngularFormControl(
      () => group.controls.age,
      null,
      "number",
    );
    expect(numberProps.value()).toBe("30");
    numberProps["on:input"]({ currentTarget: { value: "35" } });
    expect(group.controls.age.value).toBe(35);

    let submittedEvents = 0;
    let defaultPrevented = false;
    const formProps = forms.bindAngularFormGroup(
      () => group,
      { class: "profile-form" },
      () => {
        submittedEvents += 1;
      },
    );
    expect(formProps.class()).toBe(
      "profile-form ng-touched ng-dirty ng-invalid",
    );
    formProps["on:submit"]({
      preventDefault() {
        defaultPrevented = true;
      },
    });
    expect(defaultPrevented).toBe(true);
    expect(submittedEvents).toBe(1);

    const fgDir = new forms.FormGroupDirective(group);
    fgDir.onSubmit();
    expect(fgDir.submitted).toBe(true);
    fgDir.resetForm({ username: "grace", subscribed: false, age: 40 });
    expect(fgDir.submitted).toBe(false);
    expect(group.controls.username.value).toBe("grace");
  });

  test("NgOptimizedImage, IMAGE_LOADER, IMAGE_CONFIG, and built-in CDN loaders resolve optimized image props", () => {
    expect(COMMON_DIRECTIVES).toContain(NgOptimizedImage);
    expect(defaultImageLoader({ src: "/hero.jpg", width: 400 })).toBe(
      "/hero.jpg",
    );
    expect(DEFAULT_IMAGE_CONFIG.breakpoints.length).toBeGreaterThan(5);

    // Imgix loader + priority + ngSrcset + placeholder
    const imgixEnv = createEnvironmentInjector([
      ...provideImgixLoader("https://cdn.example.com/"),
      {
        provide: IMAGE_CONFIG,
        useValue: { breakpoints: [400, 800], placeholderResolution: 24 },
      },
    ]);

    @Component({
      selector: "app-img-host",
      template: `<img />`,
    })
    class ImgHost {
      readonly kind = "img-host";
    }

    const hostInst = imgixEnv.runInContext(() =>
      instantiateAngularComponent(ImgHost),
    );
    const dynamicSrc = signal("photos/banner.png");
    const prioritySig = signal(true);

    const props = resolveNgOptimizedImageProps(
      hostInst,
      {
        ngSrc: () => dynamicSrc(),
        ngSrcset: () => "400w, 800w",
        width: () => 800,
        height: () => 600,
        priority: () => prioritySig(),
        loaderParams: () => ({ fit: "crop" }),
        placeholder: () => true,
      },
      { alt: "Banner", style: "border-radius: 4px" },
    );

    expect(props["ng-img"]).toBe("true");
    expect(props.alt).toBe("Banner");
    expect(props.src()).toBe(
      "https://cdn.example.com/photos/banner.png?auto=format&w=800&fit=crop",
    );
    expect(props.srcset()).toBe(
      "https://cdn.example.com/photos/banner.png?auto=format&w=400&fit=crop 400w, https://cdn.example.com/photos/banner.png?auto=format&w=800&fit=crop 800w",
    );
    expect(props.width()).toBe(800);
    expect(props.height()).toBe(600);
    expect(props.loading()).toBe("eager");
    expect(props.fetchpriority()).toBe("high");
    expect(props.decoding()).toBe("sync");
    expect(props.style()).toContain("border-radius: 4px");
    expect(props.style()).toContain(
      "background-image: url(https://cdn.example.com/photos/banner.png?auto=format&w=24&q=20&blur=15&fit=crop)",
    );
    expect(props.style()).toContain("filter: blur(15px)");

    prioritySig.set(false);
    expect(props.loading()).toBe("lazy");
    expect(props.fetchpriority()).toBe("auto");
    expect(props.decoding()).toBe("async");

    // Fill mode + responsive breakpoints with Cloudinary, Cloudflare, and Netlify loaders
    const cloudinaryEnv = createEnvironmentInjector([
      ...provideCloudinaryLoader(
        "https://res.cloudinary.com/demo/image/upload",
      ),
      { provide: IMAGE_CONFIG, useValue: { breakpoints: [320, 640] } },
    ]);
    const cloudInst = cloudinaryEnv.runInContext(() =>
      instantiateAngularComponent(ImgHost),
    );
    const fillProps = resolveNgOptimizedImageProps(cloudInst, {
      ngSrc: () => "sample.jpg",
      fill: () => true,
      loaderParams: () => ({ rounded: true }),
    });
    expect(fillProps.src()).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,r_max/sample.jpg",
    );
    expect(fillProps.srcset()).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_320,r_max/sample.jpg 320w, https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640,r_max/sample.jpg 640w",
    );
    expect(fillProps.sizes()).toBe("100vw");
    expect(fillProps.style()).toContain(
      "position: absolute; width: 100%; height: 100%; inset: 0px",
    );

    const cfEnv = createEnvironmentInjector([
      ...provideCloudflareLoader("https://assets.example.com"),
    ]);
    const cfLoader = cfEnv.get(IMAGE_LOADER);
    expect(cfLoader({ src: "/avatar.png", width: 120 })).toBe(
      "https://assets.example.com/cdn-cgi/image/format=auto,width=120/avatar.png",
    );

    const netlifyEnv = createEnvironmentInjector([
      ...provideNetlifyLoader("https://site.netlify.app"),
    ]);
    const netlifyLoader = netlifyEnv.get(IMAGE_LOADER);
    expect(netlifyLoader({ src: "hero.webp", width: 640 })).toBe(
      "https://site.netlify.app/.netlify/images?url=%2Fhero.webp&w=640",
    );

    imgixEnv.destroy();
    cloudinaryEnv.destroy();
    cfEnv.destroy();
    netlifyEnv.destroy();
  });

  test("@angular/ssr & @angular/platform-server tokens, hybrid routing, renderApplication, AngularAppEngine, and CommonEngine", async () => {
    const routes: ServerRoute[] = [
      {
        path: "ssr/:slug",
        renderMode: RenderMode.Server,
        status: 201,
        headers: { "x-route-mode": "server" },
      },
      {
        path: "spa/**",
        renderMode: RenderMode.Client,
        headers: { "x-route-mode": "client" },
      },
      {
        path: "static/about",
        renderMode: RenderMode.Prerender,
        fallback: PrerenderFallback.Server,
      },
    ];

    expect(matchServerRoute(routes, "/ssr/hello")?.params).toEqual({
      slug: "hello",
    });
    expect(
      matchServerRoute(routes, "/spa/dashboard/settings")?.route.renderMode,
    ).toBe(RenderMode.Client);
    expect(matchServerRoute(routes, "/unmatched")).toBeNull();

    class AppShell {
      readonly shell = true;
    }
    const env = createEnvironmentInjector([
      provideServerRouting(routes, withAppShell(AppShell)),
      provideServerRoutesConfig(routes),
      provideServerRendering(withRoutes(routes)),
    ]);
    expect(env.get(PLATFORM_ID)).toBe(PLATFORM_SERVER_ID);
    expect(env.get(SERVER_ROUTES_CONFIG).length).toBe(3);
    expect(env.get(APP_SHELL_COMPONENT)).toBeDefined();
    expect(env.get(ENABLE_DOM_EMULATION)).toBe(true);
    expect(env.get(SERVER_CONTEXT)).toBe("other");
    env.destroy();

    const STATE_KEY = makeStateKey<{ reqPath: string }>("ssr-meta");

    @Component({
      selector: "app-root",
      standalone: true,
      template: `<main></main>`,
    })
    class ServerPageComponent {
      static ɵRender(inst: ServerPageComponent) {
        return `<main data-path="${inst.pathname}" data-ctx="${inst.ctxLabel}">SSR Content</main>`;
      }
      req = inject(REQUEST);
      ctx = inject(REQUEST_CONTEXT) as { region?: string } | undefined;
      resInit = inject(RESPONSE_INIT);
      title = inject(Title);
      meta = inject(Meta);
      transferState = inject(TransferState);
      pathname = this.req ? new URL(this.req.url).pathname : "none";
      ctxLabel = this.ctx?.region ?? "default";

      ngOnInit() {
        this.title.setTitle(`Page ${this.pathname}`);
        this.meta.addTag({
          name: "description",
          content: `Rendered ${this.pathname}`,
        });
        this.transferState.set(STATE_KEY, { reqPath: this.pathname });
        if (this.resInit && this.pathname === "/ssr/custom") {
          this.resInit.headers.set("x-custom-ssr", "1");
        }
      }
    }

    @Component({
      selector: "app-root",
      standalone: true,
      template: `<div class="app-shell">Loading Shell...</div>`,
    })
    class ShellComponent {
      readonly label = "Loading Shell...";
      static ɵRender(inst: ShellComponent) {
        return `<div class="app-shell">${inst.label}</div>`;
      }
    }

    let beforeSerializedRan = 0;
    const renderedHtml = await renderApplication(
      () =>
        bootstrapApplication(ServerPageComponent, {
          providers: [
            provideServerRendering(),
            {
              provide: BEFORE_APP_SERIALIZED,
              useValue: () => {
                beforeSerializedRan += 1;
              },
              multi: true,
            },
          ],
        }),
      {
        url: "https://example.com/render-app",
        document:
          "<!DOCTYPE html><html><head><title>Old</title></head><body><app-root></app-root></body></html>",
      },
    );
    expect(beforeSerializedRan).toBe(1);
    expect(renderedHtml).toContain("<title>Page /render-app</title>");
    expect(renderedHtml).toContain(
      '<meta name="description" content="Rendered /render-app">',
    );
    expect(renderedHtml).toContain(
      '<app-root><main data-path="/render-app" data-ctx="default">SSR Content</main></app-root>',
    );
    expect(renderedHtml).toContain(
      '<script id="ng-state" type="application/json">{"ssr-meta":{"reqPath":"/render-app"}}</script>',
    );

    // AngularAppEngine handles Server routes (with REQUEST, REQUEST_CONTEXT, RESPONSE_INIT) and Client routes (with appShell)
    const engine = new AngularAppEngine({
      bootstrap: ServerPageComponent,
      routes,
      appShell: ShellComponent,
    });

    const ssrRes = await engine.handle(
      new Request("https://example.com/ssr/custom"),
      { region: "ap-southeast-2" },
    );
    expect(ssrRes).not.toBeNull();
    expect(ssrRes!.status).toBe(201);
    expect(ssrRes!.headers.get("x-route-mode")).toBe("server");
    expect(ssrRes!.headers.get("x-custom-ssr")).toBe("1");
    const ssrBody = await ssrRes!.text();
    expect(ssrBody).toContain(
      '<main data-path="/ssr/custom" data-ctx="ap-southeast-2">SSR Content</main>',
    );

    const spaRes = await engine.handle(
      new Request("https://example.com/spa/dashboard"),
    );
    expect(spaRes).not.toBeNull();
    expect(spaRes!.headers.get("x-route-mode")).toBe("client");
    const spaBody = await spaRes!.text();
    expect(spaBody).toContain('<div class="app-shell">Loading Shell...</div>');

    // CommonEngine render with INITIAL_CONFIG and SERVER_CONTEXT
    const common = new CommonEngine({
      bootstrap: ServerPageComponent,
    });
    const commonHtml = await common.render({
      url: "https://example.com/common-engine",
      serverContext: "ssr-common",
      providers: [
        {
          provide: APP_ID,
          useValue: "custom-ng",
        },
      ],
    });
    expect(commonHtml).toContain(
      '<main data-path="/common-engine" data-ctx="default">SSR Content</main>',
    );
    expect(commonHtml).toContain('<script id="custom-ng-state"');

    // Direct withAngularServerContext sync/async
    const syncUrl = withAngularServerContext(
      { request: "https://example.com/ctx-test" },
      () =>
        createEnvironmentInjector([]).runInContext(() => inject(REQUEST)?.url),
    );
    expect(syncUrl).toBe("https://example.com/ctx-test");
    expect(INITIAL_CONFIG).toBeDefined();
  });

  test("TemplateRef, ViewContainerRef.createEmbeddedView, createAngularTemplateRef, renderNgTemplateOutlet, matchesNgContentSelector, and projectAngularContent", () => {
    const hostInst = { prefix: "Item:" };
    const tpl = createAngularTemplateRef<{ $implicit: string; count: number }>(
      hostInst,
      ["refA", "refB"],
      (ctx) => `${hostInst.prefix} ${ctx.$implicit} (${ctx.count})`,
    );
    expect(tpl).toBeInstanceOf(TemplateRef);
    expect(resolveViewChild(hostInst, "refA")).toBe(tpl);
    expect(resolveViewChild(hostInst, "refB")).toBe(tpl);

    expect(renderNgTemplateOutlet(tpl, { $implicit: "Alpha", count: 3 })).toBe(
      "Item: Alpha (3)",
    );
    expect(renderNgTemplateOutlet(null, { $implicit: "Alpha", count: 3 })).toBe(
      null,
    );

    const vcr = new ViewContainerRef();
    const viewRef = vcr.createEmbeddedView(tpl, {
      $implicit: "Beta",
      count: 7,
    });
    expect(vcr.length).toBe(1);
    expect(viewRef.rootNodes).toEqual(["Item: Beta (7)"]);
    expect(viewRef.destroyed).toBe(false);
    vcr.clear();
    expect(vcr.length).toBe(0);
    expect(viewRef.destroyed).toBe(true);

    // Multi-slot <ng-content select="..."> selector matching and projection
    const headerNode = {
      tag: "header",
      props: { class: "card-header primary", "data-slot": "top" },
    };
    const actionNode = {
      tag: "button",
      props: { "card-action": "", id: "save-btn" },
    };
    const bodyText = "Main card body";

    expect(
      matchesNgContentSelector(headerNode, "header.card-header[data-slot=top]"),
    ).toBe(true);
    expect(matchesNgContentSelector(actionNode, "[card-action]")).toBe(true);
    expect(matchesNgContentSelector(actionNode, "#save-btn")).toBe(true);
    expect(matchesNgContentSelector(bodyText, "[card-action]")).toBe(false);

    const children = [headerNode, bodyText, actionNode];
    const selectors = ["header.card-header", "[card-action]"];
    expect(
      projectAngularContent(
        children,
        "header.card-header",
        selectors,
        "no-hdr",
      ),
    ).toEqual([headerNode]);
    expect(
      projectAngularContent(children, "[card-action]", selectors, "no-act"),
    ).toEqual([actionNode]);
    // Default slot receives only nodes not claimed by named selectors
    expect(projectAngularContent(children, null, selectors, "no-body")).toEqual(
      [bodyText],
    );
    // Unmatched selector falls back
    expect(
      projectAngularContent(children, "footer", selectors, "Fallback Footer"),
    ).toBe("Fallback Footer");
  });

  test("bindAngularDirective, contentChild/contentChildren/@ContentChild/@ContentChildren, and DI-backed @Pipe", () => {
    @Injectable({ providedIn: "root" })
    class PrefixService {
      prefix = "TAG:";
    }

    @Pipe({ name: "tagger", standalone: true })
    class TaggerPipe {
      _tagger = true;
      svc = inject(PrefixService);
      transform(val: unknown, suffix = "!") {
        return `${this.svc.prefix}${String(val)}${suffix}`;
      }
    }

    @Directive({
      selector: "[appHighlight]",
      exportAs: "highlighter",
      standalone: true,
      inputs: [{ name: "color", alias: "appHighlight" }],
    })
    class HighlightDirective {
      el = inject(ElementRef);
      @Input("appHighlight") color = "yellow";
      @Output() toggled = new EventEmitter<boolean>();
      active = false;

      @HostBinding("attr.data-hl")
      get hlAttr() {
        return `${this.color}:${this.active ? "on" : "off"}`;
      }

      @HostListener("click")
      onClick() {
        this.active = !this.active;
        this.toggled.emit(this.active);
      }
    }

    @Component({
      selector: "app-panel",
      standalone: true,
    })
    class PanelComponent {
      headerEl = contentChild.required<ElementRef>("panelHeader");
      highlightDir = contentChild(HighlightDirective);
      highlightEl = contentChild(HighlightDirective, { read: ElementRef });
      allHighlights = contentChildren(HighlightDirective);
      @ContentChild("panelHeader") decoratedHeader?: ElementRef;
      @ContentChildren(HighlightDirective)
      decoratedHighlights: HighlightDirective[] = [];
      contentReady = false;

      ngAfterContentInit() {
        this.contentReady =
          Boolean(this.headerEl()) && this.allHighlights().length === 1;
      }
    }

    const env = createEnvironmentInjector([PrefixService]);
    env.runInContext(() => {
      const hostComp = {
        toggledEvents: [] as boolean[],
      };

      let exportedDir: HighlightDirective | undefined;
      const mergedProps = bindAngularDirective(
        hostComp,
        HighlightDirective,
        {
          class: "item",
          appHighlight: () => "gold",
          "on:toggled": (v: boolean) => hostComp.toggledEvents.push(v),
        },
        (dir) => ({
          "data-hl": () => dir.hlAttr,
          onClick: () => dir.onClick(),
        }),
        (dir) => {
          exportedDir = dir;
        },
      );

      expect(exportedDir).toBeInstanceOf(HighlightDirective);
      expect(exportedDir!.color).toBe("gold");
      // Directive input/output props are stripped from DOM attribute props
      expect("appHighlight" in mergedProps).toBe(false);
      expect("on:toggled" in mergedProps).toBe(false);
      expect((mergedProps["data-hl"] as () => string)()).toBe("gold:off");

      // Simulate click listener on directive host
      (mergedProps.onClick as (e: any) => void)({});
      expect(exportedDir!.active).toBe(true);
      expect(hostComp.toggledEvents).toEqual([true]);
      expect((mergedProps["data-hl"] as () => string)()).toBe("gold:on");

      // Register DOM/SSR node with registerViewChild so ElementRef and NG_DIRECTIVE_INSTANCES attach
      const pNode = { tag: "p", props: mergedProps };
      registerViewChild(hostComp, ["hlRef"], pNode, mergedProps);
      expect(exportedDir!.el.nativeElement).toBe(pNode);

      const h2Node = { tag: "h2", props: {} };
      registerViewChild(hostComp, "panelHeader", h2Node);

      // Instantiate PanelComponent with projected children and verify content queries + ngAfterContentInit
      const panel = instantiateAngularComponent(
        PanelComponent,
        { children: [h2Node, pNode] },
        true,
      );
      expect(panel.contentReady).toBe(true);
      expect(panel.headerEl()).toBeInstanceOf(ElementRef);
      expect(panel.headerEl().nativeElement).toBe(h2Node);
      expect(panel.decoratedHeader?.nativeElement).toBe(h2Node);
      expect(panel.highlightDir()).toBe(exportedDir);
      expect(panel.highlightEl()).toBeInstanceOf(ElementRef);
      expect(panel.highlightEl()?.nativeElement).toBe(pNode);
      expect(panel.allHighlights()).toEqual([exportedDir!]);
      expect(panel.decoratedHighlights).toEqual([exportedDir!]);
      expect(typeof TaggerPipe).toBe("function");
      completeAngularViewInit(panel, { tag: "section", props: {} });

      // DI-backed custom @Pipe via applyPipe
      expect(applyPipe("hello", "tagger", "?")).toBe("TAG:hello?");
    });
    env.destroy();
  });
});
