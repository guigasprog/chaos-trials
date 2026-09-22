/**
 * A dificuldade.
 *
 * Escolhida na criação do personagem, e fixa para a vida dele — ela muda a
 * curva de monstro e de recompensa, e trocar no meio quebraria a curva que
 * o jogador já mediu. Substitui o que antes era "comum" vs. "julgamento":
 * agora TODA luta carrega risco de verdade, e o que muda por dificuldade é
 * quantas vidas amortecem esse risco antes da morte de fato, e o quanto o
 * monstro (e a recompensa) escalam com ela.
 */

export type Dificuldade = "facil" | "medio" | "dificil";

export const DIFICULDADES: readonly Dificuldade[] = ["facil", "medio", "dificil"];

export const NOME_DA_DIFICULDADE: Readonly<Record<Dificuldade, string>> = {
  facil: "Fácil",
  medio: "Médio",
  dificil: "Difícil",
};

export function dificuldadeValida(d: unknown): d is Dificuldade {
  return typeof d === "string" && (DIFICULDADES as readonly string[]).includes(d);
}
