/** Native signal bridges and a lazy native renderer; host APIs remain on legacy subpaths. */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export type Readable<T> = {
  get: () => T;
  subscribe: (fn: (value: T) => void) => () => void;
};

export function fromMoonshineSignal<T>(signal: MsSignal<T>): Readable<T> {
  return {
    get: () => signal(),
    subscribe: (fn) => {
      fn(signal());
      return signal.subscribe(() => fn(signal()));
    },
  };
}

export function createBridgedReadable<T>(initial: T): Readable<T> {
  return fromMoonshineSignal(msCreateSignal(initial));
}

export { msCreateSignal as createMoonshineSignal };
export type { MsSignal as MoonshineSignal };
export {
  createResource,
  createSignal as createMsSignal,
  createMemo,
  batch,
  untrack,
} from "@tschk/moonshine";
export type { Resource, ResourceStatus } from "@tschk/moonshine";
export { crepusRenderer } from "@tschk/moonshine-dom/framework-lazy";
export {
  ACTION_ERROR_CODES,
  ActionError,
  ActionInputError,
  isActionError,
  isInputError,
  defineAction,
  getActionQueryString,
  actionPathToString,
  type ActionErrorCode,
  type ActionInputIssue,
  type ErrorInferenceObject,
  type SafeResult,
  type ActionAPIContext,
  type SchemaValidator,
  type ActionAccept,
  type ActionHandler,
  type ActionClient,
} from "./actions";
export {
  AstroCookie,
  AstroCookies,
  createAstroGlobal,
  withAstroContext,
  useAstro,
  type AstroCookieGetOptions,
  type AstroCookieSetOptions,
  type AstroCookieDeleteOptions,
  type ValidRedirectStatus,
  type AstroResponseInit,
  type AstroGlobal,
  type AstroContextInit,
} from "./context";
export {
  TRANSITION_BEFORE_PREPARATION,
  TRANSITION_AFTER_PREPARATION,
  TRANSITION_BEFORE_SWAP,
  TRANSITION_AFTER_SWAP,
  TRANSITION_PAGE_LOAD,
  fade,
  slide,
  none,
  createAnimationScope,
  transition,
  supportsViewTransitions,
  isTransitionEnabled,
  swapFunctions,
  navigate,
  type TransitionAnimation,
  type TransitionAnimationPair,
  type TransitionDirectionalAnimations,
  type AnimationOptions,
  type Direction,
  type NavigationOptions,
} from "./transitions";
export {
  ZodArray,
  ZodBoolean,
  ZodDate,
  ZodError,
  ZodNumber,
  ZodObject,
  ZodString,
  ZodType,
  clearCollections,
  createSchemaContext,
  defineCollection,
  extractMarkdownHeadings,
  getCollection,
  getEntries,
  getEntry,
  getLiveCollection,
  getLiveEntry,
  reference,
  registerCollections,
  render,
  seedCollection,
  slugifyHeading,
  z,
  type CollectionConfig,
  type CollectionEntry,
  type CollectionLoader,
  type ContentLoader,
  type ImageMetadata,
  type InferCollectionSchema,
  type InferObjectOutput,
  type LoaderContext,
  type LoaderStore,
  type LoaderStoreEntry,
  type MarkdownHeading,
  type ReferenceEntry,
  type RenderResult,
  type RenderedContent,
  type SafeParseResult,
  type SchemaContext,
  type SeedEntryInput,
  type ZodIssue,
  type ZodRawShape,
} from "./content";
