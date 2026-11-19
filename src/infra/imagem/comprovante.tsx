import type satori from "satori";

/** O motor é injetado: em Node é o `satori` padrão; no Worker é `satori/wasm` com o Yoga inicializado. */
export type MotorSatori = typeof satori;

export type DadosImagem = {
  valorTexto: string;
  para: string;
  de: string;
  mensagem: string | null;
  chegaLa: string;
  quando: string;
  numero: string;
  dominio: string;
};

export type FontesImagem = {
  mono: ArrayBuffer | Uint8Array;
  monoBold: ArrayBuffer | Uint8Array;
  titulo: ArrayBuffer | Uint8Array;
};

const TINTA = "#141414";
const CINZA = "#555555";
const LINHA = "#bdbdbd";
const PIX = "#32bcad";
const CARIMBO = "#d7263d";

function Linha({ rotulo, valor, bold, italico, ultima }: { rotulo: string; valor: string; bold?: boolean; italico?: boolean; ultima?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "18px 0",
        borderBottom: ultima ? "none" : `2px dashed ${LINHA}`,
        fontSize: 30,
      }}
    >
      <span style={{ color: CINZA }}>{rotulo}</span>
      <span style={{ fontWeight: bold ? 700 : 400, fontStyle: italico ? "italic" : "normal", maxWidth: 640, textAlign: "right" }}>{valor}</span>
    </div>
  );
}

/** A imagem quadrada do comprovante (1080×1080), pronta para o story. Satori: JSX → SVG. */
export async function gerarSvgComprovante(d: DadosImagem, fontes: FontesImagem, motor: MotorSatori): Promise<string> {
  const toBuf = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b) as ArrayBuffer;
  return motor(
    <div
      style={{
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        color: TINTA,
        fontFamily: "IBM Plex Mono",
        padding: 72,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `4px solid ${TINTA}`, paddingBottom: 20 }}>
        <span style={{ fontFamily: "Archivo Narrow", fontWeight: 700, fontSize: 40 }}>pix esconde</span>
        <span style={{ fontSize: 24, color: CINZA }}>{d.dominio}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
        <span style={{ fontFamily: "Archivo Narrow", fontWeight: 700, fontSize: 64, lineHeight: 1 }}>Comprovante de Pix</span>
        <span style={{ fontFamily: "Archivo Narrow", fontWeight: 700, fontSize: 64, lineHeight: 1 }}>sem motivo</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <Linha rotulo="valor" valor={d.valorTexto} bold />
        <Linha rotulo="para" valor={d.para} />
        <Linha rotulo="de" valor={d.de} />
        <Linha rotulo="motivo" valor="nenhum" />
        <Linha rotulo="mensagem" valor={d.mensagem ? `“${d.mensagem}”` : "—"} italico={Boolean(d.mensagem)} />
        <Linha rotulo="chega lá" valor={d.chegaLa} />
        <Linha rotulo="quando" valor={d.quando} />
        <Linha rotulo="nº" valor={d.numero} ultima />
      </div>

      <div
        style={{
          position: "absolute",
          right: 96,
          top: 300,
          transform: "rotate(-10deg)",
          border: `8px solid ${PIX}`,
          color: PIX,
          borderRadius: 12,
          padding: "10px 26px",
          fontFamily: "Archivo Narrow",
          fontWeight: 700,
          fontSize: 56,
          letterSpacing: 2,
        }}
      >
        PAGO
      </div>

      <div style={{ position: "absolute", left: 72, bottom: 56, display: "flex", alignItems: "center", fontSize: 22, color: CINZA }}>
        <span style={{ color: CARIMBO, fontFamily: "Archivo Narrow", fontWeight: 700, fontSize: 26, marginRight: 16 }}>SEM MOTIVO</span>
        <span>Ninguém sabe quem mandou. Ninguém sabe quem recebeu.</span>
      </div>
    </div>,
    {
      width: 1080,
      height: 1080,
      fonts: [
        { name: "IBM Plex Mono", data: toBuf(fontes.mono), weight: 400, style: "normal" },
        { name: "IBM Plex Mono", data: toBuf(fontes.monoBold), weight: 700, style: "normal" },
        { name: "Archivo Narrow", data: toBuf(fontes.titulo), weight: 700, style: "normal" },
      ],
    },
  );
}
