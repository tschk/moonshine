import assert from "node:assert/strict";
import { sourceRealm } from "../src/platform.js";

assert.equal(sourceRealm(), globalThis);
assert.deepEqual(Object.keys(await import("../src/platform.js")), [
  "sourceRealm",
]);
