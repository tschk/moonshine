import { redirect } from "@tschk/moonshine-server";

export const loader = () => {
  throw redirect("/new");
};

export default function Old() {
  return null;
}
