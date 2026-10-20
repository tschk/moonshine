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
  ApplicationInitStatus,
  applyPipe,
  AsyncPipe,
  Attribute,
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
import { input, model, output, viewChild, viewChildren } from "../src/signals";

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
        events.push(`changes:${Object.keys(changes).sort().join(",")}`);
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
});
