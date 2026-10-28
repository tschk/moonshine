import { describe, expect, test } from "bun:test";
import { clampColumns, truncate, warningBar, terminalTui } from "../src/tui";

describe("clampColumns", () => {
  test("returns 80 for undefined, non-finite, or 0 (falsy) values", () => {
    expect(clampColumns(undefined)).toBe(80);
    expect(clampColumns(0)).toBe(80);
    expect(clampColumns(NaN)).toBe(80);
    expect(clampColumns(Infinity)).toBe(80);
    expect(clampColumns(-Infinity)).toBe(80);
  });

  test("clamps to a minimum of 20, including negative numbers", () => {
    expect(clampColumns(-5)).toBe(20);
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

  test("returns the original text when it is exactly the width", () => {
    expect(truncate("exact", 5)).toBe("exact");
    expect(truncate("a", 1)).toBe("a");
    expect(truncate("", 0)).toBe("");
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

  test("handles empty string gracefully", () => {
    expect(truncate("", 5)).toBe("");
    expect(truncate("", 1)).toBe("");
    expect(truncate("", -1)).toBe("");
  });

  test("handles strings with spaces", () => {
    expect(truncate("a b c", 3)).toBe("a …");
    expect(truncate("a b c", 4)).toBe("a b…");
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
  test("creates a TUI instance", () => {
    const tui = terminalTui();
    expect(tui).toHaveProperty("isTTY");
    expect(tui).toHaveProperty("columns");
    expect(typeof tui.write).toBe("function");
    expect(typeof tui.prompt).toBe("function");
  });

  test("write outputs to process.stdout", () => {
    const tui = terminalTui();
    let written = "";
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      written += chunk.toString();
      return true;
    }) as any;

    try {
      tui.write("hello write");
      expect(written).toBe("hello write");
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test("prompt outputs question and reads from console", async () => {
    const tui = terminalTui();
    let written = "";
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      written += chunk.toString();
      return true;
    }) as any;

    const originalConsole = globalThis.console;
    globalThis.console = {
      ...originalConsole,
      [Symbol.asyncIterator]: async function* () {
        yield "user input line 1";
        yield "user input line 2";
      },
    } as any;

    try {
      const result = await tui.prompt("Question? ");
      expect(written).toBe("Question? ");
      expect(result).toBe("user input line 1");
    } finally {
      process.stdout.write = originalWrite;
      globalThis.console = originalConsole;
    }
  });

  test("prompt handles empty console stream", async () => {
    const tui = terminalTui();
    const originalWrite = process.stdout.write;
    process.stdout.write = (() => true) as any;

    const originalConsole = globalThis.console;
    globalThis.console = {
      ...originalConsole,
      [Symbol.asyncIterator]: async function* () {},
    } as any;

    try {
      const result = await tui.prompt("Q: ");
      expect(result).toBe("");
    } finally {
      process.stdout.write = originalWrite;
      globalThis.console = originalConsole;
    }
  });
});
