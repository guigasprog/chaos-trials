import type { Atributos, NomeAtributo } from "./atributos.ts";

/**
 * Efeitos de status.
 *
 * Porte do modelo do QuestTerm, com uma diferença de fundo: lá o efeito era
 * aplicado mexendo direto nos atributos do combatente, e aqui ele é uma
 * **camada** que se soma na hora de ler. A diferença importa porque efeito
 * mutando atributo não volta direito: dois venenos sobrepostos, ou um buff que
 * expira enquanto outro está ativo, deixam resíduo. Como camada, expirar é só
 * tirar da lista.
 */

export type TipoDeEfeito =
  /** Dano por rodada, ignora redução — é veneno, não pancada. */
  | "veneno"
  /** Dano por rodada, sofre redução normalmente. */
  | "queimadura"
  /** Soma a um atributo enquanto durar. */
  | "reforco"
  /** Subtrai de um atributo enquanto durar. */
  | "fraqueza"
  /** Perde o turno. */
  | "atordoamento"
  /** Não pode ser alvo até agir. */
  | "oculto";

export interface EfeitoAtivo {
  readonly tipo: TipoDeEfeito;
  /** Rodadas restantes. Some ao chegar a zero. */
  readonly rodadas: number;
  /** Intensidade: dano por rodada, ou quanto soma/subtrai do atributo. */
  readonly potencia: number;
  /** Qual atributo, para reforço e fraqueza. */
  readonly atributo?: NomeAtributo;
  /** De onde veio, para o log dizer quem causou o quê. */
  readonly origem: string;
}

/** Efeitos que impedem o combatente de agir no turno. */
const IMPEDEM_AGIR: readonly TipoDeEfeito[] = ["atordoamento"];

export function impedeAgir(efeitos: readonly EfeitoAtivo[]): boolean {
  return efeitos.some((e) => IMPEDEM_AGIR.includes(e.tipo));
}

export function estaOculto(efeitos: readonly EfeitoAtivo[]): boolean {
  return efeitos.some((e) => e.tipo === "oculto");
}

/**
 * Os atributos com reforços e fraquezas aplicados.
 *
 * Os atributos-base nunca são tocados; esta função é a única leitura válida
 * durante uma batalha. Nenhum atributo desce abaixo de 1 — zero faria vida
 * máxima e redução de dano darem resultados sem sentido.
 */
export function atributosComEfeitos(
  base: Atributos,
  efeitos: readonly EfeitoAtivo[],
): Atributos {
  const ajuste: Record<string, number> = {};

  for (const e of efeitos) {
    if (e.tipo !== "reforco" && e.tipo !== "fraqueza") continue;
    if (!e.atributo) continue;
    const sinal = e.tipo === "reforco" ? 1 : -1;
    ajuste[e.atributo] = (ajuste[e.atributo] ?? 0) + sinal * e.potencia;
  }

  if (Object.keys(ajuste).length === 0) return base;

  const piso = (v: number) => Math.max(1, Math.round(v));
  return {
    intelecto: piso(base.intelecto + (ajuste.intelecto ?? 0)),
    presenca: piso(base.presenca + (ajuste.presenca ?? 0)),
    destreza: piso(base.destreza + (ajuste.destreza ?? 0)),
    forca: piso(base.forca + (ajuste.forca ?? 0)),
    vigor: piso(base.vigor + (ajuste.vigor ?? 0)),
  };
}

/** Dano que os efeitos causam nesta rodada, separado por tipo de mitigação. */
export function danoPorRodada(efeitos: readonly EfeitoAtivo[]): {
  ignoraArmadura: number;
  mitigavel: number;
} {
  let ignoraArmadura = 0;
  let mitigavel = 0;
  for (const e of efeitos) {
    if (e.tipo === "veneno") ignoraArmadura += e.potencia;
    if (e.tipo === "queimadura") mitigavel += e.potencia;
  }
  return { ignoraArmadura, mitigavel };
}

/**
 * Passa uma rodada: desconta a duração e descarta o que acabou.
 *
 * Devolve lista nova — o estado da batalha é sempre substituído, nunca
 * alterado no lugar, para o log poder guardar o antes e o depois.
 */
export function envelhecer(
  efeitos: readonly EfeitoAtivo[],
): { efeitos: EfeitoAtivo[]; expirados: EfeitoAtivo[] } {
  const vivos: EfeitoAtivo[] = [];
  const expirados: EfeitoAtivo[] = [];

  for (const e of efeitos) {
    const restante = e.rodadas - 1;
    if (restante > 0) vivos.push({ ...e, rodadas: restante });
    else expirados.push(e);
  }

  return { efeitos: vivos, expirados };
}

/**
 * Adiciona um efeito.
 *
 * Do mesmo tipo e atributo, o mais forte vence e a duração é a maior das duas
 * — em vez de empilhar. Empilhar é o caminho conhecido para o jogador aplicar
 * o mesmo veneno oito vezes e derrubar qualquer chefe; e somar durações
 * tornaria um efeito fraco aplicado muitas vezes melhor que um forte.
 */
export function aplicar(
  efeitos: readonly EfeitoAtivo[],
  novo: EfeitoAtivo,
): EfeitoAtivo[] {
  const mesmo = (e: EfeitoAtivo) =>
    e.tipo === novo.tipo && e.atributo === novo.atributo;

  const existente = efeitos.find(mesmo);
  if (!existente) return [...efeitos, novo];

  const fundido: EfeitoAtivo = {
    ...novo,
    potencia: Math.max(existente.potencia, novo.potencia),
    rodadas: Math.max(existente.rodadas, novo.rodadas),
  };
  return efeitos.map((e) => (mesmo(e) ? fundido : e));
}

/** Remove um efeito pelo tipo — é o que cura veneno ou tira o atordoamento. */
export function remover(
  efeitos: readonly EfeitoAtivo[],
  tipo: TipoDeEfeito,
): EfeitoAtivo[] {
  return efeitos.filter((e) => e.tipo !== tipo);
}
