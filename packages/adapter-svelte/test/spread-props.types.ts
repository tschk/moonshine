import {
  spreadProps,
  spreadServerProps,
  type LivePropLayer,
  type PropLayer,
} from "../src/spread-props";
function child(props: { label: string; count: number }) {
  return props;
}
const initial = { label: "first", count: 1 };
child(spreadProps(initial, () => ({ label: "live" })));
child(spreadServerProps([initial, { label: "server" }]));
const override = spreadProps(initial, { count: "wrong" });
// @ts-expect-error Later named values override earlier types.
child(override);
// @ts-expect-error SSR has the same override contract.
child(spreadServerProps([initial, { count: "wrong" }]));
const nullish: { label: string } | null | undefined = Math.random()
  ? { label: "later" }
  : null;
child(spreadProps(initial, nullish));
child(spreadServerProps([initial, nullish]));
const optional: { count?: string } = {};
// @ts-expect-error An optional later key can replace the numeric value.
child(spreadProps(initial, optional));
const broad: Record<string, unknown> = {};
child(spreadProps(initial, broad));
child(spreadServerProps([broad, initial]));
const dynamic: LivePropLayer[] = [initial];
const serverDynamic: PropLayer[] = [initial];
const fallback: Record<PropertyKey, unknown> = spreadProps(...dynamic);
const serverFallback: Record<PropertyKey, unknown> =
  spreadServerProps(serverDynamic);
// @ts-expect-error Non-tuples cannot promise statically present keys.
child(fallback);
// @ts-expect-error Neither can non-tuple server arrays.
child(serverFallback);
const descriptorChunk = Object.create(null, {});
child(spreadProps(initial, descriptorChunk));
child(spreadServerProps([descriptorChunk, initial]));
const liveNullable = () => nullish;
child(spreadProps(initial, liveNullable));
const symbol = Symbol();
const keyed = spreadProps({ [symbol]: 1 }, { [symbol]: "later" });
const symbolValue: string = keyed[symbol];
void [symbolValue, fallback, serverFallback];
const getterLayer = {
  get count(): number {
    return 2;
  },
};
child(spreadProps(initial, () => getterLayer));
child(spreadServerProps([initial, getterLayer]));
const laterKnown: Record<string, unknown> & { count: string } = {
  count: "wrong",
};
// @ts-expect-error Removing an index signature must retain its explicit named keys.
child(spreadProps(initial, laterKnown));
// @ts-expect-error Nullable-only layers do not manufacture required props.
child(spreadProps(null, undefined));
type IsAny<T> = 0 extends 1 & T ? true : false;
const explicitAnyPreserved: IsAny<ReturnType<typeof anyLayers>> = true;
function anyLayers() {
  return spreadProps(initial, descriptorChunk);
}
void explicitAnyPreserved;

const serverKeyed = spreadServerProps([{ [symbol]: 1, label: "server" }]);
const serverLabel: string = serverKeyed.label;
// @ts-expect-error Server snapshots copy string keys only, not symbols.
void serverKeyed[symbol];
const serverAnyPreserved: IsAny<ReturnType<typeof serverAnyLayers>> = true;
function serverAnyLayers() {
  return spreadServerProps([descriptorChunk, initial]);
}
void [serverLabel, serverAnyPreserved];
