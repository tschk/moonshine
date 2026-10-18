/** Optional compiler-facing element bindings; no hydration or compiler ABI. */
import {
  createRenderEffect,
  createRoot,
  getOwner,
  onCleanup,
  untrack,
} from "./reactive";

export type InputValue = string | number | null | undefined;

/** Install after user toggle listeners; nullish state closes rather than adopts. */
export function bindOpen(
  element: HTMLDetailsElement,
  read: () => boolean | null | undefined,
  write: (value: boolean) => void,
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Open bindings require a live native owner");
  if (
    !(element instanceof HTMLDetailsElement) ||
    typeof read !== "function" ||
    typeof write !== "function"
  )
    throw new TypeError(
      "Open bindings require details and getter/setter functions",
    );
  const toggle = () => untrack(() => write(element.open));
  element.addEventListener("toggle", toggle);
  onCleanup(() => element.removeEventListener("toggle", toggle));
  createRenderEffect(() => {
    element.open = Boolean(read());
  });
}

/** Call after element attributes and user listeners are installed, under a live owner. */
export function bindValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  read: () => InputValue,
  write: (value: string | number | undefined, reset?: true) => void,
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Value bindings require a live native owner");
  if (
    !(element instanceof HTMLTextAreaElement) &&
    (!(element instanceof HTMLInputElement) ||
      ![
        "text",
        "search",
        "tel",
        "url",
        "email",
        "password",
        "number",
        "range",
        "date",
        "datetime-local",
        "month",
        "week",
        "time",
        "color",
      ].includes(element.type))
  )
    throw new TypeError(
      "Value bindings support text, numeric, date/time and color inputs or textarea",
    );
  const numberlike = () =>
    element instanceof HTMLInputElement &&
    (element.type === "number" || element.type === "range");
  function value(text = element.value): string | number | undefined {
    if (!numberlike()) return text;
    const number = text === "" ? NaN : Number(text);
    return Number.isNaN(number) ? undefined : number;
  }
  function apply(): void {
    const next = read();
    // Preserve numeric formatting/caret when the represented number is unchanged.
    if (numberlike() && next === value()) return;
    const text = String(next ?? "");
    if (element.value !== text) element.value = text;
  }
  const input = (reset?: true) =>
    untrack(() => {
      if (reset) write(value(element.defaultValue), true);
      else write(value());
      apply();
    });
  listen(element, "input", input);
  untrack(() => {
    if (read() == null && element.value) write(value());
  });
  createRenderEffect(apply);
}

function listen(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  eventName: "input" | "change",
  handler: (reset?: true) => void,
): void {
  let active = true;
  const reset = (event: Event) => {
    if (event.target !== element.form || !element.form) return;
    queueMicrotask(() => {
      if (!active || event.defaultPrevented) return;
      handler(true);
    });
  };
  const document = element.ownerDocument;
  const listener = () => handler();
  element.addEventListener(eventName, listener);
  // shortcut: connected forms only; add form-local tracking if detached-form support is required.
  document.addEventListener("reset", reset, true);
  onCleanup(() => {
    active = false;
    element.removeEventListener(eventName, listener);
    document.removeEventListener("reset", reset, true);
  });
}

/** FileList binding; nullish models leave the browser's current selection intact. */
export function bindFiles(
  element: HTMLInputElement,
  read: () => FileList | null | undefined,
  write: (value: FileList | null) => void,
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Files bindings require a live native owner");
  if (
    !(element instanceof HTMLInputElement) ||
    element.type !== "file" ||
    typeof read !== "function" ||
    typeof write !== "function"
  )
    throw new TypeError(
      "Files bindings require a file input and getter/setter functions",
    );
  listen(element, "change", () => untrack(() => write(element.files)));
  createRenderEffect(() => {
    const files = read();
    if (files != null) element.files = files;
  });
}

