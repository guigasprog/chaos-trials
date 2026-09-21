import type { NomeAtributo } from "./atributos.ts";
import { ATRIBUTO_OFENSIVO_DO_RAMO } from "./atributos.ts";
import type { Ramo } from "./classe.ts";
import type { TipoDeEfeito } from "./efeitos.ts";

/**
 * As habilidades, e o que cada uma faz.
 *
 * O efeito é **dado**, não código: cada habilidade é uma lista de operações
 * declaradas, e o motor de combate sabe executar cada operação. Porte do
 * modelo do QuestTerm, e a razão é a mesma lá e aqui — habilidade como função
 * obrigaria a enviar código ao cliente para ele mostrar o que vai acontecer, e
 * impediria de gerar habilidade nova sem mexer no motor.
 */

export type Alvo = "inimigo" | "proprio";

export interface OperacaoDano {
  readonly tipo: "dano";
  /** Multiplicador sobre o atributo ofensivo de quem usa. */
  readonly escala: number;
  /** Ignora a redução de dano do alvo — caro, e por isso raro. */
  readonly perfurante?: boolean;
}

export interface OperacaoCura {
  readonly tipo: "cura";
  /** Multiplicador sobre a presença de quem usa. */
  readonly escala: number;
}

export interface OperacaoEfeito {
  readonly tipo: "efeito";
  readonly efeito: TipoDeEfeito;
  readonly rodadas: number;
  /** Fixo, ou fração do atributo ofensivo quando `escala` estiver presente. */
  readonly potencia?: number;
  readonly escala?: number;
  readonly atributo?: NomeAtributo;
  /** Probabilidade de pegar, de 0 a 1. Ausente é certo. */
  readonly chance?: number;
}

export interface OperacaoLimpar {
  readonly tipo: "limpar";
  readonly efeito: TipoDeEfeito;
}

export type Operacao =
  | OperacaoDano
  | OperacaoCura
  | OperacaoEfeito
  | OperacaoLimpar;

export interface Habilidade {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly alvo: Alvo;
  /** Rodadas de espera depois de usar. Zero é usável todo turno. */
  readonly recarga: number;
  readonly operacoes: readonly Operacao[];
  /** Ramos que a possuem. Vazio significa todos. */
  readonly ramos?: readonly Ramo[];
  /** Nível em que fica disponível. */
  readonly nivel: number;
  /**
   * Só pela árvore de habilidade, nunca por nível.
   *
   * Marcadas aqui em vez de numa lista à parte: quem lê a habilidade precisa
   * saber de onde ela vem, e uma segunda lista seria mais uma coisa para sair
   * de sincronia.
   */
  readonly porArvore?: boolean;
}

/**
 * O catálogo inicial.
 *
 * Enxuto de propósito: sete habilidades cobrem o que o motor precisa provar —
 * dano, cura, dano ao longo do tempo, reforço, fraqueza, atordoamento e
 * perfuração. Ampliar é acrescentar dado, não código.
 */
