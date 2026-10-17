/** Native binding helpers with Svelte state-proxy identity comparison. */
import {
  bindSelectValue as nativeBindSelectValue,
  bindValue as nativeBindValue,
  type InputValue,
  createInputGroup as nativeCreateInputGroup,
} from "@tschk/moonshine-dom/binding";
import { stateEquals } from "./state";
import {
  createComponentScope,
  getOwner,
  getRenderScheduler,
} from "@tschk/moonshine-dom/reactive";
import {
  bindOwnedReference,
  type ComponentReference,
  type OwnedReference,
} from "@tschk/moonshine-dom/component-instance";
import { captureRuneReferenceCleanup } from "./pre";
export {
  bindChecked,
  bindFiles,
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
  kind: "radio" | "checkbox" | "mixed",
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

/** Compiler-owned element references publish before this element's actions. */
export function bindThis<
  T extends Element,
  Parts extends readonly unknown[] = [],
>(element: T, reference: ComponentReference<T, Parts, unknown>): void {
  const owner = getOwner();
  if (!owner || owner.disposed || owner.disposing)
    throw new Error("Element references require a live native owner");
  if (
    !(element instanceof Element) ||
    !reference ||
    typeof reference.get !== "function" ||
    typeof reference.set !== "function"
  )
    throw new TypeError(
      "Element references require an element and getter/setter functions",
    );
  if (reference.cleanup !== undefined && reference.cleanup !== "commit")
    throw new TypeError(
      "Element reference cleanup must be commit when provided",
    );
  if (reference.publication !== undefined && reference.publication !== "post")
    throw new TypeError(
      "Element reference publication must be post when provided",
    );
  const scheduler = getRenderScheduler();
  if (!scheduler)
    throw new Error("Element references require an opt-in render scheduler");
  const enqueueClear = captureRuneReferenceCleanup();
  createComponentScope(() =>
    scheduler.branch(() => {
      const scope = getOwner()!;
      const posts = getRenderScheduler()!;
      let published = false;
      let firstPublication: (() => void) | undefined;
      bindOwnedReference(
        scope,
        element,
        // Tuple callbacks enter the checked internal path protocol here.
        reference as unknown as OwnedReference<T>,
        (publish) => {
          if (published) publish();
          else
            posts.post(
              (firstPublication ??= () => {
                published = true;
                publish();
              }),
            );
        },
        { cleanup: "commit", previousCheck: "after-set", enqueueClear },
      )();
    }),
  );
}
