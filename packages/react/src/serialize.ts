// Island props go into a `<script>` tag, the same hazard the server's data
// payload has, so both use the framework's one HTML-safe JSON serializer.
// A second copy here is a second place to forget an escape vector.
import { serializeData } from "@tschk/moonshine-framework";

function rejectDangerouslySetInnerHTML(value: unknown, seen = new Set<unknown>()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if ("dangerouslySetInnerHTML" in value) {
    throw new Error("serializeIslandProps: dangerouslySetInnerHTML is not allowed");
  }
  for (const key in value as Record<string, unknown>) {
    rejectDangerouslySetInnerHTML((value as Record<string, unknown>)[key], seen);
  }
}

export function serializeIslandProps(value: unknown): string {
  rejectDangerouslySetInnerHTML(value);
  return serializeData(value);
}

function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function escapeHtml(value: string): string {
  return escapeHtmlValue(value);
}
