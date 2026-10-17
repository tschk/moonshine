/** Independent owner-scoped context; lazy children must be created under Provider. */
import {
  createComponentScope,
  getOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";

import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { scopeSSRChild } from "@tschk/moonshine-dom/ssr-owner";

import { children } from "./children";

export interface Context<T> {
  id: symbol;
  Provider: (props: { value: T; children?: any }) => any;
  defaultValue: T;
}
export function createContext<T>(
  defaultValue?: undefined,
  options?: { name?: string },
): Context<T | undefined>;
export function createContext<T>(
  defaultValue: T,
  options?: { name?: string },
): Context<T>;
export function createContext<T>(
  defaultValue?: T,
  _options?: { name?: string },
): Context<T | undefined> {
  const id = Symbol("context");
  return {
    id,
    defaultValue,
    Provider(props) {
      return createComponentScope(() => {
        const owner = getOwner()!;
        owner.context = new Map(owner.context);
        owner.context.set(
          id,
          untrack(() => props.value),
        );
        const resolved = children(() => props.children);
        return peekComponentContext()?.mode === "ssr"
          ? scopeSSRChild(resolved)
          : resolved;
      });
    },
  };
}
export function useContext<T>(context: Context<T>): T {
  const value = getOwner()?.context?.get(context.id);
  return value === undefined ? context.defaultValue : (value as T);
}
