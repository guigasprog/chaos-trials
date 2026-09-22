import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estadoInicialDoCambio,
  mesDe,
  normalizarCambio,
  registrarCompraDePremium,
  sucataNaTaxa,
  taxaDoCambio,
} from "../src/cambio.ts";
import { TAXA_BASE_DO_CAMBIO } from "../src/balanceamento.ts";

const SETEMBRO = Date.UTC(2026, 8, 15); // 2026-09-15
const OUTUBRO = Date.UTC(2026, 9, 1); // 2026-10-01

describe("mês", () => {
  it("identifica o mês em UTC, ano-mês", () => {
    assert.equal(mesDe(SETEMBRO), "2026-09");
    assert.equal(mesDe(OUTUBRO), "2026-10");
  });
});

describe("taxa", () => {
  it("sem uso nenhum e sem circulação, é o preço de tabela", () => {
    const estado = estadoInicialDoCambio(SETEMBRO);
    assert.equal(taxaDoCambio(estado, 0), TAXA_BASE_DO_CAMBIO);
  });

  it("mais comprado no mês, mais cara — o próprio uso se autolimita", () => {
    const parado = estadoInicialDoCambio(SETEMBRO);
    const usado = registrarCompraDePremium(parado, 10_000);
    assert.ok(taxaDoCambio(usado, 0) > taxaDoCambio(parado, 0));
  });

  it("mais premium em circulação, mais cara — segundo freio, independente", () => {
    const estado = estadoInicialDoCambio(SETEMBRO);
    assert.ok(taxaDoCambio(estado, 100_000) > taxaDoCambio(estado, 0));
  });

  it("nunca fica abaixo do preço de tabela", () => {
    const estado = estadoInicialDoCambio(SETEMBRO);
    assert.ok(taxaDoCambio(estado, 0) >= TAXA_BASE_DO_CAMBIO);
    // Circulação negativa não devia existir, mas não pode quebrar o piso.
    assert.ok(taxaDoCambio(estado, -50) >= TAXA_BASE_DO_CAMBIO);
  });
});

describe("o contador zera sozinho quando o mês vira", () => {
  it("mesmo mês: o contador continua", () => {
    const estado = registrarCompraDePremium(estadoInicialDoCambio(SETEMBRO), 500);
    const normalizado = normalizarCambio(estado, SETEMBRO + 1000);
    assert.equal(normalizado.premiumCompradoNoMes, 500);
  });

  it("mês seguinte: o contador volta a zero", () => {
    const estado = registrarCompraDePremium(estadoInicialDoCambio(SETEMBRO), 500);
    const normalizado = normalizarCambio(estado, OUTUBRO);
    assert.equal(normalizado.premiumCompradoNoMes, 0);
    assert.equal(normalizado.mes, "2026-10");
  });
});

describe("conversão", () => {
  it("o mesmo número nos dois sentidos — sem spread", () => {
    assert.equal(sucataNaTaxa(2000, 3), 6000);
  });

  it("arredonda", () => {
    assert.equal(sucataNaTaxa(2001, 1), 2001);
  });
});
