import { afterEach, expect, test } from "bun:test";
import { bindFiles } from "../src/binding";
import { createRoot, createSignal } from "../src/reactive";
import "../../react/test/dom";

afterEach(() => document.body.replaceChildren());

const list = (...names: string[]) => {
  const transfer = new DataTransfer();
  for (const name of names) transfer.items.add(new File(["x"], name));
  return transfer.files;
};

const fileInput = () => {
  const input = document.createElement("input");
  input.type = "file";
  document.body.append(input);
  return input;
};

test("files bindings require a live owner and a file input with function accessors", () => {
  const input = fileInput();
  expect(() =>
    bindFiles(
      input,
      () => null,
      () => {},
    ),
  ).toThrow("live native owner");
  createRoot((dispose) => {
    const text = document.createElement("input");
    expect(() =>
      bindFiles(
        text,
        () => null,
        () => {},
      ),
    ).toThrow(TypeError);
    expect(() => bindFiles(input, null as never, () => {})).toThrow(TypeError);
    expect(() => bindFiles(input, () => null, null as never)).toThrow(
      TypeError,
    );
    dispose();
    expect(() =>
      bindFiles(
        input,
        () => null,
        () => {},
      ),
    ).toThrow("live native owner");
  });
});

test("nullish models neither adopt nor clear the current selection", () => {
  for (const initial of [null, undefined]) {
    const input = fileInput();
    const selected = list("a.txt");
    input.files = selected;
    const [value, set] = createSignal<FileList | null | undefined>(initial);
    const writes: unknown[] = [];
    const dispose = createRoot((stop) => {
      bindFiles(input, value, (next) => writes.push(next));
      return stop;
    });
    expect(writes).toEqual([]);
    expect(input.files).toBe(selected);
    set(null);
    set(undefined);
    expect(input.files).toBe(selected);
    dispose();
  }
});

test("programmatic lists apply synchronously, change events write, and disposal detaches", () => {
  const input = fileInput();
  const [value, set] = createSignal<FileList | null>(null);
  const writes: (FileList | null)[] = [];
  const dispose = createRoot((stop) => {
    bindFiles(input, value, (next) => {
      writes.push(next);
      set(next);
    });
    return stop;
  });
  const first = list("a.txt", "b.txt");
  set(first);
  expect(input.files).toBe(first);
  expect(input.files!.length).toBe(2);
  expect(writes).toEqual([]);

  const picked = list("c.txt");
  input.files = picked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  expect(writes).toEqual([picked]);

  const empty = list();
  set(empty);
  expect(input.files).toBe(empty);
  expect(input.files!.length).toBe(0);

  dispose();
  input.files = picked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  expect(writes).toEqual([picked]);
  set(first);
  expect(input.files).toBe(picked);
});
