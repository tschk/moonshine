type GreetProps = {
  name?: string;
};

export default function Greet({ name = "Moon" }: GreetProps) {
  return <span>Hi {name}</span>;
}
