import { describe, expect, test } from "bun:test";
import {
  ActivatedRoute,
  ControlEvent,
  DefaultUrlSerializer,
  FormBuilder,
  FormControl,
  FormResetEvent,
  FormSubmittedEvent,
  GuardsCheckEnd,
  GuardsCheckStart,
  InjectionToken,
  NavigationCancel,
  NavigationEnd,
  NavigationStart,
  NgForm,
  NgModel,
  NonNullableFormBuilder,
  PristineChangeEvent,
  ROUTER_DIRECTIVES,
  RedirectCommand,
  ResolveEnd,
  ResolveStart,
  Router,
  RouterModule,
  RoutesRecognized,
  StatusChangeEvent,
  TouchedChangeEvent,
  UrlTree,
  Validators,
  ValueChangeEvent,
  bindAngularFormGroup,
  bindAngularNgModel,
  bindAngularRouterLink,
  convertToParamMap,
  createEnvironmentInjector,
  inject,
  instantiateAngularComponent,
  isFormArray,
  isFormControl,
  isFormGroup,
  isFormRecord,
  provideForms,
  provideRouter,
  renderRouterOutlet,
  runInInjectionContext,
  signal,
  toSignal,
  withComponentInputBinding,
  withRouterConfig,
} from "../src/index.ts";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";

