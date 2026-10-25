/** Independent host-free Astro Content Collections, Live Content Layer, and Zod-compatible schema runtime (`astro:content`). */
import type { ActionInputIssue, SchemaValidator } from "./actions";

export interface ZodIssue extends ActionInputIssue {
  code: string;
  path: (string | number)[];
  message: string;
}

export class ZodError extends Error {
  readonly issues: ZodIssue[];

  constructor(issues: ZodIssue[]) {
    super(
      issues.length > 0
        ? issues
            .map((i) =>
              i.path.length > 0
                ? `${i.path.join(".")}: ${i.message}`
                : i.message,
            )
            .join("; ")
        : "Validation failed",
    );
    this.name = "ZodError";
    this.issues = issues;
  }

  get errors(): ZodIssue[] {
    return this.issues;
  }
}

export type SafeParseResult<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; data?: undefined; error: ZodError };

export class ZodType<Output = any, Input = Output> {
  declare readonly _output: Output;
  declare readonly _input: Input;
  private readonly validator: (
    value: unknown,
    path: (string | number)[],
  ) => { ok: true; value: Output } | { ok: false; issues: ZodIssue[] };

  constructor(
    validator: (
      value: unknown,
      path: (string | number)[],
    ) => { ok: true; value: Output } | { ok: false; issues: ZodIssue[] },
  ) {
    this.validator = validator;
  }

  /** Internal path-aware validation helper. */
  _validate(
    value: unknown,
    path: (string | number)[],
  ): { ok: true; value: Output } | { ok: false; issues: ZodIssue[] } {
    return this.validator(value, path);
  }

  safeParse(value: unknown): SafeParseResult<Output> {
    const res = this.validator(value, []);
    if (res.ok) {
      return { success: true, data: res.value };
    }
    return { success: false, error: new ZodError(res.issues) };
  }

  parse(value: unknown): Output {
    const res = this.safeParse(value);
    if (!res.success) {
      throw res.error;
    }
    return res.data;
  }

  optional(): ZodType<Output | undefined, Input | undefined> {
    return new ZodType<Output | undefined, Input | undefined>((val, path) => {
      if (val === undefined) return { ok: true, value: undefined };
      return this._validate(val, path);
    });
  }

  nullable(): ZodType<Output | null, Input | null> {
    return new ZodType<Output | null, Input | null>((val, path) => {
      if (val === null) return { ok: true, value: null };
      return this._validate(val, path);
    });
  }

  nullish(): ZodType<Output | null | undefined, Input | null | undefined> {
    return new ZodType<Output | null | undefined, Input | null | undefined>(
      (val, path) => {
        if (val === undefined || val === null) {
          return { ok: true, value: val };
        }
        return this._validate(val, path);
      },
    );
  }

  default(
    defaultValue: Output | (() => Output),
  ): ZodType<Output, Input | undefined> {
    return new ZodType<Output, Input | undefined>((val, path) => {
      if (val === undefined) {
        const resolved =
          typeof defaultValue === "function"
            ? (defaultValue as () => Output)()
            : defaultValue;
        return { ok: true, value: resolved };
      }
      return this._validate(val, path);
    });
  }

  transform<NewOut>(fn: (val: Output) => NewOut): ZodType<NewOut, Input> {
    return new ZodType<NewOut, Input>((val, path) => {
      const base = this._validate(val, path);
      if (!base.ok) return base;
      try {
        return { ok: true, value: fn(base.value) };
      } catch (err) {
        return {
          ok: false,
          issues: [
            {
              code: "custom",
              path,
              message: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    });
  }

  refine(
    check: (val: Output) => boolean,
    messageOrOpts?: string | { message?: string; path?: (string | number)[] },
  ): ZodType<Output, Input> {
    return new ZodType<Output, Input>((val, path) => {
      const base = this._validate(val, path);
      if (!base.ok) return base;
      if (!check(base.value)) {
        const msg =
          typeof messageOrOpts === "string"
            ? messageOrOpts
            : (messageOrOpts?.message ?? "Invalid input");
        const extraPath =
          typeof messageOrOpts === "object" && messageOrOpts?.path
            ? messageOrOpts.path
            : [];
        return {
          ok: false,
          issues: [
            {
              code: "custom",
              path: [...path, ...extraPath],
              message: msg,
            },
          ],
        };
      }
      return base;
    });
  }

  or<Other extends ZodType<any, any>>(
    other: Other,
  ): ZodType<Output | Other["_output"], Input | Other["_input"]> {
    return new ZodType((val, path) => {
      const first = this._validate(val, path);
      if (first.ok) return first;
      const second = other._validate(val, path);
      if (second.ok) return second;
      return { ok: false, issues: [...first.issues, ...second.issues] };
    });
  }

  array(): ZodArray<ZodType<Output, Input>> {
    return new ZodArray<ZodType<Output, Input>>(this);
  }
}

export class ZodString extends ZodType<string, string> {
  constructor(
    checks: Array<
      | { kind: "transform"; fn: (val: string) => string }
      | { kind: "check"; fn: (val: string) => string | undefined }
    > = [],
    coerce = false,
  ) {
    super((val, path) => {
      let current: unknown = val;
      if (coerce && current !== undefined && current !== null) {
        current = String(current);
      }
      if (typeof current !== "string") {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_type",
              path,
              message: `Expected string, received ${typeof current}`,
            },
          ],
        };
      }
      let str = current;
      const issues: ZodIssue[] = [];
      for (const step of checks) {
        if (step.kind === "transform") {
          str = step.fn(str);
        } else {
          const err = step.fn(str);
          if (err) {
            issues.push({ code: "invalid_string", path, message: err });
          }
        }
      }
      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, value: str };
    });
    this.checks = checks;
    this.coerce = coerce;
  }

