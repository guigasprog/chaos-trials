import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { type Conta, type Personagem } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * A loja pela API.
 *
 * O que mais importa: comprar cobra a moeda certa, entrega a peça, e uma
 * vaga que já saiu da prateleira (hora virou) não vende mais nada.
 */

const AGORA = 1_700_002_800_000; // múltiplo exato de LOJA_TROCA_A_CADA_MS

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
  sucata: 10_000,
  mortes: 0,
  gastos: {},
  equipado: {},
  mochila: [],
  elo: 1000,
  duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
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
  const p = heroi("p1", { sucata: opcoes.sucata ?? 10_000 });
  const armazenamento = emMemoria([p], [conta("c1", ["p1"], opcoes.premium ?? 0)]);
  const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
  return {
    app,
    armazenamento,
    headers: { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` },
  };
}

async function vagas(app: FastifyInstance, headers: Record<string, string>) {
  const r = await app.inject({ method: "GET", url: "/loja", headers });
  return JSON.parse(r.body) as {
    vagas: { id: string; preco: number; moeda: string }[];
    proximaTrocaEm: number;
  };
}

describe("loja", () => {
  it("sempre seis vagas, com o tempo até a próxima troca", async () => {
    const { app, headers } = bancada();
    const r = await vagas(app, headers);
    assert.equal(r.vagas.length, 6);
    assert.ok(r.proximaTrocaEm > 0);
  });

  it("comprar em sucata cobra do personagem e entrega a peça", async () => {
    const { app, headers } = bancada();
    const { vagas: lista } = await vagas(app, headers);
    const vaga = lista.find((v) => v.moeda === "sucata")!;

    const r = await app.inject({
      method: "POST",
      url: "/loja/comprar",
      headers,
      payload: { id: vaga.id, personagem: "p1" },
    });
    assert.equal(r.statusCode, 200);
    const corpo = JSON.parse(r.body);
    assert.equal(corpo.pagou, vaga.preco);
    assert.equal(corpo.personagem.sucata, 10_000 - vaga.preco);
    assert.equal(corpo.personagem.mochila.length, 1);
  });

  it("comprar em premium cobra da CONTA, não do personagem", async () => {
    const { app, headers } = bancada({ premium: 10_000 });
    const { vagas: lista } = await vagas(app, headers);
    const vaga = lista.find((v) => v.moeda === "premium")!;

    const r = await app.inject({
      method: "POST",
      url: "/loja/comprar",
      headers,
      payload: { id: vaga.id, personagem: "p1" },
    });
    assert.equal(r.statusCode, 200);
    const corpo = JSON.parse(r.body);
    assert.equal(corpo.personagem.sucata, 10_000); // intacta
  });

  it("sem saldo, recusa dizendo os dois números", async () => {
    const { app, headers } = bancada({ sucata: 0 });
    const { vagas: lista } = await vagas(app, headers);
    const vaga = lista.find((v) => v.moeda === "sucata")!;

    const r = await app.inject({
      method: "POST",
      url: "/loja/comprar",
      headers,
      payload: { id: vaga.id, personagem: "p1" },
    });
    assert.equal(r.statusCode, 400);
    assert.match(JSON.parse(r.body).erro, new RegExp(`${vaga.preco}.*0`));
  });

  it("vaga que não existe (loja trocou) não vende", async () => {
    const { app, headers } = bancada();
    const r = await app.inject({
      method: "POST",
      url: "/loja/comprar",
      headers,
      payload: { id: "loja-99", personagem: "p1" },
    });
    assert.equal(r.statusCode, 404);
  });

  it("mochila cheia recusa a compra antes de cobrar", async () => {
    const { app, armazenamento, headers } = bancada();
    const cheio = Array.from({ length: 24 }, (_, i) => ({
      id: `x${i}`,
      encaixe: "arma" as const,
      raridade: "bruto" as const,
      nivel: 1,
      nome: `Peça ${i}`,
      atributos: { intelecto: 0, presenca: 0, destreza: 0, forca: 1, vigor: 0 },
      danoPercentual: 0,
      vidaPercentual: 0,
      criticoAdicional: 0,
      reducaoAdicional: 0,
      roubodeVida: 0,
    }));
    await armazenamento.personagens.salvar(heroi("p1", { mochila: cheio }));
    const { vagas: lista } = await vagas(app, headers);
    const vaga = lista[0];
    assert.ok(vaga);

    const r = await app.inject({
      method: "POST",
      url: "/loja/comprar",
      headers,
      payload: { id: vaga.id, personagem: "p1" },
    });
    assert.equal(r.statusCode, 409);
  });

  it("a rota exige sessão", async () => {
    const { app } = bancada();
    const r = await app.inject({ method: "GET", url: "/loja" });
    assert.equal(r.statusCode, 401);
  });
});
