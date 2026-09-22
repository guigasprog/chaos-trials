import { atributosDe, somar, vidaMaxima } from "./atributos.ts";
import {
  type Bonus,
  bonusDe,
  comprar,
  type Gastos,
  podeComprar,
  pontosLivres,
  zerar,
} from "./arvore.ts";
import {
  bonusDoEquipamento,
  type Encaixe,
  type Item,
  NOME_DO_ENCAIXE,
  precoDeDesmanche,
  somarBonus,
} from "./item.ts";
import { sementeDe } from "./aleatorio.ts";
import {
  criarCombatente,
  iniciarBatalha,
  resolverBatalha,
} from "./batalha.ts";
import {
  classePorIndice,
  filhosDe,
  profundidadeDe,
  RAIZES,
  ramoDe,
} from "./classe.ts";
import {
  NIVEL_DA_SUBCLASSE,
  OFFLINE_RITMO,
  OFFLINE_TETO_HORAS,
  DESCANSO_POR_HORA,
  ELO_INICIAL,
  OFFLINE_DESCANSA_ABAIXO_DE,
  POCAO_CURA,
  POCAO_EM_VITORIAS,
  POCAO_PRECO_MINIMO,
  PRECO_REVIVE,
  SUCATA_INICIAL,
  VIDA_APOS_RECUAR,
  VIDAS_POR_DIFICULDADE,
  VIDAS_GUARDADAS_MAXIMO,
} from "./balanceamento.ts";
import { type Dificuldade, DIFICULDADES } from "./dificuldade.ts";
import { habilidadesDe } from "./habilidades.ts";
import {
  equilibrio,
  nivelDaParede,
  podeRenascer,
  xpParaNivel,
} from "./progressao.ts";

/**
 * O personagem e o que acontece com ele: subir de nível, escolher subclasse,
 * morrer, ser revivido, renascer, e render enquanto a pessoa está fora.
 *
 * Tudo puro, como o resto do domínio. Quem persiste é o servidor; aqui só se
 * decide o que o estado novo deve ser.
 */

export type EstadoDoPersonagem = "vivo" | "tumulo";

export interface Personagem {
  readonly id: string;
  readonly nome: string;
  /** Índice na árvore de classes. */
  readonly classe: number;
  readonly nivel: number;
  /** XP dentro do nível atual, não acumulado desde o começo. */
  readonly xp: number;
  readonly camada: number;
  readonly estado: EstadoDoPersonagem;
  /** Vida corrente, que atravessa batalhas. */
  readonly vida: number;
  /** Quando esteve online pela última vez, em ms. */
  readonly visto: number;
  /**
   * Moeda ganha jogando. É do personagem, e morre com ele.
   *
   * A moeda COMPRADA não está aqui: ela é da conta (`Conta.premium`).
   * Dinheiro de verdade não pode evaporar num permadeath — seria vender
   * algo que o jogo destrói sozinho.
   */
  readonly sucata: number;
  /** Quantas vezes já morreu — o túmulo não apaga a história. */
  readonly mortes: number;
  /** Graus comprados na árvore de habilidade, por id de nó. */
  readonly gastos: Gastos;
  /** O que está vestido, por encaixe. */
  readonly equipado: Partial<Record<Encaixe, Item>>;
  /** O que está guardado. Tem teto: ver `MOCHILA_MAXIMA`. */
  readonly mochila: readonly Item[];
  /** Pontuação na arena. Ver `arena.ts`. */
  readonly elo: number;
  /** Vitórias e derrotas em duelos, contando os dois lados. */
  readonly duelos: { vitorias: number; derrotas: number; defesas: number };
  /**
   * Escolhida na criação, fixa para a vida do personagem — muda a curva de
   * monstro e de recompensa, e trocar no meio quebraria a curva medida.
   */
  readonly dificuldade: Dificuldade;
  /**
   * Quantas derrotas ainda aguenta antes de morrer de vez. Começa no teto
   * de `VIDAS_POR_DIFICULDADE` e cai a cada luta perdida — ver
   * `perderBatalha`. Chegar a zero é o túmulo.
   */
  readonly vidasRestantes: number;
  /**
   * Vidas extras GUARDADAS — a reserva rara que soma além das vidas da
   * dificuldade, achada em combate ou comprada na loja. Some para cobrir a
   * morte só quando `vidasRestantes` já chegaria a zero.
   */
  readonly vidasGuardadas: number;
}

