import { island } from "../../src/islands";

const Counter = island(() => import("./Counter"));

type IslandPageProps = {
  data?: { start?: number; text?: string };
};

export default function IslandPage({ data }: IslandPageProps) {
  return (
    <div>
      <Counter start={data?.start} text={data?.text} />
    </div>
  );
}
