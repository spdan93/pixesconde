import { Link } from "react-router";
import type { RecebedorPublico } from "@/domain/recebedores/servico";
import { formatarReais, nomeAnonimo, tempoRelativo } from "~/util/formatos";
import { Botao } from "./Botao";

type Item = Pick<RecebedorPublico, "numeroPublico" | "totalRecebidoCentavos" | "quantidadePix" | "criadoEm"> & {
  ultimaMensagem: { texto: string; apelido: string | null; em: Date | string } | null;
  criadoEm: Date | string;
};

export function ListaRecebedores({ itens, agora }: { itens: Item[]; agora: Date }) {
  if (itens.length === 0) {
    return (
      <div className="border-2 border-tinta p-6">
        <p className="font-titulo text-2xl font-bold">Ninguém na roda ainda.</p>
        <p className="mt-2 text-cinza">
          Alguém tem que ser o primeiro a receber um Pix sem motivo.{" "}
          <Link to="/cadastrar" className="link text-tinta">
            Pode ser você.
          </Link>
        </p>
      </div>
    );
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="linha-solida text-left text-[12px]">
          <th className="py-2.5 font-bold">chave</th>
          <th className="hidden py-2.5 font-bold sm:table-cell">última mensagem recebida</th>
          <th className="py-2.5 text-right font-bold">recebeu</th>
          <th className="py-2.5" />
        </tr>
      </thead>
      <tbody>
        {itens.map((r) => (
          <tr key={r.numeroPublico} className="linha-pontilhada align-top">
            <td className="py-3 pr-3">
              <Link to={`/mandar/${r.numeroPublico}`} className="link font-bold">
                {nomeAnonimo(r.numeroPublico)}
              </Link>
              <div className="text-[12px] text-cinza">na roda {tempoRelativo(new Date(r.criadoEm), agora)}</div>
              {r.ultimaMensagem && (
                <div className="mt-1 text-[12px] italic text-cinza sm:hidden">“{r.ultimaMensagem.texto}”</div>
              )}
            </td>
            <td className="hidden py-3 pr-3 sm:table-cell">
              {r.ultimaMensagem ? (
                <>
                  <span className="italic">“{r.ultimaMensagem.texto}”</span>
                  <div className="text-[12px] text-cinza">
                    de {r.ultimaMensagem.apelido ?? "anônimo"}, {tempoRelativo(new Date(r.ultimaMensagem.em), agora)}
                  </div>
                </>
              ) : (
                <span className="text-cinza">{r.quantidadePix === 0 ? "ninguém mandou nada ainda" : "sem mensagem"}</span>
              )}
            </td>
            <td className="py-3 text-right">
              <b>{formatarReais(r.totalRecebidoCentavos)}</b>
              <div className="text-[12px] text-cinza">{r.quantidadePix === 1 ? "1 pix" : `${r.quantidadePix} pix`}</div>
            </td>
            <td className="py-3 pl-3 text-right">
              <Botao variante="contorno" tamanho="p" href={`/mandar/${r.numeroPublico}`}>
                mandar pix
              </Botao>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