/** Checkbox checked binding; call after attributes and user change listeners. */
export function bindChecked(
  element: HTMLInputElement,
  read: () => boolean | null | undefined,
  write: (value: boolean) => void,
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Checked bindings require a live native owner");
  if (!(element instanceof HTMLInputElement) || element.type !== "checkbox")
    throw new TypeError("Checked bindings support checkbox inputs only");
  const apply = () => {
    element.checked = Boolean(read());
  };
  listen(element, "change", () =>
    untrack(() => {
      write(element.checked);
      apply();
    }),
  );
  untrack(() => {
    if (read() == null) write(element.checked);
  });
  createRenderEffect(apply);
}

const optionValues = new WeakMap<HTMLOptionElement, unknown>();
const selectUpdates = new WeakMap<HTMLSelectElement, () => void>();

/** Preserve source-level option identity; plain h(option,{value}) stays string-valued. */
export function setOptionValue(
  option: HTMLOptionElement,
  value: unknown,
): void {
  if (!(option instanceof HTMLOptionElement))
    throw new TypeError("Option values require an option element");
  const text = value == null ? "" : String(value);
  optionValues.set(option, value);
  option.value = text;
  const select = option.closest("select");
  if (select) untrack(() => selectUpdates.get(select)?.());
}
export function optionValue(option: HTMLOptionElement): unknown {
  return optionValues.has(option) ? optionValues.get(option) : option.value;
}

/** Typed single/multiple select binding, after options and user listeners are installed. */
export function bindSelectValue(
  select: HTMLSelectElement,
  read: () => unknown,
  write: (value: unknown) => void,
  equal: (left: unknown, right: unknown) => boolean = Object.is,
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Select bindings require a live native owner");
  if (!(select instanceof HTMLSelectElement))
    throw new TypeError("Select bindings require a select element");
  if (selectUpdates.has(select))
    throw new Error("Select already has a value binding");
  function selected(reset = false): unknown {
    const options = Array.from(select.options).filter((option) =>
      reset ? option.hasAttribute("selected") : option.selected,
    );
    if (select.multiple) return options.map(optionValue);
    const option =
      options[0] ??
      Array.from(select.options).find((candidate) => !candidate.disabled);
    return option ? optionValue(option) : null;
  }
  function apply(): void {
    const next = read();
    if (select.multiple) {
      if (next == null) return;
      if (!Array.isArray(next))
        throw new TypeError(
          "Multiple select bindings require an array or nullish value",
        );
      for (const option of select.options)
        option.selected = next.includes(optionValue(option));
    } else {
      let found = false;
      for (const option of select.options) {
        const matches = !found && equal(optionValue(option), next);
        option.selected = matches;
        if (matches) found = true;
      }
      if (!found) select.selectedIndex = -1;
    }
  }
  listen(select, "change", (reset) =>
    untrack(() => {
      const value = selected(reset);
      write(value);
      // An unchanged accepted value preserves the user's duplicate option choice.
      // Rejected/transformed writes still reconcile the DOM with the actual model.
      if (select.multiple || !equal(read(), value)) apply();
    }),
  );
  let active = true;
  const observer = new MutationObserver(() => {
    if (active) untrack(apply);
  });
  selectUpdates.set(select, apply);
  onCleanup(() => {
    active = false;
    observer.disconnect();
    selectUpdates.delete(select);
  });
  untrack(() => {
    // Typed undefined is a real option value; match it before default adoption.
    if (!select.multiple && read() === undefined) {
      const match = Array.from(select.options).find((option) =>
        equal(optionValue(option), undefined),
      );
      if (match) match.selected = true;
    }
    if (
      read() === undefined &&
      (select.multiple ||
        Array.from(select.options).some((option) => option.selected))
    )
      write(selected());
  });
  createRenderEffect(apply);
  observer.observe(select, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["value", "selected"],
  });
}

const inputValues = /* @__PURE__ */ new WeakMap<HTMLInputElement, unknown>();
const inputUpdates = /* @__PURE__ */ new WeakMap<
  HTMLInputElement,
  () => void
>();

