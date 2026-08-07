// Island props go into a `<script>` tag, the same hazard the server's data
// payload has, so both use the framework's one HTML-safe JSON serializer.
// A second copy here is a second place to forget an escape vector.
export { serializeData as serializeIslandProps } from "@tschk/moonshine-framework";

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
