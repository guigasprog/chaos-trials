import type { Dificuldade } from "./dificuldade.ts";

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
 * Com quanta vida o personagem fica depois de recuar de uma derrota.
 *
 * ## Por que já foi 0,70
 *
 * Era 0,35, escolhido por parecer "um bom susto", e a medição mostrou um
 * poço: com 35% da vida a taxa de vitória caía para 11% no nível 10 e
 * ZERO no nível 3 — 60 lutas seguidas sem uma vitória. Como derrota
 * comum não mata, o personagem não morria nem voltava. O efeito estava
 * na CAUDA, não na mediana: em 120 corridas de 45 batalhas, o jogador
 * mediano chegava ao nível 10 dos dois jeitos, e o azarado ficava preso
 * no 2. Medir só a mediana teria dito "não muda nada".
 *
 * ## Por que agora é 0,12
 *
 * Aquele 0,70 tinha de ser generoso porque era a ÚNICA rede: vencer
 * curava tudo, e quem recuava só voltava vencendo. Agora há três formas
 * de curar — subir de nível, poção e descanso —, então a rede não
 * precisa mais estar no recuo, e mantê-la ali criava o absurdo inverso:
 * entrar numa luta com 30% de vida, perder, e sair com 70%. Perder seria
 * a cura mais barata do jogo.
 *
 * 0,12 é o que a derrota merece: o personagem sai destroçado e precisa
 * de uma poção (ou de meia hora de descanso) para voltar. O poço não
 * volta porque o descanso é grátis e sempre funciona — o que o teste em
 * `recuo.test.ts` verifica.
 */
export const VIDA_APOS_RECUAR = 0.12;

// ── Morte ────────────────────────────────────────────────────────────────

/** Preço do revive em moeda premium. Personagem no túmulo não rende nada e é
 *  preservado indefinidamente. */
export const PRECO_REVIVE = 250;

// ── Dificuldade ──────────────────────────────────────────────────────────

/*
 * Antes o jogo tinha DUAS lutas: comum (sem risco de morrer) e julgamento
 * (a única forma de morrer, pagando 6x). Virou dificuldade, escolhida na
 * criação e fixa para a vida do personagem: TODA luta agora é a luta que
 * paga o risco — o que muda por dificuldade é quantas vidas amortecem uma
 * derrota antes da morte de fato, e o quanto monstro e prêmio escalam.
 *
 * Médio herda os números do antigo "comum"; difícil herda os do antigo
 * "julgamento" — já medidos, não reinventados. Fácil é a única faixa nova,
 * abaixo dos dois, para quem quer nível sem o mesmo tanto de aposta.
 */

/**
 * Quantas derrotas o personagem aguenta antes de morrer de vez.
 *
 * Perder QUALQUER luta agora consome uma vida — não só o antigo
 * "julgamento". Sem a folga de mais de uma vida em fácil/médio, isso
 * recriaria exatamente o desastre que o README já documenta (~25% de
 * derrota por luta vira morte a cada 3-4 lutas, e permadeath frequente é
 * extração, não dificuldade). Com a folga, perder uma luta comum custa
 * uma vida da reserva, não o personagem inteiro.
 */
export const VIDAS_POR_DIFICULDADE: Readonly<Record<Dificuldade, number>> = {
  facil: 3,
  medio: 2,
  dificil: 1,
};

/**
 * O quanto o monstro é mais duro, por dificuldade.
 *
 * 1,05 no difícil é o antigo fator do julgamento, medido: 91% de vitória
 * no nível 10, 67% no 50, 26% na parede — confortável cedo, risco real no
 * meio. Médio fica em 1 (o antigo "comum", sem ajuste). Fácil em 0,85: o
 * atributo entra duas vezes no poder (ofensiva e o que se aguenta), então
 * 15% a menos de atributo é bem mais que 15% a menos de dificuldade.
 */
export const DUREZA_POR_DIFICULDADE: Readonly<Record<Dificuldade, number>> = {
  facil: 0.85,
  medio: 1,
  dificil: 1.05,
};

