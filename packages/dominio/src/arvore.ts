import type { Atributos, NomeAtributo } from "./atributos.ts";
import { ATRIBUTO_DO_RAMO } from "./atributos.ts";
import type { Ramo } from "./classe.ts";
import { habilidadePorId } from "./habilidades.ts";

/**
 * A árvore de habilidade.
 *
 * Três tipos de nó, e a diferença entre eles é o que cada um faz com o ponto
 * gasto:
 *
 * - **atributo** — sobe um número. Sempre útil, nunca empolgante; é o piso.
 * - **magia** — dá uma habilidade nova para usar em combate. Muda o que dá
 *   para fazer no turno, não o quanto se bate.
 * - **passiva** — muda uma regra permanentemente. Não aparece na barra de
 *   ações e é o que mais muda a sensação de jogar.
 *
 * A mesma árvore para os cinco ramos, com o nó de atributo do tronco apontando
 * para o atributo DAQUELE ramo. Cinco árvores separadas seriam cinco vezes o
 * trabalho de balancear, e quatro quintos do conteúdo que ninguém veria numa
 * vida — e aqui uma vida acaba na parede.
 */

export type TipoDeNo = "atributo" | "magia" | "passiva";

/** As regras que uma passiva pode mudar. */
export type NomeDePassiva =
  | "danoPercentual"
  | "vidaPercentual"
  | "criticoAdicional"
  | "reducaoAdicional"
  | "roubodeVida"
  | "recargaReduzida";

export type Efeito =
  /** `"doRamo"` aponta para o atributo que define o ramo do personagem. */
  | { readonly tipo: "atributo"; readonly atributo: NomeAtributo | "doRamo"; readonly valor: number }
  | { readonly tipo: "magia"; readonly habilidade: string }
  | { readonly tipo: "passiva"; readonly passiva: NomeDePassiva; readonly valor: number };

export interface No {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly tipo: TipoDeNo;
  /** Pontos por grau. */
  readonly custo: number;
  /** Quantas vezes dá para comprar. Magia é sempre 1. */
  readonly graus: number;
  /** Ids que precisam ter ao menos um grau antes. */
  readonly requer: readonly string[];
  readonly efeito: Efeito;
  /** Onde fica na grade, para a tela desenhar sem calcular layout. */
  readonly coluna: number;
  readonly linha: number;
}

/**
 * Um ponto por nível.
 *
 * A árvore inteira custa 148, e a parede da camada 0 fica no nível 100: não dá
 * para ter tudo numa vida, e é isso que faz a escolha existir. Camadas
 * seguintes vão mais longe e permitem outras combinações, que é o conteúdo
 * rejogável.
 */
export const PONTOS_POR_NIVEL = 1;

