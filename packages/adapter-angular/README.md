# `@tschk/moonshine-angular`

The root and `./signals` entries provide native Moonshine signal primitives
(`signal`, `computed`, `linkedSignal`, `effect`, `untracked`, `isSignal`,
`isWritableSignal`, `resource`, `toObservable`, `toSignal`, `input`,
`input.required`, `applyInputValue`, `model`, `model.required`, `output`,
`outputFromObservable`, `outputToObservable`, `createDestroyRef`,
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
  fromMoonshineSignal,
  crepusRenderer,
} from "@tschk/moonshine-angular";
```

| Entry       | Provides                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`         | Native Angular signals, async `resource`, RxJS-compatible `toObservable`/`toSignal`, signal bridges, and lazy native renderer                                                         |
| `./signals` | Host-free Angular signal primitives (`signal`, `computed`, `linkedSignal`, `effect`, `untracked`, `isSignal`, `isWritableSignal`, `resource`, `toObservable`, `toSignal`) and bridges |
| `./core`    | Legacy Angular core re-exports                                                                                                                                                        |
| `./common`  | Legacy Angular common re-exports                                                                                                                                                      |

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

Angular component decorators, dependency injection, compiled-template instructions and lifecycle remain host APIs on the legacy entries. Native rendering does not execute Angular component classes or claim Ivy instruction compatibility.
Source parsing and compilation belong to Crepuscularity; these root runtime
changes do not establish full Angular source support.

## Native template protocol

The locally verified Crepus template emitter accepts `.component.html` templates
without Angular. Compiler publication is separate from the Moonshine SDK.

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
and escaped values on Bun and Node. This protocol does not instantiate Angular
component classes, run their lifecycle hooks or implement Ivy instructions.
