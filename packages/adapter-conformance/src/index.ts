export { adapterConformance } from "./suite.js";
export {
  artifactConformance,
  bunRuntime,
  nodeRuntime,
  vercelRuntime,
  workerdRuntime,
  type ArtifactRuntime,
  type RunningArtifact,
} from "./artifact.js";
// Re-exported for the suite's own consumers; the framework owns the shape so
// deploy adapters can name it without depending on the test suite.
export type { Harness, HarnessFactory } from "@tschk/moonshine-framework";
