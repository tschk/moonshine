import { serializeData } from "@tschk/moonshine-framework";

// Island props go into a `<script>` tag, the same hazard the server's data
// payload has, so both use the framework's one HTML-safe JSON serializer.
// A second copy here is a second place to forget an escape vector.
export function serializeIslandProps(props: unknown): string {
  const serialized = serializeData(props);
  // Ensure the output is fully sanitized to prevent XSS in <script> tags.
  return serialized
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
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
