import { test, expect } from "bun:test";
import { catchError, ErrorBoundary } from "../src/error";
import {
  createRoot,
  createSignal,
  createEffect,
  createErrorOwner,
  errorHandlerKey,
} from "../src/reactive";

test("normalizeError handles Error instances", async () => {
  let caught: Error | undefined;
  createRoot(() => {
    catchError(
      () => {
        throw new Error("standard error");
      },
      (e) => {
        caught = e;
      },
    );
  });
  await Promise.resolve();
  expect(caught).toBeInstanceOf(Error);
  expect(caught?.message).toBe("standard error");
});

test("normalizeError handles string primitives", async () => {
  let caught: Error | undefined;
  createRoot(() => {
    catchError(
      () => {
        throw "string error";
      },
      (e) => {
        caught = e;
      },
    );
  });
  await Promise.resolve();
  expect(caught).toBeInstanceOf(Error);
  expect(caught?.message).toBe("string error");
  expect(caught?.cause).toBe("string error");
});

test("normalizeError handles non-standard objects/primitives", async () => {
  let caught: Error | undefined;
  createRoot(() => {
    catchError(
      () => {
        throw 123;
      },
      (e) => {
        caught = e;
      },
    );
  });
  await Promise.resolve();
  expect(caught).toBeInstanceOf(Error);
  expect(caught?.message).toBe("Unknown error");
  expect(caught?.cause).toBe(123);
});

test("ErrorBoundary normalizes thrown string errors in children", async () => {
  const [shouldThrow, setShouldThrow] = createSignal(false);
  let view: () => string | undefined;
  createRoot(() => {
    view = ErrorBoundary({
      children: () => {
        createEffect(() => {
          if (shouldThrow()) throw "string error";
        });
        return "ok";
      },
      fallback: (e) => {
        return e.message;
      },
    }) as () => string;
  });
  expect(view!()).toBe("ok");
  setShouldThrow(true);
  expect(view!()).toBe("string error");
});

test("ErrorBoundary normalizes non-standard objects thrown in children", async () => {
  const [shouldThrow, setShouldThrow] = createSignal(false);
  let view: () => string | undefined;
  createRoot(() => {
    view = ErrorBoundary({
      children: () => {
        createEffect(() => {
          if (shouldThrow()) throw { custom: true };
        });
        return "ok";
      },
      fallback: (e) => {
        expect(e.cause).toEqual({ custom: true });
        return e.message;
      },
    }) as () => string;
  });
  expect(view!()).toBe("ok");
  setShouldThrow(true);
  expect(view!()).toBe("Unknown error");
});

test("catchError routes failure in handler to parent queue", async () => {
  let caught: Error | undefined;
  createRoot(() => {
    catchError(
      () => {
        catchError(
          () => {
            throw "first error";
          },
          () => {
            throw "handler error";
          },
        );
      },
      (e) => {
        caught = e;
      },
    );
  });
  await Promise.resolve();
  expect(caught).toBeInstanceOf(Error);
  expect(caught?.message).toBe("handler error");
});

test("catchError route returns false if disposed", async () => {
  let caught = false;
  createRoot(() => {
    catchError(
      () => {
        createRoot((d) => {
          catchError(
            () => {
              d(); // Dispose inner scope
              throw new Error("disposed error");
            },
            () => {
              caught = true;
            }, // Should NOT be called
          );
        });
      },
      (e) => {
        expect(e.message).toBe("disposed error");
      },
    );
  });
  await Promise.resolve();
  expect(caught).toBe(false);
});

test("catchError route returns false if disposed and no parent", async () => {
  let caught = false;
  createRoot((dispose) => {
    catchError(
      () => {
        dispose();
        try {
          throw new Error("disposed no parent");
        } catch (e) {
          const errorHandler = createErrorOwner().context?.get(errorHandlerKey);
          if (errorHandler) {
            const handled = (errorHandler as any)(e);
            expect(handled).toBe(false);
          }
        }
      },
      () => {
        caught = true;
      },
    );
  });
  await Promise.resolve();
  expect(caught).toBe(false);
});