export const ARVORE: readonly No[] = [
  // ── Tronco: o que serve a qualquer caminho ────────────────────────────
  {
    id: "raiz",
    nome: "Vocação",
    descricao: "O atributo do seu ramo cresce.",
    tipo: "atributo",
    custo: 1,
    graus: 10,
    requer: [],
    efeito: { tipo: "atributo", atributo: "doRamo", valor: 3 },
    coluna: 2,
    linha: 0,
  },
  {
    id: "couro",
    nome: "Couro Curtido",
    descricao: "Vigor, para aguentar mais um turno.",
    tipo: "atributo",
    custo: 1,
    graus: 8,
    requer: ["raiz"],
    efeito: { tipo: "atributo", atributo: "vigor", valor: 3 },
    coluna: 2,
    linha: 1,
  },

  // ── Faixa da esquerda: ofensiva ───────────────────────────────────────
  {
    id: "gume",
    nome: "Gume",
    descricao: "Todo dano que você causa aumenta.",
    tipo: "passiva",
    custo: 2,
    graus: 6,
    requer: ["raiz"],
    efeito: { tipo: "passiva", passiva: "danoPercentual", valor: 0.06 },
    coluna: 0,
    linha: 1,
  },
  {
    id: "olho",
    nome: "Olho Afiado",
    descricao: "Mais chance de crítico.",
    tipo: "passiva",
    custo: 2,
    graus: 5,
    requer: ["gume"],
    efeito: { tipo: "passiva", passiva: "criticoAdicional", valor: 0.03 },
    coluna: 0,
    linha: 2,
  },
  {
    id: "sangria-no",
    nome: "Sangria",
    descricao: "Um corte que não fecha.",
    tipo: "magia",
    custo: 4,
    graus: 1,
    requer: ["gume"],
    efeito: { tipo: "magia", habilidade: "sangria" },
    coluna: 1,
    linha: 2,
  },
  {
    id: "destreza-of",
    nome: "Mão Rápida",
    descricao: "Destreza, que decide quem age primeiro.",
    tipo: "atributo",
    custo: 1,
    graus: 8,
    requer: ["olho"],
    efeito: { tipo: "atributo", atributo: "destreza", valor: 3 },
    coluna: 0,
    linha: 3,
  },
  {
    id: "fulgor-no",
    nome: "Fulgor",
    descricao: "Um golpe que nenhuma armadura detém.",
    tipo: "magia",
    custo: 8,
    graus: 1,
    requer: ["olho", "sangria-no"],
    efeito: { tipo: "magia", habilidade: "fulgor" },
    coluna: 1,
    linha: 4,
  },
  {
    id: "sede",
    nome: "Sede",
    descricao: "Parte do dano que você causa volta como vida.",
    tipo: "passiva",
    custo: 5,
    graus: 4,
    requer: ["destreza-of"],
    efeito: { tipo: "passiva", passiva: "roubodeVida", valor: 0.04 },
    coluna: 0,
    linha: 5,
  },

  // ── Faixa da direita: resistir ────────────────────────────────────────
  {
    id: "casco",
    nome: "Casco",
    descricao: "Sua vida máxima aumenta.",
    tipo: "passiva",
    custo: 2,
    graus: 6,
    requer: ["raiz"],
    efeito: { tipo: "passiva", passiva: "vidaPercentual", valor: 0.07 },
    coluna: 4,
    linha: 1,
  },
  {
    id: "anteparo",
    nome: "Anteparo",
    descricao: "Reduz todo dano que chega.",
    tipo: "passiva",
    custo: 3,
    graus: 5,
    requer: ["casco"],
    efeito: { tipo: "passiva", passiva: "reducaoAdicional", valor: 0.025 },
    coluna: 4,
    linha: 2,
  },
  {
    id: "barreira-no",
    nome: "Barreira",
    descricao: "Endurecer por vontade, quando o turno pede.",
    tipo: "magia",
    custo: 4,
    graus: 1,
    requer: ["casco"],
    efeito: { tipo: "magia", habilidade: "barreira" },
    coluna: 3,
    linha: 2,
  },
  {
    id: "fôlego",
    nome: "Fôlego",
    descricao: "Presença, que manda na cura e no efeito.",
    tipo: "atributo",
    custo: 1,
    graus: 8,
    requer: ["anteparo"],
    efeito: { tipo: "atributo", atributo: "presenca", valor: 3 },
    coluna: 4,
    linha: 3,
  },
  {
    id: "quebranto-no",
    nome: "Quebranto",
    descricao: "Derruba a guarda de quem está na frente.",
    tipo: "magia",
    custo: 6,
    graus: 1,
    requer: ["anteparo", "barreira-no"],
    efeito: { tipo: "magia", habilidade: "quebranto" },
    coluna: 3,
    linha: 4,
  },
  {
    id: "raiz-funda",
    nome: "Raiz Funda",
    descricao: "Mais vigor, no fim do caminho.",
    tipo: "atributo",
    custo: 2,
    graus: 6,
    requer: ["fôlego"],
    efeito: { tipo: "atributo", atributo: "vigor", valor: 5 },
    coluna: 4,
    linha: 5,
  },

  // ── Centro, mais fundo: o que custa caro ──────────────────────────────
  {
    id: "cadencia",
    nome: "Cadência",
    descricao: "As esperas das habilidades encurtam.",
    tipo: "passiva",
    custo: 6,
    graus: 3,
    requer: ["couro"],
    efeito: { tipo: "passiva", passiva: "recargaReduzida", valor: 1 },
    coluna: 2,
    linha: 3,
  },
  {
    id: "arroubo-no",
    nome: "Arroubo",
    descricao: "Acelerar de propósito, na hora certa.",
    tipo: "magia",
    custo: 5,
    graus: 1,
    requer: ["cadencia"],
    efeito: { tipo: "magia", habilidade: "arroubo" },
    coluna: 2,
    linha: 4,
  },
  {
    id: "coroa",
    nome: "Coroa",
    descricao: "O atributo do seu ramo, de novo — e mais fundo.",
    tipo: "atributo",
    custo: 3,
    graus: 8,
    requer: ["arroubo-no"],
    efeito: { tipo: "atributo", atributo: "doRamo", valor: 6 },
    coluna: 2,
    linha: 5,
  },
];

const POR_ID = new Map(ARVORE.map((n) => [n.id, n]));

export function noPorId(id: string): No {
  const n = POR_ID.get(id);
  if (!n) throw new Error(`nó inexistente na árvore: ${id}`);
  return n;
}

/** Quantos graus de cada nó foram comprados. */
export type Gastos = Readonly<Record<string, number>>;

export function pontosGanhos(nivel: number): number {
  return Math.max(0, (nivel - 1) * PONTOS_POR_NIVEL);
}

export function pontosGastos(gastos: Gastos): number {
  let total = 0;
  for (const [id, graus] of Object.entries(gastos)) {
    if (graus > 0) total += noPorId(id).custo * graus;
  }
  return total;
}

export function pontosLivres(nivel: number, gastos: Gastos): number {
  return pontosGanhos(nivel) - pontosGastos(gastos);
}

/** Custo total de comprar a árvore inteira — o denominador da escolha. */
export function custoDaArvoreInteira(): number {
  return ARVORE.reduce((s, n) => s + n.custo * n.graus, 0);
}

