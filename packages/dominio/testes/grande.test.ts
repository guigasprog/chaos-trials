import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compara,
  deMantissa,
  divide,
  grande,
  igual,
  maiorQue,
  paraNumero,
  potencia,
  produto,
  soma,
  subtrai,
  texto,
  UM,
  ZERO,
} from "../src/grande.ts";

/**
 * A estratégia: dentro da faixa segura do `double`, conferir contra a
 * aritmética nativa, que é a referência. Fora dela, onde não há referência,
 * conferir propriedades que têm de valer de qualquer jeito — normalização,
 * comutatividade, ordem.
 */

/** Tolera o ruído inevitável de ponto flutuante, comparando em proporção. */
function perto(a: number, b: number, tolerancia = 1e-9): void {
  if (a === b) return;
  const escala = Math.max(Math.abs(a), Math.abs(b));
  assert.ok(
    Math.abs(a - b) / escala < tolerancia,
    `esperava ~${b}, veio ${a}`,
  );
}

function estaNormalizado(g: { m: number; e: number }): boolean {
  if (g.m === 0) return g.e === 0;
  return Math.abs(g.m) >= 1 && Math.abs(g.m) < 10;
}

describe("normalização", () => {
  it("põe a mantissa em 1..10 para números comuns", () => {
    for (const n of [1, 9.99, 10, 1000, 1e17, 0.5, 0.001, -42, -1e9]) {
      assert.ok(estaNormalizado(grande(n)), `${n} saiu desnormalizado`);
    }
  });

  it("acerta as potências exatas de dez, onde o log10 erra sozinho", () => {
    // Math.log10(1000) pode devolver 2,9999999999999996. Sem a correção a
    // mantissa ficaria em 10 e toda comparação passaria a depender de como o
    // número foi construído.
    for (let e = 0; e <= 20; e++) {
      const g = grande(10 ** e);
      assert.equal(g.e, e, `10^${e} caiu no expoente ${g.e}`);
      perto(g.m, 1);
    }
  });

  it("trata zero, infinito e NaN como zero", () => {
    for (const n of [0, -0, Infinity, -Infinity, NaN]) {
      assert.deepEqual(grande(n), ZERO);
    }
  });
});

describe("soma", () => {
  it("bate com a soma nativa dentro da faixa segura", () => {
    const casos: [number, number][] = [
      [1, 1],
      [1234, 5678],
      [0.5, 0.25],
      [1e15, 1],
      [-5, 3],
      [-5, -3],
      [7, -7],
    ];
    for (const [a, b] of casos) {
      perto(paraNumero(soma(grande(a), grande(b))), a + b);
    }
  });

  it("é comutativa mesmo muito longe da faixa segura", () => {
    const a = deMantissa(3.7, 200);
    const b = deMantissa(9.1, 197);
    assert.ok(igual(soma(a, b), soma(b, a)));
  });

  it("ignora a parcela que não caberia na precisão do double", () => {
    const enorme = deMantissa(1, 100);
    // 10^100 + 1 é 10^100 num double. Somar mesmo assim só adicionaria ruído.
    assert.ok(igual(soma(enorme, UM), enorme));
  });

  it("zero é neutro dos dois lados", () => {
    const a = deMantissa(4.2, 33);
    assert.ok(igual(soma(a, ZERO), a));
    assert.ok(igual(soma(ZERO, a), a));
  });

  it("devolve zero quando os opostos se cancelam", () => {
    const a = deMantissa(6.6, 40);
    assert.ok(igual(subtrai(a, a), ZERO));
  });
});

describe("produto e divisão", () => {
  it("batem com o nativo dentro da faixa segura", () => {
    const casos: [number, number][] = [
      [2, 3],
      [1e8, 1e8],
      [0.5, 0.5],
      [-4, 2.5],
      [-4, -2.5],
    ];
    for (const [a, b] of casos) {
      perto(paraNumero(produto(grande(a), grande(b))), a * b);
      perto(paraNumero(divide(grande(a), grande(b))), a / b);
    }
  });

  it("somam expoentes bem além do que um double aguentaria", () => {
    const r = produto(deMantissa(2, 400), deMantissa(3, 400));
    assert.equal(r.e, 800);
    perto(r.m, 6);
  });

  it("multiplicar por zero dá zero, e dividir por zero explode", () => {
    assert.ok(igual(produto(deMantissa(5, 50), ZERO), ZERO));
    assert.throws(() => divide(UM, ZERO), /divisão por zero/);
  });
});

