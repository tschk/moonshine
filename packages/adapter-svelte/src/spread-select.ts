import { optionValue } from "@tschk/moonshine-dom/binding";
import { stateEquals } from "./state";

/** Compiler-owned select reconciliation, using the native typed-option store. */
export function createSpreadSelect(
  select: HTMLSelectElement,
  enqueue: (run: () => void) => void,
): {
  update: (attributes: ReadonlyMap<string, unknown>) => void;
  dispose: () => void;
} {
  let attributes: ReadonlyMap<string, unknown> = new Map();
  let initialized = false,
    active = true,
    defaultApplied = false;
  let previousDefault: unknown;
  function reconcile(mounting = false, optionsChanged = false): void {
    if (!active) return;
    const options = Array.from(select.options);
    const defaultValue = attributes.get("defaultValue");
    if (
      attributes.has("defaultValue") &&
      (!defaultApplied || previousDefault !== defaultValue || optionsChanged)
    ) {
      const preserve =
        !optionsChanged && (defaultApplied || attributes.has("value"));
      const index = select.selectedIndex;
      const selected = new Set(options.filter((option) => option.selected));
      for (const option of options) {
        const matches = select.multiple
          ? Array.isArray(defaultValue) &&
            defaultValue.includes(optionValue(option))
          : stateEquals(optionValue(option), defaultValue);
        if (matches) {
          if (!option.hasAttribute("selected"))
            option.setAttribute("selected", "");
        } else option.removeAttribute("selected");
      }
      if (preserve) {
        if (select.multiple)
          for (const option of options) option.selected = selected.has(option);
        else select.selectedIndex = index;
      }
      previousDefault = defaultValue;
      defaultApplied = true;
    }
    if (!mounting && !attributes.has("value")) return;
    const value = attributes.get("value");
    if (select.multiple) {
      if (value == null || !Array.isArray(value)) return;
      for (const option of options)
        option.selected = value.includes(optionValue(option));
    } else {
      const found = options.find((option) =>
        stateEquals(optionValue(option), value),
      );
      if (found) found.selected = true;
      else if (!mounting || value !== undefined) select.selectedIndex = -1;
    }
  }
  const observer = new MutationObserver(() => {
    if (initialized) reconcile(false, true);
  });
  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["value"],
  });
  return {
    update(next) {
      attributes = next;
      if (initialized) reconcile();
      else
        enqueue(() => {
          if (!active || initialized) return;
          reconcile(true);
          initialized = true;
        });
    },
    dispose() {
      active = false;
      observer.disconnect();
    },
  };
}
