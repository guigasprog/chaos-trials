import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  horaDaLoja,
  itensDaLoja,
  proximaTrocaDaLojaEm,
} from "../src/loja.ts";
import { LOJA_TROCA_A_CADA_MS, PRECO_MINIMO } from "../src/balanceamento.ts";

const HORA_CHEIA = 1_700_002_800_000; // múltiplo exato de LOJA_TROCA_A_CADA_MS

describe("loja", () => {
  it("a mesma hora sempre dá a mesma prateleira", () => {
    const a = itensDaLoja(HORA_CHEIA);
    const b = itensDaLoja(HORA_CHEIA + 5_000); // segundos depois, hora igual
    assert.deepEqual(a, b);
  });

  it("horas diferentes dão prateleiras diferentes", () => {
    const agora = itensDaLoja(HORA_CHEIA);
    const depois = itensDaLoja(HORA_CHEIA + LOJA_TROCA_A_CADA_MS);
    assert.notDeepEqual(
      agora.map((i) => i.item.id),
      depois.map((i) => i.item.id),
    );
  });

  it("sempre seis vagas, todas com preço válido e moeda das duas", () => {
    const vagas = itensDaLoja(HORA_CHEIA);
    assert.equal(vagas.length, 6);
    for (const v of vagas) {
      assert.ok(v.preco >= PRECO_MINIMO, `${v.item.nome}: preço ${v.preco}`);
    }
    const moedas = new Set(vagas.map((v) => v.moeda));
    assert.ok(moedas.has("sucata"));
    assert.ok(moedas.has("premium"));
  });

  it("horaDaLoja é o piso da divisão pelo intervalo", () => {
    assert.equal(
      horaDaLoja(HORA_CHEIA + 1),
      HORA_CHEIA / LOJA_TROCA_A_CADA_MS,
    );
  });

  it("proximaTrocaDaLojaEm conta até a virada, nunca até depois dela", () => {
    const faltam = proximaTrocaDaLojaEm(HORA_CHEIA + 1);
    assert.ok(faltam > 0 && faltam <= LOJA_TROCA_A_CADA_MS);
  });
});
