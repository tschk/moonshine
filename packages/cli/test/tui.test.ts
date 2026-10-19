import { describe, expect, test } from "bun:test";
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

describe("terminalTui", () => {
  // Save the original process.stdout properties
  const originalIsTTY = process.stdout.isTTY;
  const originalColumns = process.stdout.columns;

  test("initializes correctly when stdout is a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: 90, configurable: true });

    const tui = terminalTui();
    expect(tui.isTTY).toBe(true);
    expect(tui.columns).toBe(90);

    // restore
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
  });

  test("initializes correctly when stdout is not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: undefined, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: undefined, configurable: true });

    const tui = terminalTui();
    expect(tui.isTTY).toBe(false);
    expect(tui.columns).toBe(80); // clampColumns fallback

    // restore
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
  });

  test("write outputs to process.stdout", () => {
    const originalWrite = process.stdout.write;
    let writtenText = "";
    process.stdout.write = ((text: string) => {
      writtenText = text;
      return true;
    }) as any;

    const tui = terminalTui();
    tui.write("hello from tui");
    expect(writtenText).toBe("hello from tui");

    process.stdout.write = originalWrite;
  });

  test("prompt writes question and reads from console", async () => {
    const originalWrite = process.stdout.write;
    let writtenText = "";
    process.stdout.write = ((text: string) => {
      writtenText = text;
      return true;
    }) as any;

    const tui = terminalTui();
    const promptPromise = tui.prompt("continue? ");

    // In test environment, console async iteration will be empty
    const answer = await promptPromise;
    expect(writtenText).toBe("continue? ");
    expect(answer).toBe("");

    process.stdout.write = originalWrite;
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
