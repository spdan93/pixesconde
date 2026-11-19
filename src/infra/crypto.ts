/**
 * Primitivas de criptografia sobre WebCrypto: rodam igual em Node e em workerd.
 * - cifrar/decifrar: AES-GCM 256, valor guardado como "enc:v1:<iv>:<ct>" em base64.
 * - hmacHex: HMAC-SHA256 para unicidade sem expor o texto.
 * - gerarToken/sha256Hex: tokens de link secreto e seus hashes.
 * - assinarCookie/verificarCookie: valor + HMAC, para o cookie de dono de apelido.
 */

const PREFIXO = "enc:v1:";
const enc = new TextEncoder();
const dec = new TextDecoder();

function base64ParaBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesParaBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function bytesParaBase64Url(bytes: Uint8Array): string {
  return bytesParaBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesParaHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function chaveAes(chaveBase64: string): Promise<CryptoKey> {
  const bytes = base64ParaBytes(chaveBase64);
  if (bytes.length !== 32) throw new Error("CHAVE_CIFRA precisa ter 32 bytes em base64");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function chaveHmac(segredoBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ParaBytes(segredoBase64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function cifrar(texto: string, chaveBase64: string): Promise<string> {
  const chave = await chaveAes(chaveBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, enc.encode(texto));
  return `${PREFIXO}${bytesParaBase64(iv)}:${bytesParaBase64(new Uint8Array(ct))}`;
}

/** Aceita valor sem prefixo e devolve como está, para rollout de cifra em coluna existente. */
export async function decifrar(valor: string, chaveBase64: string): Promise<string> {
  if (!valor.startsWith(PREFIXO)) return valor;
  const [ivB64, ctB64] = valor.slice(PREFIXO.length).split(":");
  if (!ivB64 || !ctB64) throw new Error("valor cifrado malformado");
  const chave = await chaveAes(chaveBase64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ParaBytes(ivB64) },
    chave,
    base64ParaBytes(ctB64),
  );
  return dec.decode(pt);
}

export async function hmacHex(texto: string, segredoBase64: string): Promise<string> {
  const chave = await chaveHmac(segredoBase64);
  const sig = await crypto.subtle.sign("HMAC", chave, enc.encode(texto));
  return bytesParaHex(new Uint8Array(sig));
}

export async function sha256Hex(texto: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(texto));
  return bytesParaHex(new Uint8Array(hash));
}

export function gerarToken(bytes = 24): string {
  return bytesParaBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function assinarCookie(valor: string, segredoBase64: string): Promise<string> {
  const assinatura = await hmacHex(valor, segredoBase64);
  return `${valor}.${assinatura}`;
}

export async function verificarCookie(assinado: string, segredoBase64: string): Promise<string | null> {
  const i = assinado.lastIndexOf(".");
  if (i <= 0) return null;
  const valor = assinado.slice(0, i);
  const assinatura = assinado.slice(i + 1);
  const esperada = await hmacHex(valor, segredoBase64);
  if (assinatura.length !== esperada.length) return null;
  let diff = 0;
  for (let k = 0; k < esperada.length; k++) diff |= assinatura.charCodeAt(k) ^ esperada.charCodeAt(k);
  return diff === 0 ? valor : null;
}
