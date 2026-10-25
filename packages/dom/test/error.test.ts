import { test, expect } from "bun:test";
import { catchError } from "../src/error";
import { createRoot } from "../src/reactive";

test("catchError routes string error to handler as normalized Error", () => {
  const log: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw "custom string error";
      },
      (e) => {
        log.push(e.message);
      },
    );
  });
  expect(log).toEqual(["custom string error"]);
  stop();
});

test("catchError routes object error to handler as Error with Unknown error and cause", () => {
  const log: Error[] = [];
  let stop!: () => void;
  const objError = { foo: "bar" };
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw objError;
      },
      (e) => {
        log.push(e);
      },
    );
  });
  expect(log.length).toBe(1);
  expect(log[0].message).toBe("Unknown error");
  expect(log[0].cause).toBe(objError);
  stop();
});

test("catchError routes Error instance directly to handler", () => {
  const log: Error[] = [];
  let stop!: () => void;
  const errorInstance = new Error("actual error");
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw errorInstance;
      },
      (e) => {
        log.push(e);
      },
    );
  });
  expect(log.length).toBe(1);
  expect(log[0]).toBe(errorInstance);
  expect(log[0].message).toBe("actual error");
  stop();
});