export function criarPersonagem(dados: {
  id: string;
  nome: string;
  classeRaiz: number;
  agora: number;
  /** Padrão "médio" — o meio-termo, sem escolha explícita. */
  dificuldade?: Dificuldade;
}): Personagem {
  if (!RAIZES.some((c) => c.indice === dados.classeRaiz)) {
    throw new Error(
      `só se começa numa das cinco raízes, não em ${dados.classeRaiz}`,
    );
  }
  const dificuldade = dados.dificuldade ?? "medio";
  if (!DIFICULDADES.includes(dificuldade)) {
    throw new Error(`dificuldade inválida: ${dificuldade}`);
  }

  return {
    id: dados.id,
    nome: dados.nome,
    classe: dados.classeRaiz,
    nivel: 1,
    xp: 0,
    camada: 0,
    estado: "vivo",
    vida: vidaMaxima(atributosDe(dados.classeRaiz, 1)),
    visto: dados.agora,
    sucata: SUCATA_INICIAL,
    mortes: 0,
    gastos: zerar(),
    equipado: {},
    mochila: [],
    elo: ELO_INICIAL,
    duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
    dificuldade,
    vidasRestantes: VIDAS_POR_DIFICULDADE[dificuldade],
    vidasGuardadas: 0,
  };
}

/**
 * Preenche o que faltar num personagem vindo do armazenamento.
 *
 * Campo novo em dado já gravado chega `undefined`, e um `undefined` circulando
 * como `Gastos` estoura três camadas adiante, longe da causa. Aqui ele morre
 * na porta de entrada.
 *
 * O XP também passa por aqui inteiro: quem jogou antes de `xpParaNivel`
 * arredondar carrega uma fração gravada, e ela reapareceria na ficha de
 * quem já estava jogando.
 */
export function normalizar(p: Personagem): Personagem {
  const inteiro = Math.round(p.xp);
  const completo =
    p.gastos &&
    p.mochila &&
    p.equipado &&
    p.elo !== undefined &&
    p.duelos &&
    p.dificuldade !== undefined &&
    p.vidasRestantes !== undefined &&
    p.vidasGuardadas !== undefined;
  if (completo && p.xp === inteiro) return p;
  // Personagem gravado antes da dificuldade existir: "médio" é o meio-termo
  // sem escolha explícita, e as vidas restantes começam no teto dele — não
  // em zero, que mataria na primeira derrota alguém que nunca escolheu
  // arriscar tanto.
  const dificuldade: Dificuldade = p.dificuldade ?? "medio";
  return {
    ...p,
    gastos: p.gastos ?? zerar(),
    equipado: p.equipado ?? {},
    mochila: p.mochila ?? [],
    elo: p.elo ?? ELO_INICIAL,
    duelos: p.duelos ?? { vitorias: 0, derrotas: 0, defesas: 0 },
    dificuldade,
    vidasRestantes: p.vidasRestantes ?? VIDAS_POR_DIFICULDADE[dificuldade],
    vidasGuardadas: p.vidasGuardadas ?? 0,
    xp: inteiro,
  };
}

/**
 * Tudo que soma neste personagem: a árvore MAIS o equipamento.
 *
 * Um `Bonus` só, e não dois caminhos paralelos. "Mais 8% de dano" tem de
 * significar exatamente a mesma coisa vindo da árvore e vindo de uma
 * lâmina — dois caminhos para o mesmo efeito é onde a regra diverge sem
 * ninguém notar.
 */
export function bonusDoPersonagem(p: Personagem): Bonus {
  return somarBonus(
    bonusDe(p.gastos ?? {}, ramoDe(p.classe)),
    bonusDoEquipamento(p.equipado ?? {}),
  );
}

// ── Equipamento ──────────────────────────────────────────────────────────

/**
 * Teto da mochila.
 *
 * Existe porque sem ele a mochila vira um depósito infinito que ninguém
 * olha, e a decisão "isto vale um espaço?" — que é a decisão do sistema de
 * itens — nunca acontece. Quando está cheia, a queda vira sucata em vez de
 * ser recusada: recusar pararia o laço de jogo para mandar arrumar gaveta.
 */
export const MOCHILA_MAXIMA = 24;

export function guardarItem(p: Personagem, item: Item): Personagem {
  const mochila = p.mochila ?? [];
  if (mochila.length >= MOCHILA_MAXIMA) {
    throw new Error(`a mochila está cheia (${MOCHILA_MAXIMA} peças)`);
  }
  return { ...p, mochila: [...mochila, item] };
}