  private readonly checks: Array<
    | { kind: "transform"; fn: (val: string) => string }
    | { kind: "check"; fn: (val: string) => string | undefined }
  >;
  private readonly coerce: boolean;

  private addCheck(fn: (val: string) => string | undefined): ZodString {
    return new ZodString([...this.checks, { kind: "check", fn }], this.coerce);
  }

  private addTransform(fn: (val: string) => string): ZodString {
    return new ZodString(
      [...this.checks, { kind: "transform", fn }],
      this.coerce,
    );
  }

  min(length: number, message?: string): ZodString {
    return this.addCheck((s) =>
      s.length >= length
        ? undefined
        : (message ?? `String must contain at least ${length} character(s)`),
    );
  }

  max(length: number, message?: string): ZodString {
    return this.addCheck((s) =>
      s.length <= length
        ? undefined
        : (message ?? `String must contain at most ${length} character(s)`),
    );
  }

  length(len: number, message?: string): ZodString {
    return this.addCheck((s) =>
      s.length === len
        ? undefined
        : (message ?? `String must contain exactly ${len} character(s)`),
    );
  }

  nonempty(message?: string): ZodString {
    return this.min(1, message ?? "String cannot be empty");
  }

  email(message?: string): ZodString {
    return this.addCheck((s) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
        ? undefined
        : (message ?? "Invalid email"),
    );
  }

  url(message?: string): ZodString {
    return this.addCheck((s) => {
      try {
        const parsed = new URL(s);
        return parsed.href ? undefined : (message ?? "Invalid url");
      } catch {
        return message ?? "Invalid url";
      }
    });
  }

  regex(re: RegExp, message?: string): ZodString {
    return this.addCheck((s) =>
      re.test(s) ? undefined : (message ?? "Invalid"),
    );
  }

  startsWith(prefix: string, message?: string): ZodString {
    return this.addCheck((s) =>
      s.startsWith(prefix)
        ? undefined
        : (message ?? `Invalid input: must start with "${prefix}"`),
    );
  }

  endsWith(suffix: string, message?: string): ZodString {
    return this.addCheck((s) =>
      s.endsWith(suffix)
        ? undefined
        : (message ?? `Invalid input: must end with "${suffix}"`),
    );
  }

  includes(substring: string, message?: string): ZodString {
    return this.addCheck((s) =>
      s.includes(substring)
        ? undefined
        : (message ?? `Invalid input: must include "${substring}"`),
    );
  }

  trim(): ZodString {
    return this.addTransform((s) => s.trim());
  }

  toLowerCase(): ZodString {
    return this.addTransform((s) => s.toLowerCase());
  }

  toUpperCase(): ZodString {
    return this.addTransform((s) => s.toUpperCase());
  }
}

export class ZodNumber extends ZodType<number, number> {
  private readonly checks: Array<(val: number) => string | undefined>;
  private readonly coerce: boolean;

  constructor(
    checks: Array<(val: number) => string | undefined> = [],
    coerce = false,
  ) {
    super((val, path) => {
      const current = coerce ? Number(val) : val;
      if (typeof current !== "number" || Number.isNaN(current)) {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_type",
              path,
              message: `Expected number, received ${typeof val}`,
            },
          ],
        };
      }
      const issues: ZodIssue[] = [];
      for (const check of checks) {
        const err = check(current);
        if (err) {
          issues.push({ code: "invalid_number", path, message: err });
        }
      }
      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, value: current };
    });
    this.checks = checks;
    this.coerce = coerce;
  }

  private addCheck(fn: (val: number) => string | undefined): ZodNumber {
    return new ZodNumber([...this.checks, fn], this.coerce);
  }

  min(value: number, message?: string): ZodNumber {
    return this.addCheck((n) =>
      n >= value
        ? undefined
        : (message ?? `Number must be greater than or equal to ${value}`),
    );
  }

  max(value: number, message?: string): ZodNumber {
    return this.addCheck((n) =>
      n <= value
        ? undefined
        : (message ?? `Number must be less than or equal to ${value}`),
    );
  }

  int(message?: string): ZodNumber {
    return this.addCheck((n) =>
      Number.isInteger(n)
        ? undefined
        : (message ?? "Expected integer, received float"),
    );
  }

  positive(message?: string): ZodNumber {
    return this.addCheck((n) =>
      n > 0 ? undefined : (message ?? "Number must be greater than 0"),
    );
  }

  nonnegative(message?: string): ZodNumber {
    return this.addCheck((n) =>
      n >= 0
        ? undefined
        : (message ?? "Number must be greater than or equal to 0"),
    );
  }

  negative(message?: string): ZodNumber {
    return this.addCheck((n) =>
      n < 0 ? undefined : (message ?? "Number must be less than 0"),
    );
  }

  nonpositive(message?: string): ZodNumber {
    return this.addCheck((n) =>
      n <= 0
        ? undefined
        : (message ?? "Number must be less than or equal to 0"),
    );
  }

  finite(message?: string): ZodNumber {
    return this.addCheck((n) =>
      Number.isFinite(n) ? undefined : (message ?? "Number must be finite"),
    );
  }
}

