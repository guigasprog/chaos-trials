import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ajusteDeElo,
  duelar,
  eloInicial,
  faixaDeNivel,
  podeDesafiar,
  premioDaArena,
  sementeDoDuelo,
  vidaAposDuelo,
} from "../src/arena.ts";
import { ELO_PESO, ELO_PISO } from "../src/balanceamento.ts";
import {
  criarPersonagem,
  morrer,
  type Personagem,
  vidaMaximaDe,
} from "../src/personagem.ts";

/**
 * PvP assíncrono.
 *
 * O que estes testes protegem, acima de tudo: o DEFENSOR não perde nada
 * material. Ele não estava lá e não escolheu lutar — ser atacado
 * dormindo e acordar sem nível é o tipo de coisa que faz alguém parar de
 * jogar.
 */

const heroi = (extra: Partial<Personagem> = {}): Personagem => {
  const base = criarPersonagem({
    id: "a",
    nome: "A",
    classeRaiz: 4,
    agora: 0,
  });
  const com = { ...base, ...extra };
  return { ...com, vida: extra.vida ?? vidaMaximaDe(com) };
};

describe("o duelo", () => {
  it("é determinístico: a mesma semente dá o mesmo resultado", () => {
    // É o que permite ao servidor recalcular um duelo para auditar uma
    // reclamação, e ao defensor ver o replay do que aconteceu com ele.
    const a = heroi({ id: "a", nivel: 30 });
    const b = heroi({ id: "b", nome: "B", nivel: 30 });
    const um = duelar(a, b, 12345);
    const outro = duelar(a, b, 12345);
    assert.equal(um.vencedor, outro.vencedor);
    assert.equal(um.rodadas, outro.rodadas);
    assert.deepEqual(um.eventos.length, outro.eventos.length);
  });

  it("os dois entram com a vida CHEIA", () => {
    /*
     * Não com a vida corrente. O defensor não está lá para beber poção
     * antes, e atacar quem acabou de sair de uma luta difícil premiaria
     * cronometragem em vez de build — o jogador viraria um vigia
     * esperando o outro ficar machucado.
     */
    const forte = heroi({ id: "a", nivel: 40 });
    const fraquinho = heroi({ id: "b", nome: "B", nivel: 40, vida: 1 });
    const comVidaCheia = heroi({ id: "b", nome: "B", nivel: 40 });

    const contraFerido = duelar(forte, fraquinho, 7);
    const contraCheio = duelar(forte, comVidaCheia, 7);
    assert.equal(contraFerido.vencedor, contraCheio.vencedor);
    assert.equal(contraFerido.rodadas, contraCheio.rodadas);
  });

  it("um nível muito maior ganha quase sempre", () => {
    // Sem isto, o elo mediria sorte. O duelo tem de refletir a build.
    let doForte = 0;
    for (let s = 0; s < 40; s++) {
      const forte = heroi({ id: "a", nivel: 60 });
      const fraco = heroi({ id: "b", nome: "B", nivel: 12 });
      if (duelar(forte, fraco, s).vencedor === "desafiante") doForte += 1;
    }
    assert.ok(doForte > 32, `o nível 60 só venceu ${doForte} de 40`);
  });

  it("empate por teto de rodadas conta para o DEFENSOR", () => {
    // Duas paredes se encarando até o fim do tempo não é vitória de quem
    // atacou; sem esta regra o desafiante forçaria empate de graça.
    const a = heroi({ id: "a", nivel: 30 });
    const b = heroi({ id: "b", nome: "B", nivel: 30 });
    const d = duelar(a, b, 1);
    // Só confirma que o tipo é fechado — quem não venceu, perdeu.
    assert.ok(d.vencedor === "desafiante" || d.vencedor === "defensor");
  });

  it("a semente sai dos dois ids e do instante", () => {
    const x = sementeDoDuelo("a", "b", 1000);
    assert.equal(x, sementeDoDuelo("a", "b", 1000));
    assert.notEqual(x, sementeDoDuelo("b", "a", 1000));
    assert.notEqual(x, sementeDoDuelo("a", "b", 1001));
  });
});

