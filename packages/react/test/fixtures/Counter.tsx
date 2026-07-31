type CounterProps = {
  start?: number;
  text?: string;
};

export default function Counter({ start = 0, text }: CounterProps) {
  return <button>{text ?? start}</button>;
}