export function itemNaMochila(p: Personagem, id: string): Item | null {
  return (p.mochila ?? []).find((i) => i.id === id) ?? null;
}

/**
 * Veste uma peça da mochila. O que estava no encaixe volta para a mochila.
 *
 * A troca é atômica de propósito: tirar e pôr em dois passos deixaria um
 * instante com a mochila cheia e a peça antiga sem lugar.
 */
export function equipar(p: Personagem, id: string): Personagem {
  const item = itemNaMochila(p, id);
  if (!item) throw new Error("essa peça não está na mochila");

  const anterior = (p.equipado ?? {})[item.encaixe];
  const mochila = (p.mochila ?? []).filter((i) => i.id !== id);
  return {
    ...p,
    equipado: { ...(p.equipado ?? {}), [item.encaixe]: item },
    mochila: anterior ? [...mochila, anterior] : mochila,
  };
}

export function desequipar(p: Personagem, encaixe: Encaixe): Personagem {
  const item = (p.equipado ?? {})[encaixe];
  if (!item) throw new Error(`não há nada em ${NOME_DO_ENCAIXE[encaixe]}`);
  if ((p.mochila ?? []).length >= MOCHILA_MAXIMA) {
    throw new Error("a mochila está cheia — desmanche alguma coisa antes");
  }
  const equipado = { ...(p.equipado ?? {}) };
  delete equipado[encaixe];
  return { ...p, equipado, mochila: [...(p.mochila ?? []), item] };
}

export interface Desmanche {
  readonly personagem: Personagem;
  readonly sucata: number;
}

/** Desmancha uma peça da mochila em sucata. Só da mochila: o que está
 *  vestido tem de sair do corpo primeiro, e isso é um gesto a mais de
 *  propósito — desmanchar a arma equipada por engano é caro. */
export function desmanchar(p: Personagem, id: string): Desmanche {
  const item = itemNaMochila(p, id);
  if (!item) throw new Error("essa peça não está na mochila");
  const sucata = precoDeDesmanche(item);
  return {
    personagem: {
      ...p,
      mochila: (p.mochila ?? []).filter((i) => i.id !== id),
      sucata: p.sucata + sucata,
    },
    sucata,
  };
}

export function pontosDisponiveis(p: Personagem): number {
  return pontosLivres(p.nivel, p.gastos ?? {});
}

/**
 * Compra um grau de um nó.
 *
 * A mensagem diz o que falta em frase inteira, e não só o detalhe: ela sobe
 * até a tela como está, e "Vocação" sozinho não explica nada a quem clicou.
 */
export function evoluirArvore(p: Personagem, no: string): Personagem {
  const impede = podeComprar(no, p.nivel, p.gastos ?? {});
  if (impede) {
    const frase = {
      requisito: `precisa de ${impede.detalhe} antes`,
      pontos: `sem pontos: ${impede.detalhe}`,
      maximo: `já está no máximo — ${impede.detalhe}`,
      inexistente: `esse nó não existe: ${impede.detalhe}`,
    }[impede.motivo];
    throw new Error(frase);
  }
  return { ...p, gastos: comprar(no, p.nivel, p.gastos ?? {}) };
}

/** As habilidades que o personagem tem: as do nível mais as da árvore. */
export function habilidadesTotais(p: Personagem): string[] {
  const doNivel = habilidadesDe(ramoDe(p.classe), p.nivel).map((h) => h.id);
  return [...new Set([...doNivel, ...bonusDoPersonagem(p).magias])];
}

/**
 * Vida máxima do personagem FORA da batalha.
 *
 * Tem de dar o mesmo número que `criarCombatente` dá, e por um tempo não
 * deu: aqui o bônus da árvore era ignorado, então a ficha mostrava um
 * máximo e a luta usava outro — e `vidaAposVitoria`, que cura até este
 * valor, desperdiçava a vida que a árvore tinha comprado.
 */
export function vidaMaximaDe(p: Personagem): number {
  const bonus = bonusDoPersonagem(p);
  return Math.round(
    vidaMaxima(somar(atributosDe(p.classe, p.nivel), bonus.atributos)) *
      (1 + bonus.vidaPercentual),
  );
}

export function habilidadesDoPersonagem(p: Personagem): string[] {
  return habilidadesDe(ramoDe(p.classe), p.nivel).map((h) => h.id);
}

// ── Nível ────────────────────────────────────────────────────────────────

