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

/** Onde o token de sessão fica entre visitas. */
const CHAVE_TOKEN = "chaos-trials:sessao";

/**
 * A conta.
 *
 * A moeda premium mora aqui, e não no personagem: foi comprada com dinheiro
 * de verdade e não pode evaporar num permadeath.
 */
export interface Conta {
  id: string;
  email: string;
  premium: number;
  slots: {
    total: number;
    usados: number;
    livres: number;
    gratis: number;
    comprados: number;
    maximo: number;
    precoDoProximo: number;
    /** Já resolvido pelo servidor, como na árvore. */
    podeComprar: boolean;
    impedimento: string | null;
  };
}

export type Encaixe = "arma" | "elmo" | "peito" | "talisma";

/**
 * A peça, já pronta para a tela.
 *
 * Cor, nome da raridade e propriedades em texto vêm do servidor: são regra
 * de domínio, e recalculá-las aqui seria a mesma duplicação que o
 * impedimento da árvore evita.
 */
export interface Item {
  id: string;
  nome: string;
  encaixe: Encaixe;
  encaixeNome: string;
  raridade: string;
  raridadeNome: string;
  cor: string;
  nivel: number;
  poder: number;
  desmanchePor: number;
  propriedades: { nome: string; valor: string }[];
  /** Presente só na queda que não coube na mochila. */
  viroSucata?: number;
}

export type Moeda = "sucata" | "premium";

export interface Anuncio {
  id: string;
  item: Item;
  preco: number;
  moeda: Moeda;
  estado: "aberto" | "vendido" | "retirado";
  vendedorNome: string;
  /** Se este anúncio é da minha conta. Resolvido pelo servidor. */
  meu: boolean;
  criadoEm: number;
  dizimo: number;
  aoVendedor: number;
}

/** Um adversário na arena. Sem mochila nem sucata: não é da nossa conta. */
export interface Alvo {
  id: string;
  nome: string;
  nivel: number;
  camada: number;
  elo: number;
  classe: { indice: number; nome: string; ramo: 1 | 2 | 3 | 4 | 5 };
  vidaMaxima: number;
  defesas: number;
}

export interface Duelo {
  venci: boolean;
  rodadas: number;
  eventos: Evento[];
  premio: number;
  elo: { antes: number; depois: number };
  defensor: Alvo;
  personagem: Personagem | null;
}

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
  mortes: number;
  parede: number;
  /** Pontuação na arena, e o histórico de duelos dos dois lados. */
  elo: number;
  duelos: { vitorias: number; derrotas: number; defesas: number };
  podeRenascer: boolean;
  subclasses: { indice: number; nome: string }[];
  habilidades: { id: string; nome: string; descricao: string; recarga: number }[];
  custoDoRevive: number;
  /** A poção, já resolvida pelo servidor: preço, cura e o motivo de não dar. */
  pocao: {
    preco: number;
    cura: number;
    podeBeber: boolean;
    impedimento: string | null;
  };
  arvore: Arvore;
  equipado: Partial<Record<Encaixe, Item>>;
  /** Já ordenada por poder pelo servidor. */
  mochila: Item[];
  mochilaMaxima: number;
  ausencia?: {
    horas: number;
    batalhas: number;
    vitorias: number;
    xp: number;
    sucata: number;
    morreu: boolean;
    /** O tempo que sobrou virou descanso, e o quanto ele curou. */
    horasDescansando: number;
    vidaRecuperada: number;
  } | null;
}

export interface NoDaArvore {
  id: string;
  nome: string;
  descricao: string;
  tipo: "atributo" | "magia" | "passiva";
  custo: number;
  graus: number;
  comprados: number;
  requer: string[];
  coluna: number;
  linha: number;
  podeComprar: boolean;
  /** O motivo de estar fechado, já resolvido pelo servidor. */
  impedimento: { motivo: string; detalhe: string } | null;
  /** O que UM grau faz, em número — não só a frase de sabor. */
  efeitoPorGrau: string;
}

export interface Arvore {
  pontos: number;
  nos: NoDaArvore[];
  bonus: Record<string, number | string[]>;
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
  /** O que a vitória largou, se largou. */
  queda?: Item | null;
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
  const token = tokenGuardado();
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: opcoes?.metodo ?? "GET",
      headers: {
        ...(opcoes?.corpo ? { "Content-Type": "application/json" } : {}),
        // No cabeçalho e não em cookie: o cliente é uma página estática
        // noutra origem, e cookie de origem cruzada vira negociação com
        // cada navegador. De quebra, elimina CSRF por construção.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opcoes?.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    // Distinguir "servidor fora" de "pedido recusado" importa: a tela diz
    // coisas diferentes, e "erro desconhecido" não ajuda ninguém.
    throw new ErroDaApi(0, "o servidor não respondeu — ele está no ar?");
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    // Sessão que caiu apaga o token guardado na hora. Sem isto a tela
    // insistiria com uma credencial morta a cada carga.
    if (resposta.status === 401) esquecerToken();
    throw new ErroDaApi(
      resposta.status,
      (dados as { erro?: string }).erro ?? `falha ${resposta.status}`,
    );
  }
  return dados as T;
}

