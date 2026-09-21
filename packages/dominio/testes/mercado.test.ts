import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type Anuncio,
  contaDaVenda,
  criarAnuncio,
  marcarRetirado,
  marcarVendido,
  podeComprar,
  precoSugerido,
  precoValido,
  vitrine,
} from "../src/mercado.ts";
import {
  DIZIMO_DO_MERCADO,
  PRECO_MAXIMO,
  PRECO_MINIMO,
} from "../src/balanceamento.ts";
import { gerarItem, poderDoItem } from "../src/item.ts";

const AGORA = 1_700_000_000_000;
const peca = (s = 1, raridade?: "bruto" | "sagrado") =>
  gerarItem({ nivel: 30, ramo: 4, semente: s, id: `i${s}`, ...(raridade ? { raridade } : {}) });

function anuncio(extra: Partial<Parameters<typeof criarAnuncio>[0]> = {}): Anuncio {
  return criarAnuncio({
    id: "a1",
    vendedor: "conta-a",
    vendedorNome: "Vendedor",
    personagem: "p1",
    item: peca(),
    preco: 100,
    moeda: "sucata",
    agora: AGORA,
    ...extra,
  });
}

describe("preço", () => {
  it("recusa fora da faixa, e diz o limite", () => {
    assert.match(precoValido(0, "sucata")!.detalhe, new RegExp(`${PRECO_MINIMO}`));
    assert.match(
      precoValido(PRECO_MAXIMO + 1, "sucata")!.detalhe,
      new RegExp(`${PRECO_MAXIMO}`),
    );
    assert.equal(precoValido(10.5, "sucata")?.motivo, "preco");
    assert.equal(precoValido(100, "sucata"), null);
  });

  it("recusa moeda inventada", () => {
    // O cliente manda intenção; "moeda: dolar" não pode virar uma moeda.
    assert.equal(precoValido(100, "dolar" as "sucata")?.motivo, "moeda");
  });

  it("a sugestão em premium é MUITO menor que em sucata", () => {
    // Premium é escasso por construção: a mesma peça não pode custar o
    // mesmo número nas duas moedas, ou o preço em premium vira absurdo.
    const i = peca(5, "sagrado");
    assert.ok(precoSugerido(i, "premium") < precoSugerido(i, "sucata") / 5);
    assert.ok(precoSugerido(i, "sucata") > poderDoItem(i));
  });
});

describe("dízimo", () => {
  it("toda venda destrói uma fatia", () => {
    /*
     * É o ÚNICO ralo de moeda do jogo. Sem ralo, a economia fechada só
     * acumula: cada compra com dinheiro real empurra o total para cima e
     * nada nunca puxa para baixo.
     */
    const { dizimo, aoVendedor } = contaDaVenda(1000);
    assert.equal(dizimo + aoVendedor, 1000, "a conta não fecha");
    assert.ok(dizimo > 0);
    assert.equal(dizimo, Math.ceil(1000 * DIZIMO_DO_MERCADO));
  });

  it("nem a venda de 1 escapa do ralo", () => {
    // Arredondar para baixo faria toda venda de preço baixo ser isenta, e
    // o ralo sumiria justamente onde há mais volume.
    const { dizimo, aoVendedor } = contaDaVenda(1);
    assert.equal(dizimo, 1);
    assert.equal(aoVendedor, 0);
  });

  it("a soma sempre fecha, em qualquer preço", () => {
    for (const preco of [1, 2, 7, 13, 99, 100, 12_345, PRECO_MAXIMO]) {
      const { dizimo, aoVendedor } = contaDaVenda(preco);
      assert.equal(dizimo + aoVendedor, preco, `preço ${preco}`);
      assert.ok(dizimo >= 1 && aoVendedor >= 0, `preço ${preco}`);
    }
  });
});

