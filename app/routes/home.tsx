import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "pix esconde" }];
}

export default function Home() {
  return <main className="p-8 font-mono">pix esconde — em construção</main>;
}
