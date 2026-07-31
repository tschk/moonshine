/**
 * svelte/store re-exports + moonshine bridges live on package root.
 *
 * ```ts
 * import { writable, readable, derived, get } from "@tschk/moonshine-svelte/store";
 * ```
 */
export { derived, get, readable, readonly, writable } from "svelte/store";
export type { Readable, Writable } from "svelte/store";
