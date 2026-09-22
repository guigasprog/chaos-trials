import { type Ramo, ramoDe } from "./classe.ts";
import { ATRIBUTO_OFENSIVO_DO_RAMO, atributosDe } from "./atributos.ts";
import {
  DURACAO_DA_ESQUIVA_EM_TICKS,
  RECARGA_DA_ESQUIVA_EM_TICKS,
  ONDAS_COMUNS_ANTES_DO_CHEFE,
  DUREZA_DO_INIMIGO_COMUM_NA_SALA,
  DUREZA_DO_CHEFE_NA_SALA,
  VIDA_DO_INIMIGO_COMUM_NA_SALA,
  VIDA_DO_CHEFE_NA_SALA,
  TELEGRAFO_DO_INIMIGO_EM_TICKS,
} from "./balanceamento.ts";
import { chance } from "./aleatorio.ts";

/**
 * O combate em tempo real — Fase 1: sala PvE contra um chefe.
 *
 * Puro e determinístico, como o resto do domínio: nada aqui conhece
 * WebSocket, relógio da máquina, ou o personagem gravado — só o número de
 * classe, nível e vida que entram em `iniciarSala`. Quem grava o
 * resultado é o servidor, depois que a sala termina.
 *
 * Raias e distância discreta, não um plano 2D contínuo — ver a spec para
 * o porquê (mobile-first medido, arte de vitral estática). Espaço e
 * timing ainda importam: só não há física de colisão livre.
 */

export type Raia = "esquerda" | "centro" | "direita";
export const RAIAS: readonly Raia[] = ["esquerda", "centro", "direita"];

export type Distancia = "longe" | "medio" | "perto";
export const DISTANCIAS: readonly Distancia[] = ["longe", "medio", "perto"];

export type TipoDeInimigo = "comum" | "chefe";

export interface LutadorTempoReal {
  readonly vida: number;
  readonly vidaMaxima: number;
  readonly raia: Raia;
  readonly distancia: Distancia;
  /** Ticks restantes de invencibilidade por esquiva. 0 = não esquivando. */
  readonly esquivandoPor: number;
  /** Ticks restantes até poder esquivar de novo. */
  readonly recargaDeEsquivaPor: number;
}

export interface InimigoTempoReal extends LutadorTempoReal {
  readonly tipo: TipoDeInimigo;
  /** Dano do golpe, calculado uma vez ao spawnar a onda. */
  readonly dano: number;
  /** Ticks restantes até o golpe telegrafado resolver. `null` = não está
      telegrafando agora. */
  readonly telegrafandoPor: number | null;
}

export type FaseDaSala = "em-andamento" | "vitoria" | "derrota";

export interface Sala {
  readonly jogador: LutadorTempoReal;
  /** O dano do golpe básico do jogador — calculado uma vez, na criação. */
  readonly danoDoJogador: number;
  readonly inimigo: InimigoTempoReal;
  /** 1..ONDAS_COMUNS_ANTES_DO_CHEFE = comuns; o próximo número = chefe. */
  readonly onda: number;
  readonly fase: FaseDaSala;
  readonly semente: number;
  /** Guardados para recalcular o inimigo de cada nova onda — ver
      `avancarTick` (Task 5), que spawna o próximo inimigo sem precisar
      que o servidor mande esses dois números de novo a cada onda. */
  readonly classeDoJogador: number;
  readonly nivelDoJogador: number;
}

function inimigoDaOnda(dados: {
  onda: number;
  classeDoJogador: number;
  nivelDoJogador: number;
  semente: number;
}): InimigoTempoReal {
  const ehChefe = dados.onda > ONDAS_COMUNS_ANTES_DO_CHEFE;
  const ramo = ramoDe(dados.classeDoJogador);
  const atributos = atributosDe(dados.classeDoJogador, dados.nivelDoJogador);
  const poderOfensivo = atributos[ATRIBUTO_OFENSIVO_DO_RAMO[ramo]];

  const dureza = ehChefe ? DUREZA_DO_CHEFE_NA_SALA : DUREZA_DO_INIMIGO_COMUM_NA_SALA;
  const vida = ehChefe ? VIDA_DO_CHEFE_NA_SALA : VIDA_DO_INIMIGO_COMUM_NA_SALA;

  // O multiplicador `3` é chute inicial — sem medição real ainda (EM ABERTO, ver spec).
  return {
    tipo: ehChefe ? "chefe" : "comum",
    vida: Math.round(poderOfensivo * 3 * vida),
    vidaMaxima: Math.round(poderOfensivo * 3 * vida),
    dano: Math.round(poderOfensivo * dureza),
    raia: "centro",
    distancia: "longe",
    esquivandoPor: 0,
    recargaDeEsquivaPor: 0,
    telegrafandoPor: null,
  };
}

