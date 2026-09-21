import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Conta, ELO_INICIAL, type Personagem } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * A arena pela API.
 *
 * A propriedade que mais importa: o DEFENSOR não perde nada material.
 * Ele não estava lá e não escolheu lutar.
 */

const AGORA = 1_700_000_000_000;

const heroi = (id: string, extra: Partial<Personagem> = {}): Personagem => ({
  id,
  nome: `Herói ${id}`,
  classe: 4,
  nivel: 30,
  xp: 0,
  camada: 0,
  estado: "vivo",
  vida: 100_000,
  visto: AGORA,
  sucata: 500,
  mortes: 0,
  gastos: {},
  equipado: {},
  mochila: [],
  elo: ELO_INICIAL,
  duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
  ...extra,
});

const conta = (id: string, personagens: string[]): Conta => ({
  id,
  email: `${id}@t.com`,
  senha: "(direto)",
  criadaEm: AGORA,
  visto: AGORA,
  premium: 0,
  slotsComprados: 10,
  personagens,
});

function bancada(extras: Personagem[] = []) {
  const sessoes = new Sessoes();
  const meu = heroi("meu");
  const alheio = heroi("alheio", { nome: "Alvo" });
  const armazenamento = emMemoria(
    [meu, alheio, ...extras],
    [
      conta("c1", ["meu"]),
      conta("c2", ["alheio", ...extras.map((p) => p.id)]),
    ],
  );
  const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
  return {
    app,
    armazenamento,
    headers: { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` },
  };
}

const arena = async (
  app: ReturnType<typeof bancada>["app"],
  headers: Record<string, string>,
) =>
  (
    await app.inject({
      method: "GET",
      url: "/arena?personagem=meu",
      headers,
    })
  ).json();

describe("a lista de alvos", () => {
  it("mostra só personagens de OUTRAS contas", async () => {
    const { app, headers } = bancada([heroi("segundo-meu")]);
    const r = await arena(app, headers);
    assert.ok(r.alvos.length > 0);
    assert.equal(
      r.alvos.some((a: { id: string }) => a.id === "meu"),
      false,
      "apareceu o próprio personagem",
    );
    await app.close();
  });

  it("não mostra quem está no túmulo", async () => {
    // Bater em quem já caiu não é desafio, é carniça.
    const { app, headers } = bancada([
      heroi("morto", { estado: "tumulo", vida: 0 }),
    ]);
    const r = await arena(app, headers);
    assert.equal(
      r.alvos.some((a: { id: string }) => a.id === "morto"),
      false,
    );
    await app.close();
  });

  it("não mostra quem está fora da faixa de nível", async () => {
    /*
     * Por NÍVEL e não por elo: o elo diz quem joga bem, o nível diz quem
     * tem números maiores, e num jogo de progressão infinita é o segundo
     * que decide o duelo.
     */
    const { app, headers } = bancada([
      heroi("gigante", { nivel: 3000 }),
      heroi("bebe", { nivel: 1 }),
    ]);
    const r = await arena(app, headers);
    const ids = r.alvos.map((a: { id: string }) => a.id);
    assert.equal(ids.includes("gigante"), false);
    assert.equal(ids.includes("bebe"), false);
    assert.ok(ids.includes("alheio"));
    await app.close();
  });

  it("o alvo não expõe mochila nem sucata", async () => {
    // O que a tela precisa é nome, nível, classe e elo. Mochila do outro
    // jogador é informação que não serve para decidir o duelo e serve
    // muito para escolher quem roubar — e aqui ninguém rouba nada.
    const { app, headers } = bancada();
    const alvo = (await arena(app, headers)).alvos[0];
    assert.ok(alvo.nome && alvo.nivel && alvo.elo);
    assert.equal("mochila" in alvo, false);
    assert.equal("sucata" in alvo, false);
    await app.close();
  });

  it("ferido demais, a arena diz que não dá — e por quê", async () => {
    const sessoes = new Sessoes();
    const armazenamento = emMemoria(
      [heroi("meu", { vida: 1 }), heroi("alheio")],
      [conta("c1", ["meu"]), conta("c2", ["alheio"])],
    );
    const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
    const headers = { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` };

    const r = await arena(app, headers);
    assert.equal(r.podeDesafiar, false);
    assert.match(r.impedimento, /ferido/);
    await app.close();
  });
});

