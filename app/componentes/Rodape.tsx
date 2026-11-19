import { Link } from "react-router";

export function Rodape() {
  return (
    <footer className="mt-16 border-t-2 border-tinta">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-[12px] text-cinza sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Pix sem motivo para desconhecidos. A plataforma possui taxas de operação simbólicas, saiba mais em '
          <Link to="/como-funciona" className="link">
            como funciona
          </Link>
          '.
        </p>
        <nav aria-label="rodapé" className="flex gap-4">
          <Link to="/como-funciona" className="link">
            como funciona
          </Link>
          <Link to="/cadastrar" className="link">
            cadastrar chave
          </Link>
        </nav>
      </div>
    </footer>
  );
}