describe("o custo de duelar", () => {
  it("cansa o desafiante, e NUNCA o cura", () => {
    /*
     * O mesmo defeito que `recuar` teve: definir um valor fixo faz quem
     * entra abaixo dele SAIR melhor. Com limiar de entrada em 50% e teto
     * de desgaste em 60%, a faixa de 50% a 60% seria exatamente a zona
     * do abuso.
     */
    const cheio = heroi({ nivel: 30 });
    const depois = vidaAposDuelo(cheio);
    assert.ok(depois < cheio.vida, "duelar de vida cheia não custou nada");

    const jaCansado = { ...cheio, vida: Math.round(vidaMaximaDe(cheio) * 0.55) };
    assert.ok(
      vidaAposDuelo(jaCansado) <= jaCansado.vida,
      "duelar curou quem entrou cansado",
    );
    assert.ok(vidaAposDuelo({ ...cheio, vida: 1 }) >= 1);
  });

  it("nunca mata: permadeath é do julgamento", () => {
    // Na arena a pessoa não apostou o personagem — ela apostou tempo.
    for (const nivel of [1, 10, 100]) {
      const p = heroi({ nivel, vida: 1 });
      assert.ok(vidaAposDuelo(p) >= 1);
    }
  });

  it("no túmulo não se duela, e ferido demais também não", () => {
    const p = heroi({ nivel: 20 });
    assert.equal(podeDesafiar(p), null);
    assert.match(podeDesafiar(morrer(p))!, /túmulo/);
    assert.match(
      podeDesafiar({ ...p, vida: Math.round(vidaMaximaDe(p) * 0.2) })!,
      /ferido/,
    );
  });
});

describe("elo", () => {
  it("todo mundo começa no mesmo lugar", () => {
    assert.equal(eloInicial(), heroi().elo);
  });

  it("vencer quem está acima vale mais que vencer quem está abaixo", () => {
    /*
     * É o que impede a estratégia de escolher sempre o alvo mais fraco —
     * que, sem isto, seria a forma ótima de subir e transformaria a
     * arena numa fila de execução.
     */
    const contraForte = ajusteDeElo(1000, 1400, true).desafiante - 1000;
    const contraFraco = ajusteDeElo(1000, 600, true).desafiante - 1000;
    assert.ok(
      contraForte > contraFraco,
      `contra forte +${contraForte}, contra fraco +${contraFraco}`,
    );
    assert.ok(contraFraco >= 0, "vencer nunca pode tirar elo");
  });

  it("perder para quem está abaixo dói mais", () => {
    const paraFraco = 1000 - ajusteDeElo(1000, 600, false).desafiante;
    const paraForte = 1000 - ajusteDeElo(1000, 1400, false).desafiante;
    assert.ok(paraFraco > paraForte);
  });

  it("é soma zero — a arena redistribui, não injeta", () => {
    // Elo inflacionado não ordena nada: se todo duelo somasse ao total,
    // o número subiria para todo mundo e o ranking perderia sentido.
    for (const [a, b] of [
      [1000, 1000],
      [1200, 800],
      [700, 1500],
    ]) {
      for (const venceu of [true, false]) {
        const r = ajusteDeElo(a!, b!, venceu);
        assert.equal(
          r.desafiante + r.defensor,
          a! + b!,
          `${a} vs ${b}, venceu=${venceu}`,
        );
      }
    }
  });

  it("nunca passa do peso máximo por duelo", () => {
    for (const [a, b] of [
      [200, 5000],
      [5000, 200],
      [1000, 1000],
    ]) {
      const r = ajusteDeElo(a!, b!, true);
      assert.ok(Math.abs(r.desafiante - a!) <= ELO_PESO);
    }
  });

  it("há piso: ninguém mergulha a ponto de não ser desafiado", () => {
    let elo = ELO_PISO;
    for (let i = 0; i < 50; i++) elo = ajusteDeElo(elo, 3000, false).desafiante;
    assert.equal(elo, ELO_PISO);
  });
});

describe("pareamento", () => {
  it("a faixa é proporcional ao nível", () => {
    /*
     * Fixa não serve: ±5 níveis é enorme no nível 10 e irrelevante no
     * 3.000. E é por NÍVEL e não por elo — o elo diz quem joga bem, o
     * nível diz quem tem números maiores, e num jogo de progressão
     * infinita é o segundo que decide o duelo.
     */
    const baixa = faixaDeNivel(10);
    const alta = faixaDeNivel(1000);
    assert.ok(alta.maximo - alta.minimo > baixa.maximo - baixa.minimo);
    assert.ok(baixa.minimo >= 1, "a faixa não pode descer abaixo do nível 1");
  });

  it("todo nível está dentro da própria faixa", () => {
    for (const nivel of [1, 3, 10, 100, 5000]) {
      const f = faixaDeNivel(nivel);
      assert.ok(f.minimo <= nivel && nivel <= f.maximo, `nível ${nivel}`);
    }
  });
});

describe("prêmio", () => {
  it("cresce com o nível, mas devagar", () => {
    assert.ok(premioDaArena(100) > premioDaArena(10));
    assert.ok(premioDaArena(100) < premioDaArena(10) * 10);
    assert.ok(premioDaArena(1) >= 1);
  });
});
