import { resolve } from "node:path";
import { describe } from "bun:test";
import {
  adapterConformance,
  artifactConformance,
  bunRuntime,
} from "@tschk/moonshine-adapter-conformance";
import { bunAdapter, bunHarness } from "../src/index.js";

describe("bun adapter", () => {
  adapterConformance(bunAdapter, bunHarness);
  artifactConformance(bunAdapter, bunRuntime, resolve(import.meta.dir, ".."));
});
