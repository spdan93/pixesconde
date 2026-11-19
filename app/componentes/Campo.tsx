import type { ReactNode } from "react";

type Props = {
  rotulo: ReactNode;
  htmlFor?: string;
  dica?: ReactNode;
  erro?: string | null;
  opcional?: boolean;
  children: ReactNode;
};

/** Rótulo, controle, dica e erro, no ritmo do comprovante. */
export function Campo({ rotulo, htmlFor, dica, erro, opcional, children }: Props) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="mb-1.5 block font-bold">
        {rotulo}
        {opcional && <span className="font-normal text-cinza"> (opcional)</span>}
      </label>
      {children}
      {erro ? (
        <p role="alert" className="mt-1.5 text-[13px] text-carimbo">
          {erro}
        </p>
      ) : dica ? (
        <p className="mt-1.5 text-[13px] text-cinza">{dica}</p>
      ) : null}
    </div>
  );
}

export const classeInput =
  "w-full rounded-md border-2 border-tinta bg-papel px-3 py-2.5 font-mono text-[15px] text-tinta placeholder:text-linha focus:border-pix focus:outline-none aria-[invalid=true]:border-carimbo";
