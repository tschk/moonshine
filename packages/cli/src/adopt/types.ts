/** The shapes a scan and a plan travel in. */
import type { RouteConvention } from "@tschk/moonshine-compiler";
import type { Framework } from "./frameworks.js";

export type { Framework };

export type NextImport = {
  /** Project-relative file holding the import. */
  file: string;
  specifier: string;
  /** Whether `@tschk/moonshine-next` implements this specifier. */
  aliasable: boolean;
};

export type TemplateFile = {
  /** Project-relative `.svelte` / `.vue` file. */
  file: string;
  /** URL path this template becomes, when it maps to one. */
  route?: string;
  /** Project-relative route module generated for it. */
  generated?: string;
  /** Whether the crepuscularity frontend compiled the template. */
  ok: boolean;
  /** View IR nodes produced. */
  nodes?: number;
  /** The compiled View IR, embedded in the generated route module. */
  ir?: unknown;
  /** IR schema version the parser emitted. */
  irVersion?: number;
  /** Parse error, verbatim. Unsupported constructs are errors, not silent drops. */
  error?: string;
};

export type AdoptScan = {
  projectDir: string;
  framework: Framework;
  /** Project-relative route directory, when one was found. */
  routesDir?: string;
  convention?: RouteConvention;
  routes: { path: string; file: string }[];
  /** Templates compiled to View IR, for the Svelte and Vue paths. */
  templates: TemplateFile[];
  imports: NextImport[];
  conventions: string[];
  /** Blunt list of what adoption does not carry over. */
  manual: string[];
};

export type AdoptChange = {
  file: string;
  summary: string;
  /** What the write does to a file that may or may not exist yet. */
  action: "create" | "modify" | "none";
  /** Concrete keys and values the write adds, shown before confirmation. */
  details: string[];
  /** Already true before this run; used to keep repeat runs honest. */
  alreadyApplied: boolean;
  contents?: string;
};

export type AdoptPlan = {
  scan: AdoptScan;
  changes: AdoptChange[];
  /** Source files whose imports had to be edited because no alias covered them. */
  rewritten: string[];
};