export interface GanhoDeXp {
  readonly personagem: Personagem;
  readonly niveisSubidos: number;
  /** Subclasses disponíveis agora, se a subida destravou alguma. */
  readonly subclassesAbertas: readonly number[];
}

/**
 * Aplica XP, subindo quantos níveis couberem.
 *
 * Em laço, e não por fórmula fechada, porque cada subida pode destravar uma
 * escolha de subclasse — e engolir duas destravas de uma vez esconderia uma
 * decisão do jogador.
 *
 * Personagem no túmulo não recebe nada. É o que dá peso ao permadeath: o
 * tempo parado é tempo perdido de verdade.
 */
export function ganharXp(p: Personagem, quantidade: number): GanhoDeXp {
  if (quantidade < 0) throw new Error(`xp negativo: ${quantidade}`);
  if (p.estado === "tumulo" || quantidade === 0) {
    return { personagem: p, niveisSubidos: 0, subclassesAbertas: [] };
  }

  let nivel = p.nivel;
  // Inteiro na entrada: um chamador que passe fração contamina o saldo
  // gravado, e a fração só aparece muito depois, na ficha.
  let xp = Math.round(p.xp + quantidade);
  let subidos = 0;

  while (xp >= xpParaNivel(nivel)) {
    xp -= xpParaNivel(nivel);
    nivel += 1;
    subidos += 1;
  }

  /*
   * Subir de nível CURA por completo.
   *
   * É a única cura grátis do jogo, e ela está aqui de propósito: o nível
   * novo aumenta a vida máxima, e chegar nele com a barra pela metade
   * transformaria a recompensa em "agora você tem mais vida faltando".
   * É também o que faz a progressão ter fôlego — cada nível é um fôlego
   * literal.
   *
   * Sem subir de nível, a vida NÃO se recupera sozinha: ela atravessa as
   * batalhas, e voltar ao máximo custa poção ou tempo de descanso.
   */
  const curado: Personagem =
    subidos > 0
      ? { ...p, nivel, xp, vida: vidaMaximaDe({ ...p, nivel }) }
      : { ...p, nivel, xp };

  return {
    personagem: curado,
    niveisSubidos: subidos,
    subclassesAbertas: subidos > 0 ? subclassesDisponiveis(curado) : [],
  };
}

/**
 * As subclasses que o personagem pode escolher agora.
 *
 * Vazio quando não há nada para escolher, o que é o caso na maior parte do
 * tempo: a escolha só aparece nos níveis marcados em `NIVEL_DA_SUBCLASSE`.
 */
export function subclassesDisponiveis(p: Personagem): number[] {
  const filhos = filhosDe(p.classe);
  if (filhos.length === 0) return [];

  const profundidadeAlvo = profundidadeDe(p.classe) + 1;
  const nivelExigido = NIVEL_DA_SUBCLASSE[profundidadeAlvo];
  if (nivelExigido === undefined || p.nivel < nivelExigido) return [];

  return filhos.map((c) => c.indice);
}

/** Avança na árvore. A escolha é permanente para aquela vida. */
export function escolherSubclasse(p: Personagem, indice: number): Personagem {
  if (!subclassesDisponiveis(p).includes(indice)) {
    throw new Error(
      `${classePorIndice(p.classe).nome} não pode virar ${indice} no nível ${p.nivel}`,
    );
  }
  // Os atributos derivam de classe e nível, então trocar a classe já muda a
  // vida máxima — e a vida corrente pode ficar acima dela por um instante.
  const personagem: Personagem = { ...p, classe: indice };
  return { ...personagem, vida: Math.min(personagem.vida, vidaMaximaDe(personagem)) };
}

// ── Morte, túmulo e revive ───────────────────────────────────────────────

/**
 * Morrer é permanente até alguém pagar.
 *
 * O personagem para: não luta, não sobe, não rende offline. O que ele tinha
 * fica guardado indefinidamente — nada é apagado por tempo, e comprar o revive
 * três meses depois devolve tudo intacto.
 */
export function morrer(p: Personagem): Personagem {
  if (p.estado === "tumulo") return p;
  return { ...p, estado: "tumulo", vida: 0, mortes: p.mortes + 1 };
}

export interface Revive {
  readonly personagem: Personagem;
  readonly pagou: number;
}

