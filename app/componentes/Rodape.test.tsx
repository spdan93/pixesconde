import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { Rodape } from "./Rodape";

function renderizar() {
  const Stub = createRoutesStub([{ path: "/", Component: () => <Rodape /> }]);
  render(<Stub initialEntries={["/"]} />);
}

describe("Rodape", () => {
  test("fala de taxas simbólicas e manda para o como funciona, sem citar porcentagem", () => {
    renderizar();
    const rodape = screen.getByRole("contentinfo");
    expect(rodape).toHaveTextContent("A plataforma possui taxas de operação simbólicas, saiba mais em 'como funciona'.");
    expect(rodape).not.toHaveTextContent("%");
    const links = screen.getAllByRole("link", { name: "como funciona" });
    expect(links.every((l) => l.getAttribute("href") === "/como-funciona")).toBe(true);
  });
});
