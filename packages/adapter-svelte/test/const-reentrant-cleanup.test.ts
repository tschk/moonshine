import { test, expect } from "bun:test";
import {
  createComponent,
  getComponentContext,
  withComponentCleanupConsumer,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import {
  createRoot,
  getOwner,
  runWithOwner,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
test("disposal inside cleanup cannot erase the no-owned-work capability mid-computation", () => {
  let owner!: Owner,
    frame!: ComponentContext,
    calls = 0;
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        owner = getOwner()!;
        frame = getComponentContext();
      },
      {},
      "dom",
    );
    return dispose;
  });
  runWithOwner(owner, () =>
    withComponentCleanupConsumer(frame, () => {
      stop();
      expect(() =>
        createRoot((release) => {
          calls++;
          release();
        }),
      ).toThrow("effect_in_teardown");
    }),
  );
  expect(calls).toBe(0);
});
