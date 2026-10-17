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
  /** Project-relative frontend template file. */
  file: string;
  /** URL path this template becomes, when it maps to one. */
  route?: string;
  /** Project-relative route module generated for it. */
  generated?: string;
  /** Whether the crepuscularity frontend compiled the template. */
  ok: boolean;
  /** View IR nodes produced. */
  nodes?: number;
  /** Legacy parsed View IR; native adoption stores emitted source instead. */
  ir?: unknown;
  /** Unchanged native SSR compiler output. */
  source?: string;
  component?: string;
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
  /** Templates emitted as native SSR components for non-React frontends. */
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
