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
  readonly batalha: Batalha;
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
  iniciar(p: Personagem, agora: number): Sessao {
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
      atributos: oponenteDe(p),
      habilidades: habilidadesDe(4, p.nivel)
        .map((h) => h.id)
        // O inimigo não se cura: uma luta por turnos contra algo que se cura
        // sozinho vira corrida de atrito, e não é o que se quer provar aqui.
        .filter((h) => h !== "recompor"),
    });

    this.contador += 1;
    const id = `b${this.contador}`;
    const sessao: Sessao = {
      id,
      personagemId: p.id,
      batalha: iniciarBatalha(
        [heroi, vilao],
        sementeDe(`${p.id}:${p.camada}:${p.nivel}:${agora}`),
      ),
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

    let batalha = executarTurno(sessao.batalha, habilidade);
    const eventos: Evento[] = [...batalha.eventos];

    // Enquanto não for a vez do herói, o servidor joga pelos outros.
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

    const atualizada: Sessao = { ...sessao, batalha };
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

/** O que a vitória rende, jogando ativamente. */
export function premioDe(nivel: number) {
  return recompensaDe(nivel, true);
}
