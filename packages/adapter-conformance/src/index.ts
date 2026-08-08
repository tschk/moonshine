export { adapterConformance } from "./suite.js";
// Re-exported for the suite's own consumers; the framework owns the shape so
// deploy adapters can name it without depending on the test suite.
export type { Harness, HarnessFactory } from "@tschk/moonshine-framework";
