import { createEmitter, type EventListeners } from "../src/events";
type Events = { change: [number, string]; "item-change": [number] };
const emit = createEmitter<Events>({});
emit("change", 1, "x");
emit("item-change", 2);
// @ts-expect-error missing label
emit("change", 1);
// @ts-expect-error undeclared event
emit("missing", 1);
// @ts-expect-error wrong payload
emit("item-change", "bad");
const listeners: EventListeners<Events> = {
  onChange: (amount, label) => [amount.toFixed(), label.toUpperCase()],
  onItemChangeOnce: (amount) => amount.toFixed(),
};
void listeners;

type ModelEvents = { "update:modelValue": [value: string] };
const modelListeners: EventListeners<ModelEvents> = {
  "onUpdate:modelValue": (value) => value.toUpperCase(),
  "onUpdate:modelValueOnce": (value) => value.toLowerCase(),
};
const modelEmit = createEmitter<ModelEvents>(modelListeners);
modelEmit("update:modelValue", "next");
// @ts-expect-error model event payload types remain checked.
modelEmit("update:modelValue", 1);

type NamedModels = {
  "update:title": [value: string];
  "update:count": [value: number];
  "update:first-name": [value: string];
};
const namedListeners: EventListeners<NamedModels> = {
  "onUpdate:title": (value) => value.toUpperCase(),
  "onUpdate:countOnce": (value) => value.toFixed(),
  "onUpdate:firstName": (value) => value.toLowerCase(),
};
const namedEmit = createEmitter<NamedModels>(namedListeners);
namedEmit("update:title", "next");
namedEmit("update:count", 2);
// @ts-expect-error named model payloads stay distinct.
namedEmit("update:count", "wrong");
