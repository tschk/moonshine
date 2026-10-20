# `@tschk/moonshine-angular`

The root and `./signals` entries provide native Moonshine signal primitives
(`signal`, `computed`, `linkedSignal`, `effect`, `untracked`, `isSignal`,
`isWritableSignal`, `resource`, `toObservable`, `toSignal`, `input`,
`input.required`, `applyInputValue`, `model`, `model.required`, `output`,
`outputFromObservable`, `outputToObservable`, `viewChild`, `viewChild.required`,
`viewChildren`, `contentChild`, `contentChild.required`, `contentChildren`,
`applyQueryValue`, `getQueryMetadata`, `InjectionToken`, `HostAttributeToken`,
`Injector`, `EnvironmentInjector`, `createEnvironmentInjector`,
`makeEnvironmentProviders`, `ENVIRONMENT_INITIALIZER`,
`provideEnvironmentInitializer`, `runInInjectionContext`,
`assertInInjectionContext`, `inject`, `DestroyRef`, `createDestroyRef`,
`injectDestroyRef`, `takeUntilDestroyed`, `afterNextRender`, `afterRender`),
signal bridges (`fromMoonshineSignal`, `createBridgedSignal`), and a lazy native
renderer. At runtime, root and `./signals` imports need neither Angular, React,
parser WASM nor the optional framework peer. Legacy host APIs remain explicit on
their existing subpaths.

Strict TypeScript checking of the root entry requires installing
`@tschk/moonshine-framework`, even when importing only a bridge: the root also
exports `crepusRenderer` with the framework's `Renderer` contract. The framework
remains optional for runtime imports and bridge-only browser/Bun/Node bundles.
This requirement does not apply to `./signals` or the signal-only
`@tschk/moonshine` core entry.

```ts
import {
  signal,
  computed,
  linkedSignal,
  effect,
  untracked,
  resource,
  toObservable,
  toSignal,
  InjectionToken,
  createEnvironmentInjector,
  inject,
  viewChild,
  contentChildren,
  fromMoonshineSignal,
  crepusRenderer,
} from "@tschk/moonshine-angular";
```

| Entry        | Provides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | Native Angular signals, signal queries, DI (`inject`, `EnvironmentInjector`), `@Component`/`@Injectable`/`@Pipe` decorators, `CommonModule`, `NgOptimizedImage`, `ReactiveFormsModule`, `FormsModule`, `RouterModule`, `ROUTER_DIRECTIVES`, `@angular/ssr` (`AngularAppEngine`, `CommonEngine`, `RenderMode`, `PrerenderFallback`, `provideServerRouting`, `withRoutes`, `withAppShell`, `REQUEST`, `REQUEST_CONTEXT`, `RESPONSE_INIT`) & `@angular/platform-server` (`provideServerRendering`, `renderApplication`, `INITIAL_CONFIG`, `BEFORE_APP_SERIALIZED`, `ENABLE_DOM_EMULATION`, `SERVER_CONTEXT`), `EventEmitter`, async `resource`/`rxResource`/`httpResource`, `HttpClient`, `toObservable`/`toSignal`, bridges, and lazy SSR renderer                                                                                                                                                                                                                                                                                       |
| `./signals`  | Host-free Angular signal primitives, signal inputs/models/outputs/queries, DI (`InjectionToken`, `Injector`, `EnvironmentInjector`, `inject`), `resource`/`rxResource`, `toObservable`/`toSignal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `./http`     | Host-free `HttpClient`, `httpResource` (`.text`, `.blob`, `.arrayBuffer`), `HttpHeaders`, `HttpParams`, `HttpContext`, `HttpRequest`, `HttpResponse`, `provideHttpClient`, `withInterceptors`, `withFetch`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `./forms`    | Host-free `FormControl`, `FormGroup`, `FormArray`, `FormRecord`, `FormBuilder`, `NonNullableFormBuilder`, `Validators`, `ControlEvent` streams, signal accessors (`valueSignal`, `statusSignal`, `validSignal`, `errorsSignal`), `ReactiveFormsModule`, `FormsModule`, `ControlValueAccessor` (`DefaultValueAccessor`, `CheckboxControlValueAccessor`, `NumberValueAccessor`, `SelectControlValueAccessor`), `FormControlDirective`, `FormControlName`, `FormGroupDirective`, `FormGroupName`, `FormArrayName`, `NgModel`, `NgForm`, `bindAngularFormControl`, `bindAngularFormGroup`, `bindAngularNgModel`, and `provideForms`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `./router`   | Host-free `Router`, `ActivatedRoute`, `ActivatedRouteSnapshot`, `RouterState`, `UrlTree`, `DefaultUrlSerializer`, `RedirectCommand`, router events, functional guards/resolvers, `provideRouter`, `RouterModule`, `ROUTER_DIRECTIVES`, `RouterOutlet`, `RouterLink`, `RouterLinkActive`, `renderRouterOutlet`, and `bindAngularRouterLink`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `./platform` | Host-free `Component`, `Directive`, `Pipe`, `Injectable`, `Input`, `Output`, `ViewChild`, `ViewChildren`, `HostBinding`, `HostListener`, `CommonModule`, `COMMON_DIRECTIVES`, `NgOptimizedImage`, `IMAGE_LOADER`, `IMAGE_CONFIG`, `provideImageKitLoader`, `provideCloudinaryLoader`, `provideCloudflareLoader`, `provideImgixLoader`, `provideNetlifyLoader`, `resolveNgOptimizedImageProps`, `AngularAppEngine`, `CommonEngine`, `RenderMode`, `PrerenderFallback`, `provideServerRouting`, `withRoutes`, `withAppShell`, `provideServerRendering`, `renderApplication`, `REQUEST`, `REQUEST_CONTEXT`, `RESPONSE_INIT`, `withAngularServerContext`, `EventEmitter`, `Title`, `Meta`, `DomSanitizer`, `TransferState`, `PLATFORM_ID`, `ElementRef`, `TemplateRef`, `ViewContainerRef`, `createAngularTemplateRef`, `renderNgTemplateOutlet`, `matchesNgContentSelector`, `projectAngularContent`, `ChangeDetectorRef`, `NgZone`, `Renderer2`, `bootstrapApplication`, `instantiateAngularComponent`, and `getAngularInstanceInjector` |
| `./core`     | Legacy Angular core re-exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `./common`   | Legacy Angular common re-exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

`crepusRenderer` preserves its compatibility name but renders native server
factories, escaped metadata, API JSON and SPA shells. Install
`@tschk/moonshine-framework` when invoking this source-file compatibility facade
under Bun. Bundled deployments use `@tschk/moonshine-dom/framework-native`
explicitly; the facade intentionally keeps source loading outside the static
bundle graph. Legacy React/View IR page outputs reject; native island hydration
is unsupported. The renderer loads only when
called, so signal bridge consumers do not load server rendering.

Legacy entries require their optional host peers: `@angular/core` and `@angular/common`. They cannot be
aliased over arbitrary host-compiled output to remove the host.

## Native `@Component` module & template compilation

The locally verified Crepus compiler accepts both standalone `.component.html` templates
and authored `.component.ts` / `.ng.ts` `@Component` modules (with inline `template`,
optional inline `styles`, and `host` metadata) via `crepus web build --emit moonshine-dom` and `--emit moonshine-ssr`
without the Angular runtime or Ivy compiler instructions. Compiler publication is separate
from the Moonshine SDK.

```html
<ul>
  <li *ngFor="let item of items">{{ item }}</li>