export class ZodBoolean extends ZodType<boolean, boolean> {
  constructor(coerce = false) {
    super((val, path) => {
      const current = coerce ? Boolean(val) : val;
      if (typeof current !== "boolean") {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_type",
              path,
              message: `Expected boolean, received ${typeof val}`,
            },
          ],
        };
      }
      return { ok: true, value: current };
    });
  }
}

export class ZodDate extends ZodType<Date, Date | string | number> {
  private readonly checks: Array<(val: Date) => string | undefined>;
  private readonly coerce: boolean;

  constructor(
    checks: Array<(val: Date) => string | undefined> = [],
    coerce = false,
  ) {
    super((val, path) => {
      const current =
        coerce && (typeof val === "string" || typeof val === "number")
          ? new Date(val)
          : val;
      if (!(current instanceof Date) || Number.isNaN(current.getTime())) {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_date",
              path,
              message: "Invalid date",
            },
          ],
        };
      }
      const issues: ZodIssue[] = [];
      for (const check of checks) {
        const err = check(current);
        if (err) {
          issues.push({ code: "invalid_date", path, message: err });
        }
      }
      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, value: current };
    });
    this.checks = checks;
    this.coerce = coerce;
  }

  min(minDate: Date, message?: string): ZodDate {
    return new ZodDate(
      [
        ...this.checks,
        (d) =>
          d.getTime() >= minDate.getTime()
            ? undefined
            : (message ??
              `Date must be greater than or equal to ${minDate.toISOString()}`),
      ],
      this.coerce,
    );
  }

  max(maxDate: Date, message?: string): ZodDate {
    return new ZodDate(
      [
        ...this.checks,
        (d) =>
          d.getTime() <= maxDate.getTime()
            ? undefined
            : (message ??
              `Date must be smaller than or equal to ${maxDate.toISOString()}`),
      ],
      this.coerce,
    );
  }
}

export class ZodArray<Item extends ZodType<any, any>> extends ZodType<
  Item["_output"][],
  Item["_input"][]
> {
  readonly element: Item;
  private readonly checks: Array<
    (arr: Item["_output"][]) => string | undefined
  >;

  constructor(
    element: Item,
    checks: Array<(arr: Item["_output"][]) => string | undefined> = [],
  ) {
    super((val, path) => {
      if (!Array.isArray(val)) {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_type",
              path,
              message: `Expected array, received ${typeof val}`,
            },
          ],
        };
      }
      const out: Item["_output"][] = [];
      const issues: ZodIssue[] = [];
      for (let i = 0; i < val.length; i++) {
        const itemRes = element._validate(val[i], [...path, i]);
        if (itemRes.ok) {
          out.push(itemRes.value);
        } else {
          issues.push(...itemRes.issues);
        }
      }
      if (issues.length > 0) return { ok: false, issues };
      for (const check of checks) {
        const err = check(out);
        if (err) {
          issues.push({ code: "invalid_array", path, message: err });
        }
      }
      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, value: out };
    });
    this.element = element;
    this.checks = checks;
  }

  private addCheck(
    fn: (arr: Item["_output"][]) => string | undefined,
  ): ZodArray<Item> {
    return new ZodArray(this.element, [...this.checks, fn]);
  }

  min(length: number, message?: string): ZodArray<Item> {
    return this.addCheck((arr) =>
      arr.length >= length
        ? undefined
        : (message ?? `Array must contain at least ${length} element(s)`),
    );
  }

  max(length: number, message?: string): ZodArray<Item> {
    return this.addCheck((arr) =>
      arr.length <= length
        ? undefined
        : (message ?? `Array must contain at most ${length} element(s)`),
    );
  }

  length(len: number, message?: string): ZodArray<Item> {
    return this.addCheck((arr) =>
      arr.length === len
        ? undefined
        : (message ?? `Array must contain exactly ${len} element(s)`),
    );
  }

  nonempty(message?: string): ZodArray<Item> {
    return this.min(1, message ?? "Array cannot be empty");
  }
}

