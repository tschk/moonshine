/** Native binding helpers with Svelte state-proxy identity comparison. */
import {
  bindSelectValue as nativeBindSelectValue,
  bindValue as nativeBindValue,
  type InputValue,
  createInputGroup as nativeCreateInputGroup,
} from "@tschk/moonshine-dom/binding";
import { stateEquals } from "./state";
export {
  bindChecked,
  bindOpen,
  setOptionValue,
  setInputValue,
  type InputValue,
} from "@tschk/moonshine-dom/binding";

export function bindSelectValue(
  select: HTMLSelectElement,
  read: () => unknown,
  write: (value: unknown) => void,
): void {
  nativeBindSelectValue(select, read, write, stateEquals);
}

export function createInputGroup(
  kind: "radio" | "checkbox",
  read: () => unknown,
  write: (value: unknown) => void,
): { bind(input: HTMLInputElement): void } {
  return nativeCreateInputGroup(kind, read, write, stateEquals);
}

/** Svelte numeric bindings write null for an empty number/range input. */
export function bindValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  read: () => InputValue,
  write: (value: string | number | null) => void,
): void {
  nativeBindValue(element, read, (value, reset) => {
    write(
      value === undefined
        ? reset && element.defaultValue !== ""
          ? Number(element.defaultValue)
          : null
        : value,
    );
  });
}
