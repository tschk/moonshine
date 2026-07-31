import { describe } from "bun:test";
import { adapterConformance } from "@tschk/moonshine-adapter-conformance";
import { nodeAdapter, nodeHarness } from "../src/index.js";

describe("node adapter", () => {
  adapterConformance(nodeAdapter, nodeHarness);
});
