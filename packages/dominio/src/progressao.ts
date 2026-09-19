import {
  ATRIBUTO_OFENSIVO_DO_RAMO,
  atributosDe,
  chanceDeCritico,
  reducaoDeDano,
  vidaMaxima,
} from "./atributos.ts";
import { ramoDe } from "./classe.ts";
import {
  AVANCO_DA_PAREDE_POR_CAMADA,
  CLASSE_DE_REFERENCIA,
  DESLOCAMENTO_DO_INIMIGO,
  CRESCIMENTO_POR_CAMADA,
  EXPOENTE_XP,
  NIVEL_DA_PAREDE_BASE,
  VANTAGEM_DO_INIMIGO,
  XP_BASE,
} from "./balanceamento.ts";
import { grande, type Grande, potencia, produto } from "./grande.ts";

/**
 * As curvas: quanto custa subir, quanto o prestígio dá, e onde fica a parede.
 *
 * As fórmulas moram aqui e os números em `balanceamento`. Ajustar a sensação
 * do jogo tem de ser mexer numa constante, nunca reescrever uma conta
 * espalhada por três arquivos.
 *
 * O formato inteiro se resume a três frases:
 *
 * 1. A dificuldade de um nível é FIXA. O inimigo do nível 500 é o mesmo na
 *    camada 1 e na camada 90.
 * 2. O inimigo cresce mais rápido que o jogador ao longo dos níveis, então
 *    existe um nível em que ele passa na frente: a parede.
 * 3. A camada multiplica só o jogador, e é isso que empurra a parede para
 *    mais fundo. Progressão infinita é a parede sempre existir e sempre estar
 *    mais longe que na vida anterior.
 */

// ── Nível ────────────────────────────────────────────────────────────────

/** XP para sair do nível `n` para o seguinte. */
export function xpParaNivel(nivel: number): number {
  if (nivel < 1) throw new Error(`nível inválido: ${nivel}`);
  return XP_BASE * nivel ** EXPOENTE_XP;
}

/**
 * XP total gasto para chegar ao nível `n` partindo do 1. Zero no nível 1 —
 * ninguém paga para já estar onde começou.
 */
export function xpAcumuladoAte(nivel: number): Grande {
  if (nivel < 1) throw new Error(`nível inválido: ${nivel}`);
  // Aproximação pela integral, e não laço: no nível 10 milhões o laço seria
  // impraticável, e o erro relativo da integral cai abaixo de 0,1% já na casa
  // das centenas.
  const n = nivel - 1;
  if (n === 0) return grande(0);
  const p = EXPOENTE_XP;
  return grande(XP_BASE * ((n ** (p + 1)) / (p + 1) + (n ** p) / 2));
}

// ── Prestígio ────────────────────────────────────────────────────────────

/** Multiplicador permanente acumulado até a camada. Camada 0 é 1. */
export function multiplicadorDaCamada(camada: number): Grande {
  if (camada < 0 || !Number.isInteger(camada)) {
    throw new Error(`camada inválida: ${camada}`);
  }
  return potencia(grande(CRESCIMENTO_POR_CAMADA), camada);
}

/**
 * O nível em que o inimigo alcança o jogador nesta camada.
 *
 * É a meta da vida: chegar aqui é o sinal de renascer. Não é teto imposto por
 * regra — é onde as duas curvas se cruzam.
 */
export function nivelDaParede(camada: number): number {
  if (camada < 0 || !Number.isInteger(camada)) {
    throw new Error(`camada inválida: ${camada}`);
  }
  // Deriva do cruzamento das duas curvas, e não de um teto escolhido:
  // resolvendo `1,6^camada = ((L + d) / (P + d)) ^ vantagem` para L.
  const d = DESLOCAMENTO_DO_INIMIGO;
  return (
    (NIVEL_DA_PAREDE_BASE + d) * AVANCO_DA_PAREDE_POR_CAMADA ** camada - d
  );
}

/** Se o personagem chegou à parede e pode renascer. */
export function podeRenascer(nivel: number, camada: number): boolean {
  return nivel >= nivelDaParede(camada);
}

// ── Poder ────────────────────────────────────────────────────────────────

/**
 * Poder de referência de um personagem: ofensiva vezes o que ele aguenta.
 *
 * Medida grosseira de propósito — serve para escalar o inimigo e comparar
 * curvas, não para prever o resultado de uma luta. Quem decide dano é o motor
 * de combate, turno a turno.
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
 * Poder do inimigo no nível dado. Não depende da camada, e essa é a decisão
 * central: a dificuldade de um nível é fixa, e o que a camada muda é até onde
 * o jogador consegue chegar.
 *
 * Ancorado no poder de um personagem de referência, para acompanhar qualquer
 * mudança de atributo sem recalibragem, e multiplicado por um fator que cresce
 * com o nível — é ele que faz a curva do inimigo cruzar a do jogador na parede
 * da camada 0.
 */
export function poderDoInimigo(nivel: number): Grande {
  if (nivel < 1) throw new Error(`nível inválido: ${nivel}`);
  const referencia = poderDoPersonagem(CLASSE_DE_REFERENCIA, nivel, 0);
  const d = DESLOCAMENTO_DO_INIMIGO;
  const avanco =
    ((nivel + d) / (NIVEL_DA_PAREDE_BASE + d)) ** VANTAGEM_DO_INIMIGO;
  return produto(referencia, grande(avanco));
}

/**
 * Razão entre o poder do jogador e o do inimigo.
 *
 * 1 é equilíbrio; abaixo de 1 o inimigo está à frente, e é aí que fica a
 * parede. É o número que a simulação lê e o que o teste de regressão vigia.
 */
export function equilibrio(
  indiceClasse: number,
  nivel: number,
  camada = 0,
): number {
  const jogador = poderDoPersonagem(indiceClasse, nivel, camada);
  const inimigo = poderDoInimigo(nivel);
  // Pelos logaritmos: nas camadas altas os dois estouram o double, e dividir
  // Infinity por Infinity daria NaN em vez da razão, que é finita.
  const log =
    Math.log10(Math.abs(jogador.m)) + jogador.e -
    Math.log10(Math.abs(inimigo.m)) - inimigo.e;
  return 10 ** log;
}
