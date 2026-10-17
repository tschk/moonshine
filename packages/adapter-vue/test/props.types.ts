import {
  createProps,
  createServerProps,
  createBooleanProps,
  createServerBooleanProps,
} from "../src/props";
interface Props {
  label: string;
  count: number;
  optional?: string;
  callback: (value: number) => string;
}
declare const source: Props;
const props: Props = createProps(source, [
  "label",
  "count",
  "optional",
  "callback",
]);
const server: Props = createServerProps(source, ["label", "optional"]);
const optional: string | undefined = props.optional;
const output: string = server.callback(props.count);
void optional;
void output;
// @ts-expect-error undeclared key
createProps(source, ["unknown"]);
// @ts-expect-error undeclared server key
createServerProps(source, ["unknown"]);
// @ts-expect-error retained property types
props.count = "wrong";
// @ts-expect-error retained callback parameter
server.callback("wrong");

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;
interface BooleanInput {
  pure?: boolean;
  yes?: true;
  no?: false;
  mixed?: boolean | string;
  opaque?: unknown;
  arbitrary?: any;
  label?: string;
}
declare const booleanInput: BooleanInput;
const declared = [
  "pure",
  "yes",
  "no",
  "mixed",
  "opaque",
  "arbitrary",
  "label",
] as const;
const casts = [
  ["pure", true],
  ["yes", true],
  ["no", true],
  ["mixed", true],
] as const;
const booleanDOM = createBooleanProps(booleanInput, declared, casts);
const booleanSSR = createServerBooleanProps(booleanInput, declared, casts);
const pureDOM: boolean = booleanDOM.pure;
const pureSSR: boolean = booleanSSR.pure;
const yes: Equal<typeof booleanDOM.yes, true> = true;
const no: Equal<typeof booleanSSR.no, false> = true;
const mixed: Equal<typeof booleanDOM.mixed, boolean | string | undefined> =
  true;
const opaque: Equal<typeof booleanDOM.opaque, unknown> = true;
const arbitrary: IsAny<typeof booleanDOM.arbitrary> = true;
const label: Equal<typeof booleanDOM.label, string | undefined> = true;
// @ts-expect-error Mixed Boolean/string is not a required pure Boolean.
const requiredMixed: boolean | string = booleanDOM.mixed;
// @ts-expect-error Caller input stays optional rather than becoming a resolved setup view.
const callerBoolean: boolean = booleanInput.pure;
// Official Vue type-level undefined-only prop intersection becomes never; runtime metadata does not cast it.
declare const undefinedInput: { value?: undefined };
const undefinedDOM = createBooleanProps(undefinedInput, ["value"], []);
const undefinedSSR = createServerBooleanProps(undefinedInput, ["value"], []);
const neverDOM: IsNever<typeof undefinedDOM> = true;
const neverSSR: IsNever<typeof undefinedSSR> = true;
void [
  pureDOM,
  pureSSR,
  yes,
  no,
  mixed,
  opaque,
  arbitrary,
  label,
  requiredMixed,
  callerBoolean,
  neverDOM,
  neverSSR,
];

// @ts-expect-error Ordinary props entry does not retain the opt-in Boolean metadata argument.
createProps(source, ["label"], []);
// @ts-expect-error Ordinary server props entry remains the original two-argument API.
createServerProps(source, ["label"], []);
