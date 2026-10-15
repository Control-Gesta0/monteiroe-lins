"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, criarToken, DURACAO_SESSAO_S, configAuth, senhaCorreta } from "@/lib/auth";

export type EstadoLogin = { erro?: string };

export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const config = configAuth();
  if (!config) {
    return {
      erro:
        "Acesso não configurado: defina APP_PASSWORD e AUTH_SECRET nas variáveis de ambiente do projeto.",
    };
  }

  const senha = String(dados.get("senha") ?? "");
  if (!senha) return { erro: "Informe a senha." };

  if (!(await senhaCorreta(senha, config))) {
    // Atrasa a resposta para encarecer tentativa por forca bruta.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { erro: "Senha incorreta." };
  }

  (await cookies()).set(COOKIE_SESSAO, await criarToken(config), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });

  const destino = String(dados.get("de") ?? "/");
  // Só aceita caminho interno, para o parametro nao virar redirect aberto.
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
