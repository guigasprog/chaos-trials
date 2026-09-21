import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chaveDaConta,
  chaveDoPersonagem,
  Filas,
} from "../src/filas.ts";
import {
  type Conta,
  contaDaVenda,
  type Item,
  type Personagem,
} from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * Concorrência.
 *
 * Os testes de API existentes são sequenciais, e sequencial não prova
 * nada sobre corrida: dois pedidos simultâneos leem o mesmo estado antes
 * de qualquer um gravar. Foi assim que duas compras do mesmo anúncio
 * duplicaram a peça — com todos os testes verdes.
 */

const AGORA = 1_700_000_000_000;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("a fila serializa por chave", () => {
  it("duas tarefas na mesma chave não se intercalam", async () => {
    const filas = new Filas();
    const ordem: string[] = [];

    const tarefa = (nome: string) => async () => {
      ordem.push(`${nome} entrou`);
      await espera(20);
      ordem.push(`${nome} saiu`);
    };

    await Promise.all([
      filas.executar("k", tarefa("a")),
      filas.executar("k", tarefa("b")),
    ]);

    // Sem fila a ordem seria a-entrou, b-entrou, a-saiu, b-saiu.
    assert.deepEqual(ordem, ["a entrou", "a saiu", "b entrou", "b saiu"]);
  });

  it("chaves diferentes rodam juntas", async () => {
    // Serializar tudo transformaria o servidor numa fila única, e um
    // jogador esperaria pelo turno de outro.
    const filas = new Filas();
    const ordem: string[] = [];
    const tarefa = (nome: string) => async () => {
      ordem.push(`${nome} entrou`);
      await espera(20);
      ordem.push(`${nome} saiu`);
    };

    await Promise.all([
      filas.executar("x", tarefa("a")),
      filas.executar("y", tarefa("b")),
    ]);
    assert.deepEqual(ordem, ["a entrou", "b entrou", "a saiu", "b saiu"]);
  });

  it("uma tarefa que falha não trava a chave para sempre", async () => {
    const filas = new Filas();
    await assert.rejects(
      filas.executar("k", async () => {
        throw new Error("quebrou");
      }),
      /quebrou/,
    );
    assert.equal(await filas.executar("k", async () => "passou"), "passou");
  });

  it("o erro da tarefa chega a quem chamou, e não o da fila", async () => {
    const filas = new Filas();
    void filas.executar("k", async () => {
      throw new Error("da primeira");
    }).catch(() => undefined);
    assert.equal(await filas.executar("k", async () => 42), 42);
  });

  it("a chave some do mapa quando a fila esvazia", async () => {
    // Sem isto, o mapa guarda uma entrada por personagem que já jogou:
    // vazamento lento, do tipo que só aparece depois de semanas no ar.
    const filas = new Filas();
    await filas.executar("k", async () => "ok");
    await espera(5);
    assert.equal(filas.ocupadas, 0);
  });

  it("várias chaves de uma vez, sempre na mesma ordem", async () => {
    /*
     * É o que impede abraço mortal. Dois pedidos que precisam de "a" e
     * "b" as pegam em ordem alfabética, então um espera o outro em vez
     * de cada um segurar metade.
     */
    const filas = new Filas();
    const ordem: string[] = [];
    const tarefa = (nome: string) => async () => {
      ordem.push(`${nome} entrou`);
      await espera(20);
      ordem.push(`${nome} saiu`);
    };

    await Promise.all([
      filas.executarEm(["a", "b"], tarefa("primeiro")),
      // Ordem invertida no pedido: a fila as reordena.
      filas.executarEm(["b", "a"], tarefa("segundo")),
    ]);
    assert.deepEqual(ordem, [
      "primeiro entrou",
      "primeiro saiu",
      "segundo entrou",
      "segundo saiu",
    ]);
  });
});

// ── A corrida de verdade, pela API ──────────────────────────────────────

