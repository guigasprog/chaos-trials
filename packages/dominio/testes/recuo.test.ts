import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atributosDe } from "../src/atributos.ts";
import { VIDA_APOS_RECUAR } from "../src/balanceamento.ts";
import {
  criarCombatente,
  iniciarBatalha,
  resolverBatalha,
} from "../src/batalha.ts";
import { habilidadesDe } from "../src/habilidades.ts";
import { recompensaDe } from "../src/personagem.ts";
import { equilibrio, xpParaNivel } from "../src/progressao.ts";

/**
 * Recuar não pode ser um poço.
 *
 * Derrota comum não mata — é recuo. Isso só funciona enquanto a próxima luta
 * continua vencível: se não continua, o personagem fica preso perdendo para
 * sempre, sem morrer e sem voltar, e a única saída é fechar o jogo.
 *
 * Foi exatamente o que aconteceu com os 35% originais: 11% de vitória no
 * nível 10 e ZERO no nível 3, medidos em 60 lutas seguidas. Este arquivo
 * existe para que a próxima mexida no número não desfaça a descoberta em
 * silêncio — nenhum teste de unidade pega isso, porque cada peça está certa.
 */

const CLASSE = 4;

/** O mesmo oponente que o servidor monta em `batalhas.ts`. */
function oponente(nivel: number) {
  const base = atributosDe(4, nivel);
  const fator = Math.max(0.2, (1 / equilibrio(CLASSE, nivel, 0)) ** 0.5);
  const ajusta = (v: number) => Math.max(1, Math.round(v * fator));
  return {
    intelecto: ajusta(base.intelecto),
    presenca: ajusta(base.presenca),
    destreza: ajusta(base.destreza),
    forca: ajusta(base.forca),
    vigor: ajusta(base.vigor),
  };
}

/** Taxa de vitória do herói começando com `fracao` da vida máxima. */
function taxaDeVitoria(nivel: number, fracao: number, amostra = 120): number {
  let vitorias = 0;
  for (let s = 0; s < amostra; s++) {
    const heroi = criarCombatente({
      id: "heroi",
      nome: "H",
      lado: "jogador",
      ramo: 4,
      atributos: atributosDe(CLASSE, nivel),
      habilidades: habilidadesDe(CLASSE, nivel).map((h) => h.id),
    });
    const { batalha } = resolverBatalha(
      iniciarBatalha(
        [
          { ...heroi, vida: Math.max(1, Math.round(heroi.vidaMaxima * fracao)) },
          criarCombatente({
            id: "vilao",
            nome: "V",
            lado: "inimigo",
            ramo: 4,
            atributos: oponente(nivel),
            habilidades: habilidadesDe(4, nivel)
              .map((h) => h.id)
              .filter((h) => h !== "recompor"),
          }),
        ],
        s,
      ),
    );
    if (batalha.vencedor === "jogador") vitorias += 1;
  }
  return vitorias / amostra;
}

describe("recuar deixa o jogo jogável", () => {
  it("a luta seguinte é vencível na maioria das vezes, em todo nível testado", () => {
    for (const nivel of [3, 10, 25, 50]) {
      const taxa = taxaDeVitoria(nivel, VIDA_APOS_RECUAR);
      assert.ok(
        taxa > 0.5,
        `nível ${nivel}: com ${Math.round(VIDA_APOS_RECUAR * 100)}% de vida ` +
          `a taxa de vitória é ${Math.round(taxa * 100)}% — perder uma vez ` +
          `prende o personagem`,
      );
    }
  });

  it("mas perder ainda custa: com vida cheia se vence bem mais", () => {
    // Sem esta metade, "recuar não é poço" viraria "recuar não é nada", e a
    // derrota deixaria de ter consequência.
    const nivel = 10;
    assert.ok(
      taxaDeVitoria(nivel, 1) > taxaDeVitoria(nivel, VIDA_APOS_RECUAR) + 0.1,
      "recuar deixou de ter custo",
    );
  });

  it("o nível 3 é o caso difícil, e é onde o defeito apareceu", () => {
    // No começo a vida é pequena e um golpe pesa muito mais. Foi o nível em
    // que a taxa era exatamente zero.
    assert.ok(taxaDeVitoria(3, VIDA_APOS_RECUAR) > 0.5);
  });

  it("nem a PIOR de 120 corridas fica presa no começo", () => {
    /*
     * A taxa de vitória é o mecanismo; isto é a consequência, e é o que a
     * mediana esconde.
     *
     * Com o piso antigo o jogador mediano chegava ao mesmo nível dos dois
     * jeitos — o azarado é que ficava parado no nível 2 depois de 45
     * batalhas. Poço não piora a média: prende quem cai.
     *
     * 120 CORRIDAS DE 45 BATALHAS, e o tamanho não é folga. Calibrado:
     *
     *   corridas × batalhas   pior em 0,35   pior em 0,70
     *          30 × 30              6              7
     *          30 × 45              7              9
     *          60 × 45              7              9
     *         120 × 45              2              9
     *
     * Abaixo disso o defeito NÃO aparece — a cauda é de uma corrida em
     * cem. As sementes são fixas, então o resultado é reprodutível e não
     * sorteado. Encolher a amostra para economizar um segundo devolve um
     * teste que passa com o defeito dentro, que é pior que não ter teste.
     */
    let pior = Infinity;
    for (let corrida = 0; corrida < 120; corrida++) {
      pior = Math.min(pior, nivelApos(45, corrida));
    }
    assert.ok(
      pior >= 5,
      `a pior de 120 corridas parou no nível ${pior} depois de 45 batalhas`,
    );
  });
});

/** Uma corrida: vencer cura tudo, perder devolve ao piso de recuo. */
function nivelApos(batalhas: number, semente: number): number {
  let nivel = 1;
  let xp = 0;
  let fracao = 1;

  for (let i = 0; i < batalhas; i++) {
    const inteiro = criarCombatente({
      id: "heroi",
      nome: "H",
      lado: "jogador",
      ramo: 4,
      atributos: atributosDe(CLASSE, nivel),
      habilidades: habilidadesDe(CLASSE, nivel).map((h) => h.id),
    });
    const { batalha } = resolverBatalha(
      iniciarBatalha(
        [
          { ...inteiro, vida: Math.max(1, Math.round(inteiro.vidaMaxima * fracao)) },
          criarCombatente({
            id: "vilao",
            nome: "V",
            lado: "inimigo",
            ramo: 4,
            atributos: oponente(nivel),
            habilidades: habilidadesDe(4, nivel)
              .map((h) => h.id)
              .filter((h) => h !== "recompor"),
          }),
        ],
        semente * 1000 + i,
      ),
    );

    if (batalha.vencedor !== "jogador") {
      fracao = VIDA_APOS_RECUAR;
      continue;
    }
    fracao = 1;
    xp += recompensaDe(nivel, true).xp;
    while (xp >= xpParaNivel(nivel)) {
      xp -= xpParaNivel(nivel);
      nivel += 1;
    }
  }
  return nivel;
}
