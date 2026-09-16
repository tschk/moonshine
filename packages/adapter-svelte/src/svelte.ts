/**
 * Host library re-export. `svelte` is a peer; this file is the subpath
 * apps import when they want the real compiler runtime through moonshine.
 */
export { onMount, onDestroy, tick, createEventDispatcher } from "svelte";
