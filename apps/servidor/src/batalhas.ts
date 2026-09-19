import {
  atributosDe,
  type Batalha,
  criarCombatente,
  equilibrio,
  type Evento,
  executarTurno,
  habilidadesDe,
  habilidadesDisponiveis,
  iniciarBatalha,
  type Personagem,
  ramoDe,
  PREMIO_DO_JULGAMENTO,
  recompensaDe,
  sementeDe,
} from "@chaos/dominio";

/**
 * As batalhas em andamento.
 *
 * Vivem no servidor, e é isso que faz o jogo ser à prova de trapaça: o cliente
 * manda intenção — "usar `toxina`" — e recebe o estado resultante. Ele nunca
 * envia dano, vida ou resultado, então não há o que forjar.
 *
 * Em memória por enquanto. Uma batalha dura minutos e não sobrevive a um
 * reinício do servidor, o que é aceitável nesta fatia: perder uma luta em
 * andamento é irritante, não destrutivo, e o personagem só é gravado quando a
 * batalha termina.
 */

/**
 * Comum ou julgamento.
 *
 * Perder uma comum é recuar. Perder um julgamento é morrer de verdade, e é a
 * única forma de morrer no jogo — porque é a única em que a pessoa escolheu
 * arriscar. Em troca, o julgamento paga muito mais.
 */
export type TipoDeBatalha = "comum" | "julgamento";

export interface Sessao {
  readonly id: string;
  readonly personagemId: string;
  readonly tipo: TipoDeBatalha;
  readonly batalha: Batalha;
  /** O que o inimigo fez antes da primeira vez do herói, quando ele é mais ágil. */
  readonly aberturaDoInimigo: readonly Evento[];
  /** Nível em que a batalha começou — a recompensa não muda se subir no meio. */
  readonly nivelInicial: number;
  readonly criadaEm: number;
}

/** Depois disto, uma batalha esquecida é recolhida. */
const VALIDADE_MS = 30 * 60 * 1000;

export class Batalhas {
  private readonly sessoes = new Map<string, Sessao>();
  private contador = 0;

  /** Monta o encontro apropriado para o personagem. */
  iniciar(p: Personagem, agora: number, tipo: TipoDeBatalha = "comum"): Sessao {
    const ramo = ramoDe(p.classe);

    const heroi = criarCombatente({
      id: "heroi",
      nome: p.nome,
      lado: "jogador",
      ramo,
      atributos: atributosDe(p.classe, p.nivel),
      habilidades: habilidadesDe(ramo, p.nivel).map((h) => h.id),
      vida: p.vida,
    });

    const vilao = criarCombatente({
      id: "vilao",
      nome: "Sombra do Caos",
      lado: "inimigo",
      ramo: 4,
      atributos: oponenteDe(p, tipo),
      habilidades: habilidadesDe(4, p.nivel)
        .map((h) => h.id)
        // O inimigo não se cura: uma luta por turnos contra algo que se cura
        // sozinho vira corrida de atrito, e não é o que se quer provar aqui.
        .filter((h) => h !== "recompor"),
    });

    this.contador += 1;
    const id = `b${this.contador}`;

    /*
     * Adianta até a vez do herói.
     *
     * A iniciativa decide quem começa, e um inimigo mais ágil começa. Sem
     * isto, a batalha nasceria na vez dele e toda tentativa de agir receberia
     * "não é a sua vez" — para sempre, porque o servidor só joga pelos outros
     * DEPOIS de uma ação do jogador. Achado jogando: um personagem muito
     * acima do nível encontra inimigos mais rápidos, e a luta simplesmente
     * travava.
     */
    const inicial = iniciarBatalha(
      [heroi, vilao],
      sementeDe(`${p.id}:${p.camada}:${p.nivel}:${tipo}:${agora}`),
    );
    const { batalha, eventos } = adiantarAteOHeroi(inicial);

    const sessao: Sessao = {
      id,
      personagemId: p.id,
      tipo,
      batalha,
      aberturaDoInimigo: eventos,
      nivelInicial: p.nivel,
      criadaEm: agora,
    };

    this.sessoes.set(id, sessao);
    this.recolher(agora);
    return sessao;
  }

  buscar(id: string): Sessao | null {
    return this.sessoes.get(id) ?? null;
  }

