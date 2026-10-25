import { test, expect } from "bun:test";
import { catchError, ErrorBoundary } from "../src/error";
import { createRoot, createSignal, createEffect } from "../src/reactive";

test("catchError normalizes strings", async () => {
  let caughtError: Error | undefined;
  let dispose!: () => void;
  createRoot((d) => {
    dispose = d;
    catchError(
      () => {
        throw "String error";
      },
      (error) => {
        caughtError = error;
      },
    );
  });

  await new Promise((r) => setTimeout(r, 0));
  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("String error");
  expect(caughtError?.cause).toBe("String error");
  dispose();
});

test("catchError normalizes Error instances", async () => {
  let caughtError: Error | undefined;
  let dispose!: () => void;
  createRoot((d) => {
    dispose = d;
    catchError(
      () => {
        throw new Error("Standard error");
      },
      (error) => {
        caughtError = error;
      },
    );
  });

  await new Promise((r) => setTimeout(r, 0));
  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("Standard error");
  dispose();
});

test("catchError normalizes numbers as Unknown error", async () => {
  let caughtError: Error | undefined;
  let dispose!: () => void;
  createRoot((d) => {
    dispose = d;
    catchError(
      () => {
        throw 42;
      },
      (error) => {
        caughtError = error;
      },
    );
  });

  await new Promise((r) => setTimeout(r, 0));
  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("Unknown error");
  expect(caughtError?.cause).toBe(42);
  dispose();
});

test("catchError normalizes objects as Unknown error", async () => {
  let caughtError: Error | undefined;
  const customError = { bad: true };
  let dispose!: () => void;

  createRoot((d) => {
    dispose = d;
    catchError(
      () => {
        throw customError;
      },
      (error) => {
        caughtError = error;
      },
    );
  });

  await new Promise((r) => setTimeout(r, 0));
  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("Unknown error");
  expect(caughtError?.cause).toBe(customError);
  dispose();
});

test("catchError catches and normalizes null as Unknown error", async () => {
  let caughtError: Error | undefined;
  let dispose!: () => void;

  createRoot((d) => {
    dispose = d;
    catchError(
      () => {
        throw null;
      },
      (error) => {
        caughtError = error;
      },
    );
  });

  await new Promise((r) => setTimeout(r, 0));
  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("Unknown error");
  expect(caughtError?.cause).toBe(null);
  dispose();
});

test("catchError routes to parent when nested", async () => {
  let outerError: Error | undefined;
  let innerError: Error | undefined;
  let dispose!: () => void;

  createRoot((d) => {
    dispose = d;
    catchError(
      () => {
        catchError(
          () => {
            throw new Error("Inner error");
          },
          (error) => {
            innerError = error;
            // Throwing from a handler routes to parent boundary
            throw error;
          },
        );
      },
      (error) => {
        outerError = error;
      },
    );
  });

  await new Promise((r) => setTimeout(r, 0));
  expect(innerError?.message).toBe("Inner error");
  expect(outerError?.message).toBe("Inner error");
  dispose();
});

test("ErrorBoundary renders children and handles fallbacks", async () => {
  const [shouldThrow, setShouldThrow] = createSignal(false);
  let caughtError: Error | undefined;

  let view!: () => string | undefined;
  let dispose!: () => void;

  createRoot((d) => {
    dispose = d;
    view = ErrorBoundary({
      children: () => {
        createEffect(() => {
          if (shouldThrow()) throw new Error("Component error");
        });
        return "Content";
      },
      fallback: (error, reset) => {
        caughtError = error;
        return "Fallback";
      },
    });
  });

  expect(view()).toBe("Content");

  setShouldThrow(true);

  await new Promise((r) => setTimeout(r, 0));
  expect(view()).toBe("Fallback");
  expect(caughtError?.message).toBe("Component error");

  dispose();
});

test("ErrorBoundary unmounts fallback and resets on reset call", async () => {
  const [shouldThrow, setShouldThrow] = createSignal(false);
  let caughtError: Error | undefined;
  let resetFn!: () => void;

  let view!: () => string | undefined;
  let dispose!: () => void;

  createRoot((d) => {
    dispose = d;
    view = ErrorBoundary({
      children: () => {
        createEffect(() => {
          if (shouldThrow()) throw new Error("Component error");
        });
        return "Content";
      },
      fallback: (error, reset) => {
        caughtError = error;
        resetFn = reset;
        return "Fallback";
      },
    });
  });

  expect(view()).toBe("Content");

  setShouldThrow(true);
  await new Promise((r) => setTimeout(r, 0));
  expect(view()).toBe("Fallback");

  setShouldThrow(false);
  resetFn();
  await new Promise((r) => setTimeout(r, 0));
  expect(view()).toBe("Content");

  dispose();
});