export interface Entrada {
  token: string;
  conta: Conta;
}

export const api = {
  classes: () => pedir<{ raizes: { indice: number; nome: string }[] }>("/classes"),

  cadastrar: (email: string, senha: string) =>
    pedir<Entrada>("/contas", { metodo: "POST", corpo: { email, senha } }),

  entrar: (email: string, senha: string) =>
    pedir<Entrada>("/sessoes", { metodo: "POST", corpo: { email, senha } }),

  sair: () => pedir<{ ok: boolean }>("/sessoes", { metodo: "DELETE" }),

  /** Eu e meus personagens: a tela de slots inteira numa chamada. */
  eu: () => pedir<{ conta: Conta; personagens: Personagem[] }>("/eu"),

  comprarSlot: () => pedir<{ conta: Conta }>("/eu/slots", { metodo: "POST" }),

  apagar: (id: string) =>
    pedir<{ ok: boolean }>(`/personagens/${id}`, { metodo: "DELETE" }),

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

  arena: (personagem: string) =>
    pedir<{
      eu: { elo: number; nivel: number };
      faixa: { minimo: number; maximo: number };
      podeDesafiar: boolean;
      impedimento: string | null;
      alvos: Alvo[];
    }>(`/arena?personagem=${encodeURIComponent(personagem)}`),

  duelar: (alvo: string, personagem: string) =>
    pedir<Duelo>(`/arena/${alvo}`, { metodo: "POST", corpo: { personagem } }),

  beberPocao: (id: string) =>
    pedir<Personagem & { curou: number; pagou: number }>(
      `/personagens/${id}/pocao`,
      { metodo: "POST" },
    ),

  equipar: (id: string, item: string) =>
    pedir<Personagem>(`/personagens/${id}/equipar`, {
      metodo: "POST",
      corpo: { item },
    }),

  desequipar: (id: string, encaixe: Encaixe) =>
    pedir<Personagem>(`/personagens/${id}/desequipar`, {
      metodo: "POST",
      corpo: { encaixe },
    }),

  desmanchar: (id: string, item: string) =>
    pedir<Personagem & { rendeu: number }>(`/personagens/${id}/desmanchar`, {
      metodo: "POST",
      corpo: { item },
    }),

  mercado: (moeda?: Moeda) =>
    pedir<{ dizimo: number; anuncios: Anuncio[]; meus: Anuncio[] }>(
      `/mercado${moeda ? `?moeda=${moeda}` : ""}`,
    ),

  anunciar: (personagem: string, item: string, preco: number, moeda: Moeda) =>
    pedir<{ anuncio: Anuncio; personagem: Personagem }>("/mercado", {
      metodo: "POST",
      corpo: { personagem, item, preco, moeda },
    }),

  retirarAnuncio: (id: string) =>
    pedir<{ ok: boolean; personagem: Personagem }>(`/mercado/${id}`, {
      metodo: "DELETE",
    }),

  comprarAnuncio: (id: string, personagem: string) =>
    pedir<{
      comprou: Item;
      pagou: number;
      moeda: Moeda;
      dizimo: number;
      personagem: Personagem;
    }>(`/mercado/${id}/comprar`, { metodo: "POST", corpo: { personagem } }),

  evoluirArvore: (id: string, no: string) =>
    pedir<Personagem>(`/personagens/${id}/arvore`, {
      metodo: "POST",
      corpo: { no },
    }),
};

/**
 * O que fica guardado no navegador.
 *
 * Duas coisas, e são diferentes: o TOKEN é a credencial, e o id do
 * personagem é só qual dos meus eu estava jogando. Antes o id era a
 * credencial — quem o descobrisse jogava com ele. Agora ele não abre nada
 * sozinho: o servidor confere se o personagem é da conta do token.
 */
function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    // Aba anônima com armazenamento bloqueado: joga sem lembrar, em vez de
    // quebrar a tela inteira.
    return null;
  }
}

function escrever(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* segue sem lembrar */
  }
}

export function tokenGuardado(): string | null {
  return ler(CHAVE_TOKEN);
}

export function guardarToken(token: string): void {
  escrever(CHAVE_TOKEN, token);
}

export function esquecerToken(): void {
  try {
    localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* nada a fazer */
  }
}

export function idGuardado(): string | null {
  return ler(CHAVE);
}

export function guardarId(id: string): void {
  escrever(CHAVE, id);
}

export function esquecerId(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}
