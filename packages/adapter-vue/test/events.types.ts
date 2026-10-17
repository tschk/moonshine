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