export type ZodRawShape = Record<string, ZodType<any, any>>;

type OptionalKeys<S extends ZodRawShape> = {
  [K in keyof S]: undefined extends S[K]["_output"] ? K : never;
}[keyof S];

type RequiredKeys<S extends ZodRawShape> = Exclude<keyof S, OptionalKeys<S>>;

export type InferObjectOutput<S extends ZodRawShape> = {
  [K in RequiredKeys<S>]: S[K]["_output"];
} & {
  [K in OptionalKeys<S>]?: S[K]["_output"];
};

export class ZodObject<Shape extends ZodRawShape> extends ZodType<
  InferObjectOutput<Shape>,
  InferObjectOutput<Shape>
> {
  readonly shape: Shape;
  private readonly mode: "strip" | "passthrough" | "strict";

  constructor(
    shape: Shape,
    mode: "strip" | "passthrough" | "strict" = "strip",
  ) {
    super((val, path) => {
      if (typeof val !== "object" || val === null || Array.isArray(val)) {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_type",
              path,
              message: `Expected object, received ${val === null ? "null" : typeof val}`,
            },
          ],
        };
      }
      const record = val as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const issues: ZodIssue[] = [];

      for (const [key, fieldSchema] of Object.entries(shape)) {
        const res = fieldSchema._validate(record[key], [...path, key]);
        if (res.ok) {
          if (res.value !== undefined || key in record) {
            out[key] = res.value;
          }
        } else {
          issues.push(...res.issues);
        }
      }

      if (mode !== "strip") {
        for (const key of Object.keys(record)) {
          if (!(key in shape)) {
            if (mode === "strict") {
              issues.push({
                code: "unrecognized_keys",
                path: [...path, key],
                message: `Unrecognized key in object: '${key}'`,
              });
            } else {
              out[key] = record[key];
            }
          }
        }
      }

      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, value: out as InferObjectOutput<Shape> };
    });
    this.shape = shape;
    this.mode = mode;
  }

  passthrough(): ZodObject<Shape> {
    return new ZodObject(this.shape, "passthrough");
  }

  strict(): ZodObject<Shape> {
    return new ZodObject(this.shape, "strict");
  }

  partial(): ZodObject<{
    [K in keyof Shape]: ZodType<
      Shape[K]["_output"] | undefined,
      Shape[K]["_input"] | undefined
    >;
  }> {
    const nextShape: Record<string, ZodType<any, any>> = {};
    for (const [k, v] of Object.entries(this.shape)) {
      nextShape[k] = v.optional();
    }
    return new ZodObject(nextShape as any, this.mode);
  }

  extend<Extra extends ZodRawShape>(extra: Extra): ZodObject<Shape & Extra> {
    return new ZodObject({ ...this.shape, ...extra }, this.mode);
  }

  merge<Other extends ZodRawShape>(
    other: ZodObject<Other>,
  ): ZodObject<Shape & Other> {
    return this.extend(other.shape);
  }

  pick<K extends keyof Shape>(
    keys: Record<K, true>,
  ): ZodObject<Pick<Shape, K>> {
    const picked: Record<string, ZodType<any, any>> = {};
    for (const k of Object.keys(keys)) {
      if (k in this.shape) {
        picked[k] = this.shape[k]!;
      }
    }
    return new ZodObject(picked as Pick<Shape, K>, this.mode);
  }

  omit<K extends keyof Shape>(
    keys: Record<K, true>,
  ): ZodObject<Omit<Shape, K>> {
    const omitted: Record<string, ZodType<any, any>> = {};
    for (const [k, v] of Object.entries(this.shape)) {
      if (!(k in keys)) {
        omitted[k] = v;
      }
    }
    return new ZodObject(omitted as Omit<Shape, K>, this.mode);
  }
}

