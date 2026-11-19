type Props = {
  texto: string;
  tom: "vermelho" | "pix";
  className?: string;
};

/** O carimbo torto do comprovante: "SEM MOTIVO", "PAGO", "NA RODA". */
export function Carimbo({ texto, tom, className = "" }: Props) {
  const cor = tom === "pix" ? "border-pix text-pix" : "border-carimbo text-carimbo";
  return (
    <span
      data-tom={tom}
      className={`inline-block -rotate-6 rounded border-[3px] px-2.5 py-0.5 font-titulo text-xl font-bold uppercase tracking-wide ${cor} ${className}`}
    >
      {texto}
    </span>
  );
}
