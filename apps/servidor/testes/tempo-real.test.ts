import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { type Conta, type Personagem } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * A fiação do WebSocket — abre, autentica, aceita intenção, fecha.
 *
 * A LÓGICA de combate já está testada a fundo em
 * `packages/dominio/testes/combate-tempo-real.test.ts`, pura e sem
 * infraestrutura. Aqui só interessa que a conexão em si funciona.
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
  vida: 900,
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

const conta = (id: string, personagens: string[]): Conta => ({
  id,
  email: `${id}@t.com`,
  senha: "(direto)",
  criadaEm: AGORA,
  visto: AGORA,
  premium: 0,
  slotsComprados: 0,
  personagens,
});

async function subir() {
  const sessoes = new Sessoes();
  const p = heroi("p1");
  const armazenamento = emMemoria([p], [conta("c1", ["p1"])]);
  const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
  await app.listen({ port: 0 });
  const endereco = app.server.address();
  if (!endereco || typeof endereco === "string") throw new Error("sem porta");
  return {
    app,
    porta: endereco.port,
    token: sessoes.abrir("c1", AGORA),
    armazenamento,
  };
}

describe("combate em tempo real — WebSocket", () => {
  it("recusa conexão sem token", async () => {
    const { app, porta } = await subir();
    const ws = new WebSocket(`ws://localhost:${porta}/combate-tempo-real/p1`);
    const codigo = await new Promise<number>((resolve) => {
      ws.on("close", (c) => resolve(c));
    });
    assert.equal(codigo, 4001);
    await app.close();
  });

  it("conecta com token válido e recebe o primeiro estado", async () => {
    const { app, porta, token } = await subir();
    const ws = new WebSocket(
      `ws://localhost:${porta}/combate-tempo-real/p1`,
      [`bearer.${token}`],
    );
    const primeiraMensagem = await new Promise<string>((resolve) => {
      ws.on("message", (dados) => resolve(dados.toString()));
    });
    const corpo = JSON.parse(primeiraMensagem);
    assert.equal(corpo.tipo, "estado");
    assert.equal(corpo.sala.fase, "em-andamento");
    assert.equal(corpo.sala.onda, 1);
    ws.close();
    await app.close();
  });

  it("aceita intenção e reflete no próximo estado", async () => {
    const { app, porta, token } = await subir();
    const ws = new WebSocket(
      `ws://localhost:${porta}/combate-tempo-real/p1`,
      [`bearer.${token}`],
    );

    await new Promise<void>((resolve) => ws.on("open", () => resolve()));
    await new Promise<void>((resolve) => ws.once("message", () => resolve())); // primeiro estado

    ws.send(JSON.stringify({ tipo: "mover-raia", direcao: 1 }));

    const segundoEstado = await new Promise<string>((resolve) => {
      ws.once("message", (dados) => resolve(dados.toString()));
    });
    const corpo = JSON.parse(segundoEstado);
    assert.equal(corpo.sala.jogador.raia, "direita");
    ws.close();
    await app.close();
  });

  it("fechar o socket com a sala ativa conta como derrota", async () => {
    const { app, porta, token, armazenamento } = await subir();
    const ws = new WebSocket(
      `ws://localhost:${porta}/combate-tempo-real/p1`,
      [`bearer.${token}`],
    );
    await new Promise<void>((resolve) => ws.once("message", () => resolve())); // primeiro estado
    // Fechar sem nunca ter jogado não conta como derrota (ver
    // `tempo-real.ts`, handler de "close") — este teste quer o caso em que
    // o jogador já mandou uma intenção e some, então manda uma antes.
    ws.send(JSON.stringify({ tipo: "mover-raia", direcao: 1 }));
    await new Promise<void>((resolve) => ws.once("message", () => resolve())); // estado após a intenção
    ws.close();
    await new Promise<void>((resolve) => ws.on("close", () => resolve()));
    // dá um instante para o handler assíncrono de conclusão (filas.executar
    // + armazenamento) terminar
    await new Promise((resolve) => setTimeout(resolve, 50));
    const depois = await armazenamento.personagens.buscar("p1");
    assert.ok(depois);
    assert.equal(depois.vidasRestantes, 1); // heroi() começa com 2 — derrota decrementa para 1
    await app.close();
  });
});
