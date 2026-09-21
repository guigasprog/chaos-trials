import { atributosDe } from "./atributos.ts";
import {
  criarCombatente,
  type Evento,
  iniciarBatalha,
  resolverBatalha,
} from "./batalha.ts";
import { ramoDe } from "./classe.ts";
import {
  bonusDoPersonagem,
  habilidadesTotais,
  type Personagem,
  vidaMaximaDe,
} from "./personagem.ts";
import { sementeDe } from "./aleatorio.ts";
import {
  DESGASTE_DA_ARENA,
  ELO_INICIAL,
  ELO_PESO,
  ELO_PISO,
  PREMIO_DA_ARENA,
} from "./balanceamento.ts";

/**
 * PvP assíncrono.
 *
 * ## Por que assíncrono, e não em tempo real
 *
 * O combate é por turnos e uma luta leva minutos. Exigir os dois
 * jogadores on-line ao mesmo tempo, num jogo com progressão infinita e
 * sessões de dez minutos, é garantir fila vazia — e fila vazia mata PvP
 * antes do primeiro duelo. Aqui um jogador desafia; o outro é
 * representado pela ficha dele, exatamente como ela está.
 *
 * ## O desafiado NÃO perde nada
 *
 * Ele não estava lá, não escolheu lutar e não pode ser punido por isso.
 * Ser atacado enquanto dorme e acordar sem nível seria o tipo de coisa
 * que faz alguém parar de jogar. Ele ganha elo quando defende bem, e
 * perde um pouco quando não — mas nunca perde sucata, item, vida ou
 * nível.
 *
 * ## Quem ataca arrisca tempo, não patrimônio
 *
 * O atacante paga com vida (`DESGASTE_DA_ARENA`) e ganha sucata e elo se
 * vencer. Nunca morre na arena: permadeath é do julgamento, onde a
 * pessoa escolheu a aposta, e não de um duelo contra um boneco parado.
 */

export interface Duelo {
  readonly vencedor: "desafiante" | "defensor";
  readonly rodadas: number;
  readonly eventos: readonly Evento[];
  /** Vida com que cada lado terminou, para a tela narrar. */
  readonly vidaDoDesafiante: number;
  readonly vidaDoDefensor: number;
}

/**
 * Resolve o duelo inteiro de uma vez.
 *
 * Determinístico pela semente, como todo o resto: o servidor pode
 * recalcular o mesmo duelo e chegar ao mesmo resultado — que é o que
 * permite auditar uma reclamação sem acreditar em ninguém, e o que
 * permite ao defensor ver o replay do que aconteceu com ele.
 *
 * Os dois entram com a VIDA CHEIA, e não com a vida corrente. O defensor
 * não está lá para beber poção antes, e atacar quem acabou de sair de
 * uma luta difícil seria premiar cronometragem em vez de build — o
 * jogador viraria um vigia esperando o outro ficar machucado.
 *
 * O desafiante paga o desgaste DEPOIS, sobre a vida que ele realmente
 * tem (`vidaAposDuelo`). Entrar cheio e sair cansado é o custo; entrar
 * ferido não deixa o duelo mais fácil para o outro lado.
 */
export function duelar(
  desafiante: Personagem,
  defensor: Personagem,
  semente: number,
): Duelo {
  const monta = (p: Personagem, id: string, lado: "jogador" | "inimigo") =>
    criarCombatente({
      id,
      nome: p.nome,
      lado,
      ramo: ramoDe(p.classe),
      atributos: atributosDe(p.classe, p.nivel),
      habilidades: habilidadesTotais(p),
      vida: vidaMaximaDe(p),
      bonus: bonusDoPersonagem(p),
    });

  const { batalha, eventos } = resolverBatalha(
    iniciarBatalha(
      [
        monta(desafiante, "desafiante", "jogador"),
        monta(defensor, "defensor", "inimigo"),
      ],
      semente,
    ),
  );

  return {
    // Empate por teto de rodadas conta para o DEFENSOR. Duas paredes se
    // encarando até o fim do tempo não é vitória de quem atacou, e sem
    // esta regra o atacante teria como forçar empate de graça.
    vencedor: batalha.vencedor === "jogador" ? "desafiante" : "defensor",
    rodadas: batalha.rodada,
    eventos,
    vidaDoDesafiante: batalha.combatentes.desafiante?.vida ?? 0,
    vidaDoDefensor: batalha.combatentes.defensor?.vida ?? 0,
  };
}

