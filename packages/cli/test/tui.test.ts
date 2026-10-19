import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spyOn } from "bun:test";
import { clampColumns, terminalTui, truncate, warningBar } from "../src/tui";

describe("terminalTui", () => {
  let originalIsTTY: boolean | undefined;
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    if (originalIsTTY !== undefined) {
      Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    } else {
      delete (process.stdout as any).isTTY;
    }
    if (originalColumns !== undefined) {
      Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
    } else {
      delete (process.stdout as any).columns;
    }
  });

  test("initializes Tui correctly based on process.stdout", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: 120, configurable: true });

    const tui = terminalTui();
    expect(tui.isTTY).toBe(true);
    expect(tui.columns).toBe(100); // Clamped to MAX_COLUMNS
  });

  test("write delegates to process.stdout.write", () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const tui = terminalTui();
    tui.write("hello");
    expect(writeSpy).toHaveBeenCalledWith("hello");
    writeSpy.mockRestore();
  });

  test("prompt writes question and awaits console iterator", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const iteratorSpy = spyOn(console as any, Symbol.asyncIterator as any).mockImplementation(async function* () {
      yield "user input";
    });

    const tui = terminalTui();
    const answer = await tui.prompt("Age? ");

    expect(writeSpy).toHaveBeenCalledWith("Age? ");
    expect(answer).toBe("user input");

    writeSpy.mockRestore();
    iteratorSpy.mockRestore();
  });

  test("prompt returns empty string if iterator yields nothing", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    const iteratorSpy = spyOn(console as any, Symbol.asyncIterator as any).mockImplementation(async function* () {});

    const tui = terminalTui();
    const answer = await tui.prompt("Age? ");

    expect(writeSpy).toHaveBeenCalledWith("Age? ");
    expect(answer).toBe("");

    writeSpy.mockRestore();
    iteratorSpy.mockRestore();
  });
});

describe("clampColumns", () => {
  test("returns 80 for undefined or non-finite values", () => {
    expect(clampColumns(undefined)).toBe(80);
    expect(clampColumns(NaN)).toBe(80);
    expect(clampColumns(Infinity)).toBe(80);
    expect(clampColumns(-Infinity)).toBe(80);
  });

  test("clamps to a minimum of 20", () => {
    expect(clampColumns(10)).toBe(20);
    expect(clampColumns(19)).toBe(20);
    expect(clampColumns(20)).toBe(20);
  });

  test("clamps to a maximum of 100", () => {
    expect(clampColumns(100)).toBe(100);
    expect(clampColumns(101)).toBe(100);
    expect(clampColumns(150)).toBe(100);
  });

  test("returns the exact value if within range, rounding down floats", () => {
    expect(clampColumns(50)).toBe(50);
    expect(clampColumns(50.5)).toBe(50);
    expect(clampColumns(99.9)).toBe(99);
  });
});

describe("truncate", () => {
  test("returns the original text if length is within width", () => {
    expect(truncate("hello", 5)).toBe("hello");
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("", 5)).toBe("");
  });

  test("truncates with an ellipsis if width is greater than 1", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
    expect(truncate("hello", 4)).toBe("hel…");
    expect(truncate("hello", 2)).toBe("h…");
  });

  test("truncates without an ellipsis if width is 1 or less", () => {
    expect(truncate("hello", 1)).toBe("h");
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", -5)).toBe("");
  });

  test("handles exact boundaries correctly", () => {
    expect(truncate("hello", 6)).toBe("hello"); // length < width
    expect(truncate("hello", 5)).toBe("hello"); // length == width
    expect(truncate("hello", 4)).toBe("hel…"); // length > width
  });

  test("handles long strings", () => {
    const longText = "a".repeat(100);
    expect(truncate(longText, 50)).toBe("a".repeat(49) + "…");
  });
});

describe("warningBar", () => {
  test("formats properly with ANSI codes when isTTY is true", () => {
    const tui = { isTTY: true, columns: 10 };
    // text: "Hello", max(0, 8) -> 8. "Hello" is 5 chars, so truncate returns "Hello".
    // body: " Hello ".padEnd(10, " ") -> " Hello    "
    expect(warningBar("Hello", tui)).toBe("\x1b[30;43m Hello    \x1b[0m");

    // text: "Longer text here", max(0, 8) -> 8. truncate("Longer text here", 8) -> "Longer …"
    // body: " Longer … ".padEnd(10, " ") -> " Longer … " (length 10)
    expect(warningBar("Longer text here", tui)).toBe(
      "\x1b[30;43m Longer … \x1b[0m",
    );
  });

  test("formats properly with !! prefix when isTTY is false", () => {
    const tui = { isTTY: false, columns: 10 };
    // width = 10, width - 3 = 7.
    // text: "Hello", truncate("Hello", 7) -> "Hello"
    expect(warningBar("Hello", tui)).toBe("!! Hello");

    // text: "Longer text here", truncate("Longer text here", 7) -> "Longer…"
    expect(warningBar("Longer text here", tui)).toBe("!! Longer…");
  });
});
