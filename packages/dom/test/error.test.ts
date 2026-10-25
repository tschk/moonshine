import { test, expect } from "bun:test";
import { catchError, ErrorBoundary } from "../src/error";
import { createRoot, createSignal, createEffect } from "../src/reactive";

test("catchError catches and normalizes string errors", () => {
  let caughtError: Error | undefined;

  createRoot(() => {
    catchError(
      () => {
        throw "string error message";
      },
      (err) => {
        caughtError = err;
      },
    );
  });

  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("string error message");
  expect(caughtError?.cause).toBe("string error message");
});

test("catchError catches and normalizes object errors", () => {
  let caughtError: Error | undefined;
  const objError = { custom: "error" };

  createRoot(() => {
    catchError(
      () => {
        throw objError;
      },
      (err) => {
        caughtError = err;
      },
    );
  });

  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("Unknown error");
  expect(caughtError?.cause).toBe(objError);
});

test("catchError handles regular Error objects unmodified", () => {
  let caughtError: Error | undefined;
  const standardError = new Error("standard error");

  createRoot(() => {
    catchError(
      () => {
        throw standardError;
      },
      (err) => {
        caughtError = err;
      },
    );
  });

  expect(caughtError).toBe(standardError);
  expect(caughtError?.message).toBe("standard error");
});

test("catchError returns normally on success", () => {
  const result = createRoot(() => {
    return catchError(
      () => {
        return "success";
      },
      () => {
        throw new Error("Should not be called");
      },
    );
  });

  expect(result).toBe("success");
});

test("ErrorBoundary renders children when there is no error", () => {
  let result: string | undefined;

  createRoot(() => {
    const view = ErrorBoundary({
      children: () => "success child",
      fallback: () => "fallback content",
    });
    result = view();
  });

  expect(result).toBe("success child");
});

test("ErrorBoundary renders fallback when there is an error and allows reset", () => {
  const [shouldThrow, setShouldThrow] = createSignal(false);
  let view!: () => string | undefined;
  let resetFn: (() => void) | undefined;
  let errorReceived: Error | undefined;

  createRoot(() => {
    view = ErrorBoundary({
      children: () => {
        createEffect(() => {
          if (shouldThrow()) throw new Error("child error");
        });
        return "child content";
      },
      fallback: (error, reset) => {
        errorReceived = error;
        resetFn = reset;
        return "fallback content";
      },
    });
  });

  expect(view()).toBe("child content");

  setShouldThrow(true);
  expect(view()).toBe("fallback content");
  expect(errorReceived).toBeInstanceOf(Error);
  expect(errorReceived?.message).toBe("child error");
  expect(typeof resetFn).toBe("function");

  setShouldThrow(false);
  resetFn?.();
  expect(view()).toBe("child content");
});
