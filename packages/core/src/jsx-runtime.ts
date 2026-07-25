/**
 * Thin JSX runtime re-export.
 *
 * Moonshine apps use the React JSX transform. Point TypeScript `jsxImportSource`
 * at `@tschk/moonshine` (or import from `@tschk/moonshine/jsx-runtime`).
 * The runtime itself is React's — use only when building TSX apps.
 *
 * tsconfig:
 * ```json
 * { "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@tschk/moonshine" } }
 * ```
 */
export { jsx, jsxs, Fragment } from "react/jsx-runtime";
export type { JSX } from "react/jsx-runtime";
