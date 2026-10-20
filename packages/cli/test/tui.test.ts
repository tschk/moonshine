import { describe, expect, spyOn, test } from "bun:test";
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
    expect(truncate("", 5)).toBe("");
    expect(truncate("", 0)).toBe("");
  });

  test("truncates with an ellipsis if width is greater than 1", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
    expect(truncate("hello", 4)).toBe("hel…");
    expect(truncate("hello", 2)).toBe("h…");
    expect(truncate("a very long string", 10)).toBe("a very lo…");
  });

  test("truncates without an ellipsis if width is 1 or less", () => {
    expect(truncate("hello", 1)).toBe("h");
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", -5)).toBe("");
    expect(truncate("a", 1)).toBe("a");
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
  test("returns expected properties and write method works", () => {
    const tui = terminalTui();
    expect(typeof tui.isTTY).toBe("boolean");
    expect(typeof tui.columns).toBe("number");

    let written = "";
    const mockStdout = spyOn(process.stdout, "write").mockImplementation(
      (text: string | Uint8Array) => {
        written += text.toString();
        return true;
      },
    );

    tui.write("hello world");
    expect(written).toBe("hello world");

    mockStdout.mockRestore();
  });

  test("prompt works with async iterator", async () => {
    const tui = terminalTui();
    let written = "";
    const mockStdout = spyOn(process.stdout, "write").mockImplementation(
      (text: string | Uint8Array) => {
        written += text.toString();
        return true;
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalConsoleIterator = (console as any)[Symbol.asyncIterator];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any)[Symbol.asyncIterator] = async function* () {
      yield "fake input";
    };

    const res = await tui.prompt("test?");
    expect(res).toBe("fake input");
    expect(written).toBe("test?");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any)[Symbol.asyncIterator] = originalConsoleIterator;
    mockStdout.mockRestore();
  });

  test("prompt returns empty string if no input", async () => {
    const tui = terminalTui();
    let written = "";
    const mockStdout = spyOn(process.stdout, "write").mockImplementation(
      (text: string | Uint8Array) => {
        written += text.toString();
        return true;
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalConsoleIterator = (console as any)[Symbol.asyncIterator];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any)[Symbol.asyncIterator] = async function* () {};

    const res = await tui.prompt("test2?");
    expect(res).toBe("");
    expect(written).toBe("test2?");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any)[Symbol.asyncIterator] = originalConsoleIterator;
    mockStdout.mockRestore();
  });
});
