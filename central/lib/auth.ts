/**
 * Sessao por cookie assinado (HMAC-SHA256) com Web Crypto, para funcionar tanto
 * no middleware (edge runtime) quanto nas server actions (node runtime).
 * Nenhuma dependencia externa e nenhum estado no servidor.
 */

export const COOKIE_SESSAO = "central_sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 12; // 12 horas

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64url(texto: string) {
  const s = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function chave(segredo: string) {
  return crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function hmac(segredo: string, mensagem: string) {
  const assinatura = await crypto.subtle.sign("HMAC", await chave(segredo), enc.encode(mensagem));
  return b64url(new Uint8Array(assinatura));
}

/** Comparacao de tempo constante entre duas strings ASCII. */
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Config = { segredo: string; senha: string };

/** Le a configuracao do ambiente. Retorna null (fail closed) se faltar algo. */
export function configAuth(): Config | null {
  const segredo = process.env.AUTH_SECRET;
  const senha = process.env.APP_PASSWORD;
  if (!segredo || !senha) return null;
  return { segredo, senha };
}

/**
 * Compara a senha informada com a do ambiente em tempo constante.
 * Compara digests SHA-256 (tamanho fixo) para nao vazar o tamanho da senha.
 */
export async function senhaCorreta(informada: string, config: Config) {
  const [a, b] = await Promise.all([sha256(informada), sha256(config.senha)]);
  return iguais(a, b);
}

async function sha256(valor: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(valor));
  return b64url(new Uint8Array(digest));
}

export async function criarToken(config: Config) {
  const corpo = b64url(enc.encode(JSON.stringify({ exp: Date.now() + DURACAO_SESSAO_S * 1000 })));
  return `${corpo}.${await hmac(config.segredo, corpo)}`;
}

export async function tokenValido(token: string | undefined, config: Config) {
  if (!token) return false;
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return false;
  if (!iguais(assinatura, await hmac(config.segredo, corpo))) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