export const z = {
  ZodError,
  ZodType,
  string(): ZodString {
    return new ZodString();
  },
  number(): ZodNumber {
    return new ZodNumber();
  },
  boolean(): ZodBoolean {
    return new ZodBoolean();
  },
  date(): ZodDate {
    return new ZodDate();
  },
  any(): ZodType<any, any> {
    return new ZodType((val) => ({ ok: true, value: val }));
  },
  unknown(): ZodType<unknown, unknown> {
    return new ZodType((val) => ({ ok: true, value: val }));
  },
  literal<T extends string | number | boolean | null | undefined>(
    expected: T,
  ): ZodType<T, T> {
    return new ZodType((val, path) =>
      Object.is(val, expected)
        ? { ok: true, value: expected }
        : {
            ok: false,
            issues: [
              {
                code: "invalid_literal",
                path,
                message: `Invalid literal value, expected ${JSON.stringify(expected)}`,
              },
            ],
          },
    );
  },
  enum<const T extends readonly [string, ...string[]]>(
    values: T,
  ): ZodType<T[number], T[number]> & {
    readonly options: T;
    readonly enum: { [K in T[number]]: K };
  } {
    const set = new Set<string>(values);
    const schema = new ZodType<T[number], T[number]>((val, path) =>
      typeof val === "string" && set.has(val)
        ? { ok: true, value: val as T[number] }
        : {
            ok: false,
            issues: [
              {
                code: "invalid_enum_value",
                path,
                message: `Invalid enum value. Expected ${values.map((v) => `'${v}'`).join(" | ")}, received ${JSON.stringify(val)}`,
              },
            ],
          },
    ) as ZodType<T[number], T[number]> & {
      options: T;
      enum: { [K in T[number]]: K };
    };
    const enumObj = {} as { [K in T[number]]: K };
    for (const v of values) {
      (enumObj as Record<string, string>)[v] = v;
    }
    schema.options = values;
    schema.enum = enumObj;
    return schema;
  },
  array<Item extends ZodType<any, any>>(item: Item): ZodArray<Item> {
    return new ZodArray(item);
  },
  object<Shape extends ZodRawShape>(shape: Shape): ZodObject<Shape> {
    return new ZodObject(shape);
  },
  record<V extends ZodType<any, any>>(
    keyOrValue: ZodType<string, any> | V,
    maybeValue?: V,
  ): ZodType<Record<string, V["_output"]>, Record<string, V["_input"]>> {
    const keySchema = maybeValue
      ? (keyOrValue as ZodType<string, any>)
      : undefined;
    const valSchema = (maybeValue ?? keyOrValue) as V;
    return new ZodType((val, path) => {
      if (typeof val !== "object" || val === null || Array.isArray(val)) {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_type",
              path,
              message: `Expected object record, received ${typeof val}`,
            },
          ],
        };
      }
      const out: Record<string, V["_output"]> = {};
      const issues: ZodIssue[] = [];
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (keySchema) {
          const kRes = keySchema._validate(k, [...path, k]);
          if (!kRes.ok) {
            issues.push(...kRes.issues);
            continue;
          }
        }
        const vRes = valSchema._validate(v, [...path, k]);
        if (vRes.ok) {
          out[k] = vRes.value;
        } else {
          issues.push(...vRes.issues);
        }
      }
      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, value: out };
    });
  },
  union<const T extends readonly [ZodType<any, any>, ...ZodType<any, any>[]]>(
    schemas: T,
  ): ZodType<T[number]["_output"], T[number]["_input"]> {
    return new ZodType((val, path) => {
      const allIssues: ZodIssue[] = [];
      for (const s of schemas) {
        const res = s._validate(val, path);
        if (res.ok) return res;
        allIssues.push(...res.issues);
      }
      return {
        ok: false,
        issues:
          allIssues.length > 0
            ? allIssues
            : [{ code: "invalid_union", path, message: "Invalid input" }],
      };
    });
  },
  discriminatedUnion<
    Discriminator extends string,
    const T extends readonly [ZodObject<any>, ...ZodObject<any>[]],
  >(
    discriminator: Discriminator,
    schemas: T,
  ): ZodType<T[number]["_output"], T[number]["_input"]> {
    return z.union(schemas);
  },
  tuple<const T extends readonly [ZodType<any, any>, ...ZodType<any, any>[]]>(
    schemas: T,
  ): ZodType<
    { [K in keyof T]: T[K] extends ZodType<infer O, any> ? O : never },
    { [K in keyof T]: T[K] extends ZodType<any, infer I> ? I : never }
  > {
    return new ZodType((val, path) => {
      if (!Array.isArray(val) || val.length !== schemas.length) {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_tuple",
              path,
              message: `Expected tuple of length ${schemas.length}`,
            },
          ],
        };
      }
      const out: unknown[] = [];
      const issues: ZodIssue[] = [];
      for (let i = 0; i < schemas.length; i++) {
        const res = schemas[i]!._validate(val[i], [...path, i]);
        if (res.ok) out.push(res.value);
        else issues.push(...res.issues);
      }
      if (issues.length > 0) return { ok: false, issues };
      return { ok: true, value: out as any };
    });
  },
  optional<T extends ZodType<any, any>>(
    schema: T,
  ): ZodType<T["_output"] | undefined, T["_input"] | undefined> {
    return schema.optional();
  },
  nullable<T extends ZodType<any, any>>(
    schema: T,
  ): ZodType<T["_output"] | null, T["_input"] | null> {
    return schema.nullable();
  },
  coerce: {
    string(): ZodString {
      return new ZodString([], true);
    },
    number(): ZodNumber {
      return new ZodNumber([], true);
    },
    boolean(): ZodBoolean {
      return new ZodBoolean(true);
    },
    date(): ZodDate {
      return new ZodDate([], true);
    },
  },
};

export namespace z {
  export type infer<T extends SchemaValidator<any>> =
    T extends ZodType<infer O, any>
      ? O
      : T extends SchemaValidator<infer O>
        ? O
        : unknown;
}

