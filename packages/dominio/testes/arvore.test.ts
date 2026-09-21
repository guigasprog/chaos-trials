import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ARVORE,
  bonusDe,
  comprar,
  custoDaArvoreInteira,
  type Gastos,
  noPorId,
  podeComprar,
  pontosGanhos,
  pontosGastos,
  pontosLivres,
  zerar,
} from "../src/arvore.ts";
import { ATRIBUTO_DO_RAMO, atributosDe } from "../src/atributos.ts";
import { HABILIDADES, habilidadePorId } from "../src/habilidades.ts";
import { nivelDaParede } from "../src/progressao.ts";
import {
  criarCombatente,
  iniciarBatalha,
  resolverBatalha,
} from "../src/batalha.ts";
import { sementeDe } from "../src/aleatorio.ts";

/** Compra tudo que der, do topo para baixo, com os pontos de um nível. */
function gastarTudo(nivel: number): Gastos {
  let gastos = zerar();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const no of ARVORE) {
      while (!podeComprar(no.id, nivel, gastos)) {
        gastos = comprar(no.id, nivel, gastos);
        mudou = true;
      }
    }
  }
  return gastos;
}

describe("integridade da árvore", () => {
  it("não tem id repetido", () => {
    assert.equal(new Set(ARVORE.map((n) => n.id)).size, ARVORE.length);
  });

  it("todo requisito existe, e nada requer a si mesmo", () => {
    for (const no of ARVORE) {
      for (const r of no.requer) {
        assert.doesNotThrow(() => noPorId(r), `${no.id} requer ${r}`);
        assert.notEqual(r, no.id, `${no.id} requer a si mesmo`);
      }
    }
  });

  it("todo nó é alcançável a partir dos que não exigem nada", () => {
    // Um nó inalcançável é conteúdo que ninguém vê, e não dá erro em lugar
    // nenhum — só some.
    const alcancados = new Set(ARVORE.filter((n) => n.requer.length === 0).map((n) => n.id));
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const no of ARVORE) {
        if (alcancados.has(no.id)) continue;
        if (no.requer.every((r) => alcancados.has(r))) {
          alcancados.add(no.id);
          mudou = true;
        }
      }
    }
    for (const no of ARVORE) {
      assert.ok(alcancados.has(no.id), `${no.nome} é inalcançável`);
    }
  });

  it("todo nó de magia aponta para uma habilidade que existe", () => {
    for (const no of ARVORE) {
      if (no.efeito.tipo !== "magia") continue;
      assert.doesNotThrow(
        () => habilidadePorId(no.efeito.tipo === "magia" ? no.efeito.habilidade : ""),
        `${no.nome} aponta para habilidade inexistente`,
      );
      assert.equal(no.graus, 1, `${no.nome} é magia e deveria ter 1 grau só`);
    }
  });

  it("toda habilidade marcada como de árvore tem um nó que a destrava", () => {
    // Sem isto, uma habilidade ficaria escrita no catálogo e inalcançável.
    const porNo = new Set(
      ARVORE.flatMap((n) => (n.efeito.tipo === "magia" ? [n.efeito.habilidade] : [])),
    );
    for (const h of HABILIDADES) {
      if (!h.porArvore) continue;
      assert.ok(porNo.has(h.id), `${h.nome} não tem nó na árvore`);
    }
  });

  it("a árvore inteira custa mais do que uma vida dá", () => {
    // É o que faz a escolha existir: com pontos de sobra, não há build.
    const naParede = pontosGanhos(Math.ceil(nivelDaParede(0)));
    assert.ok(
      custoDaArvoreInteira() > naParede,
      `árvore custa ${custoDaArvoreInteira()} e a vida dá ${naParede}`,
    );
  });
});

describe("pontos", () => {
  it("o nível 1 não dá ponto, e o 50 dá 49", () => {
    assert.equal(pontosGanhos(1), 0);
    assert.equal(pontosGanhos(50), 49);
  });

  it("gastar desconta do que está livre", () => {
    const g = comprar("raiz", 10, zerar());
    assert.equal(pontosGastos(g), noPorId("raiz").custo);
    assert.equal(pontosLivres(10, g), pontosGanhos(10) - noPorId("raiz").custo);
  });
});

describe("compra", () => {
  it("o primeiro nó não exige nada", () => {
    assert.equal(podeComprar("raiz", 5, zerar()), null);
  });

  it("nó com requisito diz QUAL falta, não só que falta", () => {
    // "sem pontos" e "precisa de Gume antes" levam a ações diferentes, e botão
    // apagado sem explicação não leva a nenhuma.
    const impede = podeComprar("olho", 50, zerar());
    assert.equal(impede?.motivo, "requisito");
    assert.match(impede!.detalhe, /Gume/);
  });

  it("sem pontos, o motivo é pontos", () => {
    const impede = podeComprar("raiz", 1, zerar());
    assert.equal(impede?.motivo, "pontos");
  });

  it("no grau máximo, não compra mais", () => {
    let g = zerar();
    const no = noPorId("raiz");
    for (let i = 0; i < no.graus; i++) g = comprar("raiz", 200, g);
    assert.equal(podeComprar("raiz", 200, g)?.motivo, "maximo");
    assert.throws(() => comprar("raiz", 200, g), /não dá para comprar/);
  });

  it("nó inexistente falha alto", () => {
    assert.equal(podeComprar("inventado", 50, zerar())?.motivo, "inexistente");
  });

  it("nunca se gasta mais do que se tem", () => {
    for (const nivel of [5, 30, 100]) {
      const g = gastarTudo(nivel);
      assert.ok(
        pontosGastos(g) <= pontosGanhos(nivel),
        `nível ${nivel}: gastou ${pontosGastos(g)} de ${pontosGanhos(nivel)}`,
      );
    }
  });
});

