/**
 * Números que crescem além do inteiro seguro do JavaScript.
 *
 * Guardados como mantissa e expoente — `1,42 × 10^17` vira `{ m: 1.42, e: 17 }`
 * —, sempre normalizados em `1 <= |m| < 10`, com o zero em `{ m: 0, e: 0 }`.
 *
 * `BigInt` é o reflexo óbvio e é a escolha errada aqui: não tem parte
 * fracionária, e um sistema de multiplicadores multiplica o tempo todo, que é
 * justamente onde ele é lento.
 *
 * Quando isto passa a ser necessário, medido: o multiplicador de prestígio
 * sozinho só ultrapassa `Number.MAX_SAFE_INTEGER` na camada 79, e o produto
 * dele com escala de nível e equipamento, por volta da camada 40. Não é
 * urgência — é que enfiar precisão estendida depois, num código que assumiu
 * `number` em todo lugar, é mudança enorme e cheia de bug silencioso.
 */

export interface Grande {
  /** Mantissa, em `1 <= |m| < 10`. Zero é o único valor fora dessa faixa. */
  readonly m: number;
  /** Expoente decimal. */
  readonly e: number;
}

export const ZERO: Grande = { m: 0, e: 0 };
export const UM: Grande = { m: 1, e: 0 };

/**
 * Além de ~17 casas de diferença, a parcela menor não muda um `double`.
 * Somá-la seria trabalho jogado fora e ainda introduziria ruído de
 * arredondamento.
 */
const CASAS_UTEIS = 17;

/**
 * Põe mantissa e expoente na forma canônica.
 *
 * O ajuste por `log10` erra sozinho nas potências exatas — `Math.log10(1000)`
 * pode devolver 2,9999999999999996, e o `floor` disso deixa a mantissa em 10.
 * Os dois `while` corrigem essa borda; sem eles a normalização mente e as
 * comparações passam a depender de como o número foi construído.
 */
function normalizar(m: number, e: number): Grande {
  if (m === 0 || !Number.isFinite(m)) return ZERO;

  let mantissa = m;
  let expoente = e + Math.floor(Math.log10(Math.abs(m)));
  mantissa = m / 10 ** Math.floor(Math.log10(Math.abs(m)));

  while (Math.abs(mantissa) >= 10) {
    mantissa /= 10;
    expoente += 1;
  }
  while (Math.abs(mantissa) < 1) {
    mantissa *= 10;
    expoente -= 1;
  }

  return { m: mantissa, e: expoente };
}

/** Converte um número comum. Infinito e NaN viram zero, de propósito: é melhor
 *  perder o valor do que propagar um veneno que só aparece três telas depois. */
export function grande(n: number): Grande {
  return normalizar(n, 0);
}

/** Atalho para `m × 10^e` sem passar por um `number` que estouraria. */
export function deMantissa(m: number, e: number): Grande {
  return normalizar(m, e);
}

export function soma(a: Grande, b: Grande): Grande {
  if (a.m === 0) return b;
  if (b.m === 0) return a;

  const troca = a.e < b.e;
  const maior = troca ? b : a;
  const menor = troca ? a : b;
  const distancia = maior.e - menor.e;

  if (distancia > CASAS_UTEIS) return maior;
  return normalizar(maior.m + menor.m / 10 ** distancia, maior.e);
}

export function negativo(a: Grande): Grande {
  return a.m === 0 ? ZERO : { m: -a.m, e: a.e };
}

export function subtrai(a: Grande, b: Grande): Grande {
  return soma(a, negativo(b));
}

export function produto(a: Grande, b: Grande): Grande {
  if (a.m === 0 || b.m === 0) return ZERO;
  return normalizar(a.m * b.m, a.e + b.e);
}

export function divide(a: Grande, b: Grande): Grande {
  if (b.m === 0) throw new Error("divisão por zero");
  if (a.m === 0) return ZERO;
  return normalizar(a.m / b.m, a.e - b.e);
}

/** Potência de expoente inteiro — é o que a curva de prestígio precisa. */
export function potencia(base: Grande, expoente: number): Grande {
  if (!Number.isInteger(expoente)) {
    throw new Error("potência só aceita expoente inteiro");
  }
  if (expoente === 0) return UM;
  if (base.m === 0) return ZERO;

  // Pelo logaritmo, e não multiplicando em laço: a camada 400 sairia com 400
  // arredondamentos empilhados, e cada um deles suja a mantissa.
  const sinal = base.m < 0 && expoente % 2 !== 0 ? -1 : 1;
  const log = Math.log10(Math.abs(base.m)) + base.e;
  const total = log * expoente;
  const parteInteira = Math.floor(total);
  return normalizar(sinal * 10 ** (total - parteInteira), parteInteira);
}

/** Negativo, zero ou positivo, como o comparador de `Array.sort`. */
export function compara(a: Grande, b: Grande): number {
  if (a.m === 0 && b.m === 0) return 0;
  if (a.m === 0) return b.m > 0 ? -1 : 1;
  if (b.m === 0) return a.m > 0 ? 1 : -1;

  const sinalA = Math.sign(a.m);
  if (sinalA !== Math.sign(b.m)) return sinalA;

  // Mesmo sinal: o expoente decide. Entre negativos a ordem inverte — o de
  // expoente maior é o mais distante de zero, e portanto o menor.
  if (a.e !== b.e) return (a.e > b.e ? 1 : -1) * sinalA;
  if (a.m === b.m) return 0;
  return a.m > b.m ? 1 : -1;
}

export const maiorQue = (a: Grande, b: Grande) => compara(a, b) > 0;
export const menorQue = (a: Grande, b: Grande) => compara(a, b) < 0;
export const igual = (a: Grande, b: Grande) => compara(a, b) === 0;

/**
 * De volta a `number`, quando couber.
 *
 * Devolve `Infinity` acima da faixa em vez de um número errado em silêncio:
 * quem chamou isto precisa saber que não coube.
 */
export function paraNumero(g: Grande): number {
  if (g.m === 0) return 0;
  if (g.e > 308) return g.m > 0 ? Infinity : -Infinity;
  return g.m * 10 ** g.e;
}

/** Sufixos curtos até 10^15; daí em diante a notação científica é mais legível
 *  do que inventar nome para cada potência. */
const SUFIXOS = ["", " mil", " M", " B", " T"] as const;

/**
 * Até onde o número sai por extenso, em expoente.
 *
 * 4 quer dizer "abaixo de 10.000". Num RPG por turnos se lê dano exato, e
 * `1234` informa mais que `1,23 mil`; o sufixo só compensa quando o número
 * deixa de ser legível de relance.
 */
const EXTENSO_ATE = 4;

export function texto(g: Grande, casas = 2): string {
  if (g.m === 0) return "0";

  if (g.e < 0) return paraNumero(g).toFixed(Math.max(casas, 2));
  if (g.e < EXTENSO_ATE) return Math.round(paraNumero(g)).toString();

  const degrau = Math.floor(g.e / 3);
  if (degrau < SUFIXOS.length) {
    const valor = g.m * 10 ** (g.e - degrau * 3);
    return valor.toFixed(casas).replace(".", ",") + (SUFIXOS[degrau] ?? "");
  }

  return `${g.m.toFixed(casas).replace(".", ",")}e${g.e}`;
}
