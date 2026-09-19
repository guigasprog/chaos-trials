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
import { NIVEL_DA_PAREDE_BASE } from "../src/balanceamento.ts";
import { nivelDaParede } from "../src/progressao.ts";

describe("curva de XP", () => {
  it("cresce sempre", () => {
    for (let n = 1; n < 500; n++) {
      assert.ok(xpParaNivel(n + 1) > xpParaNivel(n));
    }
  });

  it("o acumulado é zero no nível 1 e cresce a partir dali", () => {
    assert.equal(paraNumero(xpAcumuladoAte(1)), 0);
    assert.ok(maiorQue(xpAcumuladoAte(100), xpAcumuladoAte(50)));
  });

  it("a aproximação pela integral bate com a soma real", () => {
    // O laço é impraticável no nível 10 milhões, então o acumulado usa a
    // integral. Aqui se confirma que ela não mente onde dá para conferir.
    let soma = 0;
    for (let n = 1; n < 400; n++) {
      soma += xpParaNivel(n);
      if (n < 50) continue;
      const erro = Math.abs(paraNumero(xpAcumuladoAte(n + 1)) - soma) / soma;
      assert.ok(erro < 0.01, `nível ${n}: integral errou ${(erro * 100).toFixed(2)}%`);
    }
  });

  it("permanece finito em níveis que só existem em camadas altas", () => {
    // Com a curva exponencial anterior, o nível 10 mil era Infinity — o que
    // fechava a porta para a parede avançar.
    for (const n of [1e3, 1e5, 1e7]) {
      assert.ok(Number.isFinite(xpParaNivel(n)), `nível ${n} estourou`);
      assert.ok(Number.isFinite(xpAcumuladoAte(n).e));
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

  it("só libera o renascimento ao chegar na parede da camada", () => {
    assert.ok(!podeRenascer(NIVEL_DA_PAREDE_BASE - 1, 0));
    assert.ok(podeRenascer(NIVEL_DA_PAREDE_BASE, 0));
    // E a parede da camada seguinte é mais longe: o que bastava antes não basta
    // mais, que é o ponto do prestígio.
    assert.ok(!podeRenascer(NIVEL_DA_PAREDE_BASE, 1));
  });

  it("recusa camada negativa ou fracionária", () => {
    assert.throws(() => multiplicadorDaCamada(-1), /camada inválida/);
    assert.throws(() => multiplicadorDaCamada(1.5), /camada inválida/);
  });
});

/**
 * Os testes que faltavam.
 *
 * Duas versões do balanceamento quebraram aqui antes de existir este bloco, e
 * nenhum outro teste pegaria: todos olham peças isoladas, e estes defeitos só
 * existem na RELAÇÃO entre duas curvas.
 */
describe("a parede, e o caminho até ela", () => {
  it("a vida começa confortável, sem ser passeio", () => {
    // Sem o deslocamento da curva do inimigo, o nível 1 dava 10.000x de
    // vantagem e a resistência real só começava lá pelo nível 50.
    for (const classe of RAIZES) {
      const r = equilibrio(classe.indice, 1, 0);
      assert.ok(r > 1.5, `${classe.nome} começa sufocado: ${r.toFixed(2)}`);
      assert.ok(r < 8, `${classe.nome} começa invencível: ${r.toFixed(2)}`);
    }
  });

  it("o inimigo alcança o jogador conforme a vida avança", () => {
    // É o oposto do que uma versão anterior deste arquivo afirmava. Sem isso
    // não existe parede, e sem parede o prestígio não tem para onde levar.
    let anterior = Infinity;
    for (const nivel of [1, 10, 25, 50, 75, 100]) {
      const r = equilibrio(4, nivel, 0);
      assert.ok(r < anterior, `nível ${nivel} não apertou em relação ao anterior`);
      anterior = r;
    }
  });

  it("na parede as duas curvas se cruzam, em qualquer camada", () => {
    for (const camada of [0, 1, 5, 10, 20, 50, 100]) {
      const nivel = Math.round(nivelDaParede(camada));
      const r = equilibrio(4, nivel, camada);
      assert.ok(
        Math.abs(r - 1) < 0.05,
        `camada ${camada}: na parede (nível ${nivel}) a razão era ${r.toFixed(3)}`,
      );
    }
  });

  it("a rampa até a parede é contínua, sem trecho intransponível", () => {
    for (const classe of RAIZES) {
      for (let nivel = 1; nivel <= NIVEL_DA_PAREDE_BASE; nivel++) {
        const r = equilibrio(classe.indice, nivel, 0);
        assert.ok(
          r >= 0.9,
          `${classe.nome} no nível ${nivel}: razão ${r.toFixed(3)} antes da parede`,
        );
      }
    }
  });

  it("cada camada empurra a parede para mais fundo", () => {
    let anterior = 0;
    for (const camada of [0, 1, 5, 10, 30, 100]) {
      const parede = nivelDaParede(camada);
      assert.ok(parede > anterior, `a camada ${camada} não avançou`);
      assert.ok(Number.isFinite(parede), `a camada ${camada} deu ${parede}`);
      anterior = parede;
    }
  });

  it("a camada nova não torna trivial o que já foi vencido — leva adiante", () => {
    // A falha da versão anterior: jogador e inimigo escalavam ambos por
    // camada, o jogador mais rápido, e na camada 35 o conteúdo já era enfeite
    // porque a vantagem composta não tinha onde ser gasta.
    const paredeAnterior = Math.round(nivelDaParede(9));
    const naParedeVelha = equilibrio(4, paredeAnterior, 10);
    const naParedeNova = equilibrio(4, Math.round(nivelDaParede(10)), 10);
    assert.ok(
      naParedeVelha > 1,
      "a parede anterior devia ficar fácil com a camada nova",
    );
    assert.ok(
      Math.abs(naParedeNova - 1) < 0.05,
      "a parede nova devia ser o novo limite",
    );
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
  it("o do jogador cresce com nível e com camada", () => {
    assert.ok(maiorQue(poderDoPersonagem(1, 50), poderDoPersonagem(1, 10)));
    assert.ok(maiorQue(poderDoPersonagem(1, 50, 5), poderDoPersonagem(1, 50, 0)));
  });

  it("o do inimigo cresce com nível e NÃO depende da camada", () => {
    // É a decisão central do modelo: a dificuldade de um nível é fixa, e o que
    // a camada muda é até onde se chega.
    assert.ok(maiorQue(poderDoInimigo(50), poderDoInimigo(10)));
    assert.equal(poderDoInimigo.length, 1, "poderDoInimigo não deve receber camada");
  });

  it("classes do mesmo ramo têm o mesmo poder de referência", () => {
    // Shadow Knight (4411) e Melee (4) compartilham o atributo do ramo.
    assert.equal(compara(poderDoPersonagem(4411, 30), poderDoPersonagem(4, 30)), 0);
  });
});
