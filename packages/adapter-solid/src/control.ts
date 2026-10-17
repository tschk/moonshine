/** Native accessor-shaped compiler controls; public /solid controls keep their distinct props ABI. */
export * from "@tschk/moonshine-dom/control";
import { Show as nativeShow } from "@tschk/moonshine-dom/control";
import { createComponentScope, untrack } from "@tschk/moonshine-dom/reactive";
export const createSolidShow: typeof nativeShow = (props, schedule) =>
  createComponentScope(() => untrack(() => nativeShow(props, schedule)));
