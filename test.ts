type ViewNode =
  | { kind: "text"; content: string }
  | { kind: "link"; href: string };

const RENDERERS: {
  [K in ViewNode["kind"]]?: (node: Extract<ViewNode, { kind: K }>, cls: string) => void;
} = {
  text: (node, cls) => console.log(node.content),
  link: (node, cls) => console.log(node.href)
};

function render(node: ViewNode) {
  const r = RENDERERS[node.kind];
  if (r) r(node as any, "cls");
}