/**
 * Tira do túmulo, cobrando em moeda premium.
 *
 * NÃO existe caminho por sucata. É decisão de produto, tomada com as
 * alternativas na mesa, e está registrada aqui porque é o tipo de regra que
 * alguém tentaria "consertar" depois achando que foi esquecimento.
 *
 * O túmulo prende o personagem, não a conta: quem não pode pagar cria outro do
 * zero, perdendo as camadas deste. Sem isso, não poder pagar tiraria o acesso
 * ao produto inteiro.
 *
 * O saldo entra por parâmetro e o débito sai no retorno porque a moeda é da
 * CONTA, não do personagem — moeda comprada com dinheiro de verdade não pode
 * evaporar num permadeath. Quem debita é quem tem a conta na mão; aqui só se
 * decide se pode e quanto custa.
 */
export function reviver(p: Personagem, premiumDaConta: number): Revive {
  if (p.estado !== "tumulo") throw new Error("só se revive quem está no túmulo");
  if (premiumDaConta < PRECO_REVIVE) {
    throw new Error(
      `revive custa ${PRECO_REVIVE} e a conta tem ${premiumDaConta}`,
    );
  }

  const personagem: Personagem = {
    ...p,
    estado: "vivo",
    vida: Math.max(1, Math.round(vidaMaximaDe(p) * 0.3)),
    // Vida nova, vidas cheias — a reserva da dificuldade volta ao teto. A
    // vida GUARDADA (a rara) não: essa é história de fora desta luta e
    // continua onde estava.
    vidasRestantes: VIDAS_POR_DIFICULDADE[p.dificuldade],
  };
  return { personagem, pagou: PRECO_REVIVE };
}

export function custoDoRevive(): number {
  return PRECO_REVIVE;
}

// ── Prestígio ────────────────────────────────────────────────────────────

/** Se o personagem chegou à parede da camada e pode renascer. */
export function prontoParaRenascer(p: Personagem): boolean {
  return p.estado === "vivo" && podeRenascer(p.nivel, p.camada);
}

/**
 * Renasce: sobe uma camada e recomeça a vida.
 *
 * Zera nível, XP e classe; preserva camada, moedas e a contagem de mortes. A
 * classe raiz é escolhida de novo, que é o ponto — as 45 classes viram
 * conteúdo rejogável em vez de escolha única.
 */
export function renascer(p: Personagem, classeRaiz: number): Personagem {
  if (!prontoParaRenascer(p)) {
    throw new Error(
      `ainda falta chegar ao nível ${Math.ceil(nivelDaParede(p.camada))}`,
    );
  }
  if (!RAIZES.some((c) => c.indice === classeRaiz)) {
    throw new Error(`renascer exige uma das cinco raízes, não ${classeRaiz}`);
  }

  const camada = p.camada + 1;
  return {
    // O elo e o histórico de duelos ATRAVESSAM o renascimento: a arena
    // mede a pessoa jogando, e zerar a reputação a cada camada faria o
    // ranking medir só quem renasceu menos.
    ...p,
    classe: classeRaiz,
    nivel: 1,
    xp: 0,
    camada,
    vida: vidaMaxima(atributosDe(classeRaiz, 1)),
    // A árvore zera junto: o nó do tronco aponta para o atributo DO RAMO, e
    // renascer troca o ramo. Mantendo os gastos, uma build montada para força
    // continuaria rodando num mago.
    gastos: zerar(),
    // Vida nova, vidas cheias — mesma lógica do revive.
    vidasRestantes: VIDAS_POR_DIFICULDADE[p.dificuldade],
  };
}

// ── Offline ──────────────────────────────────────────────────────────────

/** Quanto tempo uma batalha automática representa. */
const SEGUNDOS_POR_BATALHA = 30;

/**
 * Vencer NÃO cura. A vida atravessa as batalhas.
 *
 * Isto já foi cura total, e a mudança é de desenho, não de correção: a
 * vida passa a ser um recurso que se administra entre lutas, com três
 * formas de recuperá-la — subir de nível (grátis e total), beber poção
 * (custa sucata) e descansar (custa tempo).
 *
 * O que a medição antiga dizia continua verdade e por isso as três
 * existem: SEM nenhuma delas, com recuperação de 25% a mediana era 3
 * batalhas até morrer. O que tornava a cura total necessária era ser a
 * única fonte; deixando de ser, a tensão sai de dentro de uma luta só e
 * vira a pergunta "aguento mais uma?", que é uma decisão de verdade.
 *
 * Medido depois da mudança, 400 corridas — ver `arena`/`descanso` no
 * relatório da simulação.
 */
