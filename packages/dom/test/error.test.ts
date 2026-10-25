import { test, expect } from "bun:test";
import { catchError, ErrorBoundary } from "../src/error";
import { createRoot, createSignal } from "../src/reactive";

test("catchError normalizes unknown strings and objects to Error", async () => {
  let stringErr: Error | undefined;
  let objectErr: Error | undefined;
  let errorErr: Error | undefined;

  let dispose = createRoot((d) => {
    catchError(
      () => { throw "string failure" },
      (e) => stringErr = e
    );
    catchError(
      () => { throw { fail: true } },
      (e) => objectErr = e
    );
    catchError(
      () => { throw new Error("real error") },
      (e) => errorErr = e
    );
    return d;
  });

  await Promise.resolve();

  expect(stringErr).toBeInstanceOf(Error);
  expect(stringErr?.message).toBe("string failure");
  expect(stringErr?.cause).toBe("string failure");

  expect(objectErr).toBeInstanceOf(Error);
  expect(objectErr?.message).toBe("Unknown error");
  expect(objectErr?.cause).toEqual({ fail: true });

  expect(errorErr).toBeInstanceOf(Error);
  expect(errorErr?.message).toBe("real error");

  dispose();
});

test("catchError propagates upward if disposed", async () => {
  let outerErr: Error | undefined;
  let innerErr: Error | undefined;
  let disposeOuter = createRoot((d) => {
    catchError(
      () => {
        let disposeInner = createRoot((innerD) => {
          catchError(
            () => {
              innerD();
              throw "inner failure";
            },
            (e) => innerErr = e
          );
          return innerD;
        });
      },
      (e) => outerErr = e
    );
    return d;
  });

  await Promise.resolve();

  expect(innerErr).toBeUndefined();
  expect(outerErr).toBeInstanceOf(Error);
  expect(outerErr?.message).toBe("inner failure");

  disposeOuter();
});

test("ErrorBoundary unwraps successfully or catches error", async () => {
  const [shouldThrow, setShouldThrow] = createSignal(false);
  let errorState: Error | undefined;
  let view: () => string | undefined;

  let dispose = createRoot((d) => {
    view = ErrorBoundary({
      children: () => {
        if (shouldThrow()) throw "child failure";
        return "success";
      },
      fallback: (error, reset) => {
        errorState = error;
        return "fallback";
      }
    });
    return d;
  });

  await Promise.resolve();
  expect(view!()).toBe("success");

  setShouldThrow(true);
  await Promise.resolve();
  expect(view!()).toBe("fallback");
  expect(errorState).toBeInstanceOf(Error);
  expect(errorState?.message).toBe("child failure");

  dispose();
});

test("catchError handles failure inside the handler itself", async () => {
  let outerErr: Error | undefined;

  let dispose = createRoot((d) => {
    catchError(
      () => {
        catchError(
          () => { throw "first failure" },
          () => { throw "handler failure" }
        );
      },
      (e) => outerErr = e
    );
    return d;
  });

  await Promise.resolve();

  expect(outerErr).toBeInstanceOf(Error);
  expect(outerErr?.message).toBe("handler failure");
  expect(outerErr?.cause).toBe("handler failure");

  dispose();
});

test("catchError bypasses queueErrorHandler if scope is disposed before microtask executes", async () => {
  let innerErr: Error | undefined;

  let disposeOuter = createRoot((d) => {
    catchError(
      () => {
        let disposeInner: any;
        createRoot((innerD) => {
          disposeInner = innerD;
          catchError(
            () => {
              throw "inner failure"; // queueErrorHandler gets called since scope isn't disposed yet
            },
            (e) => innerErr = e
          );
        });
        // Dispose right after the throw but before microtask executes
        disposeInner();
      },
      (e) => {
         // Because it was disposed before microtask executes, queueErrorHandler's callback checks `if (scope.disposed) return;`
         // So neither innerErr nor outerErr gets called by the inner boundary if parent is not called directly.
      }
    );
    return d;
  });

  await Promise.resolve();

  // inner handler should be bypassed due to scope.disposed
  expect(innerErr).toBeUndefined();

  disposeOuter();
});
