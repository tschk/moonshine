import type {
  ComponentExports,
  ComponentProps,
  MountOptions,
  UnmountOptions,
} from "./mount-types";
export type {
  ComponentView,
  ComponentFactory,
  ComponentProps,
  ComponentExports,
  MountOptions,
  UnmountOptions,
} from "./mount-types";
function unavailable(name: string): never {
  throw new Error(
    `lifecycle_function_unavailable\n\`${name}(...)\` is not available on the server\nhttps://svelte.dev/e/lifecycle_function_unavailable`,
  );
}
export function mount<C extends (...args: never[]) => unknown>(
  _component: C & ([ComponentExports<C>] extends [never] ? never : unknown),
  _options: MountOptions<ComponentProps<C>>,
): ComponentExports<C> {
  return unavailable("mount");
}
export function unmount(
  _instance: object,
  _options?: UnmountOptions,
): Promise<void> {
  return unavailable("unmount");
}
