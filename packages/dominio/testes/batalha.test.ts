import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atributosDe } from "../src/atributos.ts";
import {
  type Batalha,
  type Combatente,
  criarCombatente,
  executarTurno,
  habilidadesDisponiveis,
  iniciarBatalha,
  quemAge,
  resolverBatalha,
  RODADAS_MAXIMAS,
  vivo,
} from "../src/batalha.ts";
import { habilidadesDe } from "../src/habilidades.ts";
import { sementeDe } from "../src/aleatorio.ts";

function heroi(nivel = 20, ramo: 1 | 2 | 3 | 4 | 5 = 4): Combatente {
  return criarCombatente({
    id: "heroi",
    nome: "Herói",
    lado: "jogador",
    ramo,
    atributos: atributosDe(ramo, nivel),
    habilidades: habilidadesDe(ramo, nivel).map((h) => h.id),
  });
}

function vilao(nivel = 20, id = "vilao"): Combatente {
  return criarCombatente({
    id,
    nome: "Vilão",
    lado: "inimigo",
    ramo: 4,
    atributos: atributosDe(4, nivel),
    habilidades: ["golpe", "investida"],
  });
}

function montar(a = heroi(), b = vilao(), semente = sementeDe("teste")): Batalha {
  return iniciarBatalha([a, b], semente);
}

describe("início", () => {
  it("ordena pela iniciativa, com desempate estável", () => {
    // Estável, e não sorteado: duas batalhas com a mesma semente têm de sair
    // idênticas, e ordem instável quebraria a reprodução.
    const rapido = criarCombatente({
      id: "b",
      nome: "Rápido",
      lado: "jogador",
      ramo: 3,
      atributos: atributosDe(3, 30),
      habilidades: ["golpe"],
    });
    const b = iniciarBatalha([vilao(30, "a"), rapido], 1);
    assert.equal(b.ordem[0], "b", "o mais ágil devia agir primeiro");
  });

  it("todo mundo começa com a vida cheia", () => {
    const b = montar();
    for (const c of Object.values(b.combatentes)) {
      assert.equal(c.vida, c.vidaMaxima);
      assert.ok(vivo(c));
    }
  });
});

describe("determinismo", () => {
  it("a mesma semente dá exatamente a mesma batalha", () => {
    // É o que sustenta a progressão offline: o servidor recalcula o que
    // aconteceu enquanto a pessoa estava fora, e tem de dar o mesmo resultado.
    const um = resolverBatalha(montar(heroi(), vilao(), 12345));
    const dois = resolverBatalha(montar(heroi(), vilao(), 12345));
    assert.deepEqual(um.eventos, dois.eventos);
    assert.equal(um.batalha.vencedor, dois.batalha.vencedor);
  });

  it("sementes diferentes dão batalhas diferentes", () => {
    const um = resolverBatalha(montar(heroi(), vilao(), 1));
    const dois = resolverBatalha(montar(heroi(), vilao(), 999));
    assert.notDeepEqual(um.eventos, dois.eventos);
  });

  it("sementeDe é estável para o mesmo texto", () => {
    assert.equal(sementeDe("heroi:42"), sementeDe("heroi:42"));
    assert.notEqual(sementeDe("heroi:42"), sementeDe("heroi:43"));
  });
});

describe("resolução", () => {
  it("toda batalha termina com um vencedor", () => {
    for (let s = 0; s < 40; s++) {
      const { batalha } = resolverBatalha(montar(heroi(), vilao(), s));
      assert.ok(batalha.vencedor, `semente ${s} não terminou`);
      assert.ok(batalha.rodada <= RODADAS_MAXIMAS + 1);
    }
  });

  it("o perdedor termina sem vida e o vencedor com alguma", () => {
    const { batalha } = resolverBatalha(montar(heroi(), vilao(), 7));
    const vencedores = Object.values(batalha.combatentes).filter(
      (c) => c.lado === batalha.vencedor,
    );
    const perdedores = Object.values(batalha.combatentes).filter(
      (c) => c.lado !== batalha.vencedor,
    );
    assert.ok(vencedores.some(vivo));
    assert.ok(perdedores.every((c) => !vivo(c)));
  });

  it("um herói bem acima do nível vence quase sempre", () => {
    let vitorias = 0;
    for (let s = 0; s < 40; s++) {
      const { batalha } = resolverBatalha(montar(heroi(60), vilao(10), s));
      if (batalha.vencedor === "jogador") vitorias++;
    }
    assert.ok(vitorias >= 38, `venceu só ${vitorias} de 40`);
  });

  it("um herói bem abaixo do nível perde quase sempre", () => {
    let derrotas = 0;
    for (let s = 0; s < 40; s++) {
      const { batalha } = resolverBatalha(montar(heroi(10), vilao(60), s));
      if (batalha.vencedor === "inimigo") derrotas++;
    }
    assert.ok(derrotas >= 38, `perdeu só ${derrotas} de 40`);
  });

  it("o dano nunca é zero, por mais redução que haja", () => {
    // Com redução alta e arredondamento para baixo o dano viraria zero, e a
    // batalha nunca acabaria. Há piso de 1.
    const { eventos } = resolverBatalha(
      montar(heroi(80, 5), vilao(80, "tanque"), 3),
    );
    for (const e of eventos) {
      if (e.tipo === "dano") assert.ok(e.valor >= 1, "dano zerado");
    }
  });
});