export const HABILIDADES: readonly Habilidade[] = [
  {
    id: "golpe",
    nome: "Golpe",
    descricao: "Um ataque direto, sem custo nem espera.",
    alvo: "inimigo",
    recarga: 0,
    nivel: 1,
    operacoes: [{ tipo: "dano", escala: 1 }],
  },
  {
    id: "investida",
    nome: "Investida",
    descricao: "Ataque forte que deixa você exposto por duas rodadas.",
    alvo: "inimigo",
    recarga: 3,
    nivel: 1,
    operacoes: [
      { tipo: "dano", escala: 2.1 },
      { tipo: "efeito", efeito: "fraqueza", atributo: "vigor", rodadas: 2, escala: 0.3 },
    ],
  },
  {
    id: "toxina",
    nome: "Toxina",
    descricao: "Envenena por quatro rodadas. O veneno ignora armadura.",
    alvo: "inimigo",
    recarga: 4,
    nivel: 5,
    operacoes: [
      { tipo: "dano", escala: 0.4 },
      { tipo: "efeito", efeito: "veneno", rodadas: 4, escala: 0.35 },
    ],
  },
  {
    id: "brasa",
    nome: "Brasa",
    descricao: "Incendeia o alvo por três rodadas.",
    alvo: "inimigo",
    recarga: 3,
    nivel: 5,
    ramos: [1, 2],
    operacoes: [
      { tipo: "dano", escala: 0.8 },
      { tipo: "efeito", efeito: "queimadura", rodadas: 3, escala: 0.5 },
    ],
  },
  {
    id: "perfurar",
    nome: "Perfurar",
    descricao: "Atravessa a armadura. Espera longa.",
    alvo: "inimigo",
    recarga: 5,
    nivel: 10,
    ramos: [3, 4],
    operacoes: [{ tipo: "dano", escala: 1.6, perfurante: true }],
  },
  {
    id: "atordoar",
    nome: "Atordoar",
    descricao: "Metade de chance de o alvo perder o próximo turno.",
    alvo: "inimigo",
    recarga: 5,
    nivel: 10,
    ramos: [4, 5],
    operacoes: [
      { tipo: "dano", escala: 0.6 },
      { tipo: "efeito", efeito: "atordoamento", rodadas: 1, potencia: 0, chance: 0.5 },
    ],
  },
  {
    id: "recompor",
    nome: "Recompor",
    descricao: "Cura, e limpa o veneno.",
    alvo: "proprio",
    recarga: 4,
    nivel: 5,
    operacoes: [
      { tipo: "cura", escala: 2.4 },
      { tipo: "limpar", efeito: "veneno" },
    ],
  },
  // ── Só pela árvore ──────────────────────────────────────────────────
  {
    id: "fulgor",
    nome: "Fulgor",
    descricao: "Um golpe que atravessa qualquer armadura. Espera muito longa.",
    alvo: "inimigo",
    recarga: 7,
    nivel: 1,
    porArvore: true,
    operacoes: [{ tipo: "dano", escala: 3.2, perfurante: true }],
  },
  {
    id: "barreira",
    nome: "Barreira",
    descricao: "Endurece por quatro rodadas.",
    alvo: "proprio",
    recarga: 6,
    nivel: 1,
    porArvore: true,
    operacoes: [
      { tipo: "efeito", efeito: "reforco", atributo: "vigor", rodadas: 4, escala: 0.9 },
    ],
  },
  {
    id: "sangria",
    nome: "Sangria",
    descricao: "Corte que não fecha: sangra por cinco rodadas.",
    alvo: "inimigo",
    recarga: 5,
    nivel: 1,
    porArvore: true,
    operacoes: [
      { tipo: "dano", escala: 0.7 },
      { tipo: "efeito", efeito: "veneno", rodadas: 5, escala: 0.5 },
    ],
  },
  {
    id: "arroubo",
    nome: "Arroubo",
    descricao: "Acelera por três rodadas — mais precisão e mais crítico.",
    alvo: "proprio",
    recarga: 6,
    nivel: 1,
    porArvore: true,
    operacoes: [
      { tipo: "efeito", efeito: "reforco", atributo: "destreza", rodadas: 3, escala: 1.1 },
    ],
  },
  {
    id: "quebranto",
    nome: "Quebranto",
    descricao: "Abate o vigor do alvo por quatro rodadas.",
    alvo: "inimigo",
    recarga: 5,
    nivel: 1,
    porArvore: true,
    operacoes: [
      { tipo: "dano", escala: 0.9 },
      { tipo: "efeito", efeito: "fraqueza", atributo: "vigor", rodadas: 4, escala: 0.6 },
    ],
  },
];

const POR_ID = new Map(HABILIDADES.map((h) => [h.id, h]));

export function habilidadePorId(id: string): Habilidade {
  const h = POR_ID.get(id);
  if (!h) throw new Error(`habilidade inexistente: ${id}`);
  return h;
}

/** As que um personagem de dado ramo e nível já possui, sem contar a árvore. */
export function habilidadesDe(ramo: Ramo, nivel: number): Habilidade[] {
  return HABILIDADES.filter(
    (h) => !h.porArvore && h.nivel <= nivel && (!h.ramos || h.ramos.includes(ramo)),
  );
}

/** O atributo com que um ramo causa dano — o motor consulta por aqui. */
export function atributoDeDano(ramo: Ramo): NomeAtributo {
  return ATRIBUTO_OFENSIVO_DO_RAMO[ramo];
}
