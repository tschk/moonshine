import {
  createDefaultProps,
  createServerDefaultProps,
  type DefaultValues,
} from "../src/props";
type Props = {
  label?: string;
  plain?: string;
  count?: number;
  nullable?: string | null;
  enabled?: boolean;
  undefinedBool?: boolean;
  mixed?: boolean | string;
  object?: { n: number };
  handler?: () => number;
};
const defaults = {
  label: "label",
  nullable: null,
  undefinedBool: undefined,
  object: () => ({ n: 1 }),
  handler: () => 1,
  count: function (this: null, raw: Props) {
    const value: number | undefined = raw.count;
    raw.plain = "factory mutation";
    return value ?? 1;
  },
} satisfies DefaultValues<Props>;
declare const source: Props;
const client = createDefaultProps<Props, typeof defaults>(
  source,
  [
    "label",
    "plain",
    "count",
    "nullable",
    "enabled",
    "undefinedBool",
    "mixed",
    "object",
    "handler",
  ],
  [
    ["enabled", true],
    ["undefinedBool", true],
    ["mixed", true],
  ],
  [
    ["label", defaults.label, false],
    ["count", defaults.count, true],
    ["nullable", defaults.nullable, false],
    ["undefinedBool", defaults.undefinedBool, false],
    ["object", defaults.object, true],
    ["handler", defaults.handler, false],
  ],
).props;
const server = createServerDefaultProps<Props, typeof defaults>(
  source,
  [
    "label",
    "plain",
    "count",
    "nullable",
    "enabled",
    "undefinedBool",
    "mixed",
    "object",
    "handler",
  ],
  [
    ["enabled", true],
    ["undefinedBool", true],
    ["mixed", true],
  ],
  [
    ["label", defaults.label, false],
    ["count", defaults.count, true],
    ["nullable", defaults.nullable, false],
    ["undefinedBool", defaults.undefinedBool, false],
    ["object", defaults.object, true],
    ["handler", defaults.handler, false],
  ],
);
const label: string = client.label,
  serverLabel: string = server.label;
const count: number = client.count,
  nullable: string | null = server.nullable;
const enabled: boolean = client.enabled,
  explicitUndefined: boolean | undefined = server.undefinedBool;
const mixed: boolean | string | undefined = client.mixed,
  handler: () => number = server.handler;
const caller: Props = {};
// @ts-expect-error Setup is readonly at the top level.
client.label = "other";
// @ts-expect-error Server setup is readonly at the top level.
server.label = "other";
// @ts-expect-error A nondefaulted ordinary value remains optional.
const plain: string = client.plain;
// @ts-expect-error Explicit undefined default retains undefined.
const required: boolean = server.undefinedBool;
client.object.n = 2;
server.object.n = 2;
// @ts-expect-error Primitive default must match its prop.
const wrongPrimitive = { label: 3 } satisfies DefaultValues<Props>;
// @ts-expect-error Object defaults are factories.
const wrongObject = { object: { n: 1 } } satisfies DefaultValues<Props>;
// @ts-expect-error Resolved factory cannot return undefined.
const wrongReturn = { label: () => undefined } satisfies DefaultValues<Props>;
// @ts-expect-error Function-valued default preserves its callable contract.
const wrongFunction = { handler: () => "wrong" } satisfies DefaultValues<Props>;
const wrongRaw = {
  // @ts-expect-error Factory receives the declared raw props shape.
  label: (raw: { missing: number }) => String(raw.missing),
} satisfies DefaultValues<Props>;
// @ts-expect-error Unknown default key.
const unknownDefault = { missing: 1 } satisfies DefaultValues<Props>;
const rawShape = {
  count(raw) {
    const shape: { count: number | undefined } = raw;
    void shape;
    return raw.count ?? 1;
  },
} satisfies DefaultValues<{ count?: number }>;
void [
  label,
  serverLabel,
  count,
  nullable,
  enabled,
  explicitUndefined,
  mixed,
  handler,
  caller,
  plain,
  required,
  wrongPrimitive,
  wrongObject,
  wrongReturn,
  wrongFunction,
  wrongRaw,
  unknownDefault,
  rawShape,
];
