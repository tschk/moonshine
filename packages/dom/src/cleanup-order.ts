export const cleanupOrderKey = /* @__PURE__ */ Symbol(
  "moonshine.cleanup-order",
);
export interface CleanupPolicy {
  reverse: boolean;
  deferRemoval(
    owned: readonly Node[],
    anchor: Node,
    retain: ((node: Node) => boolean) | undefined,
    remove: (
      owned: readonly Node[],
      retained?: ReadonlySet<Node>,
      retain?: (node: Node) => boolean,
    ) => void,
  ): void;
}
