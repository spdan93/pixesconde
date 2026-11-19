import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { Cabecalho } from "./componentes/Cabecalho";
import { Rodape } from "./componentes/Rodape";

export const links: Route.LinksFunction = () => [{ rel: "icon", href: "/favicon.ico" }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <>
      <Cabecalho />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
      <Rodape />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let titulo = "Deu ruim. Não foi você.";
  let detalhe = "Alguma coisa quebrou do nosso lado. Tenta de novo daqui a pouco.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      titulo = "Isso aqui não existe.";
      detalhe = "Ou nunca existiu, ou alguém tirou da roda. Não dá pra saber, e é assim mesmo.";
    } else {
      titulo = `Erro ${error.status}`;
      detalhe = error.statusText || detalhe;
    }
  } else if (import.meta.env.DEV && error instanceof Error) {
    detalhe = error.message;
    stack = error.stack;
  }

  return (
    <>
      <Cabecalho />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="font-titulo text-5xl font-bold leading-none tracking-tight">{titulo}</h1>
        <p className="mt-4 max-w-xl text-cinza">{detalhe}</p>
        {stack && (
          <pre className="mt-8 overflow-x-auto border-2 border-tinta p-4 text-xs">
            <code>{stack}</code>
          </pre>
        )}
      </main>
    </>
  );
}