export function vidaAposVitoria(p: Personagem, vidaNaBatalha: number): number {
  /*
   * A vida com que o herói SAIU da luta, e não a que ele tinha antes.
   *
   * Parece óbvio e não era: o servidor guardava o personagem de antes da
   * batalha e só somava XP e sucata em cima dele. Com cura total na
   * vitória isso não aparecia — o valor era sobrescrito pelo máximo de
   * qualquer jeito. Tirada a cura, o defeito ficaria: vencer não custaria
   * vida nenhuma e a mudança inteira seria enfeite.
   */
  return Math.max(1, Math.min(Math.round(vidaNaBatalha), vidaMaximaDe(p)));
}

// ── Poções e descanso ────────────────────────────────────────────────────

/**
 * Quanto uma poção custa, em sucata.
 *
 * Atrelada ao que uma VITÓRIA rende, e não a uma fórmula paralela. É a
 * única forma de o laço fechar sozinho em qualquer nível: a poção custa
 * sempre a mesma fração do que se ganha jogando.
 *
 * A primeira tentativa usou `base * raiz(nível)` e a medição mostrou o
 * estrago: no nível 10 a poção custava 44 e uma vitória rendia 8 —
 * cinco vitórias e meia por poção, num ritmo de duas lutas por poção.
 * Impagável, e o jogador ficaria parado esperando as três horas de
 * descanso para sempre.
 */
export function precoDaPocao(p: Personagem): number {
  return Math.max(
    POCAO_PRECO_MINIMO,
    Math.round(recompensaDe(p.nivel, true).sucata * POCAO_EM_VITORIAS),
  );
}

export function podeBeberPocao(p: Personagem): string | null {
  if (p.estado === "tumulo") return "quem está no túmulo não bebe nada";
  if (p.vida >= vidaMaximaDe(p)) return "a vida já está cheia";
  if (p.sucata < precoDaPocao(p)) {
    return `a poção custa ${precoDaPocao(p)} e você tem ${p.sucata}`;
  }
  return null;
}

export interface Pocao {
  readonly personagem: Personagem;
  readonly curou: number;
  readonly pagou: number;
}

/**
 * Bebe uma poção: cura uma FRAÇÃO da vida máxima, e cobra sucata.
 *
 * Fração e não valor fixo, pelo mesmo motivo do preço. E fração da
 * máxima e não da que falta: curar "metade do que falta" nunca chega ao
 * cheio e produz aquela sensação de estar sempre um pouco quebrado.
 */
export function beberPocao(p: Personagem): Pocao {
  const impede = podeBeberPocao(p);
  if (impede) throw new Error(impede);

  const maxima = vidaMaximaDe(p);
  const pagou = precoDaPocao(p);
  const alvo = Math.min(maxima, p.vida + Math.ceil(maxima * POCAO_CURA));
  return {
    personagem: { ...p, vida: alvo, sucata: p.sucata - pagou },
    curou: alvo - p.vida,
    pagou,
  };
}

/**
 * Quanto se cura descansando por um tempo.
 *
 * Em fração da vida máxima por hora, e não em pontos: em pontos, o
 * descanso que enche a barra no nível 5 levaria um dia no nível 500.
 */
export function curaPorDescanso(p: Personagem, horas: number): number {
  if (horas <= 0) return 0;
  const maxima = vidaMaximaDe(p);
  const cheio = Math.min(maxima, p.vida + maxima * DESCANSO_POR_HORA * horas);
  return Math.max(0, Math.round(cheio) - p.vida);
}

/**
 * Perder uma batalha é recuar, não morrer direto — a peça que faltava, e a
 * medição obrigou a ela: com ~25% de derrota por luta, perder significando
 * morte dava uma morte a cada 3 ou 4 batalhas. Com permadeath e revive
 * pago em moeda comprada, isso não é dificuldade — é uma máquina de
 * extração, e foi construída sem ninguém decidir que seria assim.
 *
 * `recuar` sozinho não decide mais quem morre: quem decide é
 * `perderBatalha`, logo abaixo, que soma isto à conta de vidas da
 * dificuldade. `recuar` continua existindo porque `progredirOffline` usa
 * exatamente este resto — o offline nunca risca vida, de propósito.
 *
 * O quanto sobra está em `VIDA_APOS_RECUAR`, e o número lá tem uma história:
 * com os 35% originais o personagem não morria nem conseguia voltar.
 */
