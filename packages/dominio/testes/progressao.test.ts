import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RAIZES } from "../src/classe.ts";
import {
  equilibrio,
  multiplicadorDaCamada,
  podeRenascer,
  poderDoInimigo,
  poderDoPersonagem,
  xpAcumuladoAte,
  xpParaNivel,
} from "../src/progressao.ts";
import { compara, maiorQue, paraNumero } from "../src/grande.ts";
import { NIVEL_MAXIMO } from "../src/balanceamento.ts";

describe("curva de XP", () => {
  it("cresce sempre, e o acumulado bate com a soma dos níveis", () => {
    let soma = 0;
    for (let n = 1; n < 60; n++) {
      assert.ok(xpParaNivel(n + 1) > xpParaNivel(n));
      soma += xpParaNivel(n);
      // A fórmula fechada tem de dar o mesmo que somar um a um — ela existe só
      // para não empilhar 99 arredondamentos a cada vitória.
      const diferenca = Math.abs(xpAcumuladoAte(n + 1) - soma) / soma;
      assert.ok(diferenca < 1e-9, `nível ${n}: fórmula e soma divergiram`);
    }
  });

  it("recusa nível inválido", () => {
    assert.throws(() => xpParaNivel(0), /nível inválido/);
    assert.throws(() => xpAcumuladoAte(-1), /nível inválido/);
  });
});

describe("prestígio", () => {
  it("camada 0 não multiplica nada", () => {
    assert.equal(paraNumero(multiplicadorDaCamada(0)), 1);
  });

  it("cresce sem parar, muito além do inteiro seguro", () => {
    let anterior = multiplicadorDaCamada(0);
    for (const camada of [1, 10, 50, 200, 1000]) {
      const atual = multiplicadorDaCamada(camada);
      assert.ok(maiorQue(atual, anterior), `camada ${camada} não cresceu`);
      anterior = atual;
    }
  });

  it("só libera o renascimento no nível máximo", () => {
    assert.ok(!podeRenascer(NIVEL_MAXIMO - 1));
    assert.ok(podeRenascer(NIVEL_MAXIMO));
  });

  it("recusa camada negativa ou fracionária", () => {
    assert.throws(() => multiplicadorDaCamada(-1), /camada inválida/);
    assert.throws(() => multiplicadorDaCamada(1.5), /camada inválida/);
  });
});

/**
 * O teste que faltava.
 *
 * A primeira versão do balanceamento fazia o inimigo crescer exponencialmente
 * enquanto os atributos do jogador crescem linearmente. Linear não alcança
 * exponencial: no nível 70 o jogo já era impossível e no 100 o jogador estava
 * 970x atrás. Nenhum teste pegou, porque todos olhavam peças isoladas — e o
 * defeito só existe na relação entre duas curvas.
 */
describe("equilíbrio entre jogador e inimigo", () => {
  /** Abaixo disto o nível é intransponível, e não apenas difícil. */
  const PISO = 0.5;
  /**
   * Acima disto o conteúdo virou enfeite.
   *
   * 12 e não 4 porque o Tank deriva mais que os outros: `vigor` entra duas
   * vezes na vida efetiva — uma na vida máxima, outra na redução de dano —,
   * então ele cresce com expoente 2,32 contra 2,06 dos demais. É a identidade
   * da classe, e o fim da vida é justamente quando se renasce.
   */
  const TETO = 12;

  it("nenhum nível de nenhuma classe fica impossível", () => {
    for (const classe of RAIZES) {
      for (let nivel = 1; nivel <= NIVEL_MAXIMO; nivel++) {
        const r = equilibrio(classe.indice, nivel);
        assert.ok(
          r >= PISO,
          `${classe.nome} no nível ${nivel}: razão ${r.toFixed(3)} — intransponível`,
        );
        assert.ok(
          r <= TETO,
          `${classe.nome} no nível ${nivel}: razão ${r.toFixed(3)} — trivial`,
        );
      }
    }
  });

  it("subir de nível é sentido como progresso", () => {
    // O jogador tem de abrir vantagem ao longo da vida, senão o nível não
    // significa nada — mas devagar, senão o fim da vida vira passeio.
    const inicio = equilibrio(1, 5);
    const fim = equilibrio(1, NIVEL_MAXIMO);
    assert.ok(fim > inicio, "o nível 100 não estava melhor que o 5");
    assert.ok(fim / inicio < 10, "a vantagem ao longo da vida é grande demais");
  });

  it("o equilíbrio se mantém em qualquer camada, inclusive absurda", () => {
    // A razão é quase independente da camada, porque os dois lados multiplicam.
    // O que muda é o quanto o jogador avança antes de bater na parede.
    for (const camada of [0, 1, 40, 200, 1000]) {
      const r = equilibrio(1, 50, camada);
      assert.ok(
        Number.isFinite(r) && r > 0,
        `camada ${camada} produziu razão ${r}`,
      );
    }
  });

  it("cada camada deixa o jogador mais adiantado que a anterior", () => {
    // É o motor da progressão infinita: o jogador ganha 1,6 por camada e o
    // inimigo 1,45, então a diferença se acumula e cada vida chega mais longe.
    // Sem isso o prestígio seria decorativo.
    const r0 = equilibrio(1, 50, 0);
    const r10 = equilibrio(1, 50, 10);
    const r50 = equilibrio(1, 50, 50);
    assert.ok(r10 > r0, "a camada 10 não estava melhor que a 0");
    assert.ok(r50 > r10, "a camada 50 não estava melhor que a 10");
  });

  it("os cinco ramos ficam na mesma faixa — nenhum é a escolha óbvia", () => {
    const razoes = RAIZES.map((c) => equilibrio(c.indice, 50));
    const menor = Math.min(...razoes);
    const maior = Math.max(...razoes);
    assert.ok(
      maior / menor < 2.5,
      `desequilíbrio entre ramos: ${razoes.map((r) => r.toFixed(2)).join(", ")}`,
    );
  });
});

describe("poder", () => {
  it("cresce com nível e com camada", () => {
    assert.ok(maiorQue(poderDoPersonagem(1, 50), poderDoPersonagem(1, 10)));
    assert.ok(maiorQue(poderDoPersonagem(1, 50, 5), poderDoPersonagem(1, 50, 0)));
    assert.ok(maiorQue(poderDoInimigo(50), poderDoInimigo(10)));
    assert.ok(maiorQue(poderDoInimigo(50, 5), poderDoInimigo(50, 0)));
  });

  it("classes do mesmo ramo têm o mesmo poder de referência", () => {
    // Shadow Knight (4411) e Melee (4) compartilham o atributo do ramo.
    assert.equal(compara(poderDoPersonagem(4411, 30), poderDoPersonagem(4, 30)), 0);
  });
});
