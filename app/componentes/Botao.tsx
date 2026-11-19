import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

type Base = {
  variante: "primario" | "contorno";
  tamanho?: "p" | "m";
  children: ReactNode;
  className?: string;
};

type Props = Base &
  (
    | {
        href: string;
        /** Arquivo para baixar: vira `<a download>` servido pelo navegador, fora do roteador. */
        baixar?: string;
        type?: never;
        disabled?: never;
        name?: never;
        value?: never;
        onClick?: never;
      }
    | ({ href?: undefined; baixar?: never } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">)
  );

const base =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md font-titulo font-bold leading-none transition-[transform,background-color,border-color] duration-150 ease-out hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";
const variantes = {
  primario: "bg-pix text-white hover:bg-pix-escuro",
  contorno: "border-2 border-tinta bg-papel text-tinta hover:bg-tinta hover:text-papel",
};
const tamanhos = {
  m: "px-5 py-3.5 text-[17px]",
  p: "px-3.5 py-2 text-[14px]",
};

/** Um botão só, dois tons. Com `href` vira link. */
export function Botao(props: Props) {
  const { variante, tamanho = "m", children, className = "" } = props;
  const classes = `${base} ${variantes[variante]} ${tamanhos[tamanho]} ${className}`;
  if (props.href !== undefined) {
    if (props.baixar !== undefined) {
      return (
        <a href={props.href} download={props.baixar} className={classes}>
          {children}
        </a>
      );
    }
    return (
      <Link to={props.href} className={classes}>
        {children}
      </Link>
    );
  }
  const { href: _h, baixar: _b, variante: _v, tamanho: _t, children: _c, className: _cn, ...resto } = props;
  return (
    <button type="button" {...resto} className={classes}>
      {children}
    </button>
  );
}