export function recuar(p: Personagem): Personagem {
  /*
   * Quem perdeu chegou a zero dentro da luta. Isto devolve um resto.
   *
   * O número era 0,70 e fazia sentido quando vencer curava tudo: era a
   * rede que impedia o poço, e tinha de ser generosa porque era a ÚNICA
   * rede. Agora há três formas de curar, então o resto pode ser o que a
   * derrota merece — e 0,70 viraria absurdo do outro lado: entrar com
   * 30%, perder, e sair com 70%. Perder seria a cura mais barata do
   * jogo.
   */
  return { ...p, vida: Math.max(1, Math.round(vidaMaximaDe(p) * VIDA_APOS_RECUAR)) };
}

/**
 * A conta de vidas depois de perder uma luta.
 *
 * Toda derrota agora consome uma vida da dificuldade — não só o antigo
 * "julgamento". Com folga (`vidasRestantes > 1`), é `recuar` e a conta
 * desce. Sem folga, uma vida guardada (rara, achada ou comprada) cobre a
 * queda antes de morrer de vez. Só sem as duas é que morre.
 */
export function perderBatalha(p: Personagem): Personagem {
  const restantes = p.vidasRestantes - 1;
  if (restantes > 0) return { ...recuar(p), vidasRestantes: restantes };
  if (p.vidasGuardadas > 0) {
    return { ...recuar(p), vidasRestantes: 1, vidasGuardadas: p.vidasGuardadas - 1 };
  }
  return { ...morrer(p), vidasRestantes: 0 };
}

/**
 * Soma uma vida guardada — de uma queda rara em combate, ou comprada na
 * loja. Com teto (`VIDAS_GUARDADAS_MAXIMO`): sem ele, farmar muito
 * acumula uma pilha e o permadeath deixa de significar algo.
 */
export function ganharVidaGuardada(p: Personagem): Personagem {
  return {
    ...p,
    vidasGuardadas: Math.min(VIDAS_GUARDADAS_MAXIMO, p.vidasGuardadas + 1),
  };
}

export interface RelatorioOffline {
  readonly personagem: Personagem;
  readonly horasCreditadas: number;
  readonly batalhas: number;
  readonly vitorias: number;
  readonly xpGanho: number;
  readonly sucataGanha: number;
  /** Se a última derrota levou o personagem ao túmulo. */
  readonly morreu: boolean;
  /** Horas passadas descansando, e o quanto isso curou. */
  readonly horasDescansando: number;
  readonly vidaRecuperada: number;
}

/**
 * Roda o que aconteceu enquanto a pessoa estava fora.
 *
 * Resolve batalhas de verdade, com o mesmo motor e semente derivada do próprio
 * personagem — não estima por fórmula. É o que torna o resultado reproduzível:
 * dado o mesmo personagem e o mesmo instante, o servidor chega sempre à mesma
 * conclusão, e uma reclamação pode ser investigada.
 *
 * Teto de 8 horas. Sem ele o recálculo vira computação ilimitada por jogador
 * e, pior, quem sumiu um mês volta com o jogo resolvido.
 *
 * Morrer offline manda para o túmulo igual, e as batalhas param ali. Deixar o
 * personagem morrer repetidamente enquanto ninguém olha seria punir a ausência
 * duas vezes.
 */
