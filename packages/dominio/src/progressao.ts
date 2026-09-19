import {
  ATRIBUTO_OFENSIVO_DO_RAMO,
  atributosDe,
  chanceDeCritico,
  reducaoDeDano,
  vidaMaxima,
} from "./atributos.ts";
import { ramoDe } from "./classe.ts";
import {
  CLASSE_DE_REFERENCIA,
  CRESCIMENTO_INIMIGO_POR_CAMADA,
  CRESCIMENTO_POR_CAMADA,
  CRESCIMENTO_XP,
  DERIVA_DA_VIDA,
  NIVEL_MAXIMO,
  XP_BASE,
} from "./balanceamento.ts";
import { grande, type Grande, potencia, produto } from "./grande.ts";

/**
 * As curvas: quanto custa subir, quanto o prestígio dá, e quão forte é o
 * inimigo que vem pela frente.
 *
 * As fórmulas moram aqui e os números em `balanceamento`. A separação importa:
 * ajustar a sensação do jogo tem de ser mexer numa constante, nunca reescrever
 * uma conta espalhada por três arquivos.
 */

// ── Nível ────────────────────────────────────────────────────────────────

/** XP para sair do nível `n` para o seguinte. */
export function xpParaNivel(nivel: number): number {
  if (nivel < 1) throw new Error(`nível inválido: ${nivel}`);
  return XP_BASE * CRESCIMENTO_XP ** (nivel - 1);
}

/** XP total gasto para chegar ao nível `n` partindo do 1. */
export function xpAcumuladoAte(nivel: number): number {
  if (nivel < 1) throw new Error(`nível inválido: ${nivel}`);
  // Soma da progressão geométrica, em vez de laço: no nível 100 seriam 99
  // somas de ponto flutuante empilhando erro, e isto é chamado a cada vitória.
  const r = CRESCIMENTO_XP;
  return (XP_BASE * (r ** (nivel - 1) - 1)) / (r - 1);
}

// ── Prestígio ────────────────────────────────────────────────────────────

/** Multiplicador permanente acumulado até a camada. Camada 0 é 1. */
export function multiplicadorDaCamada(camada: number): Grande {
  if (camada < 0 || !Number.isInteger(camada)) {
    throw new Error(`camada inválida: ${camada}`);
  }
  return potencia(grande(CRESCIMENTO_POR_CAMADA), camada);
}

/** Se o personagem já pode renascer. */
export function podeRenascer(nivel: number): boolean {
  return nivel >= NIVEL_MAXIMO;
}

// ── Poder ────────────────────────────────────────────────────────────────

/**
 * Poder de referência de um personagem: ofensiva vezes o que ele aguenta.
 *
 * É uma medida grosseira, e é de propósito — serve para escalar o inimigo e
 * para comparar curvas, não para prever o resultado de uma luta. Quem decide
 * dano é o motor de combate, turno a turno.
 */
export function poderDoPersonagem(
  indiceClasse: number,
  nivel: number,
  camada = 0,
): Grande {
  const a = atributosDe(indiceClasse, nivel);
  const ofensiva =
    a[ATRIBUTO_OFENSIVO_DO_RAMO[ramoDe(indiceClasse)]] * (1 + chanceDeCritico(a));
  const aguenta = vidaMaxima(a) / (1 - reducaoDeDano(a));
  return produto(grande(ofensiva * aguenta), multiplicadorDaCamada(camada));
}

/**
 * Poder do inimigo apropriado para um nível e uma camada.
 *
 * Definido **em relação ao poder de um personagem de referência** naquele
 * nível, e não por uma fórmula própria. Assim o inimigo acompanha a curva real
 * do jogador por construção: mexer num atributo reequilibra o jogo sozinho, em
 * vez de exigir recalibragem.
 *
 * Duas coisas o afastam dessa referência, e as duas são o jogo:
 *
 * - `nivel ^ -DERIVA_DA_VIDA` deixa o inimigo ficar para trás devagar ao longo
 *   de uma vida, que é o que faz subir de nível ser sentido;
 * - a camada multiplica menos para o inimigo (1,45) do que para o jogador
 *   (1,6), e essa diferença acumulada é o motor da progressão infinita.
 */
export function poderDoInimigo(nivel: number, camada = 0): Grande {
  if (nivel < 1) throw new Error(`nível inválido: ${nivel}`);
  const referencia = poderDoPersonagem(CLASSE_DE_REFERENCIA, nivel, 0);
  const atraso = nivel ** -DERIVA_DA_VIDA;
  const porCamada = potencia(grande(CRESCIMENTO_INIMIGO_POR_CAMADA), camada);
  return produto(produto(referencia, grande(atraso)), porCamada);
}

/**
 * Razão entre o poder do jogador e o do inimigo.
 *
 * 1 é equilíbrio; abaixo de 1 o inimigo está à frente. É o número que a
 * simulação de balanceamento lê, e o que o teste de regressão vigia.
 */
export function equilibrio(
  indiceClasse: number,
  nivel: number,
  camada = 0,
): number {
  const jogador = poderDoPersonagem(indiceClasse, nivel, camada);
  const inimigo = poderDoInimigo(nivel, camada);
  // Pelos logaritmos: nas camadas altas os dois estouram o double, e dividir
  // Infinity por Infinity daria NaN em vez da razão, que é finita.
  const log =
    Math.log10(Math.abs(jogador.m)) + jogador.e -
    Math.log10(Math.abs(inimigo.m)) - inimigo.e;
  return 10 ** log;
}
