import {
  atributosDe,
  type Batalha,
  bonusDoPersonagem,
  chance,
  criarCombatente,
  type Dificuldade,
  DUREZA_POR_DIFICULDADE,
  equilibrio,
  type Evento,
  executarTurno,
  habilidadesDe,
  habilidadesDisponiveis,
  habilidadesTotais,
  iniciarBatalha,
  MULTIPLICADOR_DE_PREMIO_POR_DIFICULDADE,
  type Personagem,
  ramoDe,
  CHANCE_DE_FUGIR_POR_DIFICULDADE,
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

export interface Sessao {
  readonly id: string;
  readonly personagemId: string;
  /** A dificuldade do personagem NO INSTANTE em que a luta começou — ela é
      fixa por personagem, mas ler daqui evita reconsultar o registro. */
  readonly dificuldade: Dificuldade;
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

  /**
   * Monta o encontro apropriado para o personagem.
   *
   * A dificuldade não é mais escolhida por luta — é a do PERSONAGEM,
   * fixa desde a criação. Não existe mais "qual luta eu vou fazer agora":
   * existe só "lutar", e a dificuldade decide o quanto ela pesa.
   */
  iniciar(p: Personagem, agora: number): Sessao {
    const ramo = ramoDe(p.classe);

    const heroi = criarCombatente({
      id: "heroi",
      nome: p.nome,
      lado: "jogador",
      ramo,
      atributos: atributosDe(p.classe, p.nivel),
      // As da árvore entram junto: um ponto gasto numa magia que não aparece
      // no combate é um ponto que o jogador perdeu sem saber.
      habilidades: habilidadesTotais(p),
      vida: p.vida,
      bonus: bonusDoPersonagem(p),
    });

    const vilao = criarCombatente({
      id: "vilao",
      nome: "Sombra do Caos",
      lado: "inimigo",
      ramo: 4,
      atributos: oponenteDe(p),
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
      sementeDe(`${p.id}:${p.camada}:${p.nivel}:${p.dificuldade}:${agora}`),
    );
    const { batalha, eventos } = adiantarAteOHeroi(inicial);

    const sessao: Sessao = {
      id,
      personagemId: p.id,
      dificuldade: p.dificuldade,
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

  /**
   * Tenta fugir em vez de lutar (ou de continuar perdendo).
   *
   * Sucesso encerra a luta ali mesmo — sem vida perdida, sem prêmio, e sem
   * turno gasto de verdade: nada é jogado pelo `executarTurno`. Falha PERDE
   * o turno (um passe de propósito, `executarTurno(b, null)`) e o inimigo
   * age normalmente na sequência — fugir malsucedido custa a ação, não a
   * luta inteira.
   */
  fugir(sessaoId: string): { sessao: Sessao; eventos: Evento[]; sucesso: boolean } {
    const sessao = this.sessoes.get(sessaoId);
    if (!sessao) throw new ErroDeBatalha(404, "batalha não encontrada");
    if (sessao.batalha.vencedor) {
      throw new ErroDeBatalha(409, "esta batalha já terminou");
    }

    const atuante = sessao.batalha.ordem[sessao.batalha.vez];
    if (atuante !== "heroi") {
      throw new ErroDeBatalha(409, "não é a sua vez");
    }

    const rolo = chance(
      sementeDe(`fuga:${sessaoId}:${sessao.batalha.rodada}:${sessao.batalha.semente}`),
      chanceDeFugir(sessao),
    );

    if (rolo.acertou) {
      const eventos: Evento[] = [{ tipo: "fugiu", quem: "heroi" }];
      return { sessao, eventos, sucesso: true };
    }

    const doHeroi = executarTurno(sessao.batalha, null);
    const depois = adiantarAteOHeroi(doHeroi);
    const eventos: Evento[] = [...doHeroi.eventos, ...depois.eventos];

    const atualizada: Sessao = { ...sessao, batalha: depois.batalha };
    this.sessoes.set(sessaoId, atualizada);
    return { sessao: atualizada, eventos, sucesso: false };
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
function oponenteDe(p: Personagem) {
  const base = atributosDe(4, p.nivel);
  // Ver `DUREZA_POR_DIFICULDADE` em balanceamento.ts para a medição — 1,05
  // (difícil, o antigo julgamento) dá 91%/67%/26% de vitória em
  // nível 10/50/parede.
  const dureza = DUREZA_POR_DIFICULDADE[p.dificuldade];
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

/** O que a vitória rende. Ver `MULTIPLICADOR_DE_PREMIO_POR_DIFICULDADE`. */
export function premioDe(nivel: number, dificuldade: Dificuldade) {
  const base = recompensaDe(nivel, true);
  const mult = MULTIPLICADOR_DE_PREMIO_POR_DIFICULDADE[dificuldade];
  return { xp: base.xp * mult, sucata: base.sucata * mult };
}

/**
 * Chance de fugir com sucesso — a base da dificuldade, ajustada pela vida
 * que sobra no vilão: fugir de algo quase morto é mais fácil que fugir de
 * algo intacto. `0,7 + 0,3 * fração` mantém a base como o piso (vilão
 * cheio) e sobe até 30% a mais quando ele está no fio da vida.
 */
export function chanceDeFugir(sessao: Sessao): number {
  const vilao = sessao.batalha.combatentes.vilao;
  const fracaoDeVida = vilao ? vilao.vida / vilao.vidaMaxima : 1;
  const base = CHANCE_DE_FUGIR_POR_DIFICULDADE[sessao.dificuldade];
  return Math.min(1, base * (0.7 + 0.3 * fracaoDeVida));
}
