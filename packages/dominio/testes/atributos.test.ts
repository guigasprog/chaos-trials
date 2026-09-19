import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ATRIBUTO_DO_RAMO,
  ATRIBUTOS,
  atributosDe,
  atributosIniciais,
  chanceDeCritico,
  escalar,
  ganhoPorNivel,
  iniciativa,
  reducaoDeDano,
  somar,
  vidaMaxima,
} from "../src/atributos.ts";
import { CLASSES, RAIZES, ramoDe } from "../src/classe.ts";

describe("atributos iniciais", () => {
  it("dão ao ramo o seu atributo, e só a ele", () => {
    for (const raiz of RAIZES) {
      const a = atributosIniciais(raiz.indice);
      const favorecido = ATRIBUTO_DO_RAMO[ramoDe(raiz.indice)];
      for (const nome of ATRIBUTOS) {
        if (nome === favorecido) {
          assert.ok(a[nome] > a[nome === "forca" ? "vigor" : "forca"]);
        }
      }
      assert.equal(a[favorecido], 9);
    }
  });

  it("valem para qualquer profundidade, não só para as raízes", () => {
    // Shadow Knight (4411) é do ramo Melee e tem de favorecer força como o
    // Melee raiz — a identidade vem do ramo, não da folha.
    assert.equal(ATRIBUTO_DO_RAMO[ramoDe(4411)], "forca");
    assert.equal(atributosIniciais(4411).forca, 9);
  });
});

describe("progressão por nível", () => {
  it("nível 1 é exatamente o inicial", () => {
    for (const c of CLASSES) {
      assert.deepEqual(atributosDe(c.indice, 1), atributosIniciais(c.indice));
    }
  });

  it("cresce linearmente, e o atributo do ramo cresce mais", () => {
    const n1 = atributosDe(1, 1);
    const n11 = atributosDe(1, 11);
    // Dez níveis: +1 por nível em tudo, +3 no intelecto (ramo Wise).
    assert.equal(n11.forca - n1.forca, 10);
    assert.equal(n11.intelecto - n1.intelecto, 30);
  });

  it("no nível máximo o ramo abriu vantagem clara", () => {
    const a = atributosDe(1, 100);
    assert.ok(a.intelecto > a.forca * 2);
  });

  it("recusa nível inválido em vez de devolver número negativo", () => {
    assert.throws(() => atributosDe(1, 0), /nível inválido/);
    assert.throws(() => atributosDe(1, -5), /nível inválido/);
  });
});

describe("aritmética", () => {
  it("somar e escalar percorrem os cinco atributos", () => {
    const a = atributosDe(1, 10);
    const dobro = somar(a, a);
    const escalado = escalar(a, 2);
    assert.deepEqual(dobro, escalado);
    // Guarda contra esquecer um campo ao adicionar atributo novo.
    for (const nome of ATRIBUTOS) {
      assert.equal(dobro[nome], a[nome] * 2, `${nome} ficou de fora`);
    }
  });

  it("ganhoPorNivel é o mesmo para todo o ramo", () => {
    assert.deepEqual(ganhoPorNivel(4), ganhoPorNivel(4411));
  });
});

describe("derivados", () => {
  it("vida máxima sobe com vigor, e o Tank aguenta mais", () => {
    const tank = vidaMaxima(atributosDe(5, 50));
    const mago = vidaMaxima(atributosDe(1, 50));
    assert.ok(tank > mago, "Tank tinha de ter mais vida que Wise");
  });

  it("a redução de dano nunca chega a 100%", () => {
    // Curva de saturação: linear alcançaria o total e o personagem viraria
    // invulnerável, que é o jeito mais rápido de quebrar um jogo de escala
    // infinita.
    for (const vigor of [0, 50, 200, 1e4, 1e9]) {
      const r = reducaoDeDano({
        intelecto: 0,
        presenca: 0,
        destreza: 0,
        forca: 0,
        vigor,
      });
      assert.ok(r >= 0 && r < 1, `vigor ${vigor} deu redução ${r}`);
    }
    assert.equal(
      reducaoDeDano({ intelecto: 0, presenca: 0, destreza: 0, forca: 0, vigor: 0 }),
      0,
    );
  });

  it("o crítico tem teto, por mais destreza que haja", () => {
    for (const destreza of [0, 300, 1e6, 1e12]) {
      const c = chanceDeCritico({
        intelecto: 0,
        presenca: 0,
        destreza,
        forca: 0,
        vigor: 0,
      });
      assert.ok(c >= 0 && c <= 0.5, `destreza ${destreza} deu crítico ${c}`);
    }
  });

  it("a iniciativa é a destreza", () => {
    const a = atributosDe(3, 20);
    assert.equal(iniciativa(a), a.destreza);
  });
});