describe("duelar", () => {
  const desafiar = (
    app: ReturnType<typeof bancada>["app"],
    headers: Record<string, string>,
    alvo = "alheio",
  ) =>
    app.inject({
      method: "POST",
      url: `/arena/${alvo}`,
      headers,
      payload: { personagem: "meu" },
    });

  it("resolve o duelo inteiro e devolve o replay", async () => {
    const { app, headers } = bancada();
    const r = await desafiar(app, headers);
    assert.equal(r.statusCode, 200, r.body);
    const d = r.json();
    assert.equal(typeof d.venci, "boolean");
    assert.ok(d.rodadas > 0);
    assert.ok(d.eventos.length > 0, "duelo sem eventos não conta história");
    assert.ok(d.elo.antes === ELO_INICIAL);
    await app.close();
  });

  it("o DEFENSOR não perde nada material", async () => {
    /*
     * A regra central do PvP assíncrono. Ele não estava lá, não escolheu
     * lutar, e ser atacado dormindo não pode custar progresso.
     */
    const { app, headers, armazenamento } = bancada();
    const antes = (await armazenamento.personagens.buscar("alheio"))!;

    await desafiar(app, headers);

    const depois = (await armazenamento.personagens.buscar("alheio"))!;
    assert.equal(depois.sucata, antes.sucata, "perdeu sucata");
    assert.equal(depois.vida, antes.vida, "perdeu vida");
    assert.equal(depois.nivel, antes.nivel, "perdeu nível");
    assert.equal(depois.xp, antes.xp, "perdeu XP");
    assert.deepEqual(depois.mochila, antes.mochila, "perdeu item");
    assert.equal(depois.estado, "vivo", "foi morto por um ataque");
    // Só o elo e a contagem mudam — reputação, não patrimônio.
    assert.notEqual(depois.elo, antes.elo);
    await app.close();
  });

  it("o desafiante paga com vida, e nunca morre", async () => {
    const { app, headers, armazenamento } = bancada();
    const antes = (await armazenamento.personagens.buscar("meu"))!;
    await desafiar(app, headers);
    const depois = (await armazenamento.personagens.buscar("meu"))!;
    assert.ok(depois.vida < antes.vida, "duelar não custou vida");
    assert.ok(depois.vida >= 1, "a arena matou alguém");
    assert.equal(depois.estado, "vivo");
    await app.close();
  });

  it("o elo é soma zero entre os dois", async () => {
    // A arena redistribui reputação; ela não injeta.
    const { app, headers, armazenamento } = bancada();
    const a = (await armazenamento.personagens.buscar("meu"))!;
    const b = (await armazenamento.personagens.buscar("alheio"))!;
    await desafiar(app, headers);
    const a2 = (await armazenamento.personagens.buscar("meu"))!;
    const b2 = (await armazenamento.personagens.buscar("alheio"))!;
    assert.equal(a2.elo + b2.elo, a.elo + b.elo);
    await app.close();
  });

  it("não se duela contra o próprio personagem", async () => {
    // Seria mover elo entre os próprios personagens, e o elo é soma zero
    // justamente para isso não valer nada.
    const { app, headers } = bancada();
    const r = await app.inject({
      method: "POST",
      url: "/arena/meu",
      headers,
      payload: { personagem: "meu" },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /é seu/);
    await app.close();
  });

  it("não se duela fora da faixa de nível", async () => {
    const { app, headers } = bancada([heroi("gigante", { nivel: 3000 })]);
    const r = await desafiar(app, headers, "gigante");
    assert.equal(r.statusCode, 409);
    assert.match(r.json().erro, /faixa/);
    await app.close();
  });

  it("não se duela contra quem está no túmulo", async () => {
    const { app, headers } = bancada([
      heroi("morto", { estado: "tumulo", vida: 0 }),
    ]);
    const r = await desafiar(app, headers, "morto");
    assert.equal(r.statusCode, 409);
    await app.close();
  });

  it("ferido demais, o duelo é recusado antes de acontecer", async () => {
    // Recusar antes é o ponto: entrar sem vida daria elo de graça ao
    // defensor, e o jogador só descobriria depois de perder.
    const sessoes = new Sessoes();
    const armazenamento = emMemoria(
      [heroi("meu", { vida: 1 }), heroi("alheio")],
      [conta("c1", ["meu"]), conta("c2", ["alheio"])],
    );
    const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
    const headers = { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` };

    const r = await app.inject({
      method: "POST",
      url: "/arena/alheio",
      headers,
      payload: { personagem: "meu" },
    });
    assert.equal(r.statusCode, 409);
    assert.equal((await armazenamento.personagens.buscar("alheio"))!.elo, ELO_INICIAL);
    await app.close();
  });

  it("a arena exige sessão", async () => {
    const { app } = bancada();
    for (const [method, url] of [
      ["GET", "/arena?personagem=meu"],
      ["POST", "/arena/alheio"],
    ] as const) {
      const r = await app.inject({ method, url, payload: {} });
      assert.equal(r.statusCode, 401, `${method} ${url}`);
    }
    await app.close();
  });
});
