import { atributosDe, vidaMaxima } from "./atributos.ts";
import {
  bonusDe,
  comprar,
  type Gastos,
  podeComprar,
  pontosLivres,
  zerar,
} from "./arvore.ts";
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
  PRECO_REVIVE,
  VIDA_APOS_RECUAR,
} from "./balanceamento.ts";
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
  /** Moeda ganha jogando. */
  readonly sucata: number;
  /** Moeda comprada com dinheiro real. */
  readonly premium: number;
  /** Quantas vezes já morreu — o túmulo não apaga a história. */
  readonly mortes: number;
  /** Graus comprados na árvore de habilidade, por id de nó. */
  readonly gastos: Gastos;
}

export function criarPersonagem(dados: {
  id: string;
  nome: string;
  classeRaiz: number;
  agora: number;
}): Personagem {
  if (!RAIZES.some((c) => c.indice === dados.classeRaiz)) {
    throw new Error(
      `só se começa numa das cinco raízes, não em ${dados.classeRaiz}`,
    );
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
    sucata: 0,
    premium: 0,
    mortes: 0,
    gastos: zerar(),
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
  if (p.gastos && p.xp === inteiro) return p;
  return { ...p, gastos: p.gastos ?? zerar(), xp: inteiro };
}

/** O que a árvore rende para este personagem, já com o ramo certo. */
export function bonusDoPersonagem(p: Personagem) {
  return bonusDe(p.gastos ?? {}, ramoDe(p.classe));
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

export function vidaMaximaDe(p: Personagem): number {
  return vidaMaxima(atributosDe(p.classe, p.nivel));
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

  const personagem: Personagem = { ...p, nivel, xp };
  return {
    personagem,
    niveisSubidos: subidos,
    subclassesAbertas: subidos > 0 ? subclassesDisponiveis(personagem) : [],
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
 */
export function reviver(p: Personagem): Revive {
  if (p.estado !== "tumulo") throw new Error("só se revive quem está no túmulo");
  if (p.premium < PRECO_REVIVE) {
    throw new Error(
      `revive custa ${PRECO_REVIVE} e o personagem tem ${p.premium}`,
    );
  }

  const personagem: Personagem = {
    ...p,
    estado: "vivo",
    premium: p.premium - PRECO_REVIVE,
    vida: Math.max(1, Math.round(vidaMaximaDe(p) * 0.3)),
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
  };
}

// ── Offline ──────────────────────────────────────────────────────────────

/** Quanto tempo uma batalha automática representa. */
const SEGUNDOS_POR_BATALHA = 30;

/**
 * Vencer devolve a vida cheia.
 *
 * Medido antes de decidir: com recuperação de 25% a mediana era 3 batalhas até
 * morrer; com 50%, quatro; e mesmo com cura total, 8 no nível 20 e 3 no 50. O
 * desgaste acumulado não era o problema principal — era só o mais visível.
 *
 * Cura total põe a tensão DENTRO de cada batalha, que é onde ela pode ser
 * jogada. Perder por dano de arranhão herdado de três lutas atrás não é
 * decisão de ninguém, é só contabilidade.
 */
export function vidaAposVitoria(p: Personagem): number {
  return vidaMaximaDe(p);
}

/**
 * Perder uma batalha comum é recuar, não morrer.
 *
 * Esta é a peça que faltava, e a medição obrigou a ela: com ~25% de derrota
 * por luta, perder significando morte dava uma morte a cada 3 ou 4 batalhas.
 * Com permadeath e revive pago em moeda comprada, isso não é dificuldade — é
 * uma máquina de extração, e foi construída sem ninguém decidir que seria
 * assim.
 *
 * A morte permanente continua existindo, e continua sendo permadeath. Ela só
 * passa a acontecer onde a pessoa ESCOLHEU arriscar: no julgamento. É o que o
 * nome do jogo já dizia.
 *
 * O quanto sobra está em `VIDA_APOS_RECUAR`, e o número lá tem uma história:
 * com os 35% originais o personagem não morria nem conseguia voltar.
 */
export function recuar(p: Personagem): Personagem {
  return {
    ...p,
    vida: Math.max(1, Math.round(vidaMaximaDe(p) * VIDA_APOS_RECUAR)),
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

  for (let i = 0; i < total; i++) {
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
      atual = {
        ...ganho.personagem,
        sucata: ganho.personagem.sucata + recompensa.sucata,
        vida: vidaAposVitoria(ganho.personagem),
      };
    } else {
      // Offline só há batalha comum: derrota é recuo. Morte automática
      // enquanto ninguém olha seria punir a ausência, e a pessoa não escolheu
      // arriscar nada.
      atual = recuar(atual);
      break;
    }
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
