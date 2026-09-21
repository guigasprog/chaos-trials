import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import {
  ANUNCIOS_POR_CONTA,
  type Conta,
  contaDaVenda,
  type Item,
  MOCHILA_MAXIMA,
  type Personagem,
} from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * O mercado pela API.
 *
 * A propriedade que mais importa aqui não é "a compra funciona": é que
 * NENHUMA moeda é criada. Economia fechada não sobrevive a um caminho
 * esquecido que soma.
 */

const AGORA = 1_700_000_000_000;

const peca = (id: string, forca = 20): Item => ({
  id,
  encaixe: "arma",
  raridade: "vitral",
  nivel: 30,
  nome: `Lâmina ${id}`,
  atributos: { intelecto: 0, presenca: 0, destreza: 0, forca, vigor: 0 },
  danoPercentual: 0.1,
  vidaPercentual: 0,
  criticoAdicional: 0,
  reducaoAdicional: 0,
  roubodeVida: 0,
});

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
  sucata: 0,
  mortes: 0,
  gastos: {},
  equipado: {},
  mochila: [],
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

/** Duas contas, cada uma com um personagem — é o mínimo para haver troca. */
function bancada(opcoes: {
  vendedorMochila?: Item[];
  compradorSucata?: number;
  compradorPremium?: number;
  vendedorPremium?: number;
} = {}) {
  const sessoes = new Sessoes();
  const vendedor = heroi("pv", { mochila: opcoes.vendedorMochila ?? [peca("x1")] });
  const comprador = heroi("pc", { sucata: opcoes.compradorSucata ?? 10_000 });
  const armazenamento = emMemoria(
    [vendedor, comprador],
    [
      conta("cv", ["pv"], opcoes.vendedorPremium ?? 0),
      conta("cc", ["pc"], opcoes.compradorPremium ?? 0),
    ],
  );
  const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
  return {
    app,
    armazenamento,
    vendedor: { headers: { authorization: `Bearer ${sessoes.abrir("cv", AGORA)}` } },
    comprador: { headers: { authorization: `Bearer ${sessoes.abrir("cc", AGORA)}` } },
  };
}

async function anunciar(
  app: FastifyInstance,
  headers: Record<string, string>,
  corpo: Record<string, unknown>,
) {
  return app.inject({ method: "POST", url: "/mercado", headers, payload: corpo });
}

/** Soma toda a moeda do mundo. É o invariante da economia fechada. */
async function moedaTotal(a: ReturnType<typeof bancada>["armazenamento"]) {
  const contas = await a.contas.listar();
  const personagens = await a.personagens.listar();
  return {
    premium: contas.reduce((s, c) => s + c.premium, 0),
    sucata: personagens.reduce((s, p) => s + p.sucata, 0),
  };
}

describe("anunciar", () => {
  it("a peça SAI da mochila na hora", async () => {
    // Em custódia, e não marcada como "à venda" dentro da mochila: lá,
    // daria para anunciar, vestir, desmanchar e ainda receber pela venda.
    const { app, vendedor } = bancada();
    const r = await anunciar(app, vendedor.headers, {
      personagem: "pv",
      item: "x1",
      preco: 500,
      moeda: "sucata",
    });
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().personagem.mochila.length, 0);
    assert.equal(r.json().anuncio.preco, 500);
    await app.close();
  });

  it("o anúncio diz o dízimo e o líquido ANTES de vender", async () => {
    // Descobrir a taxa depois da venda é a forma mais rápida de perder
    // confiança num mercado.
    const { app, vendedor } = bancada();
    const a = (
      await anunciar(app, vendedor.headers, {
        personagem: "pv",
        item: "x1",
        preco: 1000,
        moeda: "sucata",
      })
    ).json().anuncio;
    const esperado = contaDaVenda(1000);
    assert.equal(a.dizimo, esperado.dizimo);
    assert.equal(a.aoVendedor, esperado.aoVendedor);
    await app.close();
  });

  it("peça que não está na mochila não vira anúncio", async () => {
    const { app, vendedor } = bancada();
    const r = await anunciar(app, vendedor.headers, {
      personagem: "pv",
      item: "lamina-inventada",
      preco: 100,
      moeda: "sucata",
    });
    assert.equal(r.statusCode, 404);
    await app.close();
  });

  it("preço fora da faixa é recusado", async () => {
    const { app, vendedor } = bancada();
    for (const preco of [0, -5, 1e12, 10.5]) {
      const r = await anunciar(app, vendedor.headers, {
        personagem: "pv",
        item: "x1",
        preco,
        moeda: "sucata",
      });
      assert.equal(r.statusCode, 400, `preço ${preco}`);
    }
    await app.close();
  });

  it("há teto de anúncios abertos por conta", async () => {
    const { app, vendedor } = bancada({
      vendedorMochila: Array.from({ length: ANUNCIOS_POR_CONTA + 2 }, (_, i) =>
        peca(`x${i}`),
      ),
    });
    for (let i = 0; i < ANUNCIOS_POR_CONTA; i++) {
      const r = await anunciar(app, vendedor.headers, {
        personagem: "pv",
        item: `x${i}`,
        preco: 100,
        moeda: "sucata",
      });
      assert.equal(r.statusCode, 201, r.body);
    }
    const excedente = await anunciar(app, vendedor.headers, {
      personagem: "pv",
      item: `x${ANUNCIOS_POR_CONTA}`,
      preco: 100,
      moeda: "sucata",
    });
    assert.equal(excedente.statusCode, 409);
    await app.close();
  });
});