  /**
   * Executa o turno do jogador e, em seguida, os turnos de quem não é ele.
   *
   * Os dois juntos porque o cliente pede uma ação e espera ver a resposta do
   * inimigo: devolver só o turno do jogador obrigaria uma segunda chamada e
   * deixaria a janela aberta para ela nunca chegar.
   */
  agir(sessaoId: string, habilidade: string): { sessao: Sessao; eventos: Evento[] } {
    const sessao = this.sessoes.get(sessaoId);
    if (!sessao) throw new ErroDeBatalha(404, "batalha não encontrada");
    if (sessao.batalha.vencedor) {
      throw new ErroDeBatalha(409, "esta batalha já terminou");
    }

    const atuante = sessao.batalha.ordem[sessao.batalha.vez];
    if (atuante !== "heroi") {
      throw new ErroDeBatalha(409, "não é a sua vez");
    }

    const disponiveis = habilidadesDisponiveis(sessao.batalha, "heroi");
    if (!disponiveis.some((h) => h.id === habilidade)) {
      throw new ErroDeBatalha(400, `habilidade indisponível: ${habilidade}`);
    }

    const doHeroi = executarTurno(sessao.batalha, habilidade);
    // Enquanto não for a vez do herói, o servidor joga pelos outros: o cliente
    // pede uma ação e espera ver a resposta do inimigo na mesma resposta.
    const depois = adiantarAteOHeroi(doHeroi);
    const eventos: Evento[] = [...doHeroi.eventos, ...depois.eventos];

    const atualizada: Sessao = { ...sessao, batalha: depois.batalha };
    this.sessoes.set(sessaoId, atualizada);
    return { sessao: atualizada, eventos };
  }

  encerrar(id: string): void {
    this.sessoes.delete(id);
  }

  /** Descarta o que ficou para trás — aba fechada no meio da luta. */
  recolher(agora: number): void {
    for (const [id, s] of this.sessoes) {
      if (agora - s.criadaEm > VALIDADE_MS) this.sessoes.delete(id);
    }
  }

  get ativas(): number {
    return this.sessoes.size;
  }
}

/**
 * Roda os turnos de quem não é o herói até chegar a vez dele.
 *
 * Usado na abertura e depois de cada ação. O teto existe porque um efeito que
 * impedisse todo mundo de agir poderia, em teoria, girar sem fim.
 */
function adiantarAteOHeroi(inicio: Batalha): {
  batalha: Batalha;
  eventos: Evento[];
} {
  let batalha = inicio;
  const eventos: Evento[] = [];
  let guarda = 0;

  while (
    !batalha.vencedor &&
    batalha.ordem[batalha.vez] !== "heroi" &&
    guarda < 50
  ) {
    batalha = executarTurno(batalha);
    eventos.push(...batalha.eventos);
    guarda += 1;
  }

  return { batalha, eventos };
}

export class ErroDeBatalha extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeBatalha";
  }
}

/**
 * Os atributos do oponente, temperados pela curva de equilíbrio.
 *
 * Raiz quadrada do fator porque o atributo entra duas vezes no poder: uma na
 * ofensiva e outra no que se aguenta. Aplicá-lo cru dobraria o efeito
 * pretendido.
 */
function oponenteDe(p: Personagem, tipo: TipoDeBatalha) {
  const base = atributosDe(4, p.nivel);
  /*
   * O quanto o julgamento é mais duro.
   *
   * 1,05 parece pouco e não é: o atributo entra duas vezes no poder — uma na
   * ofensiva, outra no que se aguenta —, então 5% a mais de atributo vira
   * cerca de 10% a mais de poder. A primeira tentativa usou 1,35 e a medição
   * mostrou o estrago: 8% de vitória no nível 10 e 1% no 100.
   *
   * Medido com 1,05: 91% de vitória no nível 10, 67% no 50, 26% na parede. É
   * a curva desejada — confortável cedo, risco real no meio, e na parede o
   * sinal de que a hora é de renascer, não de apostar.
   */
  const dureza = tipo === "julgamento" ? 1.05 : 1;
  const fator =
    Math.max(0.2, (1 / equilibrio(p.classe, p.nivel, p.camada)) ** 0.5) * dureza;
  const ajusta = (v: number) => Math.max(1, Math.round(v * fator));
  return {
    intelecto: ajusta(base.intelecto),
    presenca: ajusta(base.presenca),
    destreza: ajusta(base.destreza),
    forca: ajusta(base.forca),
    vigor: ajusta(base.vigor),
  };
}

/** O que a vitória rende. O julgamento paga o risco que cobrou. */
export function premioDe(nivel: number, tipo: TipoDeBatalha = "comum") {
  const base = recompensaDe(nivel, true);
  if (tipo !== "julgamento") return base;
  return {
    xp: base.xp * PREMIO_DO_JULGAMENTO,
    sucata: base.sucata * PREMIO_DO_JULGAMENTO,
  };
}
