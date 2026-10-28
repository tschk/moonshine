/** Independent host-free Astro typed environment schema helpers (`astro:env`). */

export type EnvContext = "client" | "server";
export type EnvAccess = "public" | "secret";

export interface EnvFieldBaseOptions<T> {
  context: EnvContext;
  access: EnvAccess;
  optional?: boolean;
  default?: T;
}

export interface StringEnvFieldOptions extends EnvFieldBaseOptions<string> {
  min?: number;
  max?: number;
  length?: number;
  url?: boolean;
  includes?: string;
  startsWith?: string;
  endsWith?: string;
}

export interface NumberEnvFieldOptions extends EnvFieldBaseOptions<number> {
  min?: number;
  max?: number;
  gt?: number;
  lt?: number;
  int?: boolean;
}

export type BooleanEnvFieldOptions = EnvFieldBaseOptions<boolean>;

export interface EnumEnvFieldOptions<
  Values extends readonly [string, ...string[]],
> extends EnvFieldBaseOptions<Values[number]> {
  values: Values;
}

export interface EnvFieldDefinition<
  T = unknown,
  Context extends EnvContext = EnvContext,
  Access extends EnvAccess = EnvAccess,
> {
  readonly type: "string" | "number" | "boolean" | "enum";
  readonly context: Context;
  readonly access: Access;
  readonly optional: boolean;
  readonly default?: T;
  readonly options: EnvFieldBaseOptions<any>;
  parse(rawValue: string | undefined, key: string): T;
}

export interface AstroEnvIssue {
  key: string;
  message: string;
}

export class AstroEnvError extends Error {
  readonly issues: AstroEnvIssue[];

  constructor(issues: AstroEnvIssue[]) {
    const summary = issues.map((i) => `${i.key}: ${i.message}`).join("; ");
    super(`Invalid environment variables: ${summary}`);
    this.name = "AstroEnvError";
    this.issues = issues;
  }
}

type ResolvedFieldType<
  Base,
  Opts extends { optional?: boolean; default?: Base },
> = Opts["optional"] extends true
  ? Opts["default"] extends Base
    ? Base
    : Base | undefined
  : Base;

function createStringField<Opts extends StringEnvFieldOptions>(
  options: Opts,
): EnvFieldDefinition<
  ResolvedFieldType<string, Opts>,
  Opts["context"],
  Opts["access"]
> {
  if (options.context === "client" && options.access === "secret") {
    throw new AstroEnvError([
      {
        key: "envField.string",
        message: 'Client environment variables cannot have access "secret".',
      },
    ]);
  }
  return {
    type: "string",
    context: options.context,
    access: options.access,
    optional: Boolean(options.optional),
    default: options.default as ResolvedFieldType<string, Opts>,
    options: { ...options },
    parse(rawValue: string | undefined, key: string) {
      const value =
        rawValue === undefined || rawValue === "" ? options.default : rawValue;
      if (value === undefined) {
        if (options.optional) {
          return undefined as ResolvedFieldType<string, Opts>;
        }
        throw new Error(`Required environment variable "${key}" is missing.`);
      }
      if (options.length !== undefined && value.length !== options.length) {
        throw new Error(
          `Expected "${key}" to have length ${options.length}, got ${value.length}.`,
        );
      }
      if (options.min !== undefined && value.length < options.min) {
        throw new Error(
          `Expected "${key}" to have minimum length ${options.min}, got ${value.length}.`,
        );
      }
      if (options.max !== undefined && value.length > options.max) {
        throw new Error(
          `Expected "${key}" to have maximum length ${options.max}, got ${value.length}.`,
        );
      }
      if (options.url && !URL.canParse(value)) {
        throw new Error(`Expected "${key}" to be a valid URL.`);
      }
      if (options.includes !== undefined && !value.includes(options.includes)) {
        throw new Error(`Expected "${key}" to include "${options.includes}".`);
      }
      if (
        options.startsWith !== undefined &&
        !value.startsWith(options.startsWith)
      ) {
        throw new Error(
          `Expected "${key}" to start with "${options.startsWith}".`,
        );
      }
      if (options.endsWith !== undefined && !value.endsWith(options.endsWith)) {
        throw new Error(`Expected "${key}" to end with "${options.endsWith}".`);
      }
      return value as ResolvedFieldType<string, Opts>;
    },
  };
}

function createNumberField<Opts extends NumberEnvFieldOptions>(
  options: Opts,
): EnvFieldDefinition<
  ResolvedFieldType<number, Opts>,
  Opts["context"],
  Opts["access"]
