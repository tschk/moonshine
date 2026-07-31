import { island } from "../../src/islands";

const Counter = island(() => import("./Counter"));
const Greet = island(() => import("./Greet"));

type IslandPage2Props = {
  data?: { start?: number; name?: string };
};

export default function IslandPage2({ data }: IslandPage2Props) {
  return (
    <div>
      <Counter start={data?.start} />
      <Greet name={data?.name} />
    </div>
  );
}
