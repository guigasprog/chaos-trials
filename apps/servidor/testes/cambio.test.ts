import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type Conta,
  type Personagem,
  TAXA_BASE_DO_CAMBIO,
} from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Cambio } from "../src/cambio.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * A bolsa pela API.
 *
 * O que mais importa: NENHUMA moeda nasce do nada — comprar debita
 * sucata do personagem exatamente o que credita de premium na conta, e
 * vice-versa —, e comprar (não vender) encarece a bolsa para a próxima
 * compra.
 */

const AGORA = Date.UTC(2026, 8, 15);

const heroi = (id: string, extra: Partial<Personagem> = {}): Personagem => ({
  id,
  nome: `Herói ${id}`,
  classe: 4,
  nivel: 30,
  xp: 0,
  camada: 0,
  estado: "vivo",
  vida: 900,
  visto: AGORA,
  sucata: 10_000_000,
  mortes: 0,
  gastos: {},
  equipado: {},
  mochila: [],
  elo: 1000,
  duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
  dificuldade: "medio",
  vidasRestantes: 2,
  vidasGuardadas: 0,
  ...extra,
});

const conta = (id: string, personagens: string[], premium = 0): Conta => ({
  id,
  email: `${id}@t.com`,
  senha: "(direto)",
  criadaEm: AGORA,
  visto: AGORA,
  premium,
  slotsComprados: 10,
  personagens,
});

function bancada(opcoes: { sucata?: number; premium?: number } = {}) {
  const sessoes = new Sessoes();
  const cambio = new Cambio(AGORA);
  const p = heroi("p1", { sucata: opcoes.sucata ?? 10_000_000 });
  const armazenamento = emMemoria([p], [conta("c1", ["p1"], opcoes.premium ?? 0)]);
  const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes, cambio });
  return {
    app,
    armazenamento,
    cambio,
    headers: { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` },
  };
}

describe("bolsa — consulta", () => {
  it("sem uso nenhum, a taxa é o preço de tabela", async () => {
    const { app, headers } = bancada();
    const r = await app.inject({ method: "GET", url: "/cambio", headers });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().taxa, TAXA_BASE_DO_CAMBIO);
  });

  it("exige sessão", async () => {
    const { app } = bancada();
    const r = await app.inject({ method: "GET", url: "/cambio" });
    assert.equal(r.statusCode, 401);
  });
});

describe("bolsa — comprar premium com sucata", () => {
  it("debita sucata do PERSONAGEM e credita premium na CONTA — nada nasce do nada", async () => {
    const { app, headers } = bancada();
    const r = await app.inject({
      method: "POST",
      url: "/cambio/comprar",
      headers,
      payload: { personagem: "p1", premium: 5 },
    });
    assert.equal(r.statusCode, 200, r.body);
    const corpo = r.json();
    assert.equal(corpo.recebeu, 5);
    assert.equal(corpo.pagou, 5 * TAXA_BASE_DO_CAMBIO);
    assert.equal(corpo.conta.premium, 5);

    const p = await app.inject({ method: "GET", url: "/personagens/p1", headers });
    assert.equal(p.json().sucata, 10_000_000 - 5 * TAXA_BASE_DO_CAMBIO);
  });

  it("sem sucata suficiente, recusa dizendo os dois números", async () => {
    const { app, headers } = bancada({ sucata: 100 });
    const r = await app.inject({
      method: "POST",
      url: "/cambio/comprar",
      headers,
      payload: { personagem: "p1", premium: 1 },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, new RegExp(`${TAXA_BASE_DO_CAMBIO}.*100`));
  });

  it("comprar encarece a PRÓXIMA compra — o freio de volume", async () => {
    const { app, headers } = bancada();
    const primeira = await app.inject({
      method: "POST",
      url: "/cambio/comprar",
      headers,
      payload: { personagem: "p1", premium: 5000 },
    });
    const taxaDepois = await app.inject({ method: "GET", url: "/cambio", headers });
    assert.ok(taxaDepois.json().taxa > primeira.json().taxa);
  });

  it("quantidade inválida é recusada", async () => {
    const { app, headers } = bancada();
    for (const premium of [0, -1, 1.5]) {
      const r = await app.inject({
        method: "POST",
        url: "/cambio/comprar",
        headers,
        payload: { personagem: "p1", premium },
      });
      assert.equal(r.statusCode, 400, `premium=${premium} devia recusar`);
    }
  });
});

describe("bolsa — vender premium por sucata", () => {
  it("debita premium da CONTA e credita sucata no PERSONAGEM", async () => {
    const { app, headers } = bancada({ premium: 10 });
    const r = await app.inject({
      method: "POST",
      url: "/cambio/vender",
      headers,
      payload: { personagem: "p1", premium: 4 },
    });
    assert.equal(r.statusCode, 200, r.body);
    const corpo = r.json();
    assert.equal(corpo.pagou, 4);
    assert.equal(corpo.recebeu, 4 * TAXA_BASE_DO_CAMBIO);
    assert.equal(corpo.conta.premium, 6);
    assert.equal(corpo.personagem.sucata, 10_000_000 + 4 * TAXA_BASE_DO_CAMBIO);
  });

  it("sem premium suficiente, recusa", async () => {
    const { app, headers } = bancada({ premium: 2 });
    const r = await app.inject({
      method: "POST",
      url: "/cambio/vender",
      headers,
      payload: { personagem: "p1", premium: 3 },
    });
    assert.equal(r.statusCode, 400);
  });

  it("vender não alimenta o contador de compras do mês — só comprar alimenta", async () => {
    // A taxa em si PODE mudar depois de vender: a conta tem menos premium
    // circulando, e o freio de circulação reage a isso — de propósito. O
    // que vender não pode fazer é mexer no freio de VOLUME, que é o que
    // este teste isola.
    const { app, headers } = bancada({ premium: 100 });
    await app.inject({
      method: "POST",
      url: "/cambio/vender",
      headers,
      payload: { personagem: "p1", premium: 50 },
    });
    const r = await app.inject({ method: "GET", url: "/cambio", headers });
    assert.equal(r.json().premiumCompradoNoMes, 0);
  });
});

describe("bolsa — circulação", () => {
  it("mais premium acumulado nas contas encarece a bolsa pra todo mundo", async () => {
    const sessoes = new Sessoes();
    const rico = heroi("p1", { sucata: 10_000_000 });
    const pobre = heroi("p2", { sucata: 10_000_000 });
    const armazenamento = emMemoria(
      [rico, pobre],
      [conta("c1", ["p1"], 1_000_000), conta("c2", ["p2"], 0)],
    );
    const app = criarAplicacao({
      armazenamento,
      agora: () => AGORA,
      sessoes,
      cambio: new Cambio(AGORA),
    });
    const headers = { authorization: `Bearer ${sessoes.abrir("c2", AGORA)}` };
    const r = await app.inject({ method: "GET", url: "/cambio", headers });
    assert.ok(r.json().taxa > TAXA_BASE_DO_CAMBIO);
  });
});
