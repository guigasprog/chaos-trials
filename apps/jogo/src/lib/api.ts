"use client";

/**
 * O que o cliente sabe falar com o servidor.
 *
 * Nada aqui calcula regra de jogo. O cliente pede e mostra; quem decide dano,
 * XP e morte é o servidor. Toda função abaixo manda **intenção** — nunca
 * estado —, porque é isso que torna a trapaça impossível.
 */

const BASE = process.env.NEXT_PUBLIC_API ?? "http://localhost:3333";

/** Onde o id do personagem fica entre visitas. */
const CHAVE = "chaos-trials:personagem";

export interface Personagem {
  id: string;
  nome: string;
  classe: { indice: number; nome: string; ramo: 1 | 2 | 3 | 4 | 5 };
  nivel: number;
  xp: number;
  xpDoNivel: number;
  camada: number;
  estado: "vivo" | "tumulo";
  vida: number;
  vidaMaxima: number;
  sucata: number;
  premium: number;
  mortes: number;
  parede: number;
  podeRenascer: boolean;
  subclasses: { indice: number; nome: string }[];
  habilidades: { id: string; nome: string; descricao: string; recarga: number }[];
  custoDoRevive: number;
  ausencia?: {
    horas: number;
    batalhas: number;
    vitorias: number;
    xp: number;
    sucata: number;
    morreu: boolean;
  } | null;
}

export interface Combatente {
  id: string;
  nome: string;
  lado: "jogador" | "inimigo";
  vida: number;
  vidaMaxima: number;
  efeitos: { tipo: string; rodadas: number }[];
}

export interface EstadoDaBatalha {
  rodada: number;
  vez: string | null;
  vencedor: "jogador" | "inimigo" | null;
  combatentes: Combatente[];
  disponiveis: { id: string; nome: string; descricao: string }[];
  recargas: Record<string, number>;
  todas: { id: string; nome: string; descricao: string }[];
}

export type Evento = Record<string, unknown> & { tipo: string };

export interface Resultado {
  venceu: boolean;
  xp: number;
  sucata: number;
  niveisSubidos: number;
  morreu: boolean;
  recuou?: boolean;
  personagem?: Personagem;
}

export interface Batalha {
  id: string;
  tipo: "comum" | "julgamento";
  mortal: boolean;
  estado: EstadoDaBatalha;
  eventos: Evento[];
  resultado: Resultado | null;
}

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

async function pedir<T>(
  caminho: string,
  opcoes?: { metodo?: string; corpo?: unknown },
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: opcoes?.metodo ?? "GET",
      headers: opcoes?.corpo ? { "Content-Type": "application/json" } : {},
      body: opcoes?.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    // Distinguir "servidor fora" de "pedido recusado" importa: a tela diz
    // coisas diferentes, e "erro desconhecido" não ajuda ninguém.
    throw new ErroDaApi(0, "o servidor não respondeu — ele está no ar?");
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new ErroDaApi(
      resposta.status,
      (dados as { erro?: string }).erro ?? `falha ${resposta.status}`,
    );
  }
  return dados as T;
}

export const api = {
  classes: () => pedir<{ raizes: { indice: number; nome: string }[] }>("/classes"),

  criar: (nome: string, classe: number) =>
    pedir<Personagem>("/personagens", {
      metodo: "POST",
      corpo: { nome, classe },
    }),

  buscar: (id: string) => pedir<Personagem>(`/personagens/${id}`),

  iniciarBatalha: (id: string, tipo: "comum" | "julgamento") =>
    pedir<Batalha>(`/personagens/${id}/batalhas`, {
      metodo: "POST",
      corpo: { tipo },
    }),

  agir: (batalha: string, habilidade: string) =>
    pedir<{ estado: EstadoDaBatalha; eventos: Evento[]; resultado: Resultado | null }>(
      `/batalhas/${batalha}/turnos`,
      { metodo: "POST", corpo: { habilidade } },
    ),

  escolherSubclasse: (id: string, classe: number) =>
    pedir<Personagem>(`/personagens/${id}/subclasse`, {
      metodo: "POST",
      corpo: { classe },
    }),

  renascer: (id: string, classe: number) =>
    pedir<Personagem>(`/personagens/${id}/renascer`, {
      metodo: "POST",
      corpo: { classe },
    }),

  reviver: (id: string) =>
    pedir<Personagem>(`/personagens/${id}/reviver`, { metodo: "POST" }),
};

/**
 * O id guardado no navegador.
 *
 * É credencial provisória, e está assim de propósito até o sub-projeto 6:
 * quem tiver o id joga com o personagem. Serve para jogar localmente e não
 * para expor.
 */
export function idGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    // Aba anônima com armazenamento bloqueado: joga sem lembrar, em vez de
    // quebrar a tela inteira.
    return null;
  }
}

export function guardarId(id: string): void {
  try {
    localStorage.setItem(CHAVE, id);
  } catch {
    /* segue sem lembrar */
  }
}

export function esquecerId(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}