describe("potência", () => {
  it("bate com o nativo onde dá para comparar", () => {
    perto(paraNumero(potencia(grande(1.6), 20)), 1.6 ** 20);
    perto(paraNumero(potencia(grande(2), 10)), 1024);
  });

  it("sustenta a curva de prestígio muito além do inteiro seguro", () => {
    // Os dois números que a spec afirma: a camada em que o multiplicador
    // sozinho passa do inteiro seguro, e uma bem acima dela.
    assert.ok(paraNumero(potencia(grande(1.6), 78)) < Number.MAX_SAFE_INTEGER);
    assert.ok(paraNumero(potencia(grande(1.6), 79)) > Number.MAX_SAFE_INTEGER);

    // O expoente é inteiro e a mantissa carrega o resto, então a conferência
    // tem de ser sobre o logaritmo inteiro do número, não sobre `e` sozinho.
    const camada400 = potencia(grande(1.6), 400);
    assert.ok(estaNormalizado(camada400));
    perto(Math.log10(camada400.m) + camada400.e, 400 * Math.log10(1.6), 1e-9);
  });

  it("expoente zero é um, e negativo na base alterna o sinal", () => {
    assert.ok(igual(potencia(deMantissa(7, 77), 0), UM));
    assert.ok(paraNumero(potencia(grande(-2), 3)) < 0);
    assert.ok(paraNumero(potencia(grande(-2), 4)) > 0);
  });

  it("recusa expoente fracionário em vez de devolver lixo", () => {
    assert.throws(() => potencia(grande(2), 0.5), /inteiro/);
  });
});

describe("comparação", () => {
  it("ordena corretamente, inclusive com sinais misturados", () => {
    const valores = [
      deMantissa(-5, 300),
      deMantissa(-1, 2),
      ZERO,
      grande(0.5),
      grande(7),
      deMantissa(1, 50),
      deMantissa(9.9, 50),
      deMantissa(1, 51),
    ];
    const embaralhado = [...valores].reverse();
    embaralhado.sort(compara);
    assert.deepEqual(embaralhado, valores);
  });

  it("entre negativos, expoente maior é valor menor", () => {
    assert.ok(maiorQue(deMantissa(-1, 2), deMantissa(-1, 9)));
  });

  it("desempata pela mantissa quando o expoente é o mesmo", () => {
    assert.ok(maiorQue(deMantissa(9.9, 50), deMantissa(1.1, 50)));
  });
});

describe("texto", () => {
  it("escreve por extenso enquanto o número é legível de relance", () => {
    assert.equal(texto(grande(0)), "0");
    assert.equal(texto(grande(42)), "42");
    // Num RPG por turnos se lê dano exato: 1234 informa mais que "1,23 mil".
    assert.equal(texto(grande(1234)), "1234");
    assert.equal(texto(grande(9999)), "9999");
  });

  it("passa a sufixo curto onde o extenso deixa de ser legível", () => {
    assert.equal(texto(grande(10_000)), "10,00 mil");
    assert.equal(texto(deMantissa(1.42, 6)), "1,42 M");
    assert.equal(texto(deMantissa(3.5, 9)), "3,50 B");
    assert.equal(texto(deMantissa(9.99, 12)), "9,99 T");
  });

  it("cai para notação científica quando o sufixo acabaria", () => {
    assert.equal(texto(deMantissa(3.8, 17)), "3,80e17");
    assert.equal(texto(deMantissa(1, 400)), "1,00e400");
  });
});

describe("paraNumero", () => {
  it("avisa com Infinity em vez de mentir um número errado", () => {
    assert.equal(paraNumero(deMantissa(1, 400)), Infinity);
    assert.equal(paraNumero(deMantissa(-1, 400)), -Infinity);
  });
});
