import { describe } from "bun:test";
import { adapterConformance } from "@tschk/moonshine-adapter-conformance";
import { bunAdapter, bunHarness } from "../src/index.js";

describe("bun adapter", () => {
  adapterConformance(bunAdapter, bunHarness);
});
