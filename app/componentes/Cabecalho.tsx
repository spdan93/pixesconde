import { Link, NavLink } from "react-router";
import { Botao } from "./Botao";

const links = [
  { para: "/chaves", texto: "chaves" },
  { para: "/ranking", texto: "ranking" },
  { para: "/como-funciona", texto: "como funciona" },
];

export function Cabecalho() {
  return (
    <header className="linha-solida">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <Link to="/" className="font-titulo text-[22px] font-bold tracking-tight">
          pix esconde
        </Link>
        <nav aria-label="principal" className="flex items-center gap-4 sm:gap-7">
          {links.map((l) => (
            <NavLink
              key={l.para}
              to={l.para}
              className={({ isActive }) =>
                `link hidden text-[13px] sm:inline ${isActive ? "border-b-2 border-pix font-bold" : ""}`
              }
            >
              {l.texto}
            </NavLink>
          ))}
          <NavLink to="/ranking" className="link text-[13px] sm:hidden">
            ranking
          </NavLink>
          <Botao variante="primario" tamanho="p" href="/cadastrar">
            <span className="sm:hidden">minha chave</span>
            <span className="hidden sm:inline">cadastrar minha chave</span>
          </Botao>
        </nav>
      </div>
    </header>
  );
}
