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

/**
 * Onde fica a parede na camada 0 — o nível em que o inimigo alcança o jogador.
 *
 * Não é um teto imposto: é onde a curva do inimigo cruza a do jogador. Passar
 * dali exige o multiplicador de uma camada nova, e é esse cruzamento que dá
 * destino à vantagem do prestígio.
 */
export const NIVEL_DA_PAREDE_BASE = 100;

/**
 * Quanto a parede avança por camada: 26,5% mais fundo a cada renascimento.
 *
 * É o coração da progressão infinita, e o número é derivado, não escolhido: com
 * o jogador ganhando 1,6 por camada e a parede caindo com a raiz disso, cada
 * camada leva `√1,6 ≈ 1,265` vezes mais longe. Camada 10 chega ao nível ~1.000;
 * camada 30, a ~10.000. Sempre há uma parede à frente, e ela sempre está mais
 * longe que a anterior.
 */
export const AVANCO_DA_PAREDE_POR_CAMADA = Math.sqrt(CRESCIMENTO_POR_CAMADA);

/**
 * Deslocamento da curva do inimigo, em níveis.
 *
 * Sem ele a curva sai de zero, e o começo da vida fica sem resistência
 * nenhuma: medido, o jogador tinha 10.000x de vantagem no nível 1 e só
 * encontrava oposição real a partir do nível 50 — metade da vida era passeio.
 *
 * O valor veio de duas medições, não de intuição. Com deslocamento 0 a vida
 * começava com 10.000x de vantagem. Com 100, começava com 3,92x — e aí o motor
 * de combate, resolvendo batalhas de verdade, mostrou que razão 1,78 já dá 99%
 * de vitória: a curva razão→vitória é muito mais íngreme do que parecia, e a
 * vida inteira virava passeio até os últimos níveis.
 *
 * Com 400, a vida vai de ~1,55x até 1,00x na parede. A faixa é estreita porque
 * é nela que o combate de fato se decide.
 */
export const DESLOCAMENTO_DO_INIMIGO = 400;

// ── Nível ────────────────────────────────────────────────────────────────

/** XP do primeiro nível. */
export const XP_BASE = 50;

/**
 * Custo de XP por nível: `XP_BASE × nivel ^ 2,2`.
 *
 * Polinomial, e não exponencial. A primeira versão usava `1,18 ^ nivel`, o que
 * tornava qualquer nível acima de ~200 inalcançável por construção — e isso
 * fecha a porta para o teto de nível subir a cada camada, que é justamente o
 * que dá destino à vantagem do prestígio.
 *
 * Polinomial deixa o nível crescer sem limite prático: o custo sobe rápido o
 * bastante para o avanço ser sentido, devagar o bastante para o nível 10.000
 * existir.
 */
export const EXPOENTE_XP = 2.2;

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
 * Quanto mais rápido o inimigo cresce que o jogador, em expoente.
 *
 * O poder do jogador cresce com expoente 2,12 no nível (medido por ajuste
 * log-log). Somando 2, o inimigo cresce com 4,12 — e é essa diferença que cria
 * a parede: até certo nível o jogador vai bem, e a partir dali o inimigo passa
 * na frente e não há como avançar sem uma camada nova.
 *
 * O valor 2 não é enfeite: ele determina quanto cada camada rende. Com
 * diferença 2, a parede avança com a raiz do ganho por camada — 26,5% mais
 * fundo a cada renascimento. Diferença menor faria a parede saltar de forma
 * absurda (camada 10 no nível milhão); maior faria o prestígio render quase
 * nada.
 *
 * O inimigo NÃO escala com a camada. Essa foi a falha da versão anterior: o
 * jogador ganhava 1,6 por camada e o inimigo 1,45, e como os dois cresciam, a
 * vantagem composta não tinha onde ser gasta — na camada 35 o conteúdo já era
 * enfeite. A dificuldade de um nível é fixa; o que a camada muda é até onde se
 * chega.
 */
export const VANTAGEM_DO_INIMIGO = 2;

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

// ── Batalhas e morte ─────────────────────────────────────────────────────

/**
 * Quanto o julgamento rende a mais que uma batalha comum.
 *
 * O prêmio precisa pagar o risco. Sem diferença, ninguém aceitaria a aposta e
 * o julgamento seria letra morta.
 */
export const PREMIO_DO_JULGAMENTO = 6;

// ── Morte ────────────────────────────────────────────────────────────────

/** Preço do revive em moeda premium. Personagem no túmulo não rende nada e é
 *  preservado indefinidamente. */
export const PRECO_REVIVE = 250;
