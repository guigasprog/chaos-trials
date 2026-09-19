/**
 * A árvore de classes.
 *
 * Porte do `ClassEnum` do server Java, preservando a melhor ideia dele: **o
 * índice codifica a hierarquia**. `1` Wise → `11` Mage → `111` Archmage →
 * `1111` Grandmaster. Pai, filhos, ancestrais e profundidade saem do próprio
 * número — não existe tabela de relacionamento, nem no banco nem aqui.
 *
 * São 45 classes em 5 ramos e até 4 níveis de profundidade.
 */

export type Ramo = 1 | 2 | 3 | 4 | 5;

export interface Classe {
  /** Identidade e hierarquia ao mesmo tempo. */
  readonly indice: number;
  readonly nome: string;
  /** Índice do pai; 0 nas raízes. */
  readonly pai: number;
}

/**
 * Os nomes ficam no original em inglês, como no `ClassEnum`.
 *
 * Nome de classe de fantasia em inglês é convenção entendida, e traduzir agora
 * criaria um segundo vocabulário para manter em sincronia com o índice. Quando
 * houver tela para localizar, ela traduz na borda.
 */
export const CLASSES: readonly Classe[] = [
  // ── Wise ─────────────────────────────────────────────────────────────
  { indice: 1, nome: "Wise", pai: 0 },
  { indice: 11, nome: "Mage", pai: 1 },
  { indice: 111, nome: "Archmage", pai: 11 },
  { indice: 1111, nome: "Grandmaster", pai: 111 },
  { indice: 1112, nome: "Elemental Lord", pai: 111 },
  { indice: 112, nome: "Spellblade", pai: 11 },
  { indice: 113, nome: "Warlock", pai: 11 },
  { indice: 12, nome: "Arcanist", pai: 1 },
  { indice: 13, nome: "Sorcerer", pai: 1 },
  { indice: 14, nome: "Elementalist", pai: 1 },
  { indice: 15, nome: "Illusionist", pai: 1 },
  { indice: 16, nome: "Cleric", pai: 1 },
  { indice: 17, nome: "Necromancer", pai: 1 },
  { indice: 171, nome: "Necrolord", pai: 17 },
  { indice: 18, nome: "Summoner", pai: 1 },
  { indice: 19, nome: "Druid", pai: 1 },

  // ── Support ──────────────────────────────────────────────────────────
  { indice: 2, nome: "Support", pai: 0 },
  { indice: 21, nome: "Bard", pai: 2 },
  { indice: 211, nome: "Enchanter", pai: 21 },
  { indice: 212, nome: "Balladist", pai: 21 },
  { indice: 22, nome: "Minstrel", pai: 2 },
  { indice: 23, nome: "Acrobat", pai: 2 },
  { indice: 24, nome: "Gambler", pai: 2 },

  // ── Ranger ───────────────────────────────────────────────────────────
  { indice: 3, nome: "Ranger", pai: 0 },
  { indice: 31, nome: "Archer", pai: 3 },
  { indice: 311, nome: "Sniper", pai: 31 },
  { indice: 312, nome: "Druid Ranger", pai: 31 },
  { indice: 32, nome: "Alchemist", pai: 3 },

  // ── Melee ────────────────────────────────────────────────────────────
  { indice: 4, nome: "Melee", pai: 0 },
  { indice: 41, nome: "Warrior", pai: 4 },
  { indice: 411, nome: "Knight", pai: 41 },
  { indice: 412, nome: "Gladiator", pai: 41 },
  { indice: 42, nome: "Templar", pai: 4 },
  { indice: 43, nome: "Lancer", pai: 4 },
  { indice: 44, nome: "Rogue", pai: 4 },
  { indice: 441, nome: "Assassin", pai: 44 },
  { indice: 4411, nome: "Shadow Knight", pai: 441 },
  { indice: 4412, nome: "Night Blade", pai: 441 },
  { indice: 442, nome: "Shadowdancer", pai: 44 },
  { indice: 45, nome: "Berserk", pai: 4 },

  // ── Tank ─────────────────────────────────────────────────────────────
  { indice: 5, nome: "Tank", pai: 0 },
  { indice: 53, nome: "Vanguard", pai: 5 },
  { indice: 54, nome: "Paladin", pai: 5 },
  { indice: 55, nome: "Inquisitor", pai: 5 },
  { indice: 56, nome: "Exorcist", pai: 5 },
] as const;

const POR_INDICE = new Map(CLASSES.map((c) => [c.indice, c]));

export function classePorIndice(indice: number): Classe {
  const c = POR_INDICE.get(indice);
  if (!c) throw new Error(`classe inexistente: ${indice}`);
  return c;
}

export function existeClasse(indice: number): boolean {
  return POR_INDICE.has(indice);
}

/** As cinco escolhíveis na criação do personagem. */
export const RAIZES: readonly Classe[] = CLASSES.filter((c) => c.pai === 0);

/** O ramo é o primeiro dígito — e é ele que manda na paleta do vitral. */
export function ramoDe(indice: number): Ramo {
  const primeiro = Number(String(indice)[0]);
  if (primeiro < 1 || primeiro > 5) {
    throw new Error(`índice fora dos cinco ramos: ${indice}`);
  }
  return primeiro as Ramo;
}

/** 1 na raiz, 4 no mais fundo. É a contagem de dígitos. */
export function profundidadeDe(indice: number): number {
  return String(indice).length;
}

/**
 * Só os filhos diretos.
 *
 * Pelo campo `pai`, e não por prefixo de string como fazia o Java: lá,
 * `getChildIndices(1)` casava com `1`, `11`, `111` e `1111` de uma vez — a
 * própria classe e todos os descendentes, em vez dos filhos.
 */
export function filhosDe(indice: number): Classe[] {
  return CLASSES.filter((c) => c.pai === indice);
}

/** Todos os descendentes, em qualquer profundidade. */
export function descendentesDe(indice: number): Classe[] {
  const achados: Classe[] = [];
  const fila = [indice];
  while (fila.length > 0) {
    const atual = fila.pop();
    if (atual === undefined) break;
    for (const filho of filhosDe(atual)) {
      achados.push(filho);
      fila.push(filho.indice);
    }
  }
  return achados;
}

/** Do pai até a raiz, nessa ordem. Vazio para uma raiz. */
export function ancestraisDe(indice: number): Classe[] {
  const linha: Classe[] = [];
  let atual = classePorIndice(indice).pai;
  while (atual !== 0) {
    const c = classePorIndice(atual);
    linha.push(c);
    atual = c.pai;
  }
  return linha;
}

/** Se `possivel` está na descendência de `indice` (ou é ele mesmo). */
export function descendeDe(possivel: number, indice: number): boolean {
  if (possivel === indice) return true;
  return ancestraisDe(possivel).some((c) => c.indice === indice);
}

/**
 * O caminho que a evolução seguiu: da raiz até a classe, incluindo ela.
 * É o que a tela de personagem mostra como trilha.
 */
export function trilhaDe(indice: number): Classe[] {
  return [...ancestraisDe(indice).reverse(), classePorIndice(indice)];
}