/**
 * Quanto a dificuldade rende a mais (ou a menos) em XP e sucata.
 *
 * Difícil em 6 é o antigo `PREMIO_DO_JULGAMENTO`: o prêmio precisa pagar o
 * risco, sem ele ninguém aceitaria a aposta. Médio em 1 é o antigo
 * "comum", sem ajuste. Fácil em 0,7 é o preço da folga: monstro mais
 * fraco E prêmio menor, senão fácil seria estritamente melhor que médio.
 */
export const MULTIPLICADOR_DE_PREMIO_POR_DIFICULDADE: Readonly<Record<Dificuldade, number>> = {
  facil: 0.7,
  medio: 1,
  dificil: 6,
};

/**
 * Chance de uma vitória largar uma peça, por dificuldade.
 *
 * Médio em 0,34 é o antigo `CHANCE_DE_QUEDA_COMUM`. Difícil em 1 (sempre
 * larga) é o antigo `CHANCE_DE_QUEDA_JULGAMENTO` — sair de mãos vazias de
 * uma luta em que se arriscou a vida seria aposta ruim. Fácil em 0,22 é
 * abaixo do médio, coerente com pagar menos por arriscar menos.
 */
export const CHANCE_DE_QUEDA_POR_DIFICULDADE: Readonly<Record<Dificuldade, number>> = {
  facil: 0.22,
  medio: 0.34,
  dificil: 1,
};

/**
 * Quantos sorteios de raridade uma queda faz, ficando com o melhor.
 *
 * Só o difícil dobra (era `SORTEIOS_DO_JULGAMENTO`): a chance de peça
 * sagrada quase dobra, e é a cauda que faz alguém aceitar arriscar a
 * última vida.
 */
export const SORTEIOS_POR_DIFICULDADE: Readonly<Record<Dificuldade, number>> = {
  facil: 1,
  medio: 1,
  dificil: 2,
};

/**
 * Chance-base de fugir de uma luta em vez de lutar (ou perder).
 *
 * Ajustada pela vida que sobra no monstro — fugir de algo quase morto é
 * mais fácil que fugir de algo intacto (ver `chanceDeFugir` em
 * `batalha.ts`). Cai com a dificuldade: quem escolheu o risco maior tem
 * mais dificuldade de recuar dele. Fugir falho não pune além de perder o
 * turno — a luta continua, o monstro age normalmente.
 */
export const CHANCE_DE_FUGIR_POR_DIFICULDADE: Readonly<Record<Dificuldade, number>> = {
  facil: 0.75,
  medio: 0.6,
  dificil: 0.45,
};

// ── Vida extra ───────────────────────────────────────────────────────────

/**
 * Chance de uma vitória render uma vida extra guardada, além da peça
 * normal — independente da dificuldade, porque é o prêmio raro que faz
 * qualquer nível valer a pena continuar tentando.
 *
 * 1%, como pedido: raro o bastante para ser notícia quando cai.
 */
export const CHANCE_DE_VIDA_EXTRA = 0.01;

/**
 * Teto de vidas guardadas ao mesmo tempo.
 *
 * Sem teto, quem farma muito acumula uma pilha e o permadeath deixa de
 * significar algo. Com 3, ainda é um colchão real — mas um colchão, não
 * uma armadura.
 */
export const VIDAS_GUARDADAS_MAXIMO = 3;

/**
 * Preço do amuleto de vida extra na loja, em moeda premium.
 *
 * Mais caro que o revive (`PRECO_REVIVE`, 250): o revive tira do túmulo
 * depois que a morte já aconteceu; o amuleto EVITA a morte seguinte. Sair
 * mais barato que a rede de segurança que ele substitui faria o revive
 * virar a opção de otário.
 */
export const PRECO_DO_AMULETO_DE_VIDA = 400;

// ── Vida entre batalhas ──────────────────────────────────────────────────

/*
 * A vida ATRAVESSA as batalhas, e há três formas de recuperá-la: subir
 * de nível (grátis e total), poção (custa sucata) e descanso (custa
 * tempo). Antes, vencer curava tudo — a mudança é de desenho, e o que a
 * medição antiga dizia continua valendo: com UMA fonte só e ela sendo
 * fraca, o personagem morria em três batalhas. Por isso são três.
 */