export interface ImageMetadata {
  src: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface SchemaContext {
  image: () => ZodType<ImageMetadata | string, ImageMetadata | string>;
}

export function createSchemaContext(): SchemaContext {
  return {
    image: () =>
      z
        .object({
          src: z.string(),
          width: z.number().optional(),
          height: z.number().optional(),
          format: z.string().optional(),
        })
        .or(z.string()),
  };
}

export interface MarkdownHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface RenderedContent {
  html: string;
  metadata?: {
    headings?: MarkdownHeading[];
    frontmatter?: Record<string, any>;
    imagePaths?: string[];
    [key: string]: any;
  };
}

export interface LoaderStoreEntry {
  id: string;
  data: Record<string, any>;
  body?: string;
  filePath?: string;
  digest?: string;
  rendered?: RenderedContent;
}

export interface LoaderStore {
  get: (id: string) => LoaderStoreEntry | undefined;
  set: (entry: LoaderStoreEntry) => boolean;
  entries: () => Array<[string, LoaderStoreEntry]>;
  values: () => LoaderStoreEntry[];
  keys: () => string[];
  delete: (id: string) => boolean;
  clear: () => void;
  has: (id: string) => boolean;
}

export interface LoaderContext {
  collection: string;
  store: LoaderStore;
  parseData: <TData = Record<string, any>>(props: {
    id: string;
    data: Record<string, any>;
    filePath?: string;
  }) => Promise<TData>;
  generateDigest: (data: Record<string, unknown> | string) => string;
}

export interface ContentLoader {
  name: string;
  load: (context: LoaderContext) => void | Promise<void>;
  schema?:
    SchemaValidator<any> | ((context: SchemaContext) => SchemaValidator<any>);
}

export type CollectionLoader =
  | ContentLoader
  | (() =>
      | Array<{ id?: string; slug?: string; [key: string]: any }>
      | Record<string, Record<string, any>>
      | Promise<
          | Array<{ id?: string; slug?: string; [key: string]: any }>
          | Record<string, Record<string, any>>
        >);

export interface CollectionConfig<S = any> {
  type?: "content" | "data" | "content_layer";
  schema?: S;
  loader?: CollectionLoader;
}

export type InferCollectionSchema<C> =
  C extends CollectionConfig<infer S>
    ? S extends (context: SchemaContext) => SchemaValidator<infer O>
      ? O
      : S extends SchemaValidator<infer O>
        ? O
        : Record<string, any>
    : Record<string, any>;

export interface CollectionEntry<
  C extends string = string,
  Data = Record<string, any>,
> {
  id: string;
  slug: string;
  collection: C;
  data: Data;
  body?: string;
  filePath?: string;
  rendered?: RenderedContent;
  render: () => Promise<RenderResult>;
}

export interface ReferenceEntry<C extends string = string> {
  collection: C;
  id: string;
}

export function defineCollection<S = any>(
  config: CollectionConfig<S>,
): CollectionConfig<S> {
  return {
    ...config,
    type: config.type ?? (config.loader ? "content_layer" : "content"),
  };
}

export function reference<C extends string>(
  collection: C,
): ZodType<
  ReferenceEntry<C>,
  string | { collection?: C; id?: string; slug?: string }
> {
  return new ZodType((val, path) => {
    if (typeof val === "string" && val.length > 0) {
      return { ok: true, value: { collection, id: val } };
    }
    if (typeof val === "object" && val !== null) {
      const obj = val as { collection?: string; id?: string; slug?: string };
      const id = obj.id ?? obj.slug;
      if (
        typeof id === "string" &&
        id.length > 0 &&
        (obj.collection === undefined || obj.collection === collection)
      ) {
        return { ok: true, value: { collection, id } };
      }
    }
    return {
      ok: false,
      issues: [
        {
          code: "invalid_reference",
          path,
          message: `Invalid reference for collection "${collection}"`,
        },
      ],
    };
  });
}

type InternalCollectionRecord = {
  config: CollectionConfig<any>;
  rawEntries: Map<string, LoaderStoreEntry>;
  loaded: boolean;
};

const collectionRegistry = new Map<string, InternalCollectionRecord>();

function ensureCollectionRecord(name: string): InternalCollectionRecord {
  let rec = collectionRegistry.get(name);
  if (!rec) {
    rec = {
      config: { type: "content" },
      rawEntries: new Map(),
      loaded: false,
    };
    collectionRegistry.set(name, rec);
  }
  return rec;
}

export function registerCollections(
  collections: Record<string, CollectionConfig<any>>,
): void {
  for (const [name, config] of Object.entries(collections)) {
    const existing = collectionRegistry.get(name);
    collectionRegistry.set(name, {
      config,
      rawEntries: existing?.rawEntries ?? new Map(),
      loaded: false,
    });
  }
}

export interface SeedEntryInput {
  id: string;
  slug?: string;
  data: Record<string, any>;
  body?: string;
  filePath?: string;
  rendered?: RenderedContent;
}

export function seedCollection(
  collection: string,
  entries: SeedEntryInput[] | Record<string, Omit<SeedEntryInput, "id">>,
): void {
  const rec = ensureCollectionRecord(collection);
  const list: SeedEntryInput[] = Array.isArray(entries)
    ? entries
    : Object.entries(entries).map(([id, item]) => ({ id, ...item }));
  for (const item of list) {
    rec.rawEntries.set(item.id, {
      id: item.id,
      data: { ...item.data },
      body: item.body,
      filePath: item.filePath,
      rendered: item.rendered,
    });
  }
}

export function clearCollections(): void {
  collectionRegistry.clear();
}

function resolveSchemaValidator(
  config: CollectionConfig<any>,
): SchemaValidator<any> | undefined {
  const rawSchema =
    config.schema ??
    (typeof config.loader === "object" && config.loader !== null
      ? config.loader.schema
      : undefined);
  if (!rawSchema) return undefined;
  if (typeof rawSchema === "function") {
    return rawSchema(createSchemaContext());
  }
  return rawSchema;
}

function validateEntryData(
  collection: string,
  entryId: string,
  data: Record<string, any>,
  validator?: SchemaValidator<any>,
): Record<string, any> {
  if (!validator) return data;
  if ("safeParse" in validator && typeof validator.safeParse === "function") {
    const res = validator.safeParse(data);
    if (!res.success) {
      const msg =
        res.error instanceof Error
          ? res.error.message
          : (res.error?.issues
              ?.map((i: ActionInputIssue) => i.message)
              .join("; ") ?? "Invalid collection entry data");
      throw new Error(
        `[${collection}] "${entryId}" data does not match collection schema: ${msg}`,
      );
    }
    return res.data as Record<string, any>;
  }
  if ("parse" in validator && typeof validator.parse === "function") {
    return validator.parse(data) as Record<string, any>;
  }
  return data;
}

function computeSlug(id: string, data?: Record<string, any>): string {
  if (typeof data?.slug === "string" && data.slug.length > 0) {
    return data.slug;
  }
  return id.replace(/\.(md|mdx|markdown|json|yaml|yml|toml)$/i, "");
}

async function runCollectionLoaderIfNeeded(
  collection: string,
  rec: InternalCollectionRecord,
): Promise<void> {
  if (rec.loaded || !rec.config.loader) return;
  rec.loaded = true;
  const loader = rec.config.loader;
  const validator = resolveSchemaValidator(rec.config);

  const store: LoaderStore = {
    get: (id) => rec.rawEntries.get(id),
    set: (entry) => {
      rec.rawEntries.set(entry.id, entry);
      return true;
    },
    entries: () => Array.from(rec.rawEntries.entries()),
    values: () => Array.from(rec.rawEntries.values()),
    keys: () => Array.from(rec.rawEntries.keys()),
    delete: (id) => rec.rawEntries.delete(id),
    clear: () => rec.rawEntries.clear(),
    has: (id) => rec.rawEntries.has(id),
  };

  if (typeof loader === "function") {
    const rawResult = await loader();
    if (Array.isArray(rawResult)) {
      for (const item of rawResult) {
        const id = String(item.id ?? item.slug ?? "");
        if (!id) continue;
        const { id: _id, body, rendered, filePath, ...rest } = item;
        const payload =
          "data" in item &&
          typeof item.data === "object" &&
          item.data !== null &&
          Object.keys(rest).length <= 2
            ? (item.data as Record<string, any>)
            : rest;
        const parsed = validateEntryData(collection, id, payload, validator);
        rec.rawEntries.set(id, {
          id,
          data: parsed,
          body: typeof body === "string" ? body : undefined,
          filePath: typeof filePath === "string" ? filePath : undefined,
          rendered: rendered as RenderedContent | undefined,
        });
      }
    } else if (typeof rawResult === "object" && rawResult !== null) {
      for (const [id, item] of Object.entries(rawResult)) {
        const parsed = validateEntryData(collection, id, item, validator);
        rec.rawEntries.set(id, { id, data: parsed });
      }
    }
    return;
  }

  await loader.load({
    collection,
    store,
    parseData: async ({ id, data }) =>
      validateEntryData(collection, id, data, validator) as any,
    generateDigest: (input) => {
      const str = typeof input === "string" ? input : JSON.stringify(input);
      let hash = 5381;
      for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
      }
      return (hash >>> 0).toString(16);
    },
  });
}

