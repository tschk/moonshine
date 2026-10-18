// https://html.spec.whatwg.org/multipage/indices.html#attributes-3
const BOOLEAN = /* @__PURE__ */ new Set(
  /* @__PURE__ */ "allowfullscreen alpha async autofocus autoplay checked controls default defer disabled formnovalidate headingreset inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected shadowrootclonable shadowrootcustomelementregistry shadowrootdelegatesfocus shadowrootserializable".split(
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

// Pinned source semantics differ from generic HTML's current standards table.
const SOURCE_BOOLEAN_ADDITIONS = /* @__PURE__ */ new Set([
  "indeterminate",
  "seamless",
  "webkitdirectory",
  "disablepictureinpicture",
  "disableremoteplayback",
]);
const SOURCE_BOOLEAN_EXCLUSIONS = /* @__PURE__ */ new Set([
  "alpha",
  "headingreset",
  "itemscope",
  "shadowrootclonable",
  "shadowrootcustomelementregistry",
  "shadowrootdelegatesfocus",
  "shadowrootserializable",
]);

/** Compiler source attributes: literal strings retain their authored fast path. */
export function sourceAttributeValue(
  name: string,
  value: unknown,
  dynamic: boolean,
): string | undefined {
  if (!dynamic && typeof value === "string") return value;
  const boolean =
    (BOOLEAN.has(name) && !SOURCE_BOOLEAN_EXCLUSIONS.has(name)) ||
    SOURCE_BOOLEAN_ADDITIONS.has(name) ||
    (name === "hidden" && value !== "until-found");
  if (value == null || (boolean && !value && value !== "")) return undefined;
  if (boolean) return "";
  if (name === "translate" && typeof value === "boolean")
    return value ? "yes" : "no";
  return String(value);
}