/** Compiler hook for typed radio/checkbox values; ordinary DOM values stay strings. */
export function setInputValue(input: HTMLInputElement, value: unknown): void {
  if (!(input instanceof HTMLInputElement))
    throw new TypeError("Input values require an input element");
  const text = value == null ? "" : String(value);
  inputValues.set(input, value);
  input.value = text;
  untrack(() => inputUpdates.get(input)?.());
}
function inputValue(input: HTMLInputElement): unknown {
  return inputValues.has(input) ? inputValues.get(input) : input.value;
}

/** One explicit token per compiler binding target; never inferred from HTML names. */
export function createInputGroup(
  kind: "radio" | "checkbox" | "mixed",
  read: () => unknown,
  write: (value: unknown) => void,
  equal: (left: unknown, right: unknown) => boolean = Object.is,
): { bind(input: HTMLInputElement): void } {
  const owner = getOwner();
  if (!owner || owner.disposed || owner.disposing)
    throw new Error("Input groups require a live native owner");
  if (kind !== "radio" && kind !== "checkbox" && kind !== "mixed")
    throw new TypeError(
      "Input groups support radio, checkbox or mixed inputs only",
    );
  type Member = {
    input: HTMLInputElement;
    checkbox: boolean;
    stop: () => void;
  };
  const members = new Set<Member>();
  let active = true;
  function release(member: Member): void {
    if (!members.delete(member)) return;
    inputUpdates.delete(member.input);
    member.stop();
  }
  onCleanup(() => {
    active = false;
    let failed = false,
      failure: unknown;
    for (const member of members) {
      try {
        release(member);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  });
  function apply(member: Member): void {
    if (!active || !members.has(member)) return;
    const value = read();
    if (member.checkbox) {
      if (value != null && !Array.isArray(value))
        throw new TypeError(
          "Checkbox groups require an array or nullish value",
        );
      member.input.checked =
        (value as unknown[] | null | undefined)?.includes(
          inputValue(member.input),
        ) ?? false;
    } else member.input.checked = equal(inputValue(member.input), value);
  }
  return {
    bind(input) {
      const current = getOwner();
      if (!active || !current || current.disposed || current.disposing)
        throw new Error(
          "Input group members require a live group and native owner",
        );
      if (
        !(input instanceof HTMLInputElement) ||
        (kind === "mixed"
          ? input.type !== "radio" && input.type !== "checkbox"
          : input.type !== kind)
      )
        throw new TypeError(
          kind === "mixed"
            ? "Input group requires radio or checkbox inputs"
            : `Input group requires ${kind} inputs`,
        );
      if (inputUpdates.has(input))
        throw new Error("Input already belongs to a group");
      const checkbox =
        kind === "checkbox" || (kind === "mixed" && input.type === "checkbox");
      const member: Member = { input, checkbox, stop: () => {} };
      onCleanup(() => release(member));
      try {
        createRoot((stop) => {
          member.stop = stop;
          members.add(member);
          inputUpdates.set(input, () => apply(member));
          listen(input, "change", (reset) =>
            untrack(() => {
              if (!active || !members.has(member)) return;
              if (reset) write(checkbox ? [] : null);
              else if (!checkbox) write(inputValue(input));
              else {
                const ordered = [...members].toSorted((a, b) => {
                  const position = a.input.compareDocumentPosition(b.input);
                  return position & Node.DOCUMENT_POSITION_DISCONNECTED
                    ? 0
                    : position & Node.DOCUMENT_POSITION_FOLLOWING
                      ? -1
                      : position & Node.DOCUMENT_POSITION_PRECEDING
                        ? 1
                        : 0;
                });
                const values = new Set(
                  ordered
                    .filter((entry) => entry.input.checked)
                    .map((entry) => inputValue(entry.input)),
                );
                if (!input.checked) values.delete(inputValue(input));
                write([...values]);
              }
              for (const entry of members) apply(entry);
            }),
          );
          createRenderEffect(() => apply(member));
        });
      } catch (error) {
        try {
          release(member);
        } catch {
          /* Preserve binding setup failure. */
        }
        throw error;
      }
    },
  };
}