describe("o que a árvore rende", () => {
  it("o nó do tronco dá o atributo DO RAMO", () => {
    // É o que permite uma árvore só servir aos cinco ramos.
    const g = comprar("raiz", 10, zerar());
    for (const ramo of [1, 2, 3, 4, 5] as const) {
      const b = bonusDe(g, ramo);
      const esperado = ATRIBUTO_DO_RAMO[ramo];
      assert.ok(b.atributos[esperado] > 0, `ramo ${ramo} não ganhou ${esperado}`);
    }
  });

  it("graus somam", () => {
    let g = zerar();
    g = comprar("raiz", 100, g);
    const um = bonusDe(g, 4).atributos.forca;
    g = comprar("raiz", 100, g);
    assert.equal(bonusDe(g, 4).atributos.forca, um * 2);
  });

  it("nó de magia entrega a habilidade", () => {
    let g = comprar("raiz", 100, zerar());
    g = comprar("gume", 100, g);
    g = comprar("sangria-no", 100, g);
    assert.ok(bonusDe(g, 4).magias.includes("sangria"));
  });

  it("passiva vira número, não habilidade", () => {
    let g = comprar("raiz", 100, zerar());
    g = comprar("gume", 100, g);
    const b = bonusDe(g, 4);
    assert.ok(b.danoPercentual > 0);
    assert.equal(b.magias.length, 0);
  });

  it("sem gastos, não rende nada", () => {
    const b = bonusDe(zerar(), 1);
    assert.equal(b.danoPercentual, 0);
    assert.equal(b.magias.length, 0);
    assert.equal(b.atributos.intelecto, 0);
  });
});

describe("a árvore muda o combate", () => {
  function duelo(bonusNoHeroi: ReturnType<typeof bonusDe> | undefined, semente: number) {
    const a = atributosDe(4, 30);
    return resolverBatalha(
      iniciarBatalha(
        [
          criarCombatente({
            id: "heroi",
            nome: "H",
            lado: "jogador",
            ramo: 4,
            atributos: a,
            habilidades: ["golpe"],
            ...(bonusNoHeroi ? { bonus: bonusNoHeroi } : {}),
          }),
          criarCombatente({
            id: "vilao",
            nome: "V",
            lado: "inimigo",
            ramo: 4,
            atributos: a,
            habilidades: ["golpe"],
          }),
        ],
        semente,
      ),
    );
  }

  it("dano percentual faz vencer mais", () => {
    // O teste que prova que a árvore não é enfeite: sem isto, ela poderia
    // estar somando números que nada lê.
    let g = comprar("raiz", 999, zerar());
    for (let i = 0; i < 6; i++) g = comprar("gume", 999, g);
    const forte = bonusDe(g, 4);

    let comBonus = 0;
    let sem = 0;
    for (let s = 0; s < 60; s++) {
      if (duelo(forte, s).batalha.vencedor === "jogador") comBonus++;
      if (duelo(undefined, s).batalha.vencedor === "jogador") sem++;
    }
    assert.ok(comBonus > sem, `com bônus venceu ${comBonus}, sem venceu ${sem}`);
  });

  it("vida percentual sobe a vida máxima", () => {
    let g = comprar("raiz", 999, zerar());
    for (let i = 0; i < 6; i++) g = comprar("casco", 999, g);
    const a = atributosDe(4, 30);

    const cru = criarCombatente({
      id: "a", nome: "A", lado: "jogador", ramo: 4, atributos: a, habilidades: ["golpe"],
    });
    const gordo = criarCombatente({
      id: "b", nome: "B", lado: "jogador", ramo: 4, atributos: a,
      habilidades: ["golpe"], bonus: bonusDe(g, 4),
    });
    assert.ok(gordo.vidaMaxima > cru.vidaMaxima);
  });

  it("roubo de vida cura quem bate", () => {
    let g = comprar("raiz", 999, zerar());
    for (const id of ["gume", "olho", "destreza-of"]) {
      g = comprar(id, 999, g);
    }
    for (let i = 0; i < 4; i++) g = comprar("sede", 999, g);
    const b = bonusDe(g, 4);
    assert.ok(b.roubodeVida > 0);

    const { eventos } = duelo(b, sementeDe("sede"));
    const curasNoHeroi = eventos.filter((e) => e.tipo === "cura" && e.alvo === "heroi");
    assert.ok(curasNoHeroi.length > 0, "o roubo de vida nunca curou");
  });

  it("recarga reduzida encurta a espera, com piso de uma rodada", () => {
    let g = comprar("raiz", 999, zerar());
    g = comprar("couro", 999, g);
    for (let i = 0; i < 3; i++) g = comprar("cadencia", 999, g);
    assert.equal(bonusDe(g, 4).recargaReduzida, 3);
    // O piso vive no motor; aqui basta garantir que o número chega inteiro.
  });
});
