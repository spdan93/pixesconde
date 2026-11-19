import { createContext } from "react-router";
import type { Servicos } from "./servicos.server";

/** Bindings e contexto de execução do Worker, para quem precisar deles direto. */
export const cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>();

/** Os serviços do domínio, montados uma vez por requisição. Loaders e actions leem daqui. */
export const servicosContext = createContext<Servicos>();
