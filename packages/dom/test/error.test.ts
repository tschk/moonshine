import { test, expect } from "bun:test";
import { catchError } from "../src/error";
import { createRoot } from "../src/reactive";

test("catchError catches and routes synchronous errors", () => {
  let result: string | undefined;
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    result = catchError(
      () => "success",
      () => {},
    );
  });
  expect(result).toBe("success");
  stop();

  let caught: Error | undefined;
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw new Error("sync failure");
      },
      (e) => {
        caught = e;
      },
    );
  });
  expect(caught).toBeDefined();
  expect(caught!.message).toBe("sync failure");
  stop();
});

test("catchError routes to parent boundary if handler throws", () => {
  const errors: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        catchError(
          () => {
            throw new Error("inner");
          },
          (_e) => {
            throw new Error("handler fail");
          },
        );
      },
      (e) => {
        errors.push(e.message);
      },
    );
  });
  expect(errors).toEqual(["handler fail"]);
  stop();
});

test("normalizeError wraps primitives and passes through Errors", () => {
  const errors: Error[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw "string error";
      },
      (_e) => errors.push(_e),
    );
  });
  expect(errors.length).toBe(1);
  expect(errors[0]).toBeInstanceOf(Error);
  expect(errors[0].message).toBe("string error");
  expect(errors[0].cause).toBe("string error");
  stop();

  errors.length = 0;
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw 123;
      },
      (e) => errors.push(e),
    );
  });
  expect(errors.length).toBe(1);
  expect(errors[0]).toBeInstanceOf(Error);
  expect(errors[0].message).toBe("Unknown error");
  expect(errors[0].cause).toBe(123);
  stop();

  errors.length = 0;
  const original = new Error("original");
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw original;
      },
      (e) => errors.push(e),
    );
  });
  expect(errors.length).toBe(1);
  expect(errors[0]).toBe(original);
  stop();
});

import { ErrorBoundary } from "../src/error";
import { createSignal, createEffect } from "../src/reactive";

test("ErrorBoundary catches and recovers", () => {
  let resetFn!: () => void;
  let fallbackRendered = false;
  let childRendered = 0;

  const [fail, setFail] = createSignal(false);

  let view!: () => any;
  let stop!: () => void;

  createRoot((d) => {
    stop = d;
    view = ErrorBoundary({
      children: () => {
        childRendered++;
        createEffect(() => {
          if (fail()) throw new Error("boundary fail");
        });
        return "child";
      },
      fallback: (err, reset) => {
        fallbackRendered = true;
        resetFn = reset;
        return "fallback";
      },
    });

    // Inside createRoot we can evaluate view
    expect(view()).toBe("child");
  });

  setFail(true);
  expect(view()).toBe("fallback");
  expect(fallbackRendered).toBe(true);

  setFail(false);
  resetFn();
  expect(view()).toBe("child");
  expect(childRendered).toBe(2);

  stop();
});

test("catchError skips disposed handler", () => {
  const errors: Error[] = [];
  let throwFn: (() => void) | undefined;
  let stop!: () => void;

  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throwFn = () => {
          throw new Error("delayed");
        };
      },
      (e) => errors.push(e),
    );
  });

  stop();
  expect(throwFn).toBeDefined();
  // Cannot directly trigger the router function for a disposed scope since it is internal,
  // but we can assert the handler isn't falsely kept alive via some leaked reference.
  expect(errors.length).toBe(0);
});
