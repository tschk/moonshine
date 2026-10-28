import { test, expect } from "bun:test";
import { catchError, ErrorBoundary } from "../src/error";
import {
  createRoot,
  createSignal,
  getOwner,
  errorHandlerKey,
} from "../src/reactive";

test("normalizeError handles strings", () => {
  let caught: Error | undefined;
  createRoot(() => {
    catchError(
      () => {
        throw "string error";
      },
      (err) => {
        caught = err;
      },
    );
  });
  expect(caught).toBeInstanceOf(Error);
  expect(caught?.message).toBe("string error");
  expect(caught?.cause).toBe("string error");
});

test("normalizeError handles unknown objects", () => {
  let caught: Error | undefined;
  createRoot(() => {
    catchError(
      () => {
        throw { some: "object" };
      },
      (err) => {
        caught = err;
      },
    );
  });
  expect(caught).toBeInstanceOf(Error);
  expect(caught?.message).toBe("Unknown error");
  expect(caught?.cause).toEqual({ some: "object" });
});

test("normalizeError passes through Error instances", () => {
  let caught: Error | undefined;
  const original = new Error("original");
  createRoot(() => {
    catchError(
      () => {
        throw original;
      },
      (err) => {
        caught = err;
      },
    );
  });
  expect(caught).toBe(original);
});

test("catchError returns fn result on success", () => {
  let result: string | undefined;
  createRoot(() => {
    result = catchError(
      () => "success",
      () => {},
    );
  });
  expect(result).toBe("success");
});

test("handler failure is passed to parent if it exists", () => {
  let parentCaught: Error | undefined;
  createRoot(() => {
    catchError(
      () => {
        catchError(
          () => {
            throw new Error("first");
          },
          () => {
            throw "second";
          },
        );
      },
      (err) => {
        parentCaught = err;
      },
    );
  });
  expect(parentCaught).toBeInstanceOf(Error);
  expect(parentCaught?.message).toBe("second");
  expect(parentCaught?.cause).toBe("second");
});

test("handler failure is normalized and re-thrown if no parent catches", () => {
  let caughtError: Error | undefined;

  try {
    createRoot(() => {
      catchError(
        () => {
          throw new Error("first");
        },
        () => {
          throw "second";
        },
      );
    });
  } catch (e) {
    caughtError = e as Error;
  }

  expect(caughtError).toBeInstanceOf(Error);
  expect(caughtError?.message).toBe("second");
});

test("route ignores errors if scope is disposed", async () => {
  let stop!: () => void;
  let handlerCalled = false;
  let route: any;

  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        route = getOwner()?.context?.get(errorHandlerKey);
      },
      () => {
        handlerCalled = true;
      },
    );
  });

  expect(route).toBeDefined();

  stop();

  const returned = route("late error");
  expect(returned).toBe(false);

  await Promise.resolve();
  expect(handlerCalled).toBe(false);
});

test("route forwards errors to the parent boundary once its scope is disposed", async () => {
  let stop!: () => void;
  let innerCalled = false;
  let parentCaught: Error | undefined;
  let route: any;

  createRoot(() => {
    catchError(
      () => {
        createRoot((d) => {
          stop = d;
          catchError(
            () => {
              route = getOwner()?.context?.get(errorHandlerKey);
            },
            () => {
              innerCalled = true;
            },
          );
        });
      },
      (err) => {
        parentCaught = err;
      },
    );
  });

  stop();

  expect(route("late error")).toBe(true);
  await Promise.resolve();
  expect(innerCalled).toBe(false);
  expect(parentCaught?.message).toBe("late error");
});

test("ErrorBoundary renders children on success", () => {
  let result: (() => string | undefined) | undefined;
  createRoot(() => {
    result = ErrorBoundary({
      children: () => "child",
      fallback: () => "error",
    });
  });
  expect(result?.()).toBe("child");
});

test("ErrorBoundary renders fallback on error", () => {
  let result: (() => string | undefined) | undefined;
  createRoot(() => {
    result = ErrorBoundary({
      children: () => {
        throw new Error("child error");
      },
      fallback: () => "error",
    });
  });
  expect(result?.()).toBe("error");
});

test("ErrorBoundary allows resetting the error state", () => {
  let result: (() => string | undefined) | undefined;
  const [shouldThrow, setShouldThrow] = createSignal(true);
  let resetFn: (() => void) | undefined;

  createRoot(() => {
    result = ErrorBoundary({
      children: () => {
        if (shouldThrow()) {
          throw new Error("child error");
        }
        return "recovered child";
      },
      fallback: (_error, reset) => {
        resetFn = reset;
        return "error fallback";
      },
    });
  });

  expect(result?.()).toBe("error fallback");

  setShouldThrow(false);
  resetFn?.();

  expect(result?.()).toBe("recovered child");
});
