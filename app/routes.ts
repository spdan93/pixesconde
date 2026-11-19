import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("chaves", "routes/chaves.tsx"),
  route("sortear", "routes/sortear.tsx"),
  route("como-funciona", "routes/como-funciona.tsx"),
  route("cadastrar", "routes/cadastrar.tsx"),
  route("k/:token", "routes/k.tsx"),
  route("mandar/:numero", "routes/mandar.tsx"),
  route("comprovante/:id", "routes/comprovante.tsx"),
  route("comprovante/:id/imagem.png", "routes/comprovante.imagem.ts"),
  route("ranking", "routes/ranking.tsx"),
  route("apelido/confirmar/:token", "routes/apelido.confirmar.tsx"),
  route("dev/pagar/:ref", "routes/dev.pagar.tsx"),
  route("webhooks/fake", "routes/webhooks.fake.ts"),
] satisfies RouteConfig;