/*
 * ## Os dois números da poção, e como saíram
 *
 * Chutei dois pares e os dois falharam. Depois varri quatro curas por
 * três preços, 25 corridas de 200 passos por célula, medindo a PIOR das
 * 25 — porque corrida única é ruído: a mesma combinação deu 0 e 46
 * descansos dependendo da semente.
 *
 *   cura | preço | nível | descansos (pior) | sucata (pior)
 *   0,60 | 0,80v |    50 |          18 (46) |      62 (-51)   <- era isto
 *   0,60 | 0,60v |    50 |           2 (16) |      374 (69)
 *   0,75 | 0,80v |    50 |           2 (20) |     390 (-43)
 *   0,75 | 0,60v |    50 |            0 (0) |     929 (516)   <- é isto
 *   1,00 | 0,60v |    50 |            0 (0) |    1193 (687)
 *
 * O critério é do jogador: nunca parar por falta de sucata, nem na pior
 * corrida, e sobrar moeda para o mercado existir. Cura total também
 * fecha e foi descartada — "curar uma porção" é o que o desenho pede, e
 * poção que enche a barra apaga a diferença entre ela e subir de nível.
 *
 * A tabela inteira está em `scripts/pocao-varredura.ts`.
 */

/** Quanto da vida máxima uma poção devolve. */
export const POCAO_CURA = 0.75;

/**
 * Preço da poção, em VITÓRIAS.
 *
 * Atrelado ao que se ganha jogando, e não a uma fórmula paralela: é a
 * única forma de o laço fechar sozinho em qualquer nível. A primeira
 * tentativa usava `base * raiz(nível)` e custava 5,5 vitórias por poção
 * — impagável.
 */
export const POCAO_EM_VITORIAS = 0.6;
export const POCAO_PRECO_MINIMO = 3;

/**
 * Quanto da vida máxima volta por hora de descanso.
 *
 * 0,30 enche a barra em pouco mais de três horas — uma noite fora
 * devolve tudo, e uma pausa para o café devolve um pedaço que vale a
 * pena. Mais rápido que isto e a poção não teria razão de existir;
 * muito mais lento e "deixar AFK" viraria "não jogar".
 */
export const DESCANSO_POR_HORA = 0.3;

/**
 * Abaixo desta fração, o personagem offline PARA de lutar e descansa.
 *
 * Sem este limiar, o offline gastaria a vida inteira em batalhas, perderia
 * a última e devolveria o personagem ferido — e "deixei AFK para curar"
 * entregaria o oposto do que promete.
 */
export const OFFLINE_DESCANSA_ABAIXO_DE = 0.55;

/**
 * Sucata com que todo personagem NASCE.
 *
 * Achado jogando de verdade, não simulando: toda medição anterior do
 * laço poção/descanso começava com "duas vitórias de sucata" — nunca com
 * ZERO, que é onde um personagem recém-criado realmente está. Um
 * playtest de ponta a ponta bateu nisso na hora: um personagem novo
 * perde uma luta cedo, fica sem sucata para a poção seguinte, e trava —
 * a única saída é esperar de verdade.
 *
 * Medido em `scripts/arranque-frio-golpe.ts`, simulando o estilo de jogo
 * mais comum e mais desfavorável — sempre a habilidade sem espera, nunca
 * a de recarga —, porque é exatamente o que um jogador sem experiência
 * faz:
 *
 *   sucata inicial | presos nas primeiras 15 ações | espera mediana
 *              0   | 33,7%                         | 1,1h
 *              5   |  5,1%                         | 1,1h
 *             10   |  0,1%                         | 1,1h
 *             15   |  0,0%                         | —
 *
 * 15 zera o pior momento — o primeiro encontro com a mecânica, que é
 * onde travar dói mais. NÃO elimina o problema de vez: o mesmo estilo
 * "só a habilidade sem espera", numa janela de 40 ações, ainda trava
 * 13,5% das vezes mesmo com este presente — porque nunca rodar a
 * habilidade de recarga é uma escolha de jogo estruturalmente mais fraca
 * a qualquer nível, e nenhuma sucata inicial resolve isso para sempre.
 * Essa parte fica **EM ABERTO**: corrigi-la de verdade é rebalancear
 * combate no nível 1, e isso está fora do que uma constante isolada
 * decide com segurança — ver o README.
 *
 * Não fere a economia fechada: essa invariante — moeda nunca criada do
 * nada — é da moeda PREMIUM, comprada com dinheiro de verdade. Sucata já
 * é descrita em `mercado.ts` como "infinitamente farmável"; um presente
 * de partida é só o primeiro farm adiantado.
 */