describe("habilidades e recarga", () => {
  it("habilidade em recarga não aparece como disponível", () => {
    let b = montar();
    const quem = quemAge(b)!;
    const comRecarga = habilidadesDisponiveis(b, quem.id).find(
      (h) => h.recarga > 0,
    )!;

    b = executarTurno(b, comRecarga.id);
    const depois = habilidadesDisponiveis(b, quem.id).map((h) => h.id);
    assert.ok(
      !depois.includes(comRecarga.id),
      `${comRecarga.id} devia estar em recarga`,
    );
  });

  it("volta a ficar disponível quando a recarga passa", () => {
    let b = montar();
    const quem = quemAge(b)!;
    const comRecarga = habilidadesDisponiveis(b, quem.id).find(
      (h) => h.recarga > 0,
    )!;
    b = executarTurno(b, comRecarga.id);

    for (let i = 0; i < comRecarga.recarga * 2 + 2 && !b.vencedor; i++) {
      b = executarTurno(b);
    }

    if (!b.vencedor) {
      const depois = habilidadesDisponiveis(b, quem.id).map((h) => h.id);
      assert.ok(depois.includes(comRecarga.id), "a recarga não passou");
    }
  });

  it("pedir habilidade indisponível falha alto", () => {
    const b = montar();
    const quem = quemAge(b)!;
    assert.throws(
      () => executarTurno(b, "habilidade-que-nao-existe"),
      /indisponível/,
      `${quem.id} devia recusar`,
    );
  });

  it("golpe não tem recarga e pode ser usado sempre", () => {
    let b = montar();
    for (let i = 0; i < 6 && !b.vencedor; i++) {
      const quem = quemAge(b)!;
      const podeGolpear = habilidadesDisponiveis(b, quem.id).some(
        (h) => h.id === "golpe",
      );
      assert.ok(podeGolpear, `${quem.id} ficou sem golpe na rodada ${b.rodada}`);
      b = executarTurno(b, "golpe");
    }
  });
});