function materializeCollectionEntry<C extends string>(
  collection: C,
  raw: LoaderStoreEntry,
  validator?: SchemaValidator<any>,
): CollectionEntry<C> {
  const validatedData = validateEntryData(
    collection,
    raw.id,
    raw.data,
    validator,
  );
  const slug = computeSlug(raw.id, validatedData);
  const entry: CollectionEntry<C> = {
    id: raw.id,
    slug,
    collection,
    data: validatedData,
    ...(raw.body !== undefined ? { body: raw.body } : {}),
    ...(raw.filePath !== undefined ? { filePath: raw.filePath } : {}),
    ...(raw.rendered !== undefined ? { rendered: raw.rendered } : {}),
    render: () => render(entry),
  };
  return entry;
}

export async function getCollection<
  C extends string = string,
  E extends CollectionEntry<C> = CollectionEntry<C>,
>(
  collection: C,
  filter?: (entry: CollectionEntry<C>) => unknown,
): Promise<E[]> {
  const rec = ensureCollectionRecord(collection);
  await runCollectionLoaderIfNeeded(collection, rec);
  const validator = resolveSchemaValidator(rec.config);
  const results: E[] = [];
  for (const raw of rec.rawEntries.values()) {
    const entry = materializeCollectionEntry(collection, raw, validator);
    if (!filter || Boolean(filter(entry))) {
      results.push(entry as E);
    }
  }
  return results;
}