</ul>
<button (click)="save()">Save</button>
```

```sh
crepus web build --site src --entry app.component.html --emit moonshine-dom --out-dir generated
```

```ts
import Template from "./generated/CrepusEmit.moonshine-dom.ts";
import { createBridgedSignal } from "@tschk/moonshine-angular";
import { h, render } from "@tschk/moonshine-dom";

const items = createBridgedSignal(["first", "second"]);
render(
  () =>
    h(Template, {
      scope: () => ({ items: items() }),
      handlers: {
        "save()": () => items.update((values) => [...values, "saved"]),
      },
    }),
  document.getElementById("app")!,
);
```

The scope reader keeps list updates live; handler keys are literal source
expressions, so this template uses `"save()"`. Browser checks cover clicks,
reordering with retained row identity, removal, append and disposal. The
`moonshine-ssr` target renders the same template with an explicit scope object
and escaped values on Bun and Node. When compiling `.component.ts` / `.ng.ts`
modules, `@angular/*` imports (including `@angular/ssr` and `@angular/platform-server`) are rewritten to `@tschk/moonshine-angular*` and
`@Component` classes lower to Moonshine DOM/SSR component functions backed by
`instantiateAngularComponent`, `applyPipe`, `normalizeNgStyle`,
`normalizeNgClass`, `mergeAngularHostProps`, `registerViewChild`,
`resolveViewChild`, `createAngularTemplateRef`, `renderNgTemplateOutlet`,
`projectAngularContent`, `bindAngularFormControl`, `bindAngularFormGroup`,
`bindAngularNgModel`, `resolveAngularFormControl`, `renderRouterOutlet`,
`bindAngularRouterLink`, `resolveNgOptimizedImageProps`, and `completeAngularViewInit` (supporting `@if`/`@else`
including `@if (cond; as alias)`, `@for ... @empty` with `$index`/`$count`/`$first`/`$last`/`$even`/`$odd`
and `; let alias = $var`, `@switch`/`@case`/`@default`, `@defer`/`@placeholder`/`@loading`/`@error`,
`@let name = expr;` local template declarations, `<ng-template #ref let-x let-y="prop">`,
`[ngTemplateOutlet]` / `[ngTemplateOutletContext]` / `[ngTemplateOutletInjector]` / `*ngTemplateOutlet`,
structural directives `*ngIf` (with `else`, `then`, and `as`), `*ngFor` (with `index`/`count`/`first`/`last`/`even`/`odd` and `trackBy`),
and `[ngSwitch]` / `*ngSwitchCase` / `*ngSwitchDefault`,
multi-slot `<ng-content select="...">` and default `<ng-content>` content projection, `<ng-container>`,
`<img ngSrc>` / `[ngSrc]` (`NgOptimizedImage` with `ngSrcset`, `sizes`, `width`, `height`, `priority`, `fill`, `loading`, `loaderParams`, `disableOptimizedSrcset`, `placeholder`, `placeholderConfig`),
`<router-outlet>` and `routerLink`/`[routerLink]`/`routerLinkActive`/`[routerLinkActiveOptions]`/`[queryParams]`/`[fragment]`/`ariaCurrentWhenActive`,
`[(ngModel)]`/`[ngModel]`/`(ngModelChange)`/`#ctrl="ngModel"`/`#f="ngForm"` with HTML validator inference,
`[(prop)]` two-way binding, `[style.x]`/`[ngStyle]`, `[class.x]`/`[ngClass]`,
`[formGroup]`/`(ngSubmit)`/`[formControl]`/`formControlName`/`formGroupName`/`formArrayName`
reactive form bindings with `ng-valid`/`ng-invalid`/`ng-pristine`/`ng-dirty`/`ng-touched`/`ng-untouched`
status classes, `#ref` template references with `viewChild()` / `@ViewChild()`,
and `@HostBinding` / `@HostListener` / `host: {...}`) while preserving `ɵClass`
for `bootstrapApplication`.
