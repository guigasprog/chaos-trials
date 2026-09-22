import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { MOCHILA_MAXIMA, type Personagem } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * Itens pela API: a queda chega à mochila, o que se veste muda o
 * personagem, e nada disso aceita ordem do cliente sobre o que largou.
 */

const AGORA = 1_700_000_000_000;

function montar(inicial: readonly Personagem[]) {
  const sessoes = new Sessoes();
  const conta = {
    id: "c1",
    email: "t@t.com",
    senha: "(direto)",
    criadaEm: AGORA,
    visto: AGORA,
    premium: 0,
    slotsComprados: 20,
    personagens: inicial.map((p) => p.id),
  };
  const app = criarAplicacao({
    armazenamento: emMemoria(inicial, [conta]),
    agora: () => AGORA,
    sessoes,
  });
  const token = sessoes.abrir("c1", AGORA);
  return { app, token, headers: { authorization: `Bearer ${token}` } };
}

const heroi = (extra: Partial<Personagem> = {}): Personagem => ({
  id: "h",
  nome: "Herói",
  classe: 4,
  nivel: 40,
  xp: 0,
  camada: 0,
  estado: "vivo",
  vida: 5000,
  visto: AGORA,
  sucata: 0,
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

/** Luta até uma vitória largar alguma coisa, e devolve o que caiu. */
async function lutarAteCair(
  app: FastifyInstance,
  headers: Record<string, string>,
  tentativas = 40,
) {
  for (let t = 0; t < tentativas; t++) {
    const inicio = await app.inject({
      method: "POST",
      url: "/personagens/h/batalhas",
      headers,
    });
    const { id } = inicio.json();
    for (let i = 0; i < 100; i++) {
      const turno = await app.inject({
        method: "POST",
        url: `/batalhas/${id}/turnos`,
        headers,
        payload: { habilidade: "golpe" },
      });
      const r = turno.json().resultado;
      if (!r) continue;
      if (r.queda) return r;
      break;
    }
  }
  return null;
}

describe("queda", () => {
  it("a peça que cai chega à mochila e vem descrita", async () => {
    const { app, headers } = montar([heroi()]);
    const r = await lutarAteCair(app, headers);
    assert.ok(r, "nenhuma queda em 40 vitórias");

    // O servidor manda a peça pronta para a tela: cor, nome da raridade e
    // as propriedades já em texto. Recalcular no cliente duplicaria regra.
    assert.ok(r.queda.nome.length > 3);
    assert.ok(r.queda.cor.startsWith("#"));
    assert.ok(r.queda.propriedades.length > 0);
    assert.ok(r.queda.poder > 0);

    assert.ok(
      r.personagem.mochila.some((i: { id: string }) => i.id === r.queda.id),
      "a peça não chegou à mochila",
    );
    await app.close();
  });

  it("o julgamento sempre larga", async () => {
    // É a luta em que se morre de verdade; sair de mãos vazias
    // transformaria o risco em aposta ruim.
    const { app, headers } = montar([heroi()]);
    const inicio = await app.inject({
      method: "POST",
      url: "/personagens/h/batalhas",
      headers,
      payload: { tipo: "julgamento" },
    });
    const { id } = inicio.json();
    for (let i = 0; i < 100; i++) {
      const r = (
        await app.inject({
          method: "POST",
          url: `/batalhas/${id}/turnos`,
          headers,
          payload: { habilidade: "golpe" },
        })
      ).json().resultado;
      if (!r) continue;
      if (r.venceu) assert.ok(r.queda, "julgamento vencido sem queda");
      break;
    }
    await app.close();
  });

  it("com a mochila cheia, a peça vira sucata em vez de sumir", async () => {
    /*
     * Recusar a peça pararia o laço de jogo para mandar arrumar gaveta.
     * Sumir em silêncio seria pior: o jogador não saberia que perdeu algo.
     */
    const cheia = heroi({
      mochila: Array.from({ length: MOCHILA_MAXIMA }, (_, i) => ({
        id: `x${i}`,
        encaixe: "arma" as const,
        raridade: "bruto" as const,
        nivel: 1,
        nome: "Entulho",
        atributos: { intelecto: 0, presenca: 0, destreza: 0, forca: 1, vigor: 0 },
        danoPercentual: 0,
        vidaPercentual: 0,
        criticoAdicional: 0,
        reducaoAdicional: 0,
        roubodeVida: 0,
      })),
    });
    const { app, headers } = montar([cheia]);
    const r = await lutarAteCair(app, headers);
    assert.ok(r, "nenhuma queda em 40 vitórias");
    assert.ok(r.queda.viroSucata > 0, "a peça sumiu sem virar nada");
    assert.equal(r.personagem.mochila.length, MOCHILA_MAXIMA);
    await app.close();
  });
});

describe("vestir", () => {
  const comPeca = () =>
    montar([
      heroi({
        mochila: [
          {
            id: "peca",
            encaixe: "arma",
            raridade: "sagrado",
            nivel: 40,
            nome: "Lâmina da Última Luz",
            atributos: {
              intelecto: 0,
              presenca: 0,
              destreza: 0,
              forca: 40,
              vigor: 30,
            },
            danoPercentual: 0.2,
            vidaPercentual: 0.15,
            criticoAdicional: 0,
            reducaoAdicional: 0,
            roubodeVida: 0,
          },
        ],
      }),
    ]);

  it("equipar tira da mochila, veste e sobe a vida máxima", async () => {
    const { app, headers } = comPeca();
    const antes = (
      await app.inject({ method: "GET", url: "/personagens/h", headers })
    ).json();

    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/equipar",
      headers,
      payload: { item: "peca" },
    });
    assert.equal(r.statusCode, 200, r.body);
    const p = r.json();
    assert.equal(p.mochila.length, 0);
    assert.equal(p.equipado.arma.id, "peca");
    // O mesmo defeito que a árvore teve: somar num objeto que ninguém lê.
    assert.ok(p.vidaMaxima > antes.vidaMaxima, "vestir não mudou a vida");
    await app.close();
  });

  it("desequipar devolve para a mochila", async () => {
    const { app, headers } = comPeca();
    await app.inject({
      method: "POST",
      url: "/personagens/h/equipar",
      headers,
      payload: { item: "peca" },
    });
    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/desequipar",
      headers,
      payload: { encaixe: "arma" },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().mochila.length, 1);
    assert.equal(r.json().equipado.arma, undefined);
    await app.close();
  });

  it("encaixe inventado é recusado", async () => {
    const { app, headers } = comPeca();
    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/desequipar",
      headers,
      payload: { encaixe: "capa-de-heroi" },
    });
    assert.equal(r.statusCode, 400);
    await app.close();
  });

  it("peça que não é minha não veste", async () => {
    // O cliente manda intenção, nunca estado: um id inventado não cria peça.
    const { app, headers } = comPeca();
    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/equipar",
      headers,
      payload: { item: "lamina-lendaria-que-eu-inventei" },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /não está na mochila/);
    await app.close();
  });

  it("desmanchar rende sucata e tira a peça", async () => {
    const { app, headers } = comPeca();
    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/desmanchar",
      headers,
      payload: { item: "peca" },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(r.json().rendeu > 0);
    assert.equal(r.json().sucata, r.json().rendeu);
    assert.equal(r.json().mochila.length, 0);
    await app.close();
  });

  it("não se desmancha o que está vestido", async () => {
    const { app, headers } = comPeca();
    await app.inject({
      method: "POST",
      url: "/personagens/h/equipar",
      headers,
      payload: { item: "peca" },
    });
    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/desmanchar",
      headers,
      payload: { item: "peca" },
    });
    assert.equal(r.statusCode, 404);
    await app.close();
  });

  it("as rotas de item exigem sessão e dono", async () => {
    const { app } = comPeca();
    for (const url of [
      "/personagens/h/equipar",
      "/personagens/h/desequipar",
      "/personagens/h/desmanchar",
    ]) {
      const r = await app.inject({ method: "POST", url, payload: {} });
      assert.equal(r.statusCode, 401, url);
    }
    await app.close();
  });
});

describe("a mochila chega ordenada", () => {
  it("a peça de maior poder vem primeiro", async () => {
    // Ordenar na tela duplicaria a regra; e sem ordem nenhuma a mochila
    // não é legível de relance.
    const { app, headers } = montar([heroi()]);
    for (let i = 0; i < 12; i++) await lutarAteCair(app, headers, 4);

    const p = (
      await app.inject({ method: "GET", url: "/personagens/h", headers })
    ).json();
    if (p.mochila.length < 2) return; // sem peças bastantes, nada a provar
    const poderes = p.mochila.map((i: { poder: number }) => i.poder);
    assert.deepEqual(poderes, [...poderes].sort((a: number, b: number) => b - a));
    await app.close();
  });
});