export const SUCATA_INICIAL = 15;

// ── Arena (PvP) ──────────────────────────────────────────────────────────

/** Onde todo mundo começa. 1.000 é a convenção, e convenção tem valor. */
export const ELO_INICIAL = 1000;

/**
 * Quanto um duelo move o elo, no máximo.
 *
 * 24 é o meio-termo de sempre: com 40, três derrotas seguidas jogam
 * alguém longe demais e o número vira ruído; com 12, subir exige dezenas
 * de duelos e ninguém acompanha o próprio progresso.
 */
export const ELO_PESO = 24;

/**
 * Piso do elo.
 *
 * Protege quem está começando de um mergulho do qual não se sai: elo
 * baixo demais e ninguém te desafia, e sem desafio não há como subir.
 */
export const ELO_PISO = 200;

/**
 * Quanto de vida o DESAFIANTE gasta por duelo.
 *
 * O custo da arena é tempo, não patrimônio: ele volta ferido e espera
 * uma vitória para se curar. Nunca morre — permadeath é do julgamento,
 * onde a pessoa escolheu a aposta, e não de um duelo contra uma ficha
 * parada.
 */
export const DESGASTE_DA_ARENA = 0.4;

/** Sucata por vitória na arena, escalada pela raiz do nível. */
export const PREMIO_DA_ARENA = 12;

/**
 * Quanto tempo entre dois duelos contra o MESMO defensor.
 *
 * Sem isto, o melhor jogo seria achar uma ficha fraca e duelar contra
 * ela em laço. Vinte minutos é o bastante para obrigar a procurar outro
 * alvo sem transformar a arena em sala de espera.
 */
export const ESPERA_DO_MESMO_ALVO_MS = 20 * 60 * 1000;

// ── Mercado ──────────────────────────────────────────────────────────────

/**
 * A fatia que toda venda destrói.
 *
 * É o ÚNICO ralo de moeda do jogo, e sem ralo a economia fechada só
 * acumula: cada compra com dinheiro real empurra o total para cima e nada
 * nunca puxa para baixo. 8% é alto o bastante para o ralo existir e baixo
 * o bastante para revender não ser burrice — acima de ~15%, o jogador
 * guarda tudo e o mercado seca.
 */
export const DIZIMO_DO_MERCADO = 0.08;

/** Piso de preço. Abaixo disso o anúncio custa mais atenção do que vale. */
export const PRECO_MINIMO = 1;

/**
 * Teto de preço.
 *
 * Contra o anúncio-piada e contra o dedo escorregado: um preço de dez
 * dígitos na vitrine não vende nada e atrapalha quem está comparando.
 */
export const PRECO_MAXIMO = 10_000_000;

/** Quantos anúncios abertos uma conta pode ter ao mesmo tempo. */
export const ANUNCIOS_POR_CONTA = 10;

// ── Conta e slots ────────────────────────────────────────────────────────

/**
 * Quantos personagens a conta tem sem pagar nada.
 *
 * Dois, e não um: com um só, perder o personagem para o permadeath encerra
 * a conta até alguém pagar, e o jogo passa a cobrar para continuar
 * existindo. Com dois, sempre há uma segunda vida possível de graça, e o
 * que se compra é conveniência — não acesso.
 */
export const SLOTS_GRATIS = 2;

/** Preço do terceiro slot, em moeda premium. */
export const PRECO_DO_PRIMEIRO_SLOT = 300;

/**
 * Quanto o slot seguinte custa a mais que o anterior.
 *
 * Slot é permanente, não consumo. A preço fixo, ter vinte personagens vira
 * gasto trivial e a decisão de qual manter — que é o que dá peso ao
 * permadeath — desaparece. Em 1,6 o décimo slot custa cerca de 8.200.
 */
export const PRECO_DO_SLOT_CRESCE = 1.6;

/** Teto de slots. Existe para a tela caber e para o preço não virar piada. */
export const SLOTS_MAXIMO = 10;

// ── Loja ─────────────────────────────────────────────────────────────────