export async function getEntry<
  C extends string = string,
  E extends CollectionEntry<C> = CollectionEntry<C>,
>(
  collectionOrRef: C | { collection: C; id?: string; slug?: string },
  maybeIdOrSlug?: string,
): Promise<E | undefined> {
  const collection =
    typeof collectionOrRef === "string"
      ? collectionOrRef
      : collectionOrRef.collection;
  const targetKey =
    typeof collectionOrRef === "string"
      ? maybeIdOrSlug
      : (collectionOrRef.id ?? collectionOrRef.slug);
  if (!targetKey) return undefined;

  const entries = await getCollection<C, E>(collection);
  return entries.find((e) => e.id === targetKey || e.slug === targetKey);
}

export async function getEntries<
  C extends string = string,
  E extends CollectionEntry<C> = CollectionEntry<C>,
>(
  references: ReadonlyArray<{ collection: C; id?: string; slug?: string }>,
): Promise<E[]> {
  const out: E[] = [];
  for (const ref of references) {
    const found = await getEntry<C, E>(ref);
    if (found) out.push(found);
  }
  return out;
}

export async function getLiveCollection<
  C extends string = string,
  E extends CollectionEntry<C> = CollectionEntry<C>,
>(
  collection: C,
  filter?: (entry: CollectionEntry<C>) => unknown,
): Promise<{ entries?: E[]; error?: Error }> {
  try {
    const rec = ensureCollectionRecord(collection);
    rec.loaded = false;
    const entries = await getCollection<C, E>(collection, filter);
    return { entries };
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export async function getLiveEntry<
  C extends string = string,
  E extends CollectionEntry<C> = CollectionEntry<C>,
>(
  collection: C,
  idOrFilter: string | { id?: string; slug?: string },
): Promise<{ entry?: E; error?: Error }> {
  try {
    const rec = ensureCollectionRecord(collection);
    rec.loaded = false;
    const target =
      typeof idOrFilter === "string"
        ? idOrFilter
        : (idOrFilter.id ?? idOrFilter.slug);
    const entry = await getEntry<C, E>(collection, target);
    return { entry };
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()!<>]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^```|^~~~/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (match) {
      const depth = match[1]!.length;
      const text = match[2]!.trim();
      headings.push({
        depth,
        slug: slugifyHeading(text),
        text,
      });
    }
  }
  return headings;
}

export function renderSimpleMarkdownToHtml(markdown: string): string {
  const blocks = markdown.trim().split(/\n{2,}/);
  const htmlParts: string[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim();
      const slug = slugifyHeading(text);
      htmlParts.push(`<h${level} id="${slug}">${text}</h${level}>`);
    } else {
      htmlParts.push(`<p>${trimmed}</p>`);
    }
  }
  return htmlParts.join("\n");
}

export interface RenderResult {
  Content: (props?: Record<string, any>) => string;
  headings: MarkdownHeading[];
  remarkPluginFrontmatter: Record<string, any>;
}

export async function render(
  entry: Pick<CollectionEntry<any>, "body" | "data" | "rendered">,
): Promise<RenderResult> {
  const rawBody = entry.body ?? "";
  const headings =
    entry.rendered?.metadata?.headings ?? extractMarkdownHeadings(rawBody);
  const html =
    entry.rendered?.html ??
    (rawBody ? renderSimpleMarkdownToHtml(rawBody) : "");
  const remarkPluginFrontmatter: Record<string, any> = {
    ...entry.data,
    ...entry.rendered?.metadata?.frontmatter,
  };

  return {
    Content: () => html,
    headings,
    remarkPluginFrontmatter,
  };
}

export {
  file,
  glob,
  matchGlobPattern,
  parseFrontmatter,
  parseSimpleCsv,
  parseSimpleToml,
  parseSimpleYaml,
  type FileLoaderOptions,
  type FrontmatterParseResult,
  type GenerateIdOptions,
  type GlobLoaderOptions,
} from "./loaders";
