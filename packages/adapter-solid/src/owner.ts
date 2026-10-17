/** Native owner callback boundary; Solid compiler owners are unsupported. */
export {
  getOwner,
  runWithOwnerCallback as runWithOwner,
} from "@tschk/moonshine-dom/reactive";
export type { Owner } from "@tschk/moonshine-dom/reactive";
