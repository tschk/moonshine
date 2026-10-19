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
  NonNullableFormBuilder,
  PristineChangeEvent,
  RedirectCommand,
  ResolveEnd,
  ResolveStart,
  Router,
  RoutesRecognized,
  StatusChangeEvent,
  TouchedChangeEvent,
  UrlTree,
  Validators,
  ValueChangeEvent,
  convertToParamMap,
  createEnvironmentInjector,
  inject,
  isFormArray,
  isFormControl,
  isFormGroup,
  isFormRecord,
  provideForms,
  provideRouter,
  runInInjectionContext,
  toSignal,
  withComponentInputBinding,
  withRouterConfig,
} from "../src/index.ts";

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
});
