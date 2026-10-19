import {
  createModel,
  unref,
  useModel,
  type DefineModelOptions,
  type ModelRef,
  type Ref,
} from "../src/reactive";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

declare const props: {
  modelValue?: string;
  count: number;
  tags?: string[];
};

const optionalModel = useModel(props, "modelValue");
type _OptionalModelType = Expect<
  Equal<
    typeof optionalModel,
    ModelRef<string | undefined, string, string | undefined, string | undefined>
  >
>;
const unwrappedOptional = unref(optionalModel);
type _UnwrappedOptional = Expect<
  Equal<typeof unwrappedOptional, string | undefined>
>;

const defaultedModel = useModel(props, "modelValue", { default: "fallback" });
type _DefaultedModelType = Expect<
  Equal<typeof defaultedModel, ModelRef<string, string, string, string>>
>;
const [destructuredModel, destructuredMods] = useModel<
  typeof props,
  "modelValue",
  "trim" | "upper"
>(props, "modelValue", { default: "" });
type _DestructuredModel = Expect<
  Equal<
    typeof destructuredModel,
    ModelRef<string, "trim" | "upper", string, string>
  >
>;
type _DestructuredMods = Expect<
  Equal<typeof destructuredMods, Record<"trim" | "upper", true | undefined>>
>;

const requiredModel = useModel(props, "count");
type _RequiredModel = Expect<
  Equal<typeof requiredModel, ModelRef<number, string, number, number>>
>;

const compilerModel = createModel<
  Exclude<string | undefined, undefined>,
  "trim"
>(
  props,
  "modelValue",
  {
    default: "init",
    get: (v) => v.toUpperCase(),
    set: (v) => v.trim(),
  },
  false,
);
type _CompilerModel = Expect<
  Equal<typeof compilerModel, ModelRef<string, "trim", string, string>>
>;

const asymmetricRef: Ref<string, string | number> = createModel<
  string,
  string,
  string,
  string | number
>(props, "modelValue", {
  default: "0",
  set: (v) => String(v),
});
asymmetricRef.value = 42;
const readAsymmetric: string = asymmetricRef.value;
const unrefAsymmetric = unref(asymmetricRef);
type _UnrefAsymmetric = Expect<Equal<typeof unrefAsymmetric, string>>;

const opts: DefineModelOptions<string> = {
  default: "ok",
  required: false,
  get: (v) => v,
  set: (v) => v,
};
void [
  optionalModel,
  unwrappedOptional,
  defaultedModel,
  destructuredModel,
  destructuredMods,
  requiredModel,
  compilerModel,
  readAsymmetric,
  unrefAsymmetric,
  opts,
];