describe("efeitos em combate", () => {
  it("veneno causa dano ao longo das rodadas", () => {
    const envenenador = criarCombatente({
      id: "heroi",
      nome: "Herói",
      lado: "jogador",
      ramo: 4,
      atributos: atributosDe(4, 30),
      habilidades: ["toxina"],
    });
    const alvo = criarCombatente({
      id: "vilao",
      nome: "Vilão",
      lado: "inimigo",
      ramo: 5,
      atributos: atributosDe(5, 30),
      habilidades: ["golpe"],
    });

    const { eventos } = resolverBatalha(iniciarBatalha([envenenador, alvo], 42));
    const porEfeito = eventos.filter(
      (e) => e.tipo === "dano" && e.fonte === "efeito",
    );
    assert.ok(porEfeito.length > 0, "o veneno nunca causou dano");
  });

  it("o mesmo efeito não empilha — o mais forte vence", () => {
    // Empilhar é o caminho conhecido para aplicar o mesmo veneno oito vezes e
    // derrubar qualquer chefe.
    let b = montar(
      criarCombatente({
        id: "heroi",
        nome: "Herói",
        lado: "jogador",
        ramo: 4,
        atributos: atributosDe(4, 40),
        habilidades: ["toxina", "golpe"],
      }),
      vilao(40),
      5,
    );

    for (let i = 0; i < 10 && !b.vencedor; i++) {
      const quem = quemAge(b)!;
      const temToxina = habilidadesDisponiveis(b, quem.id).some(
        (h) => h.id === "toxina",
      );
      b = executarTurno(b, quem.id === "heroi" && temToxina ? "toxina" : undefined);

      const alvo = b.combatentes.vilao;
      if (alvo) {
        const venenos = alvo.efeitos.filter((e) => e.tipo === "veneno");
        assert.ok(venenos.length <= 1, `${venenos.length} venenos empilhados`);
      }
    }
  });

  it("atordoamento faz perder o turno, e dura o turno seguinte do alvo", () => {
    // Varre sementes porque o atordoamento tem 50% de chance e a recarga é
    // longa: numa batalha só, o alvo pode resistir na única tentativa. Quem
    // atordoa leva `golpe` junto, senão fica parado durante a recarga.
    const atordoador = () =>
      criarCombatente({
        id: "heroi",
        nome: "Herói",
        lado: "jogador",
        ramo: 4,
        atributos: atributosDe(4, 40),
        habilidades: ["atordoar", "golpe"],
      });

    let impedidos = 0;
    let resistidos = 0;

    for (let s = 0; s < 30; s++) {
      let b = montar(atordoador(), vilao(40), s);
      while (!b.vencedor) {
        const quem = quemAge(b);
        const podeAtordoar =
          quem?.id === "heroi" &&
          habilidadesDisponiveis(b, quem.id).some((h) => h.id === "atordoar");
        b = executarTurno(b, podeAtordoar ? "atordoar" : undefined);
        for (const e of b.eventos) {
          if (e.tipo === "impedido") impedidos++;
          if (e.tipo === "resistiu") resistidos++;
        }
      }
    }

    assert.ok(impedidos > 0, "o atordoamento nunca impediu ninguém");
    assert.ok(resistidos > 0, "o atordoamento nunca foi resistido — a chance falhou");
    // Ordem dos efeitos: descontar a duração ANTES de checar impedimento fazia
    // um atordoamento de uma rodada expirar sempre antes de valer. Custou um
    // bug real, e é o que este número vigia.
    assert.ok(
      impedidos > 5,
      `só ${impedidos} impedimentos em 30 batalhas — a duração está expirando cedo demais`,
    );
  });

  it("null é um passe de propósito — o turno some, o combate segue", () => {
    const b0 = montar();
    const vidaAntes = b0.combatentes.heroi!.vida;

    const b1 = executarTurno(b0, null);
    assert.equal(b1.combatentes.heroi!.vida, vidaAntes, "passar não gasta a própria vida");
    assert.ok(
      b1.eventos.some((e) => e.tipo === "impedido" && e.motivo === "fugiu"),
      "faltou o evento de passe",
    );
    assert.ok(
      !b1.eventos.some((e) => e.tipo === "usou" && e.quem === "heroi"),
      "um passe não pode usar habilidade nenhuma",
    );
    // O vilão continua agindo normalmente depois de um passe — fugir falho
    // perde o turno, não pausa a luta.
    assert.notEqual(b1.vez, b0.vez, "o turno não avançou depois do passe");
  });

  it("cura não passa da vida máxima", () => {
    const curandeiro = criarCombatente({
      id: "heroi",
      nome: "Herói",
      lado: "jogador",
      ramo: 2,
      atributos: atributosDe(2, 30),
      habilidades: ["recompor", "golpe"],
    });
    let b = montar(curandeiro, vilao(30), 8);

    for (let i = 0; i < 12 && !b.vencedor; i++) {
      b = executarTurno(b);
      for (const c of Object.values(b.combatentes)) {
        assert.ok(c.vida <= c.vidaMaxima, `${c.id} passou da vida máxima`);
        assert.ok(c.vida >= 0, `${c.id} ficou com vida negativa`);
      }
    }
  });
});

describe("pureza", () => {
  it("executarTurno não altera a batalha que recebeu", () => {
    // O servidor guarda estados e o cliente reconcilia com eles; mutação no
    // lugar deixaria o histórico mentindo sobre o que aconteceu.
    const b = montar();
    const copia = structuredClone(b);
    executarTurno(b, "golpe");
    assert.deepEqual(b, copia);
  });

  it("uma batalha decidida não avança mais", () => {
    const { batalha } = resolverBatalha(montar());
    assert.equal(executarTurno(batalha), batalha);
  });
});
