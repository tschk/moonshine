import type { ModuleFacts } from "./analyze.js";

export type { ModuleFacts } from "./analyze.js";

export type ModeDecision = {
  mode: "static" | "ssr" | "island" | "spa" | "api";
  reason: string;
};

export type ClassificationInput = {
  explicit?: "auto" | "static" | "ssr" | "island" | "spa" | "api";
  facts: ModuleFacts;
};

export function classifyRoute(input: ClassificationInput): ModeDecision {
  if (input.explicit && input.explicit !== "auto")
    return { mode: input.explicit, reason: "explicit route configuration" };
  if (input.facts.exportsHandler)
    return { mode: "api", reason: "exports request handler" };
  if (input.facts.clientBoundary)
    return { mode: "spa", reason: "route root is a client boundary" };
  if (
    input.facts.requestBound ||
    input.facts.serverOnly ||
    input.facts.exportsLoader ||
    input.facts.exportsAction
  )
    return { mode: "ssr", reason: "uses request-time server data" };
  if (input.facts.interactive)
    return { mode: "island", reason: "contains an interactive client subtree" };
  if (!input.facts.unresolvedDynamicImport)
    return { mode: "static", reason: "deterministic build-time route" };
  return {
    mode: "ssr",
    reason: "dynamic behavior could not be resolved safely",
  };
}
