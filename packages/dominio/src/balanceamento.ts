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

/**
 * A classe contra a qual o inimigo é calibrado. Melee, por ser a mediana dos
 * cinco ramos em poder de referência.
 */
export const CLASSE_DE_REFERENCIA = 4;

/**
 * Quanto o jogador abre de vantagem ao longo de uma vida: `nivel ^ 0,3`, o que
 * dá cerca de 4x entre o nível 1 e o 100.
 *
 * O inimigo é definido **em relação ao poder de um personagem de referência
 * naquele nível**, e não por uma lei de potência própria. Isso importa: duas
 * tentativas anteriores usaram fórmula independente e as duas quebraram, cada
 * uma numa ponta. `1,15 ^ nivel` era exponencial contra o crescimento linear
 * dos atributos, e no nível 100 o jogador ficava 970x atrás. `nivel ^ 1,82`
 * acertava o fim da vida e subia rápido demais no começo — o nível 2 já ficava
 * intransponível.
 *
 * Amarrado à curva real, o inimigo acompanha qualquer mudança de atributo sem
 * precisar de recalibragem, e a constante passa a significar algo que dá para
 * decidir: quanto a pessoa fica mais forte do começo ao fim de uma vida.
 */
export const DERIVA_DA_VIDA = 0.3;

/**
 * Crescimento do inimigo POR CAMADA de prestígio.
 *
 * Abaixo do ganho do jogador (1,6) de propósito: a razão entre os dois
 * (1,6 / 1,45 ≈ 1,10) é o motor da progressão infinita. Cada renascimento
 * deixa a pessoa ~10% mais adiantada do que na camada anterior, então ela
 * chega mais longe a cada vez em vez de repetir a mesma parede.
 *
 * Igualá-lo a 1,6 tornaria o prestígio decorativo: ganho e dificuldade se
 * cancelariam e renascer não levaria a lugar nenhum.
 */
export const CRESCIMENTO_INIMIGO_POR_CAMADA = 1.45;

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