describe("adapter-angular host-free reactive forms", () => {
  test("supports FormControl value, signals, validators, touched/dirty state, and reset", () => {
    const control = new FormControl("initial", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    });

    expect(isFormControl(control)).toBe(true);
    expect(isFormGroup(control)).toBe(false);
    expect(control.value).toBe("initial");
    expect(control.defaultValue).toBe("initial");
    expect(control.valid).toBe(true);
    expect(control.status).toBe("VALID");
    expect(control.valueSignal()).toBe("initial");
    expect(control.validSignal()).toBe(true);
    expect(control.statusSignal()).toBe("VALID");
    expect(control.pristineSignal()).toBe(true);
    expect(control.touchedSignal()).toBe(false);

    const events: ControlEvent[] = [];
    const values: string[] = [];
    const statuses: string[] = [];
    const subEvents = control.events.subscribe((event) => events.push(event));
    const subValues = control.valueChanges.subscribe((val) => values.push(val));
    const subStatus = control.statusChanges.subscribe((st) =>
      statuses.push(st),
    );

    control.setValue("ab");
    expect(control.value).toBe("ab");
    expect(control.valid).toBe(false);
    expect(control.invalid).toBe(true);
    expect(control.hasError("minlength")).toBe(true);
    expect(control.getError("minlength")).toEqual({
      requiredLength: 3,
      actualLength: 2,
    });
    expect(control.errorsSignal()).toEqual({
      minlength: { requiredLength: 3, actualLength: 2 },
    });

    control.markAsDirty();
    control.markAsTouched();
    expect(control.dirty).toBe(true);
    expect(control.touched).toBe(true);
    expect(control.pristineSignal()).toBe(false);
    expect(control.touchedSignal()).toBe(true);

    control.reset();
    expect(control.value).toBe("initial");
    expect(control.valid).toBe(true);
    expect(control.pristine).toBe(true);
    expect(control.untouched).toBe(true);

    expect(values).toEqual(["ab", "initial"]);
    expect(statuses).toEqual(["INVALID", "VALID"]);
    expect(events.some((e) => e instanceof ValueChangeEvent)).toBe(true);
    expect(events.some((e) => e instanceof StatusChangeEvent)).toBe(true);
    expect(events.some((e) => e instanceof PristineChangeEvent)).toBe(true);
    expect(events.some((e) => e instanceof TouchedChangeEvent)).toBe(true);
    expect(events.some((e) => e instanceof FormResetEvent)).toBe(true);

    subEvents.unsubscribe();
    subValues.unsubscribe();
    subStatus.unsubscribe();
  });

  test("supports FormGroup, FormArray, FormRecord, disable/enable, getRawValue, and FormBuilder", () => {
    const injector = createEnvironmentInjector([provideForms()]);
    const fb = injector.get(FormBuilder);
    const nnfb = injector.get(NonNullableFormBuilder);

    expect(fb.nonNullable).toBeInstanceOf(NonNullableFormBuilder);
    expect(nnfb).toBeInstanceOf(NonNullableFormBuilder);

    const profile = fb.group({
      name: ["Ada", [Validators.required]],
      email: [
        { value: "ada@analytical.engine", disabled: true },
        [Validators.email],
      ],
      tags: fb.array([
        fb.nonNullable.control("math"),
        fb.nonNullable.control("logic"),
      ]),
      meta: fb.record<number>({
        level: fb.nonNullable.control(3, [
          Validators.min(1),
          Validators.max(5),
        ]),
      }),
    });

    expect(isFormGroup(profile)).toBe(true);
    expect(isFormArray(profile.controls.tags)).toBe(true);
    expect(isFormRecord(profile.controls.meta)).toBe(true);

    // Disabled child excluded from group.value, included in getRawValue()
    expect(profile.value).toEqual({
      name: "Ada",
      tags: ["math", "logic"],
      meta: { level: 3 },
    });
    expect(profile.getRawValue()).toEqual({
      name: "Ada",
      email: "ada@analytical.engine",
      tags: ["math", "logic"],
      meta: { level: 3 },
    });

    // Deep path lookup via get()
    expect(profile.get("tags.1")?.value).toBe("logic");
    expect(profile.get(["meta", "level"])?.value).toBe(3);

    // Patch and array/record mutation
    profile.patchValue({
      name: "Ada Lovelace",
      tags: ["computing"],
    });
    profile.controls.tags.push(fb.nonNullable.control("poetry"));
    profile.controls.meta.setControl(
      "rank",
      fb.nonNullable.control(10, [Validators.max(5)]),
    );

    expect(profile.valid).toBe(false);
    expect(profile.hasError("max", ["meta", "rank"])).toBe(true);

    profile.controls.meta.removeControl("rank");
    expect(profile.valid).toBe(true);

    const liveValue = runInInjectionContext(injector, () =>
      toSignal(profile.valueChanges, { initialValue: profile.value }),
    );
    profile.controls.name.setValue("Augusta Ada");
    expect(liveValue()?.name).toBe("Augusta Ada");

    let submitted = false;
    profile.events.subscribe((event) => {
      if (event instanceof FormSubmittedEvent) {
        submitted = true;
      }
    });
    profile.markAsSubmitted();
    expect(submitted).toBe(true);
  });

  test("supports async validators and Validators.compose / Validators.composeAsync", async () => {
    const asyncTakenCheck = async (control: { value: unknown }) => {
      await Promise.resolve();
      return control.value === "taken" ? { usernameTaken: true } : null;
    };

    const username = new FormControl("available", {
      validators: Validators.compose([
        Validators.required,
        Validators.pattern(/^[a-z]+$/),
      ]),
      asyncValidators: Validators.composeAsync([asyncTakenCheck]),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(username.status).toBe("VALID");
    expect(username.valid).toBe(true);

    username.setValue("taken");
    expect(username.status).toBe("PENDING");
    expect(username.pending).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    expect(username.status).toBe("INVALID");
    expect(username.hasError("usernameTaken")).toBe(true);
  });
});

describe("adapter-angular host-free router", () => {
  test("parses and serializes URLs with query params and fragments via DefaultUrlSerializer", () => {
    const serializer = new DefaultUrlSerializer();
    const tree = serializer.parse(
      "/teams/42/members?role=lead&tag=core&tag=ui#bio",
    );

    expect(tree).toBeInstanceOf(UrlTree);
    expect(tree.queryParams).toEqual({
      role: "lead",
      tag: ["core", "ui"],
    });
    expect(tree.queryParamMap.get("role")).toBe("lead");
    expect(tree.queryParamMap.getAll("tag")).toEqual(["core", "ui"]);
    expect(tree.fragment).toBe("bio");
    expect(serializer.serialize(tree)).toBe(
      "/teams/42/members?role=lead&tag=core&tag=ui#bio",
    );

    const map = convertToParamMap({ id: "99", filter: ["a", "b"] });
    expect(map.keys).toEqual(["id", "filter"]);
    expect(map.has("id")).toBe(true);
    expect(map.get("id")).toBe("99");
    expect(map.getAll("filter")).toEqual(["a", "b"]);
  });

  test("navigates nested routes, runs functional guards & resolvers in injection context, and updates ActivatedRoute signals", async () => {
    class AuthService {
      allowed = true;
      loadProfile(id: string) {
        return Promise.resolve({ id, name: `User ${id}` });
      }
    }
    const AUTH_SERVICE = new InjectionToken<AuthService>("AUTH_SERVICE", {
      factory: () => new AuthService(),
    });

    const injector = createEnvironmentInjector([
      provideRouter(
        [
          {
            path: "",
            pathMatch: "full",
            redirectTo: "/users/7",
          },
          {
            path: "legacy/:id",
            redirectTo: ({ params }) => `/users/${params.id}`,
          },
          {
            path: "users",
            canActivateChild: [() => inject(AUTH_SERVICE).allowed],
            children: [
              {
                path: ":id",
                title: (route) => `Profile #${route.params.id}`,
                data: { section: "directory" },
                resolve: {
                  profile: (route) =>
                    inject(AUTH_SERVICE).loadProfile(
                      route.paramMap.get("id") ?? "0",
                    ),
                },
              },
            ],
          },
          {
            path: "login",
            title: "Sign In",
          },
        ],
        withComponentInputBinding(),
        withRouterConfig({ paramsInheritanceStrategy: "always" }),
      ),
    ]);

    const router = injector.get(Router);
    const route = injector.get(ActivatedRoute);
    const auth = injector.get(AUTH_SERVICE);

    const recordedEvents: unknown[] = [];
    router.events.subscribe((ev) => recordedEvents.push(ev));

    // Initial redirect `/` -> `/users/7`
    const okRoot = await router.navigateByUrl("/");
    expect(okRoot).toBe(true);
    expect(router.url).toBe("/users/7");
    expect(router.urlSignal()).toBe("/users/7");
    expect(router.currentNavigation()).toBeNull();

    expect(route.paramsSignal()).toEqual({ id: "7" });
    expect(route.paramMapSignal().get("id")).toBe("7");
    expect(route.titleSignal()).toBe("Profile #7");
    expect(route.dataSignal()).toEqual({
      section: "directory",
      profile: { id: "7", name: "User 7" },
    });

    // Redirect function `/legacy/12` -> `/users/12?tab=activity#top`
    const okLegacy = await router.navigate(["/legacy", 12], {
      queryParams: { tab: "activity" },
      fragment: "top",
    });
    expect(okLegacy).toBe(true);
    expect(router.url).toBe("/users/12?tab=activity#top");
    expect(route.paramsSignal()).toEqual({ id: "12" });
    expect(route.queryParamsSignal()).toEqual({ tab: "activity" });
    expect(route.fragmentSignal()).toBe("top");
    expect(route.dataSignal()).toEqual({
      section: "directory",
      profile: { id: "12", name: "User 12" },
    });

    // Guard rejection cancels navigation and preserves current URL
    auth.allowed = false;
    const denied = await router.navigateByUrl("/users/99");
    expect(denied).toBe(false);
    expect(router.url).toBe("/users/12?tab=activity#top");

    expect(recordedEvents.some((e) => e instanceof NavigationStart)).toBe(true);
    expect(recordedEvents.some((e) => e instanceof RoutesRecognized)).toBe(
      true,
    );
    expect(recordedEvents.some((e) => e instanceof GuardsCheckStart)).toBe(
      true,
    );
    expect(recordedEvents.some((e) => e instanceof GuardsCheckEnd)).toBe(true);
    expect(recordedEvents.some((e) => e instanceof ResolveStart)).toBe(true);
    expect(recordedEvents.some((e) => e instanceof ResolveEnd)).toBe(true);
    expect(recordedEvents.some((e) => e instanceof NavigationEnd)).toBe(true);
    expect(recordedEvents.some((e) => e instanceof NavigationCancel)).toBe(
      true,
    );
  });

  test("supports RedirectCommand and UrlTree returns from guards and canDeactivate checks", async () => {
    let allowLeave = false;

    const injector = createEnvironmentInjector([
      provideRouter([
        {
          path: "editor",
          canDeactivate: [() => allowLeave],
        },
        {
          path: "admin",
          canActivate: [
            () => {
              const router = inject(Router);
              return new RedirectCommand(
                router.parseUrl("/denied?reason=role"),
              );
            },
          ],
        },
        {
          path: "denied",
        },
      ]),
    ]);

    const router = injector.get(Router);
    const route = injector.get(ActivatedRoute);

    await router.navigateByUrl("/editor");
    expect(router.url).toBe("/editor");

    // Blocked by canDeactivate
    const blocked = await router.navigateByUrl("/denied");
    expect(blocked).toBe(false);
    expect(router.url).toBe("/editor");

    // Allowed once allowLeave = true, then redirected by /admin guard's RedirectCommand
    allowLeave = true;
    const redirected = await router.navigateByUrl("/admin");
    expect(redirected).toBe(true);
    expect(router.url).toBe("/denied?reason=role");
    expect(route.queryParamMapSignal().get("reason")).toBe("role");
  });

  test("supports template-driven NgModel, NgForm, HTML validator inference, and exportAs references", () => {
    const ngForm = new NgForm();
    let submittedForm: NgForm | undefined;
    const exportedRefs: Record<string, unknown> = {};

    const formProps = bindAngularFormGroup(
      ngForm,
      {},
      (ev) => {
        ngForm.onSubmit(ev);
        submittedForm = ngForm;
      },
      (ref) => {
        exportedRefs.f = ref;
      },
    );
    expect(exportedRefs.f).toBe(ngForm);
    expect(String((formProps.class as () => string)())).toContain(
      "ng-pristine",
    );

    const email = signal("ab");
    const changedValues: unknown[] = [];
    const inputProps = bindAngularNgModel(
      {
        getValue: () => email(),
        setValue: (next) => email.set(String(next ?? "")),
        onModelChange: (next) => changedValues.push(next),
        parentGroup: () => ngForm,
        onRegisterNgModel: (model) => {
          exportedRefs.emailCtrl = model;
        },
      },
      {
        name: "email",
        required: true,
        minlength: 3,
      },
    );

    const emailModel = exportedRefs.emailCtrl as NgModel;
    expect(emailModel).toBeInstanceOf(NgModel);
    // Initial value "ab" fails minlength=3
    expect(emailModel.invalid).toBe(true);
    expect(emailModel.errors).toEqual({
      minlength: { requiredLength: 3, actualLength: 2 },
    });
    expect(ngForm.invalid).toBe(true);
    expect(String((inputProps.class as () => string)())).toContain(
      "ng-invalid",
    );

    // Simulate user input event updating to valid value
    const onInput = inputProps["on:input"] as (ev: unknown) => void;
    onInput({ currentTarget: { type: "text", value: "ada@example.com" } });

    expect(email()).toBe("ada@example.com");
    expect(changedValues).toEqual(["ada@example.com"]);
    expect(emailModel.valid).toBe(true);
    expect(emailModel.dirty).toBe(true);
    expect(ngForm.valid).toBe(true);
    expect(ngForm.value).toEqual({ email: "ada@example.com" });

    // Simulate blur event
    const onBlur = inputProps["on:blur"] as (ev: unknown) => void;
    onBlur({});
    expect(emailModel.touched).toBe(true);

    // Simulate submit
    const onSubmit = formProps["on:submit"] as (ev: unknown) => void;
    onSubmit({ preventDefault() {} });
    expect(ngForm.submitted).toBe(true);
    expect(submittedForm).toBe(ngForm);

    // Reset form
    ngForm.reset({ email: "grace@example.com" });
    expect(ngForm.submitted).toBe(false);
    expect(emailModel.pristine).toBe(true);
    expect(emailModel.untouched).toBe(true);
  });

  test("supports RouterModule.forRoot, renderRouterOutlet with route-scoped ActivatedRoute + withComponentInputBinding, and bindAngularRouterLink", async () => {
    expect(ROUTER_DIRECTIVES.length).toBe(3);

    function UserDetailComponent(props: Record<string, unknown>) {
      const route = inject(ActivatedRoute);
      return h(
        "article",
        { "data-user-id": String(props.id ?? route.snapshot.params.id ?? "") },
        `User ${String(props.id ?? "")} (${String(route.snapshot.data.role ?? "")})`,
      );
    }

    const rootModule = RouterModule.forRoot(
      [
        {
          path: "users/:id",
          component: UserDetailComponent,
          data: { role: "admin" },
        },
      ],
      { bindToComponentInputs: true },
    );
    const injector = createEnvironmentInjector(rootModule.providers);

    const router = injector.get(Router);
    await router.navigateByUrl("/users/42?tab=bio#profile");

    class HostShell {
      title = "shell";
    }
    const hostInstance = instantiateAngularComponent(HostShell, {}, injector);

    const activatedComponents: unknown[] = [];
    let outletRef: unknown;
    const outletHtml = renderToString(() =>
      renderRouterOutlet(hostInstance, {
        "on:activate": (comp: unknown) => activatedComponents.push(comp),
        __ngRef: (outlet: unknown) => {
          outletRef = outlet;
        },
      })(),
    );

    expect(outletHtml).toContain('data-user-id="42"');
    expect(outletHtml).toContain("User 42 (admin)");
    expect(activatedComponents).toEqual([UserDetailComponent]);
    expect(outletRef).toBeDefined();

    let rlaRef: { isActive: boolean } | undefined;
    const activeChanges: boolean[] = [];
    const linkProps = bindAngularRouterLink(hostInstance, {
      commands: () => ["/users", 42],
      queryParams: () => ({ tab: "bio" }),
      fragment: () => "profile",
      activeClass: () => "is-active-route",
      activeOptions: () => ({ exact: true }),
      ariaCurrentWhenActive: () => "page",
      onActiveChange: (active) => activeChanges.push(active),
      onRegisterRouterLinkActive: (rla) => {
        rlaRef = rla;
      },
    });

    expect((linkProps.href as () => string)()).toBe(
      "/users/42?tab=bio#profile",
    );
    expect((linkProps.class as () => string)()).toBe("is-active-route");
    expect((linkProps["aria-current"] as () => string)()).toBe("page");
    expect(rlaRef?.isActive).toBe(true);
    expect(activeChanges).toEqual([true]);
  });
});