describe("comprar", () => {
  it("com saldo, pode", () => {
    assert.equal(podeComprar(anuncio(), { conta: "conta-b", saldo: 100 }), null);
  });

  it("sem saldo, o motivo diz os dois números", () => {
    const impede = podeComprar(anuncio(), { conta: "conta-b", saldo: 40 });
    assert.equal(impede?.motivo, "saldo");
    assert.match(impede!.detalhe, /custa 100 e você tem 40/);
  });

  it("ninguém compra o próprio anúncio", () => {
    /*
     * Não é troca: é lavar moeda entre personagens da mesma conta,
     * pagando só o dízimo pelo privilégio — e com isso dá para mover
     * sucata de um personagem para outro, que é justamente o que a
     * separação "sucata é do personagem" existe para impedir.
     */
    const impede = podeComprar(anuncio(), { conta: "conta-a", saldo: 1e9 });
    assert.equal(impede?.motivo, "proprio");
  });

  it("anúncio fechado não vende de novo", () => {
    const vendido = marcarVendido(anuncio(), "conta-b", AGORA);
    assert.equal(
      podeComprar(vendido, { conta: "conta-c", saldo: 1e9 })?.motivo,
      "estado",
    );
    assert.throws(() => marcarVendido(vendido, "conta-c", AGORA), /já foi fechado/);
    assert.throws(() => marcarRetirado(vendido, AGORA), /já foi fechado/);
  });

  it("vender registra quem levou e quando", () => {
    const v = marcarVendido(anuncio(), "conta-b", AGORA + 5);
    assert.equal(v.comprador, "conta-b");
    assert.equal(v.fechadoEm, AGORA + 5);
  });
});

describe("vitrine", () => {
  const lista: Anuncio[] = [
    anuncio({ id: "a1", agora: AGORA + 1 }),
    anuncio({ id: "a2", agora: AGORA + 3, moeda: "premium", preco: 5 }),
    anuncio({ id: "a3", agora: AGORA + 2 }),
  ];

  it("mostra só o que está aberto", () => {
    const comFechado = [...lista, marcarVendido(anuncio({ id: "a4" }), "x", AGORA)];
    assert.equal(vitrine(comFechado).length, 3);
  });

  it("o mais novo vem primeiro", () => {
    /*
     * E não o mais barato: ordenar por preço faz a primeira página ser
     * sempre a mesma lista de bugigangas de 1 de sucata, e o mercado
     * parece morto mesmo cheio.
     */
    assert.deepEqual(
      vitrine(lista).map((a) => a.id),
      ["a2", "a3", "a1"],
    );
  });

  it("filtra por moeda", () => {
    assert.deepEqual(
      vitrine(lista, { moeda: "premium" }).map((a) => a.id),
      ["a2"],
    );
  });

  it("filtra por encaixe e por raridade", () => {
    const arma = peca(1);
    const so = vitrine(lista, { encaixe: arma.encaixe });
    assert.ok(so.every((a) => a.item.encaixe === arma.encaixe));
    const raras = vitrine(lista, { raridade: "sagrado" });
    assert.equal(raras.length, 0);
  });
});

describe("a economia é fechada", () => {
  it("uma venda não cria moeda — ela destrói", () => {
    /*
     * A propriedade central. Premium entra no mundo de um jeito só —
     * alguém comprou com dinheiro de verdade — e nunca sai. Uma venda
     * move e destrói; nunca soma.
     *
     * Simula uma corrente de revendas e confirma que o total só cai.
     */
    let vendedor = 0;
    let comprador = 10_000;
    const totalInicial = vendedor + comprador;

    for (let i = 0; i < 20; i++) {
      const preco = 100;
      if (comprador < preco) break;
      const { aoVendedor } = contaDaVenda(preco);
      comprador -= preco;
      vendedor += aoVendedor;
      // Troca de lados: cada um revende para o outro.
      [vendedor, comprador] = [comprador, vendedor];
    }

    assert.ok(
      vendedor + comprador < totalInicial,
      `o total saiu de ${totalInicial} para ${vendedor + comprador} — não pode subir nem empatar`,
    );
  });

  it("não existe função que troque sucata por premium", async () => {
    /*
     * Sucata é infinitamente farmável; um câmbio direto seria uma máquina
     * de imprimir premium. O único caminho de um jogador para o premium é
     * OUTRO jogador pagando — que é o que torna difícil de pegar.
     *
     * Este teste guarda a ausência de uma função, o que é estranho e é de
     * propósito: é o tipo de atalho que alguém adiciona achando que está
     * ajudando.
     */
    const mercado = await import("../src/mercado.ts");
    const suspeitas = Object.keys(mercado).filter((n) =>
      /cambio|trocar|converter|comprarPremium/i.test(n),
    );
    assert.deepEqual(suspeitas, [], `apareceu um câmbio: ${suspeitas.join(", ")}`);
  });
});
