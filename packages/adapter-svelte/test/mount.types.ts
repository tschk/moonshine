import type { DOMChild } from "@tschk/moonshine-dom/dom";
import {
  mount,
  unmount,
  type ComponentView,
  type ComponentFactory,
  type ComponentProps,
  type ComponentExports,
} from "../src/mount";
import { mount as serverMount } from "../src/server-mount";
declare const target: Element;
type Exports = {
  answer: number;
  mutable: number;
  read: () => number;
  identity: <T>(value: T) => T;
  readonly derived: number;
};
declare function Impl(
  props: any,
): ComponentView<DOMChild, Exports, { id: string; count?: number }>;
const App = Impl as ComponentFactory<typeof Impl>;
App({ id: "one" });
const app = mount(App, { target, props: { id: "one" } });
const _n: number = app.read();
app.mutable = 2;
app.answer = 43;
app.read = () => 3;
const _identity: { value: number } = app.identity({ value: 1 });
// @ts-expect-error required public callable argument
App();
// @ts-expect-error public callable wrong prop
App({ id: 1 });
// @ts-expect-error public callable missing prop
App({});
// @ts-expect-error required metadata prop despite implementation any
mount(Impl, { target, props: {} });
// @ts-expect-error incorrect metadata prop despite implementation any
mount(Impl, { target, props: { id: 1 } });
// @ts-expect-error required public mount props
mount(App, { target });
// @ts-expect-error incorrect export
app.missing();
// @ts-expect-error precise mutable setter payload
app.mutable = "bad";
// @ts-expect-error public constant field stays writable but typed
app.answer = "bad";
// @ts-expect-error replaced method preserves signature
app.read = () => "bad";
// @ts-expect-error getter-only export readonly
app.derived = 5;
// @ts-expect-error generic return precise
const _wrongGeneric: string = app.identity(1);
// @ts-expect-error explicit generic argument precise
app.identity<number>("bad");
// @ts-expect-error unknown option
mount(App, { target, props: { id: "x" }, events: {} });
// @ts-expect-error unsupported transitions
unmount(app, { outro: true });
declare function Unmarked(props: { id: string }): DOMChild;
// @ts-expect-error no compiler metadata
mount(Unmarked, { target, props: { id: "one" } });
type IsNever<T> = [T] extends [never] ? true : false;
const _unmarkedFactory: true = null as unknown as IsNever<
  ComponentFactory<typeof Unmarked>
>;
const _unmarkedProps: true = null as unknown as IsNever<
  ComponentProps<typeof Unmarked>
>;
const _unmarkedExports: true = null as unknown as IsNever<
  ComponentExports<typeof Unmarked>
>;
const server = serverMount(App, { target, props: { id: "server" } });
const _serverN: number = server.read();
// @ts-expect-error server rejects incorrect props too
serverMount(App, { target, props: { id: 1 } });
// @ts-expect-error server export retains types
server.missing();
declare function OptionalImpl(
  props: any,
): ComponentView<DOMChild, {}, { label?: string }>;
const Optional = OptionalImpl as ComponentFactory<typeof OptionalImpl>;
Optional();
Optional({});
mount(Optional, { target });
mount(Optional, { target, props: { label: "one" } });
// @ts-expect-error optional props still precise
Optional({ label: 1 });
declare function FragmentImpl(
  props: any,
): ComponentView<readonly DOMChild[], { read: () => number }, { id: string }>;
const Fragment = FragmentImpl as ComponentFactory<typeof FragmentImpl>;
const fragmentView: readonly DOMChild[] = Fragment({ id: "one" });
const _fragmentExport: number = mount(Fragment, {
  target,
  props: { id: "one" },
}).read();
// @ts-expect-error fragment metadata required props
Fragment({});
const _props: ComponentProps<typeof App> = { id: "one" };
void fragmentView;
