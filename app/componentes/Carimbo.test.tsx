import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { Carimbo } from "./Carimbo";
import { Botao } from "./Botao";

function renderComRota(el: React.ReactNode) {
  const Stub = createRoutesStub([{ path: "/", Component: () => <>{el}</> }]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("Carimbo", () => {
  test("mostra o texto e marca o tom", () => {
    render(<Carimbo texto="SEM MOTIVO" tom="vermelho" />);
    const el = screen.getByText("SEM MOTIVO");
    expect(el).toBeVisible();
    expect(el).toHaveAttribute("data-tom", "vermelho");
  });
});

describe("Botao", () => {
  test("sem href é um button", () => {
    render(<Botao variante="primario">Sortear uma chave</Botao>);
    expect(screen.getByRole("button", { name: "Sortear uma chave" })).toBeInTheDocument();
  });

  test("com href é um link", () => {
    renderComRota(
      <Botao variante="contorno" href="/chaves">
        Ver as chaves
      </Botao>,
    );
    expect(screen.getByRole("link", { name: "Ver as chaves" })).toHaveAttribute("href", "/chaves");
  });
});
