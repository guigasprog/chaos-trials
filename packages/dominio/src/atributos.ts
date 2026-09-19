import type { Ramo } from "./classe.ts";
import { ramoDe } from "./classe.ts";

/**
 * Os cinco atributos, um por ramo da árvore.
 *
 * O QuestTerm tinha quatro (`hp`, `str`, `dex`, `int`), e faltava identidade
 * defensiva para o ramo Tank. `vigor` entrou no lugar do `hp` avulso: vida
 * máxima passa a ser derivada, e não um atributo que se distribui — ponto em
 * vida crua nunca compete com ponto em dano, então oferecê-lo é oferecer uma
 * escolha que ninguém faz.
 */
export interface Atributos {
  /** Wise — dano mágico. */
  readonly intelecto: number;
  /** Support — potência de efeito e de cura. */
  readonly presenca: number;
  /** Ranger — precisão, iniciativa e chance de crítico. */
  readonly destreza: number;
  /** Melee — dano físico. */
  readonly forca: number;
  /** Tank — vida máxima e redução de dano. */
  readonly vigor: number;
}

export const ATRIBUTOS = [
  "intelecto",
  "presenca",
  "destreza",
  "forca",
  "vigor",
] as const;

export type NomeAtributo = (typeof ATRIBUTOS)[number];

/** O atributo que define cada ramo — o que ele ganha mais ao subir de nível. */
export const ATRIBUTO_DO_RAMO: Readonly<Record<Ramo, NomeAtributo>> = {
  1: "intelecto",
  2: "presenca",
  3: "destreza",
  4: "forca",
  5: "vigor",
};

const VAZIO: Atributos = {
  intelecto: 0,
  presenca: 0,
  destreza: 0,
  forca: 0,
  vigor: 0,
};

/** Todo personagem começa daqui; o ramo adiciona por cima. */
const PISO = 5;

/** Quanto o atributo do ramo recebe a mais, na criação e a cada nível. */
const FAVOR_DO_RAMO = 4;
const FAVOR_POR_NIVEL = 2;

export function somar(a: Atributos, b: Atributos): Atributos {
  return {
    intelecto: a.intelecto + b.intelecto,
    presenca: a.presenca + b.presenca,
    destreza: a.destreza + b.destreza,
    forca: a.forca + b.forca,
    vigor: a.vigor + b.vigor,
  };
}

export function escalar(a: Atributos, fator: number): Atributos {
  return {
    intelecto: a.intelecto * fator,
    presenca: a.presenca * fator,
    destreza: a.destreza * fator,
    forca: a.forca * fator,
    vigor: a.vigor * fator,
  };
}

/** Os atributos de nível 1 de uma classe. */
export function atributosIniciais(indiceClasse: number): Atributos {
  const favorecido = ATRIBUTO_DO_RAMO[ramoDe(indiceClasse)];
  const base: Atributos = {
    intelecto: PISO,
    presenca: PISO,
    destreza: PISO,
    forca: PISO,
    vigor: PISO,
  };
  return { ...base, [favorecido]: PISO + FAVOR_DO_RAMO };
}

/** O que cada nível acrescenta. Um ponto em tudo, e mais no atributo do ramo:
 *  a classe puxa a build sem impedir que ela se desvie. */
export function ganhoPorNivel(indiceClasse: number): Atributos {
  const favorecido = ATRIBUTO_DO_RAMO[ramoDe(indiceClasse)];
  const base: Atributos = {
    intelecto: 1,
    presenca: 1,
    destreza: 1,
    forca: 1,
    vigor: 1,
  };
  return { ...base, [favorecido]: 1 + FAVOR_POR_NIVEL };
}

/** Atributos de um personagem de classe e nível dados, sem equipamento. */
export function atributosDe(indiceClasse: number, nivel: number): Atributos {
  if (nivel < 1) throw new Error(`nível inválido: ${nivel}`);
  return somar(
    atributosIniciais(indiceClasse),
    escalar(ganhoPorNivel(indiceClasse), nivel - 1),
  );
}

// ── Derivados ────────────────────────────────────────────────────────────

/** Vida máxima. Vem do vigor, e por isso o Tank é o que aguenta. */
export function vidaMaxima(a: Atributos): number {
  return 40 + a.vigor * 12;
}

/**
 * Redução de dano, de 0 a 1.
 *
 * Curva de saturação, e não subtração linear: linear chega em 100% e o
 * personagem vira invulnerável. Assim 50 de vigor apara ~33%, 200 apara ~67%,
 * e nunca alcança o total.
 */
export function reducaoDeDano(a: Atributos): number {
  return a.vigor / (a.vigor + 100);
}

/** Quem age primeiro no turno. */
export function iniciativa(a: Atributos): number {
  return a.destreza;
}

/** Chance de crítico, de 0 a 1, com teto — destreza infinita não pode virar
 *  crítico garantido. */
export function chanceDeCritico(a: Atributos): number {
  return Math.min(0.5, a.destreza / (a.destreza + 300));
}

export { VAZIO as ATRIBUTOS_ZERADOS };