describe("comprar", () => {
  async function comAnuncio(
    opcoes: Parameters<typeof bancada>[0] = {},
    preco = 500,
    moeda = "sucata",
  ) {
    const b = bancada(opcoes);
    const anuncio = (
      await anunciar(b.app, b.vendedor.headers, {
        personagem: "pv",
        item: "x1",
        preco,
        moeda,
      })
    ).json().anuncio;
    return { ...b, anuncio };
  }

  it("a peça troca de dono e a moeda troca de bolso", async () => {
    const { app, anuncio, comprador, armazenamento } = await comAnuncio();
    const r = await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: comprador.headers,
      payload: { personagem: "pc" },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().personagem.mochila[0].id, "x1");
    assert.equal(r.json().personagem.sucata, 10_000 - 500);

    const pv = await armazenamento.personagens.buscar("pv");
    assert.equal(pv!.sucata, contaDaVenda(500).aoVendedor);
    await app.close();
  });

  it("NENHUMA moeda é criada — a venda destrói", async () => {
    /*
     * O invariante da economia fechada. Moeda entra no mundo de um jeito
     * só — alguém comprou com dinheiro de verdade — e nunca sai. Uma
     * venda move e destrói; nunca soma.
     */
    const { app, anuncio, comprador, armazenamento } = await comAnuncio();
    const antes = await moedaTotal(armazenamento);

    await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: comprador.headers,
      payload: { personagem: "pc" },
    });

    const depois = await moedaTotal(armazenamento);
    assert.equal(depois.premium, antes.premium, "premium apareceu do nada");
    assert.equal(
      depois.sucata,
      antes.sucata - contaDaVenda(500).dizimo,
      "a sucata total não caiu exatamente o dízimo",
    );
    await app.close();
  });

  it("em premium, sai da CONTA e entra na conta do vendedor", async () => {
    const { app, anuncio, comprador, armazenamento } = await comAnuncio(
      { compradorPremium: 1000 },
      200,
      "premium",
    );
    const antes = await moedaTotal(armazenamento);

    const r = await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: comprador.headers,
      payload: { personagem: "pc" },
    });
    assert.equal(r.statusCode, 200, r.body);

    const depois = await moedaTotal(armazenamento);
    assert.equal(depois.premium, antes.premium - contaDaVenda(200).dizimo);
    assert.equal(
      (await armazenamento.contas.buscar("cv"))!.premium,
      contaDaVenda(200).aoVendedor,
    );
    // A sucata do comprador não foi tocada: são moedas separadas.
    assert.equal(r.json().personagem.sucata, 10_000);
    await app.close();
  });

  it("sem saldo, recusa dizendo os dois números", async () => {
    const { app, anuncio, comprador } = await comAnuncio({ compradorSucata: 10 });
    const r = await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: comprador.headers,
      payload: { personagem: "pc" },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /custa 500 e você tem 10/);
    await app.close();
  });

  it("ninguém compra o próprio anúncio", async () => {
    // Não é troca: é mover sucata entre personagens da mesma conta,
    // pagando só o dízimo — e a sucata é do personagem de propósito.
    const { app, anuncio, vendedor } = await comAnuncio();
    const r = await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: vendedor.headers,
      payload: { personagem: "pv" },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /próprio anúncio/);
    await app.close();
  });

  it("o mesmo anúncio não vende duas vezes", async () => {
    const { app, anuncio, comprador, armazenamento } = await comAnuncio();
    const primeira = await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: comprador.headers,
      payload: { personagem: "pc" },
    });
    assert.equal(primeira.statusCode, 200);

    const segunda = await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: comprador.headers,
      payload: { personagem: "pc" },
    });
    assert.equal(segunda.statusCode, 409);

    // E não duplicou a peça nem cobrou de novo.
    const pc = await armazenamento.personagens.buscar("pc");
    assert.equal(pc!.mochila.filter((i) => i.id === "x1").length, 1);
    assert.equal(pc!.sucata, 10_000 - 500);
    await app.close();
  });

  it("mochila cheia recusa a compra antes de cobrar", async () => {
    const { app, anuncio, comprador, armazenamento } = await comAnuncio();
    const pc = (await armazenamento.personagens.buscar("pc"))!;
    await armazenamento.personagens.salvar({
      ...pc,
      mochila: Array.from({ length: MOCHILA_MAXIMA }, (_, i) => peca(`c${i}`)),
    });

    const r = await app.inject({
      method: "POST",
      url: `/mercado/${anuncio.id}/comprar`,
      headers: comprador.headers,
      payload: { personagem: "pc" },
    });
    assert.equal(r.statusCode, 409);
    assert.equal((await armazenamento.personagens.buscar("pc"))!.sucata, 10_000);
    await app.close();
  });
});