/**
 * Cada quanto tempo a prateleira da loja troca.
 *
 * Sem estoque nenhum para gerenciar: a hora corrente É a semente, então a
 * mesma prateleira aparece pra todo mundo que olhar dentro da mesma hora, e
 * troca sozinha na virada — sem cron, sem job, sem estado para perder num
 * restart do servidor.
 */
export const LOJA_TROCA_A_CADA_MS = 60 * 60 * 1000;

// ── Bolsa (câmbio sucata ↔ premium) ─────────────────────────────────────

/**
 * O preço de tabela: quanta sucata compra 1 de premium quando a bolsa
 * nunca foi usada este mês e não há premium nenhum em circulação.
 *
 * 2.000, como pedido. Alto o bastante para não ser um atalho óbvio —
 * `SUCATA_INICIAL` é 15, e uma vitória rende poucas unidades — mas
 * existente, que é o ponto: sem ele não há caminho nenhum de sucata
 * para premium, e com preço fixo em vez de flutuante o caminho vira
 * ilimitado, o que `cambio.ts` explica por que não pode ser.
 */
export const TAXA_BASE_DO_CAMBIO = 2000;

/**
 * Quanto premium comprado NO MÊS precisa passar para o preço dobrar.
 *
 * É o freio principal: uso em massa encarece a bolsa para todo mundo,
 * inclusive para quem começou a usar primeiro. Chute inicial — pedir
 * para medir e corrigir é o que `balanceamento.ts` promete no topo do
 * arquivo, e este número não tem medição de verdade ainda.
 */
export const CAMBIO_ESCALA_DE_VOLUME = 20_000;

/**
 * Quanto premium precisa estar parado nas contas (soma de todo mundo)
 * para o preço dobrar por causa disso.
 *
 * Segundo freio, independente do primeiro: mesmo numa bolsa pouco usada
 * num mês específico, uma economia já rica em premium acumulado torna
 * imprimir mais premium mais caro. Também chute inicial.
 */
export const CAMBIO_ESCALA_DE_CIRCULACAO = 50_000;

// ── Combate em tempo real (Fase 1) ──────────────────────────────────────

/*
 * Nenhum destes números tem medição de verdade ainda — são o chute
 * inicial que a spec (docs/superpowers/specs/2026-09-22-...) já marca
 * como EM ABERTO. Jogar de verdade e ajustar depois, como o resto deste
 * arquivo pede.
 */

/** Quantos ticks o servidor roda por segundo, nesta sala. */
export const TICKS_POR_SEGUNDO = 10;

/** Quantos milissegundos sem intenção do cliente encerram a sala como derrota (15s — ver spec, seção 6). */
export const TIMEOUT_DE_DESCONEXAO_MS = 15_000;

/** Quantos ticks de invencibilidade uma esquiva dá. */
export const DURACAO_DA_ESQUIVA_EM_TICKS = 4;

/** Quantos ticks até poder esquivar de novo, depois de esquivar. */
export const RECARGA_DA_ESQUIVA_EM_TICKS = 20;

/** Quantos ticks de aviso o golpe do inimigo dá antes de resolver. */
export const TELEGRAFO_DO_INIMIGO_EM_TICKS = 8;

/** Quantas ondas de inimigo comum vêm antes da onda de chefe. */
export const ONDAS_COMUNS_ANTES_DO_CHEFE = 3;

/**
 * Fração do poder ofensivo do jogador que o inimigo comum desta sala usa
 * como atributo — pensado pra ser vencível sozinho, sem grupo. O chefe é
 * mais forte que o próprio jogador: é a parte "mega difícil" do pedido.
 */
export const DUREZA_DO_INIMIGO_COMUM_NA_SALA = 0.6;
export const DUREZA_DO_CHEFE_NA_SALA = 1.3;

/** Multiplicador de vida do inimigo comum e do chefe, escalonado do poder
    ofensivo do jogador (não da sua vida máxima) — chefe aguenta mais troca,
    não só bate mais forte. Veja `inimigoDaOnda` em combate-tempo-real.ts. */
export const VIDA_DO_INIMIGO_COMUM_NA_SALA = 0.8;
export const VIDA_DO_CHEFE_NA_SALA = 2.5;
