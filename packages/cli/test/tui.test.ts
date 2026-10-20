import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { clampColumns, terminalTui, truncate, warningBar } from "../src/tui";

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

describe("terminalTui", () => {
  let originalIsTTY: boolean | undefined;
  let originalColumns: number | undefined;
  let writeSpy: any;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalColumns = process.stdout.columns;
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    if (originalIsTTY !== undefined) {
      process.stdout.isTTY = originalIsTTY;
    } else {
      delete (process.stdout as any).isTTY;
    }
    if (originalColumns !== undefined) {
      process.stdout.columns = originalColumns;
    } else {
      delete (process.stdout as any).columns;
    }
    writeSpy.mockRestore();
  });

  test("initializes correctly when stdout is a TTY", () => {
    process.stdout.isTTY = true;
    process.stdout.columns = 120;
    const tui = terminalTui();
    expect(tui.isTTY).toBe(true);
    expect(tui.columns).toBe(100);
  });

  test("initializes correctly when stdout is not a TTY", () => {
    process.stdout.isTTY = false;
    process.stdout.columns = undefined as any;
    const tui = terminalTui();
    expect(tui.isTTY).toBe(false);
    expect(tui.columns).toBe(80);
  });

  test("write calls process.stdout.write", () => {
    const tui = terminalTui();
    tui.write("test output");
    expect(writeSpy).toHaveBeenCalledWith("test output");
  });

  test("prompt writes question and reads from console", async () => {
    const tui = terminalTui();

    const originalConsole = globalThis.console;
    let consoleIterated = false;
    (globalThis as any).console = {
      ...originalConsole,
      async *[Symbol.asyncIterator]() {
        consoleIterated = true;
        yield "user input";
      }
    };

    const result = await tui.prompt("Question? ");
    expect(writeSpy).toHaveBeenCalledWith("Question? ");
    expect(result).toBe("user input");
    expect(consoleIterated).toBe(true);

    (globalThis as any).console = originalConsole;
  });
});
