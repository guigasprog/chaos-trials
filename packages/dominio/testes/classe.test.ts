import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ancestraisDe,
  CLASSES,
  classePorIndice,
  descendeDe,
  descendentesDe,
  existeClasse,
  filhosDe,
  profundidadeDe,
  RAIZES,
  ramoDe,
  trilhaDe,
} from "../src/classe.ts";

describe("integridade do catálogo", () => {
  it("não tem índice repetido", () => {
    const vistos = new Set(CLASSES.map((c) => c.indice));
    assert.equal(vistos.size, CLASSES.length);
  });

  it("todo pai declarado existe", () => {
    for (const c of CLASSES) {
      if (c.pai === 0) continue;
      assert.ok(existeClasse(c.pai), `${c.nome} aponta para pai inexistente`);
    }
  });

  it("tem exatamente cinco raízes", () => {
    assert.equal(RAIZES.length, 5);
    assert.deepEqual(
      RAIZES.map((c) => c.nome),
      ["Wise", "Support", "Ranger", "Melee", "Tank"],
    );
  });

  it("toda classe alcança uma raiz subindo", () => {
    for (const c of CLASSES) {
      const linha = ancestraisDe(c.indice);
      if (c.pai === 0) {
        assert.equal(linha.length, 0, `${c.nome} é raiz e teria ancestral`);
      } else {
        assert.equal(linha.at(-1)?.pai, 0, `${c.nome} não chega a uma raiz`);
      }
    }
  });

  it("nunca passa de quatro níveis", () => {
    for (const c of CLASSES) {
      assert.ok(profundidadeDe(c.indice) <= 4, `${c.nome} está fundo demais`);
    }
  });
});

describe("o índice codifica a hierarquia", () => {
  it("o índice do filho começa com o do pai", () => {
    // É a invariante que sustenta o desenho inteiro: quebrada, `ramoDe` e
    // `profundidadeDe` passam a mentir sem levantar erro.
    for (const c of CLASSES) {
      if (c.pai === 0) continue;
      assert.ok(
        String(c.indice).startsWith(String(c.pai)),
        `${c.nome} (${c.indice}) não continua o pai ${c.pai}`,
      );
    }
  });

  it("a profundidade é a contagem de dígitos", () => {
    assert.equal(profundidadeDe(1), 1);
    assert.equal(profundidadeDe(11), 2);
    assert.equal(profundidadeDe(111), 3);
    assert.equal(profundidadeDe(1111), 4);
  });

  it("o ramo é o primeiro dígito, em toda a descendência", () => {
    for (const raiz of RAIZES) {
      for (const d of descendentesDe(raiz.indice)) {
        assert.equal(ramoDe(d.indice), raiz.indice);
      }
    }
  });
});

describe("navegação", () => {
  it("filhosDe traz só os diretos", () => {
    // O Java resolvia isto por prefixo de string, e `getChildIndices(1)`
    // devolvia a própria Wise mais todos os descendentes.
    assert.deepEqual(
      filhosDe(11).map((c) => c.nome),
      ["Archmage", "Spellblade", "Warlock"],
    );
    assert.deepEqual(
      filhosDe(111).map((c) => c.nome),
      ["Grandmaster", "Elemental Lord"],
    );
    assert.deepEqual(filhosDe(1111), []);
  });

  it("descendentesDe traz a subárvore inteira, sem a própria classe", () => {
    const nomes = descendentesDe(11)
      .map((c) => c.nome)
      .sort();
    assert.deepEqual(nomes, [
      "Archmage",
      "Elemental Lord",
      "Grandmaster",
      "Spellblade",
      "Warlock",
    ]);
    assert.ok(!nomes.includes("Mage"));
  });

  it("ancestraisDe sobe do pai até a raiz, nessa ordem", () => {
    assert.deepEqual(
      ancestraisDe(1111).map((c) => c.nome),
      ["Archmage", "Mage", "Wise"],
    );
    assert.deepEqual(ancestraisDe(1), []);
  });

  it("trilhaDe desce da raiz até a classe, incluindo ela", () => {
    assert.deepEqual(
      trilhaDe(4411).map((c) => c.nome),
      ["Melee", "Rogue", "Assassin", "Shadow Knight"],
    );
  });

  it("descendeDe reconhece a linhagem e rejeita ramo alheio", () => {
    assert.ok(descendeDe(1111, 1));
    assert.ok(descendeDe(1111, 11));
    assert.ok(descendeDe(1111, 1111), "uma classe descende de si mesma");
    assert.ok(!descendeDe(1111, 2));
    assert.ok(!descendeDe(11, 111), "o pai não descende do filho");
  });
});

describe("bordas", () => {
  it("índice inexistente falha alto, em vez de devolver indefinido", () => {
    assert.throws(() => classePorIndice(999), /classe inexistente/);
    assert.equal(existeClasse(999), false);
  });

  it("o Tank começa em 53, e a numeração salteada não atrapalha", () => {
    // Não existem 51 nem 52; o índice precisa só ser único e continuar o pai.
    assert.deepEqual(
      filhosDe(5).map((c) => c.indice),
      [53, 54, 55, 56],
    );
    assert.equal(ramoDe(56), 5);
  });
});
