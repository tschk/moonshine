const { createElement } = require("react");
const { renderToString } = require("react-dom/server");

const textNodeTest = createElement("script", { type: "application/json" }, `{"foo":"<script>alert(1)</script>"}`);
console.log(renderToString(textNodeTest));

const htmlTest = createElement("script", {
  type: "application/json",
  dangerouslySetInnerHTML: { __html: `{"foo":"<script>alert(1)</script>"}` }
});
console.log(renderToString(htmlTest));
