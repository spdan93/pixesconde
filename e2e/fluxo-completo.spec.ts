import { expect, test } from "@playwright/test";

function uuidAleatorio() {
  return crypto.randomUUID();
}

test("cadastrar chave → mandar Pix → pagar (fake) → comprovante → página secreta → ranking", async ({ page }) => {
  // 1. Cadastro da chave
  await page.goto("/cadastrar");
  await page.getByLabel("Sua chave Pix aleatória").fill(uuidAleatorio());
  await page.getByRole("button", { name: "Cadastrar chave" }).click();
  await expect(page).toHaveURL(/\/k\/[A-Za-z0-9_-]{32}\?nova=1$/);
  const linkSecreto = page.url().replace("?nova=1", "");
  const numero = (await page.getByRole("heading", { name: /Você agora é anônimo #(\d+)/ }).textContent())!.match(/#(\d+)/)![1]!;

  // 2. Mandar Pix para essa chave
  await page.goto(`/mandar/${Number(numero)}`);
  await page.getByText("R$ 10", { exact: true }).click();
  await page.getByLabel("Mensagenzinha").fill("teste e2e");
  await page.getByLabel("Seu apelido no ranking").fill("robo_e2e");
  await expect(page.getByText("chega para anônimo")).toContainText(`anônimo #${numero}`);
  await page.getByRole("button", { name: /Pagar R\$ 10,00 no Mercado Pago/ }).click();

  // 3. Pagamento de mentira
  await expect(page).toHaveURL(/\/dev\/pagar\/doa_/);
  await page.getByRole("button", { name: "Aprovar pagamento" }).click();

  // 4. Comprovante
  await expect(page).toHaveURL(/\/comprovante\/[0-9a-f-]{36}$/);
  await expect(page.getByText("PAGO")).toBeVisible();
  await expect(page.getByRole("article", { name: "comprovante" })).toContainText("R$ 10,00");
  await expect(page.getByRole("article", { name: "comprovante" })).toContainText("teste e2e");
  await expect(page.getByRole("article", { name: "comprovante" })).toContainText("robo_e2e");
  // só o doador (cookie) vê a caixa de vincular apelido
  await expect(page.getByRole("heading", { name: /conte no ranking como robo_e2e/ })).toBeVisible();
  // imagem para compartilhar responde PNG, e o botão baixa de verdade (fora do roteador)
  const imagem = await page.request.get(`${page.url()}/imagem.png`);
  expect(imagem.status()).toBe(200);
  expect(imagem.headers()["content-type"]).toContain("image/png");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Baixar imagem do comprovante" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^pix-sem-motivo-PE-\d{6}\.png$/);

  // 5. Página secreta de quem recebe
  await page.goto(linkSecreto);
  await expect(page.getByText("recebido no total")).toBeVisible();
  await expect(page.locator("main")).toContainText("R$ 10,00");
  await expect(page.locator("main")).toContainText("teste e2e");
  await expect(page.locator("main")).toContainText("de robo_e2e");

  // 6. Ranking responde e lista anônimos (apelido ainda não confirmado por e-mail)
  await page.goto("/ranking");
  await expect(page.getByRole("heading", { name: "Maiores doadores" })).toBeVisible();
});

test("chave que não é aleatória é recusada com a explicação", async ({ page }) => {
  await page.goto("/cadastrar");
  await page.getByLabel("Sua chave Pix aleatória").fill("123.456.789-09");
  await page.getByRole("button", { name: "Cadastrar chave" }).click();
  await expect(page.getByRole("alert")).toContainText("só chave aleatória");
});

test("link secreto inválido dá 404 genérico", async ({ page }) => {
  const r = await page.goto("/k/nao-existe-mesmo");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Isso aqui não existe." })).toBeVisible();
});
