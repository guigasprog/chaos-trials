/**
 * Todo número que ajusta a sensação do jogo mora aqui.
 *
 * Num só arquivo de propósito: constante de balanceamento espalhada pelo
 * código é o que torna impossível responder "por que o jogo ficou fácil na
 * camada 30". Aqui dá para ler a curva inteira de uma vez, e um script pode
 * simular cem camadas lendo estes mesmos valores.
 *
 * Nada aqui é lei da natureza — todos são chutes iniciais, para medir e
 * corrigir. O que não pode é ser mudado depois que houver economia: alterar a
 * curva com jogadores dentro é inflação.
 */

// ── Prestígio ────────────────────────────────────────────────────────────

/**
 * Multiplicador permanente ganho por camada; o poder total é `1,6 ^ camada`.
 *
 * Medido: a camada 79 é onde isto sozinho passa de `Number.MAX_SAFE_INTEGER`,
 * e por volta da 40 o produto com nível e equipamento já passa. É o que
 * justifica o tipo `Grande`.
 */
export const CRESCIMENTO_POR_CAMADA = 1.6;

/** Nível que libera o renascimento. Subir além disso não rende mais nada. */
export const NIVEL_MAXIMO = 100;

// ── Nível ────────────────────────────────────────────────────────────────

/** XP do primeiro nível. */
export const XP_BASE = 50;

/** Cada nível custa 18% a mais que o anterior: o nível 30 sai a 143× o
 *  primeiro, e o 60 a ~2e4×. */
export const CRESCIMENTO_XP = 1.18;

/**
 * Em que nível cada profundidade da árvore abre.
 *
 * Índice pela profundidade da classe: escolher a subclasse de nível 2 ocorre
 * no nível 10, a de nível 3 no 30, a de nível 4 no 60.
 */
export const NIVEL_DA_SUBCLASSE: Readonly<Record<number, number>> = {
  2: 10,
  3: 30,
  4: 60,
};

// ── Inimigos ─────────────────────────────────────────────────────────────

/** Quanto o inimigo cresce por nível do jogador. Abaixo do crescimento do
 *  jogador de propósito: o avanço tem de ser sentido. */
export const CRESCIMENTO_INIMIGO = 1.15;

// ── Offline ──────────────────────────────────────────────────────────────

/**
 * Teto de acúmulo offline.
 *
 * Sem teto o recálculo vira computação ilimitada por jogador, e quem sumiu um
 * mês volta com o jogo resolvido. Ajustável agora; inflacionário depois que
 * houver economia.
 */
export const OFFLINE_TETO_HORAS = 8;

/** Rendimento offline em relação ao jogo ativo. O combate por turnos é o
 *  produto — o offline é recuperação, não substituto. */
export const OFFLINE_RITMO = 0.35;

// ── Morte ────────────────────────────────────────────────────────────────

/** Preço do revive em moeda premium. Personagem no túmulo não rende nada e é
 *  preservado indefinidamente. */
export const PRECO_REVIVE = 250;