export interface Impedimento {
  readonly motivo: "requisito" | "maximo" | "pontos" | "inexistente";
  readonly detalhe: string;
}

/**
 * Se dá para comprar mais um grau, e quando não dá, por quê.
 *
 * Devolve o motivo em vez de só `false` porque a tela precisa dizer o que
 * falta — "sem pontos" e "precisa de Gume antes" levam a ações diferentes, e
 * um botão apagado sem explicação não leva a nenhuma.
 */
export function podeComprar(
  id: string,
  nivel: number,
  gastos: Gastos,
): Impedimento | null {
  const no = POR_ID.get(id);
  if (!no) return { motivo: "inexistente", detalhe: id };

  const atual = gastos[id] ?? 0;
  if (atual >= no.graus) {
    return { motivo: "maximo", detalhe: `já está no grau ${no.graus}` };
  }

  const faltando = no.requer.filter((r) => (gastos[r] ?? 0) === 0);
  if (faltando.length > 0) {
    return {
      motivo: "requisito",
      detalhe: faltando.map((r) => noPorId(r).nome).join(" e "),
    };
  }

  if (pontosLivres(nivel, gastos) < no.custo) {
    return { motivo: "pontos", detalhe: `custa ${no.custo}` };
  }

  return null;
}

/** Compra um grau. Lança quando não pode — quem chama já conferiu. */
export function comprar(id: string, nivel: number, gastos: Gastos): Gastos {
  const impede = podeComprar(id, nivel, gastos);
  if (impede) throw new Error(`não dá para comprar ${id}: ${impede.detalhe}`);
  return { ...gastos, [id]: (gastos[id] ?? 0) + 1 };
}

/**
 * Zera a árvore.
 *
 * Existe porque renascer troca o ramo, e o `doRamo` do tronco passa a apontar
 * para outro atributo — manter os gastos daria uma build montada para um ramo
 * rodando em outro.
 */
export function zerar(): Gastos {
  return {};
}

/* ─────────────────────── o que a árvore rende ─────────────────────── */

export interface Bonus {
  /** Somado aos atributos-base. */
  readonly atributos: Atributos;
  /** Fração somada ao dano: 0.18 é +18%. */
  readonly danoPercentual: number;
  readonly vidaPercentual: number;
  readonly criticoAdicional: number;
  readonly reducaoAdicional: number;
  readonly roubodeVida: number;
  /** Rodadas a menos de espera, com piso de 1 no motor. */
  readonly recargaReduzida: number;
  /** Habilidades destravadas por nó de magia. */
  readonly magias: readonly string[];
}

export const SEM_BONUS: Bonus = {
  atributos: { intelecto: 0, presenca: 0, destreza: 0, forca: 0, vigor: 0 },
  danoPercentual: 0,
  vidaPercentual: 0,
  criticoAdicional: 0,
  reducaoAdicional: 0,
  roubodeVida: 0,
  recargaReduzida: 0,
  magias: [],
};

/**
 * Soma tudo que os nós comprados dão.
 *
 * O ramo entra porque `doRamo` só ganha sentido com ele: o mesmo nó dá
 * intelecto para um Wise e força para um Melee, e é isso que permite uma
 * árvore só servir aos cinco.
 */
export function bonusDe(gastos: Gastos, ramo: Ramo): Bonus {
  const atributos = { intelecto: 0, presenca: 0, destreza: 0, forca: 0, vigor: 0 };
  let danoPercentual = 0;
  let vidaPercentual = 0;
  let criticoAdicional = 0;
  let reducaoAdicional = 0;
  let roubodeVida = 0;
  let recargaReduzida = 0;
  const magias: string[] = [];

  for (const [id, graus] of Object.entries(gastos)) {
    if (graus <= 0) continue;
    const no = POR_ID.get(id);
    if (!no) continue;
    const e = no.efeito;

    if (e.tipo === "atributo") {
      const alvo = e.atributo === "doRamo" ? ATRIBUTO_DO_RAMO[ramo] : e.atributo;
      atributos[alvo] += e.valor * graus;
    } else if (e.tipo === "magia") {
      // Confere que a habilidade existe: nó apontando para id errado seria um
      // ponto gasto em nada, e o jogador não teria como saber.
      habilidadePorId(e.habilidade);
      magias.push(e.habilidade);
    } else {
      const v = e.valor * graus;
      if (e.passiva === "danoPercentual") danoPercentual += v;
      if (e.passiva === "vidaPercentual") vidaPercentual += v;
      if (e.passiva === "criticoAdicional") criticoAdicional += v;
      if (e.passiva === "reducaoAdicional") reducaoAdicional += v;
      if (e.passiva === "roubodeVida") roubodeVida += v;
      if (e.passiva === "recargaReduzida") recargaReduzida += v;
    }
  }

  return {
    atributos,
    danoPercentual,
    vidaPercentual,
    criticoAdicional,
    reducaoAdicional,
    roubodeVida,
    recargaReduzida,
    magias,
  };
}