describe("retirar", () => {
  it("a peça volta para a mochila de quem anunciou", async () => {
    const { app, vendedor, armazenamento } = bancada();
    const anuncio = (
      await anunciar(app, vendedor.headers, {
        personagem: "pv",
        item: "x1",
        preco: 500,
        moeda: "sucata",
      })
    ).json().anuncio;

    const r = await app.inject({
      method: "DELETE",
      url: `/mercado/${anuncio.id}`,
      headers: vendedor.headers,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal((await armazenamento.personagens.buscar("pv"))!.mochila.length, 1);

    // E some da vitrine.
    const vitrine = (
      await app.inject({ method: "GET", url: "/mercado", headers: vendedor.headers })
    ).json();
    assert.equal(vitrine.anuncios.length, 0);
    await app.close();
  });

  it("o anúncio de outra pessoa simplesmente não existe", async () => {
    // 404 e não 403, como no personagem: "existe, mas não é seu" conta a
    // quem chuta ids quais existem.
    const { app, vendedor, comprador } = bancada();
    const anuncio = (
      await anunciar(app, vendedor.headers, {
        personagem: "pv",
        item: "x1",
        preco: 500,
        moeda: "sucata",
      })
    ).json().anuncio;

    const r = await app.inject({
      method: "DELETE",
      url: `/mercado/${anuncio.id}`,
      headers: comprador.headers,
    });
    assert.equal(r.statusCode, 404);
    await app.close();
  });
});

describe("vitrine", () => {
  it("mostra os anúncios abertos e marca os meus", async () => {
    const { app, vendedor, comprador } = bancada();
    await anunciar(app, vendedor.headers, {
      personagem: "pv",
      item: "x1",
      preco: 500,
      moeda: "sucata",
    });

    const doVendedor = (
      await app.inject({ method: "GET", url: "/mercado", headers: vendedor.headers })
    ).json();
    assert.equal(doVendedor.anuncios[0].meu, true);
    assert.equal(doVendedor.meus.length, 1);

    const doComprador = (
      await app.inject({ method: "GET", url: "/mercado", headers: comprador.headers })
    ).json();
    assert.equal(doComprador.anuncios[0].meu, false);
    assert.equal(doComprador.meus.length, 0);
    await app.close();
  });

  it("filtra por moeda", async () => {
    const { app, vendedor } = bancada({
      vendedorMochila: [peca("x1"), peca("x2")],
    });
    await anunciar(app, vendedor.headers, {
      personagem: "pv", item: "x1", preco: 500, moeda: "sucata",
    });
    await anunciar(app, vendedor.headers, {
      personagem: "pv", item: "x2", preco: 20, moeda: "premium",
    });

    const so = (
      await app.inject({
        method: "GET",
        url: "/mercado?moeda=premium",
        headers: vendedor.headers,
      })
    ).json();
    assert.equal(so.anuncios.length, 1);
    assert.equal(so.anuncios[0].moeda, "premium");
    await app.close();
  });

  it("o mercado exige sessão", async () => {
    const { app } = bancada();
    for (const [method, url] of [
      ["GET", "/mercado"],
      ["POST", "/mercado"],
      ["DELETE", "/mercado/qualquer"],
      ["POST", "/mercado/qualquer/comprar"],
    ] as const) {
      const r = await app.inject({ method, url, payload: {} });
      assert.equal(r.statusCode, 401, `${method} ${url}`);
    }
    await app.close();
  });
});
