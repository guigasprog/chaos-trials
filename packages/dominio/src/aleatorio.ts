/**
 * Sorteio determinístico.
 *
 * `Math.random()` está proibido no domínio inteiro, e não é preciosismo: a
 * progressão offline recalcula no servidor o que aconteceu enquanto a pessoa
 * estava fora, e isso só funciona se a mesma semente com o mesmo estado
 * produzir exatamente a mesma sequência. É também o que permite reproduzir uma
 * batalha a partir do log para investigar uma reclamação.
 *
 * O gerador é o mulberry32: rápido, período longo o bastante para uma batalha,
 * e cabe em dez linhas. Não serve para criptografia, e aqui não precisa —
 * quem decide o resultado é o servidor, então prever o sorteio não dá vantagem
 * a ninguém.
 */

/** Um valor sorteado, junto da semente que vem depois dele. */
export interface Sorteio {
  readonly valor: number;
  readonly semente: number;
}

/**
 * Próximo número em `[0, 1)`.
 *
 * Devolve a semente nova em vez de guardar estado: função pura é o que faz o
 * resto do domínio poder ser testado e reproduzido.
 */
export function sortear(semente: number): Sorteio {
  let a = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { valor: ((t ^ (t >>> 14)) >>> 0) / 4294967296, semente: a };
}

/** Inteiro em `[min, max]`, com as duas pontas incluídas. */
export function sortearInteiro(
  semente: number,
  min: number,
  max: number,
): Sorteio {
  if (min > max) throw new Error(`faixa inválida: ${min}..${max}`);
  const s = sortear(semente);
  return { valor: min + Math.floor(s.valor * (max - min + 1)), semente: s.semente };
}

/** Variação em torno de um valor, em fração — `0.15` dá ±15%. */
export function variar(
  semente: number,
  base: number,
  fracao: number,
): Sorteio {
  const s = sortear(semente);
  return { valor: base * (1 + (s.valor * 2 - 1) * fracao), semente: s.semente };
}

export interface Chance {
  readonly acertou: boolean;
  readonly semente: number;
}

/** Testa uma probabilidade de 0 a 1. */
export function chance(semente: number, probabilidade: number): Chance {
  const s = sortear(semente);
  return { acertou: s.valor < probabilidade, semente: s.semente };
}

/**
 * Escolhe um item da lista.
 *
 * Lança em lista vazia em vez de devolver `undefined`: quem chama isto está
 * sempre escolhendo entre opções que deveriam existir, e um `undefined`
 * silencioso viraria um turno sem ação três camadas depois.
 */
export function escolher<T>(semente: number, itens: readonly T[]): {
  item: T;
  semente: number;
} {
  if (itens.length === 0) throw new Error("escolher: lista vazia");
  const s = sortearInteiro(semente, 0, itens.length - 1);
  const item = itens[s.valor];
  if (item === undefined) throw new Error("escolher: índice fora da lista");
  return { item, semente: s.semente };
}

/**
 * Semente a partir de texto — para derivar uma batalha de um identificador
 * estável, como o id do personagem mais o número do encontro.
 */
export function sementeDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