export function progredirOffline(
  p: Personagem,
  agora: number,
): RelatorioOffline {
  const vazio = (personagem: Personagem, horas = 0): RelatorioOffline => ({
    personagem,
    horasCreditadas: horas,
    batalhas: 0,
    vitorias: 0,
    xpGanho: 0,
    sucataGanha: 0,
    morreu: false,
    horasDescansando: 0,
    vidaRecuperada: 0,
  });

  if (p.estado === "tumulo") return vazio({ ...p, visto: agora });

  const decorridoMs = Math.max(0, agora - p.visto);
  const horas = Math.min(decorridoMs / 3_600_000, OFFLINE_TETO_HORAS);
  if (horas <= 0) return vazio({ ...p, visto: agora });

  const total = Math.floor((horas * 3600) / SEGUNDOS_POR_BATALHA);
  if (total === 0) return vazio({ ...p, visto: agora }, horas);

  const ramo = ramoDe(p.classe);
  let atual = p;
  let batalhas = 0;
  let vitorias = 0;
  let xpGanho = 0;
  let sucataGanha = 0;
  /* Quantas batalhas foram gastas antes de parar para descansar. */
  let usadas = 0;

  for (let i = 0; i < total; i++) {
    /*
     * Ferido demais: para de lutar e passa o resto do tempo descansando.
     *
     * Sem este limiar o offline gastaria a vida inteira em batalhas,
     * perderia a última e devolveria o personagem ferido — e "deixei AFK
     * para curar" entregaria o oposto do que promete. Agora o AFK é o
     * que o nome diz: luta enquanto dá, e descansa o resto.
     */
    if (atual.vida < vidaMaximaDe(atual) * OFFLINE_DESCANSA_ABAIXO_DE) break;
    usadas = i;
    const heroi = criarCombatente({
      id: "heroi",
      nome: atual.nome,
      lado: "jogador",
      ramo,
      atributos: atributosDe(atual.classe, atual.nivel),
      habilidades: habilidadesTotais(atual),
      vida: atual.vida,
      bonus: bonusDoPersonagem(atual),
    });

    const vilao = criarCombatente({
      id: "vilao",
      nome: "Inimigo",
      lado: "inimigo",
      ramo: 4,
      atributos: oponenteEquivalente(atual),
      habilidades: habilidadesDe(4, atual.nivel)
        .map((h) => h.id)
        .filter((h) => h !== "recompor"),
    });

    const { batalha } = resolverBatalha(
      iniciarBatalha(
        [heroi, vilao],
        sementeDe(`${atual.id}:${atual.camada}:${atual.nivel}:${i}`),
      ),
    );
    batalhas += 1;

    if (batalha.vencedor === "jogador") {
      vitorias += 1;
      const recompensa = recompensaDe(atual.nivel);
      xpGanho += recompensa.xp;
      sucataGanha += recompensa.sucata;

      const ganho = ganharXp(atual, recompensa.xp);
      const sobrou = batalha.combatentes.heroi?.vida ?? atual.vida;
      atual = {
        ...ganho.personagem,
        sucata: ganho.personagem.sucata + recompensa.sucata,
        // Subir de nível já curou dentro de `ganharXp`; fora disso vale o
        // que sobrou na luta.
        vida:
          ganho.niveisSubidos > 0
            ? ganho.personagem.vida
            : vidaAposVitoria(ganho.personagem, sobrou),
      };
      usadas = i + 1;
    } else {
      // Offline só há batalha comum: derrota é recuo. Morte automática
      // enquanto ninguém olha seria punir a ausência, e a pessoa não escolheu
      // arriscar nada.
      atual = recuar(atual);
      usadas = i + 1;
      break;
    }
  }

  // O tempo que sobrou vira descanso.
  const horasLutando = (usadas * SEGUNDOS_POR_BATALHA) / 3600;
  const horasDescansando = Math.max(0, horas - horasLutando);
  const vidaRecuperada = curaPorDescanso(atual, horasDescansando);
  if (vidaRecuperada > 0) {
    atual = { ...atual, vida: atual.vida + vidaRecuperada };
  }

  return {
    personagem: { ...atual, visto: agora },
    horasCreditadas: horas,
    batalhas,
    vitorias,
    xpGanho: Math.round(xpGanho),
    sucataGanha,
    // Offline nunca mata: só há batalha comum, e derrota ali é recuo.
    morreu: false,
    horasDescansando: Number(horasDescansando.toFixed(2)),
    vidaRecuperada,
  };
}

/**
 * O oponente do nível do personagem, temperado para bater com a curva de
 * equilíbrio. Raiz quadrada porque atributo entra duas vezes no poder — uma na
 * ofensiva, outra no que se aguenta.
 */
function oponenteEquivalente(p: Personagem) {
  const base = atributosDe(4, p.nivel);
  const fator = Math.max(0.2, (1 / equilibrio(p.classe, p.nivel, p.camada)) ** 0.5);
  const ajusta = (v: number) => Math.max(1, Math.round(v * fator));
  return {
    intelecto: ajusta(base.intelecto),
    presenca: ajusta(base.presenca),
    destreza: ajusta(base.destreza),
    forca: ajusta(base.forca),
    vigor: ajusta(base.vigor),
  };
}

/** XP e sucata por vitória. Offline rende menos que jogar de verdade. */
export function recompensaDe(nivel: number, ativo = false): {
  xp: number;
  sucata: number;
} {
  const ritmo = ativo ? 1 : OFFLINE_RITMO;
  return {
    xp: Math.round(xpParaNivel(nivel) * 0.22 * ritmo),
    sucata: Math.round((3 + nivel * 0.5) * ritmo),
  };
}