/** Semente de um duelo. Fora daqui ninguém precisa saber o formato. */
export function sementeDoDuelo(
  desafianteId: string,
  defensorId: string,
  quando: number,
): number {
  return sementeDe(`${desafianteId}:${defensorId}:${quando}`);
}

// ── Elo ──────────────────────────────────────────────────────────────────

/**
 * Quanto cada lado ganha ou perde.
 *
 * Elo clássico: vencer quem está muito acima vale muito, vencer quem
 * está muito abaixo vale quase nada. É o que impede a estratégia de
 * escolher sempre o alvo mais fraco — que, sem isto, seria a forma
 * ótima de subir, e transformaria a arena numa fila de execução.
 */
export function ajusteDeElo(
  eloDoDesafiante: number,
  eloDoDefensor: number,
  venceuODesafiante: boolean,
): { desafiante: number; defensor: number } {
  const esperado =
    1 / (1 + 10 ** ((eloDoDefensor - eloDoDesafiante) / 400));
  const real = venceuODesafiante ? 1 : 0;
  const delta = Math.round(ELO_PESO * (real - esperado));

  // O piso protege quem está começando de um mergulho do qual não se
  // sai: elo baixo demais e ninguém te desafia, e sem desafio não há
  // como subir.
  const aplicar = (atual: number, mudanca: number) =>
    Math.max(ELO_PISO, atual + mudanca);

  return {
    desafiante: aplicar(eloDoDesafiante, delta),
    // Soma zero entre os dois, antes do piso: a arena não injeta elo no
    // mundo, ela o redistribui.
    defensor: aplicar(eloDoDefensor, -delta),
  };
}

export const eloInicial = () => ELO_INICIAL;

/**
 * Faixa de adversários que faz sentido enfrentar.
 *
 * Por NÍVEL e não por elo: o elo diz quem joga bem, e o nível diz quem
 * tem números maiores. Num jogo com progressão infinita é o segundo que
 * decide o duelo, e parear por elo colocaria um nível 10 contra um nível
 * 4.000 só porque os dois perderam muito.
 */
export function faixaDeNivel(nivel: number): { minimo: number; maximo: number } {
  // Proporcional, e não fixa: ±5 níveis é enorme no nível 10 e
  // irrelevante no nível 3.000.
  const margem = Math.max(3, Math.round(nivel * 0.25));
  return { minimo: Math.max(1, nivel - margem), maximo: nivel + margem };
}

/** O que o desafiante ganha por vencer, e o que perde de vida por lutar. */
export function premioDaArena(nivel: number): number {
  return Math.max(1, Math.round(PREMIO_DA_ARENA * Math.sqrt(nivel)));
}

export function vidaAposDuelo(p: Personagem): number {
  /*
   * MÍNIMO entre o que se tem e o teto de desgaste — nunca um valor
   * fixo.
   *
   * Definir em 60% da máxima teria o mesmo defeito que `recuar` tinha:
   * quem entrasse com 55% SAIRIA com 60%, e duelar viraria uma forma de
   * se curar. O limiar de entrada é 50%, então a faixa de 50% a 60%
   * seria exatamente a zona do abuso.
   *
   * Piso em 1: a arena cansa, mas não mata nem deixa impedido de jogar.
   */
  const teto = Math.round(vidaMaximaDe(p) * (1 - DESGASTE_DA_ARENA));
  return Math.max(1, Math.min(p.vida, teto));
}

/**
 * Se este personagem pode desafiar agora.
 *
 * O túmulo não duela, e quem está muito ferido também não: entrar na
 * arena sem vida seria dar elo de graça ao defensor, e o jogador só
 * descobriria depois de perder.
 */
export function podeDesafiar(
  p: Personagem,
  vidaMinima = 0.5,
): string | null {
  if (p.estado === "tumulo") return "quem está no túmulo não duela";
  if (p.vida < vidaMaximaDe(p) * vidaMinima) {
    return "ferido demais para entrar na arena";
  }
  return null;
}