export function iniciarSala(dados: {
  classeDoJogador: number;
  nivelDoJogador: number;
  vidaDoJogador: number;
  vidaMaximaDoJogador: number;
  semente: number;
}): Sala {
  const ramo = ramoDe(dados.classeDoJogador);
  const atributos = atributosDe(dados.classeDoJogador, dados.nivelDoJogador);
  const danoDoJogador = atributos[ATRIBUTO_OFENSIVO_DO_RAMO[ramo]];

  return {
    jogador: {
      vida: dados.vidaDoJogador,
      vidaMaxima: dados.vidaMaximaDoJogador,
      raia: "centro",
      distancia: "longe",
      esquivandoPor: 0,
      recargaDeEsquivaPor: 0,
    },
    danoDoJogador,
    inimigo: inimigoDaOnda({
      onda: 1,
      classeDoJogador: dados.classeDoJogador,
      nivelDoJogador: dados.nivelDoJogador,
      semente: dados.semente,
    }),
    onda: 1,
    fase: "em-andamento",
    semente: dados.semente,
    classeDoJogador: dados.classeDoJogador,
    nivelDoJogador: dados.nivelDoJogador,
  };
}

function indiceLimitado(lista: readonly unknown[], indice: number, delta: number): number {
  return Math.max(0, Math.min(lista.length - 1, indice + delta));
}

export function moverRaia(sala: Sala, direcao: -1 | 1): Sala {
  const atual = RAIAS.indexOf(sala.jogador.raia);
  const novaRaia = RAIAS[indiceLimitado(RAIAS, atual, direcao)]!;
  return { ...sala, jogador: { ...sala.jogador, raia: novaRaia } };
}

export function moverDistancia(sala: Sala, direcao: -1 | 1): Sala {
  const atual = DISTANCIAS.indexOf(sala.jogador.distancia);
  const novaDistancia = DISTANCIAS[indiceLimitado(DISTANCIAS, atual, direcao)]!;
  return { ...sala, jogador: { ...sala.jogador, distancia: novaDistancia } };
}

/** Sem efeito se a recarga ainda não zerou — pedir esquiva cedo demais
    simplesmente não faz nada, não é erro. */
export function iniciarEsquiva(sala: Sala): Sala {
  if (sala.jogador.recargaDeEsquivaPor > 0) return sala;
  return {
    ...sala,
    jogador: {
      ...sala.jogador,
      esquivandoPor: DURACAO_DA_ESQUIVA_EM_TICKS,
      recargaDeEsquivaPor: RECARGA_DA_ESQUIVA_EM_TICKS,
    },
  };
}

export function atacar(sala: Sala): Sala {
  const acertou =
    sala.jogador.raia === sala.inimigo.raia &&
    sala.jogador.distancia === "perto" &&
    sala.inimigo.esquivandoPor === 0;

  if (!acertou) return sala;

  return {
    ...sala,
    inimigo: {
      ...sala.inimigo,
      vida: Math.max(0, sala.inimigo.vida - sala.danoDoJogador),
    },
  };
}

/** Chance por tick de iniciar o telégrafo, quando já em alcance. Não é
    constante de balanceamento formal porque é puramente de ritmo de IA,
    não de dificuldade — ajustar aqui não muda quem vence, só o quão
    "nervoso" o inimigo parece. */
const CHANCE_DE_TELEGRAFAR_POR_TICK = 0.15;

/**
 * Persegue se fora de alcance; senão, considera iniciar o telégrafo.
 * Nunca decide as duas coisas no mesmo tick — perseguir e atacar juntos
 * tornaria esquivar sem sentido, porque o inimigo já estaria em cima.
 */
export function decidirAcaoDoInimigo(sala: Sala): Sala {
  if (sala.inimigo.telegrafandoPor !== null) return sala;

  const mesmaRaia = sala.inimigo.raia === sala.jogador.raia;
  const mesmaDistancia = sala.inimigo.distancia === sala.jogador.distancia;

  if (!mesmaRaia || !mesmaDistancia) {
    const raiaAtual = RAIAS.indexOf(sala.inimigo.raia);
    const raiaAlvo = RAIAS.indexOf(sala.jogador.raia);
    const distanciaAtual = DISTANCIAS.indexOf(sala.inimigo.distancia);
    const distanciaAlvo = DISTANCIAS.indexOf(sala.jogador.distancia);

    const novaRaia = mesmaRaia
      ? sala.inimigo.raia
      : RAIAS[raiaAtual + Math.sign(raiaAlvo - raiaAtual)]!;
    const novaDistancia = mesmaDistancia
      ? sala.inimigo.distancia
      : DISTANCIAS[distanciaAtual + Math.sign(distanciaAlvo - distanciaAtual)]!;

    return {
      ...sala,
      inimigo: { ...sala.inimigo, raia: novaRaia, distancia: novaDistancia },
    };
  }

  const rolo = chance(sala.semente, CHANCE_DE_TELEGRAFAR_POR_TICK);
  if (!rolo.acertou) return { ...sala, semente: rolo.semente };

  return {
    ...sala,
    semente: rolo.semente,
    inimigo: { ...sala.inimigo, telegrafandoPor: TELEGRAFO_DO_INIMIGO_EM_TICKS },
  };
}

/** Chamada quando o telégrafo chega a zero — resolve o golpe e limpa o
    telégrafo, independente de ter acertado. */
export function resolverAtaqueDoInimigo(sala: Sala): Sala {
  const acertou =
    sala.jogador.raia === sala.inimigo.raia &&
    sala.jogador.distancia === sala.inimigo.distancia &&
    sala.jogador.esquivandoPor === 0;

  return {
    ...sala,
    inimigo: { ...sala.inimigo, telegrafandoPor: null },
    jogador: acertou
      ? { ...sala.jogador, vida: Math.max(0, sala.jogador.vida - sala.inimigo.dano) }
      : sala.jogador,
  };
}
