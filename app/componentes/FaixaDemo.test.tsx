import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FaixaDemo } from "./FaixaDemo";

describe("FaixaDemo", () => {
  test("diz que é demonstração e que nenhum dinheiro é de verdade", () => {
    render(<FaixaDemo />);
    const faixa = screen.getByRole("note");
    expect(faixa).toHaveTextContent("Demonstração");
    expect(faixa).toHaveTextContent("nenhum dinheiro de verdade");
  });
});