const peca = (id: string): Item => ({
  id,
  encaixe: "arma",
  raridade: "vitral",
  nivel: 30,
  nome: `Lâmina ${id}`,
  atributos: { intelecto: 0, presenca: 0, destreza: 0, forca: 20, vigor: 0 },
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

describe("corrida na compra", () => {
  it("duas compras simultâneas do MESMO anúncio: só uma passa", async () => {
    /*
     * Este é o teste que faltava, e a falta custou uma duplicação de
     * item. Medido antes da fila, com o servidor de verdade: as duas
     * responderam 200, a peça acabou em duas mochilas, o vendedor
     * recebeu duas vezes, e a sucata total caiu 10 onde devia cair 5.
     *
     * O teste sequencial que já existia passava — porque sequencial é
     * outra história.
     */
    const sessoes = new Sessoes();
    const armazenamento = emMemoria(
      [
        heroi("pv", { mochila: [peca("x1")] }),
        heroi("pa", { sucata: 1000 }),
        heroi("pb", { sucata: 1000 }),
      ],
      [conta("cv", ["pv"]), conta("ca", ["pa"]), conta("cb", ["pb"])],
      [],
      // `lento` é o que faz a corrida ACONTECER: sem ele o cofre resolve
      // em microtask, `app.inject` roda uma requisição inteira depois da
      // outra, e o teste passa mesmo com o defeito dentro.
      { lento: true },
    );
    const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
    const cab = (c: string) => ({
      authorization: `Bearer ${sessoes.abrir(c, AGORA)}`,
    });
    const vendedor = cab("cv");
    const a = cab("ca");
    const b = cab("cb");

    const anuncio = (
      await app.inject({
        method: "POST",
        url: "/mercado",
        headers: vendedor,
        payload: { personagem: "pv", item: "x1", preco: 500, moeda: "sucata" },
      })
    ).json().anuncio;

    const comprar = (headers: Record<string, string>, personagem: string) =>
      app.inject({
        method: "POST",
        url: `/mercado/${anuncio.id}/comprar`,
        headers,
        payload: { personagem },
      });

    const [ra, rb] = await Promise.all([comprar(a, "pa"), comprar(b, "pb")]);

    const status = [ra.statusCode, rb.statusCode].sort();
    assert.deepEqual(status, [200, 409], `respostas: ${status.join(" e ")}`);

    // A peça existe UMA vez no mundo.
    const todos = await armazenamento.personagens.listar();
    const copias = todos.reduce(
      (s, p) => s + p.mochila.filter((i) => i.id === "x1").length,
      0,
    );
    assert.equal(copias, 1, `a peça foi duplicada: ${copias} cópias`);

    // E a sucata caiu exatamente o dízimo de UMA venda.
    const total = todos.reduce((s, p) => s + p.sucata, 0);
    assert.equal(total, 2000 - contaDaVenda(500).dizimo);
    await app.close();
  });

  it("duas criações simultâneas não estouram o limite de slots", async () => {
    // Mesma classe de defeito: as duas leem "um slot livre" antes de
    // qualquer uma gravar.
    const sessoes = new Sessoes();
    const armazenamento = emMemoria(
      [],
      [{ ...conta("c1", []), slotsComprados: 0 }],
      [],
      { lento: true },
    );
    const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
    const headers = { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` };

    const criar = (nome: string) =>
      app.inject({
        method: "POST",
        url: "/personagens",
        headers,
        payload: { nome, classe: 4 },
      });

    // Quatro de uma vez, com dois slots grátis.
    const rs = await Promise.all([
      criar("Um"),
      criar("Dois"),
      criar("Três"),
      criar("Quatro"),
    ]);
    const criados = rs.filter((r) => r.statusCode === 201).length;
    assert.equal(criados, 2, `criou ${criados} com dois slots`);
    assert.equal((await armazenamento.personagens.listar()).length, 2);
    await app.close();
  });

  it("dois revives simultâneos não pagam um preço só", async () => {
    const sessoes = new Sessoes();
    const mortos = [
      heroi("m1", { estado: "tumulo", vida: 0, mortes: 1 }),
      heroi("m2", { estado: "tumulo", vida: 0, mortes: 1 }),
    ];
    // Saldo para UM revive e um pouco mais.
    const armazenamento = emMemoria(
      mortos,
      [conta("c1", ["m1", "m2"], 300)],
      [],
      { lento: true },
    );
    const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
    const headers = { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` };

    const reviver = (id: string) =>
      app.inject({ method: "POST", url: `/personagens/${id}/reviver`, headers });

    const [r1, r2] = await Promise.all([reviver("m1"), reviver("m2")]);
    const ok = [r1, r2].filter((r) => r.statusCode === 200).length;
    assert.equal(ok, 1, `${ok} revives com saldo para um`);

    const c = await armazenamento.contas.buscar("c1");
    assert.equal(c!.premium, 50);
    await app.close();
  });

  it("desmanchar a mesma peça duas vezes não paga duas vezes", async () => {
    const sessoes = new Sessoes();
    const armazenamento = emMemoria(
      [heroi("p1", { mochila: [peca("x1")] })],
      [conta("c1", ["p1"])],
      [],
      { lento: true },
    );
    const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
    const headers = { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` };

    const desmanchar = () =>
      app.inject({
        method: "POST",
        url: "/personagens/p1/desmanchar",
        headers,
        payload: { item: "x1" },
      });

    const [a, b] = await Promise.all([desmanchar(), desmanchar()]);
    const ok = [a, b].filter((r) => r.statusCode === 200).length;
    assert.equal(ok, 1, `${ok} desmanches da mesma peça`);
    await app.close();
  });
});
