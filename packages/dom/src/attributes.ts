// https://html.spec.whatwg.org/multipage/indices.html#attributes-3
const BOOLEAN = new Set(
  "allowfullscreen alpha async autofocus autoplay checked controls default defer disabled formnovalidate headingreset inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected shadowrootclonable shadowrootcustomelementregistry shadowrootdelegatesfocus shadowrootserializable".split(
    " ",
  ),
);

export function attributeValue(
  name: string,
  value: unknown,
  html: boolean,
): string | undefined {
  const lower = name.toLowerCase();
  // Hidden also accepts an empty hidden state and the string 'until-found'.
  const boolean = html && (BOOLEAN.has(lower) || lower === "hidden");
  if (value == null || (boolean && !value && value !== "")) return undefined;
  if (html && lower === "translate" && typeof value === "boolean")
    return value ? "yes" : "no";
  return boolean && value === true ? "" : String(value);
}
