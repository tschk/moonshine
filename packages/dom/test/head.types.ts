import { head, title } from "../src/head";
import {
  head as serverHead,
  title as serverTitle,
  renderWithHead,
} from "../src/head-ssr";
import { h, type DOMChild } from "../src/dom";
import { h as serverH, type SSRChild } from "../src/ssr";
const child: DOMChild = head(() => [
  title(() => "title"),
  h("meta", { name: "description", content: "description" }),
]);
const serverChild: SSRChild = serverHead(() => [
  serverTitle(() => "title"),
  serverH("meta", { name: "description", content: "description" }),
]);
const result: { body: string; head: string } = renderWithHead(
  () => serverChild,
);
// @ts-expect-error compiler title readers provide text, not an arbitrary value
title(() => 1);
// @ts-expect-error async head rendering is not supported
serverHead(async () => serverH("meta", {}));
void child;
void result;