> {
  if (options.context === "client" && options.access === "secret") {
    throw new AstroEnvError([
      {
        key: "envField.number",
        message: 'Client environment variables cannot have access "secret".',
      },
    ]);
  }
  return {
    type: "number",
    context: options.context,
    access: options.access,
    optional: Boolean(options.optional),
    default: options.default as ResolvedFieldType<number, Opts>,
    options: { ...options },
    parse(rawValue: string | undefined, key: string) {
      if (rawValue === undefined || rawValue === "") {
        if (options.default !== undefined) {
          return options.default as ResolvedFieldType<number, Opts>;
        }
        if (options.optional) {
          return undefined as ResolvedFieldType<number, Opts>;
        }
        throw new Error(`Required environment variable "${key}" is missing.`);
      }
      const num = Number(rawValue);
      if (Number.isNaN(num)) {
        throw new Error(`Expected "${key}" to be a valid number.`);
      }
      if (options.int && !Number.isInteger(num)) {
        throw new Error(`Expected "${key}" to be an integer.`);
      }
      if (options.min !== undefined && num < options.min) {
        throw new Error(`Expected "${key}" to be >= ${options.min}.`);
      }
      if (options.max !== undefined && num > options.max) {
        throw new Error(`Expected "${key}" to be <= ${options.max}.`);
      }
      if (options.gt !== undefined && num <= options.gt) {
        throw new Error(`Expected "${key}" to be > ${options.gt}.`);
      }
      if (options.lt !== undefined && num >= options.lt) {
        throw new Error(`Expected "${key}" to be < ${options.lt}.`);
      }
      return num as ResolvedFieldType<number, Opts>;
    },
  };
}

function createBooleanField<Opts extends BooleanEnvFieldOptions>(
  options: Opts,
): EnvFieldDefinition<
  ResolvedFieldType<boolean, Opts>,
  Opts["context"],
  Opts["access"]
> {
  if (options.context === "client" && options.access === "secret") {
    throw new AstroEnvError([
      {
        key: "envField.boolean",
        message: 'Client environment variables cannot have access "secret".',
      },
    ]);
  }
  return {
    type: "boolean",
    context: options.context,
    access: options.access,
    optional: Boolean(options.optional),
    default: options.default as ResolvedFieldType<boolean, Opts>,
    options: { ...options },
    parse(rawValue: string | undefined, key: string) {
      if (rawValue === undefined || rawValue === "") {
        if (options.default !== undefined) {
          return options.default as ResolvedFieldType<boolean, Opts>;
        }
        if (options.optional) {
          return undefined as ResolvedFieldType<boolean, Opts>;
        }
        throw new Error(`Required environment variable "${key}" is missing.`);
      }
      if (rawValue === "true" || rawValue === "1") {
        return true as ResolvedFieldType<boolean, Opts>;
      }
      if (rawValue === "false" || rawValue === "0") {
        return false as ResolvedFieldType<boolean, Opts>;
      }
      throw new Error(
        `Expected "${key}" to be a boolean ("true", "false", "1", or "0").`,
      );
    },
  };
}

function createEnumField<
  const Values extends readonly [string, ...string[]],
  Opts extends EnumEnvFieldOptions<Values>,
>(
  options: Opts,
): EnvFieldDefinition<
  ResolvedFieldType<Values[number], Opts>,
  Opts["context"],
  Opts["access"]
> {
  if (options.context === "client" && options.access === "secret") {
    throw new AstroEnvError([
      {
        key: "envField.enum",
        message: 'Client environment variables cannot have access "secret".',
      },
    ]);
  }
  return {
    type: "enum",
    context: options.context,
    access: options.access,
    optional: Boolean(options.optional),
    default: options.default as ResolvedFieldType<Values[number], Opts>,
    options: { ...options },
    parse(rawValue: string | undefined, key: string) {
      const value =
        rawValue === undefined || rawValue === "" ? options.default : rawValue;
      if (value === undefined) {
        if (options.optional) {
          return undefined as ResolvedFieldType<Values[number], Opts>;
        }
        throw new Error(`Required environment variable "${key}" is missing.`);
      }
      if (!options.values.includes(value as Values[number])) {
        throw new Error(
          `Expected "${key}" to be one of [${options.values.join(", ")}], got "${value}".`,
        );
      }
      return value as ResolvedFieldType<Values[number], Opts>;
    },
  };
}

export const envField = {
  string: createStringField,
  number: createNumberField,
  boolean: createBooleanField,
  enum: createEnumField,
};

export type InferEnvField<F> =
  F extends EnvFieldDefinition<infer T, any, any> ? T : never;

export type InferEnvSchema<S extends Record<string, EnvFieldDefinition<any>>> =
  {
    [K in keyof S]: InferEnvField<S[K]>;
  };

let customEnvSource: Record<string, string | undefined> | undefined;

export function setEnvSource(source: Record<string, string | undefined>): void {
  customEnvSource = { ...source };
}

export function getEnvSource(): Record<string, string | undefined> {
  if (customEnvSource) {
    return customEnvSource;
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env as Record<string, string | undefined>;
  }
  return {};
}

export function resetEnvSource(): void {
  customEnvSource = undefined;
}

export function getSecret(key: string): string | undefined {
  const source = getEnvSource();
  return source[key];
}

export function validateEnv<S extends Record<string, EnvFieldDefinition<any>>>(
  schema: S,
  env: Record<string, string | undefined> = getEnvSource(),
  filter?: { context?: EnvContext; access?: EnvAccess },
): InferEnvSchema<S> {
  const result: Record<string, unknown> = {};
  const issues: AstroEnvIssue[] = [];

  for (const [key, field] of Object.entries(schema)) {
    if (filter?.context && field.context !== filter.context) {
      continue;
    }
    if (filter?.access && field.access !== filter.access) {
      continue;
    }
    try {
      result[key] = field.parse(env[key], key);
    } catch (err) {
      issues.push({
        key,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (issues.length > 0) {
    throw new AstroEnvError(issues);
  }

  return result as InferEnvSchema<S>;
}
