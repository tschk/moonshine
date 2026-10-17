import { h } from "../src/dom";
import { h as serverH } from "../src/ssr";

interface Props {
  readonly label: string;
}
declare const props: Props;
const Component = (value: Props) => value.label;
h(Component, props);
serverH(Component, props);
// @ts-expect-error Component props retain their declared value type.
h(Component, { label: 1 });
// @ts-expect-error Server component props retain their declared value type.
serverH(Component, { label: 1 });
