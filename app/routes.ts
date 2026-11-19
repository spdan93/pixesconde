import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("chaves", "routes/chaves.tsx"),
  route("sortear", "routes/sortear.tsx"),
  route("como-funciona", "routes/como-funciona.tsx"),
] satisfies RouteConfig;
