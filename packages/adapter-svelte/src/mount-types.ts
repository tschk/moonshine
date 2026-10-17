/** Erased return metadata supplied only by the native SFC compiler. */
declare const componentMetadata: unique symbol;
export type ComponentView<
  View,
  Exports extends object,
  Props extends object,
> = View & {
  readonly [componentMetadata]?: { props: Props; exports: Exports };
};
type Metadata<C extends (...args: never[]) => unknown> = [
  ReturnType<C>,
] extends [never]
  ? never
  : typeof componentMetadata extends keyof NonNullable<ReturnType<C>>
    ? NonNullable<NonNullable<ReturnType<C>>[typeof componentMetadata]>
    : never;
export type ComponentProps<C extends (...args: never[]) => unknown> = [
  Metadata<C>,
] extends [never]
  ? never
  : Metadata<C> extends { props: infer P extends object }
    ? P
    : never;
export type ComponentExports<C extends (...args: never[]) => unknown> = [
  Metadata<C>,
] extends [never]
  ? never
  : Metadata<C> extends { exports: infer E extends object }
    ? E
    : never;
/** Restrict the actual public callable while retaining its native view return type. */
export type ComponentFactory<C extends (...args: never[]) => unknown> = [
  Metadata<C>,
] extends [never]
  ? never
  : {} extends ComponentProps<C>
    ? (props?: ComponentProps<C>) => ReturnType<C>
    : (props: ComponentProps<C>) => ReturnType<C>;
export type MountOptions<Props> = {
  target: Element | ShadowRoot;
  anchor?: Node;
  context?: ReadonlyMap<unknown, unknown>;
  /** Source transitions remain unsupported; both boolean intro values are accepted. */
  intro?: boolean;
} & ({} extends Props ? { props?: Props } : { props: Props });
export type UnmountOptions = { outro?: false };
