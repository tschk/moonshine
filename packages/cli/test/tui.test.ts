import { afterEach, describe, expect, mock, test } from "bun:test";
import { terminalTui } from "../src/tui";

describe("terminalTui", () => {
  const originalWrite = process.stdout.write;
  const originalConsoleIterator = (console as any)[Symbol.asyncIterator];

  afterEach(() => {
    delete (process.stdout as any).isTTY;
    delete (process.stdout as any).columns;
    process.stdout.write = originalWrite;
    (console as any)[Symbol.asyncIterator] = originalConsoleIterator;
  });

  test("initializes correctly with TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, "columns", {
      value: 100,
      configurable: true,
    });

    const tui = terminalTui();
    expect(tui.isTTY).toBe(true);
    expect(tui.columns).toBe(100);
  });

  test("initializes correctly without TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(process.stdout, "columns", {
      value: undefined,
      configurable: true,
    });

    const tui = terminalTui();
    expect(tui.isTTY).toBe(false);
    expect(tui.columns).toBe(80); // clampColumns defaults to 80
  });

  test("write outputs to stdout", () => {
    const writeMock = mock(() => true);
    process.stdout.write = writeMock as any;

    const tui = terminalTui();
    tui.write("hello world");

    expect(writeMock).toHaveBeenCalledWith("hello world");
  });

  test("prompt writes question and reads from console iterator", async () => {
    const writeMock = mock(() => true);
    process.stdout.write = writeMock as any;

    (console as any)[Symbol.asyncIterator] = async function* () {
      yield "user input";
      yield "more input";
    };

    const tui = terminalTui();
    const result = await tui.prompt("Enter something: ");

    expect(writeMock).toHaveBeenCalledWith("Enter something: ");
    expect(result).toBe("user input");
  });

  test("prompt returns empty string if console iterator yields nothing", async () => {
    const writeMock = mock(() => true);
    process.stdout.write = writeMock as any;

    (console as any)[Symbol.asyncIterator] = async function* () {};

    const tui = terminalTui();
    const result = await tui.prompt("Enter something: ");

    expect(result).toBe("");
  });
});
