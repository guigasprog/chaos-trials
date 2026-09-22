import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  criarPersonagem,
  custoDoRevive,
  escolherSubclasse,
  ganharVidaGuardada,
  ganharXp,
  habilidadesDoPersonagem,
  morrer,
  normalizar,
  perderBatalha,
  type Personagem,
  progredirOffline,
  prontoParaRenascer,
  recompensaDe,
  renascer,
  reviver,
  subclassesDisponiveis,
  vidaMaximaDe,
} from "../src/personagem.ts";
import {
  OFFLINE_TETO_HORAS,
  SUCATA_INICIAL,
  VIDAS_GUARDADAS_MAXIMO,
  VIDAS_POR_DIFICULDADE,
} from "../src/balanceamento.ts";
import { nivelDaParede, xpParaNivel } from "../src/progressao.ts";

const AGORA = 1_700_000_000_000;
const HORA = 3_600_000;

function novo(classeRaiz = 4): Personagem {
  return criarPersonagem({
    id: "p1",
    nome: "Teste",
    classeRaiz,
    agora: AGORA,
  });
}

/** Sobe até o nível pedido, sem depender da curva de XP. */
function noNivel(nivel: number, base = novo()): Personagem {
  return { ...base, nivel, vida: vidaMaximaDe({ ...base, nivel }) };
}

describe("criação", () => {
  it("nasce no nível 1, camada 0, com a vida cheia", () => {
    const p = novo();
    assert.equal(p.nivel, 1);
    assert.equal(p.camada, 0);
    assert.equal(p.estado, "vivo");
    assert.equal(p.vida, vidaMaximaDe(p));
    // Não zero: um presente de partida evita o arranque frio — ver
    // `SUCATA_INICIAL` em balanceamento.ts, com a medição completa.
    assert.equal(p.sucata, SUCATA_INICIAL);
    // Moeda premium NÃO fica aqui: é da conta, e sobrevive ao permadeath.
    assert.equal("premium" in p, false);
  });

  it("só se começa numa das cinco raízes", () => {
    for (const raiz of [1, 2, 3, 4, 5]) {
      assert.doesNotThrow(() => novo(raiz));
    }
    // 11 é Mage, subclasse — chegar nela é conquista da vida, não escolha
    // de criação.
    assert.throws(() => novo(11), /raízes/);
  });

  it("já começa com alguma habilidade", () => {
    assert.ok(habilidadesDoPersonagem(novo()).length > 0);
  });

  it("sem escolha explícita, nasce no médio", () => {
    assert.equal(novo().dificuldade, "medio");
    assert.equal(novo().vidasRestantes, VIDAS_POR_DIFICULDADE.medio);
  });

  it("nasce com as vidas da dificuldade escolhida, e zero guardadas", () => {
    for (const dificuldade of ["facil", "medio", "dificil"] as const) {
      const p = criarPersonagem({
        id: "p1",
        nome: "Teste",
        classeRaiz: 4,
        agora: AGORA,
        dificuldade,
      });
      assert.equal(p.dificuldade, dificuldade);
      assert.equal(p.vidasRestantes, VIDAS_POR_DIFICULDADE[dificuldade]);
      assert.equal(p.vidasGuardadas, 0);
    }
  });

  it("recusa dificuldade que não existe", () => {
    assert.throws(
      () =>
        criarPersonagem({
          id: "p1",
          nome: "Teste",
          classeRaiz: 4,
          agora: AGORA,
          // @ts-expect-error só para o teste
          dificuldade: "impossivel",
        }),
      /dificuldade/,
    );
  });
});

describe("perder uma luta", () => {
  it("com folga, recua e a conta de vidas desce", () => {
    const p = criarPersonagem({
      id: "p1", nome: "T", classeRaiz: 4, agora: AGORA, dificuldade: "facil",
    });
    const depois = perderBatalha(p);
    assert.equal(depois.estado, "vivo");
    assert.equal(depois.vidasRestantes, p.vidasRestantes - 1);
    assert.ok(depois.vida < p.vida, "recuar não machucou");
  });

  it("na última vida, sem guardada, morre de vez", () => {
    const p = criarPersonagem({
      id: "p1", nome: "T", classeRaiz: 4, agora: AGORA, dificuldade: "dificil",
    });
    assert.equal(p.vidasRestantes, 1);
    const depois = perderBatalha(p);
    assert.equal(depois.estado, "tumulo");
    assert.equal(depois.vidasRestantes, 0);
  });

  it("na última vida, COM guardada, sobrevive e a guardada some", () => {
    const p = ganharVidaGuardada(
      criarPersonagem({
        id: "p1", nome: "T", classeRaiz: 4, agora: AGORA, dificuldade: "dificil",
      }),
    );
    assert.equal(p.vidasGuardadas, 1);
    const depois = perderBatalha(p);
    assert.equal(depois.estado, "vivo", "a vida guardada devia ter coberto a queda");
    assert.equal(depois.vidasRestantes, 1);
    assert.equal(depois.vidasGuardadas, 0);
  });

  it("ganharVidaGuardada tem teto", () => {
    let p = novo();
    for (let i = 0; i < VIDAS_GUARDADAS_MAXIMO + 5; i++) {
      p = ganharVidaGuardada(p);
    }
    assert.equal(p.vidasGuardadas, VIDAS_GUARDADAS_MAXIMO);
  });

  it("reviver e renascer devolvem as vidas ao teto da dificuldade", () => {
    const dificil = criarPersonagem({
      id: "p1", nome: "T", classeRaiz: 4, agora: AGORA, dificuldade: "dificil",
    });
    const morto = { ...morrer(perderBatalha(dificil)) };
    const { personagem: revivido } = reviver(morto, custoDoRevive());
    assert.equal(revivido.vidasRestantes, VIDAS_POR_DIFICULDADE.dificil);

    const gasto = perderBatalha(criarPersonagem({
      id: "p2", nome: "T2", classeRaiz: 4, agora: AGORA, dificuldade: "facil",
    }));
    assert.ok(gasto.vidasRestantes < VIDAS_POR_DIFICULDADE.facil);
    const noNivelDaParede = noNivel(Math.ceil(nivelDaParede(0)), gasto);
    const renascido = renascer(noNivelDaParede, 1);
    assert.equal(renascido.vidasRestantes, VIDAS_POR_DIFICULDADE.facil);
  });
});

describe("normalizar", () => {
  it("personagem salvo antes da dificuldade existir ganha médio, vidas cheias", () => {
    const velho = { ...novo() } as Partial<Personagem> as Personagem;
    // @ts-expect-error simulando um registro salvo antes deste campo existir
    delete velho.dificuldade;
    // @ts-expect-error idem
    delete velho.vidasRestantes;
    // @ts-expect-error idem
    delete velho.vidasGuardadas;

    const normalizado = normalizar(velho);
    assert.equal(normalizado.dificuldade, "medio");
    assert.equal(normalizado.vidasRestantes, VIDAS_POR_DIFICULDADE.medio);
    assert.equal(normalizado.vidasGuardadas, 0);
  });
});

describe("XP e nível", () => {
  it("sobe um nível ao juntar o bastante", () => {
    const p = novo();
    const { personagem, niveisSubidos } = ganharXp(p, xpParaNivel(1));
    assert.equal(niveisSubidos, 1);
    assert.equal(personagem.nivel, 2);
    assert.equal(personagem.xp, 0);
  });

  it("sobe vários de uma vez, e guarda o resto", () => {
    const precisa = xpParaNivel(1) + xpParaNivel(2) + xpParaNivel(3);
    const { personagem, niveisSubidos } = ganharXp(novo(), precisa + 10);
    assert.equal(niveisSubidos, 3);
    assert.equal(personagem.nivel, 4);
    assert.ok(personagem.xp >= 10 - 1 && personagem.xp <= 10 + 1);
  });

  it("XP insuficiente acumula sem subir", () => {
    const { personagem, niveisSubidos } = ganharXp(novo(), 5);
    assert.equal(niveisSubidos, 0);
    assert.equal(personagem.nivel, 1);
    assert.equal(personagem.xp, 5);
  });

  it("quem está no túmulo não recebe XP", () => {
    // É o que dá peso ao permadeath: parado é tempo perdido de verdade.
    const morto = morrer(novo());
    const { personagem, niveisSubidos } = ganharXp(morto, 1e9);
    assert.equal(niveisSubidos, 0);
    assert.equal(personagem.nivel, 1);
    assert.equal(personagem.xp, 0);
  });

  it("recusa XP negativo em vez de subtrair em silêncio", () => {
    assert.throws(() => ganharXp(novo(), -10), /negativo/);
  });

  it("o saldo guardado é sempre inteiro", () => {
    // Uma fração no saldo não fica escondida: ela sai na ficha por extenso,
    // "1641.6686547393138 / 3616", que foi como este defeito apareceu.
    let p = novo();
    for (let i = 0; i < 40; i++) {
      p = ganharXp(p, 37.418).personagem;
      assert.ok(Number.isInteger(p.xp), `depois de ${i + 1} ganhos: ${p.xp}`);
    }
  });

  it("personagem gravado com XP fracionário sai inteiro da normalização", () => {
    const sujo = { ...novo(), xp: 1641.6686547393138 };
    assert.equal(normalizar(sujo).xp, 1642);
  });
});

describe("subclasse", () => {
  it("não há escolha antes do nível de destrave", () => {
    assert.deepEqual(subclassesDisponiveis(noNivel(9)), []);
    assert.ok(subclassesDisponiveis(noNivel(10)).length > 0);
  });

  it("a escolha avança na árvore e mantém o ramo", () => {
    const p = noNivel(10);
    const opcoes = subclassesDisponiveis(p);
    const escolhido = opcoes[0]!;
    const depois = escolherSubclasse(p, escolhido);
    assert.equal(depois.classe, escolhido);
    assert.equal(String(depois.classe)[0], String(p.classe)[0]);
  });

  it("escolher fora das opções falha alto", () => {
    const p = noNivel(10);
    assert.throws(() => escolherSubclasse(p, 1), /não pode virar/);
    assert.throws(() => escolherSubclasse(noNivel(5), 41), /não pode virar/);
  });

  it("a vida corrente nunca fica acima da máxima nova", () => {
    const p = { ...noNivel(10), vida: vidaMaximaDe(noNivel(10)) };
    const depois = escolherSubclasse(p, subclassesDisponiveis(p)[0]!);
    assert.ok(depois.vida <= vidaMaximaDe(depois));
  });

  it("uma classe folha não oferece mais nada", () => {
    // Shadow Knight (4411) é o fundo do ramo Melee.
    assert.deepEqual(subclassesDisponiveis({ ...noNivel(99), classe: 4411 }), []);
  });
});

describe("morte e túmulo", () => {
  it("morrer zera a vida, marca o túmulo e conta a morte", () => {
    const p = morrer(novo());
    assert.equal(p.estado, "tumulo");
    assert.equal(p.vida, 0);
    assert.equal(p.mortes, 1);
  });

  it("morrer de novo não conta duas vezes", () => {
    assert.equal(morrer(morrer(novo())).mortes, 1);
  });

  it("sem moeda premium não há saída do túmulo", () => {
    // Decisão de produto: NÃO existe caminho por sucata, por mais sucata que
    // se tenha.
    const morto = { ...morrer(novo()), sucata: 1e9 };
    assert.throws(() => reviver(morto, 0), /revive custa/);
  });

  it("com moeda premium NA CONTA sai do túmulo, e diz quanto cobrar", () => {
    // O saldo entra por parâmetro e o débito sai no retorno: a moeda é da
    // conta, e quem debita é quem tem a conta na mão. Aqui só se decide se
    // pode e quanto custa.
    const { personagem, pagou } = reviver(morrer(novo()), custoDoRevive() + 10);
    assert.equal(personagem.estado, "vivo");
    assert.equal(pagou, custoDoRevive());
    assert.ok(personagem.vida > 0);
  });

  it("revive preserva tudo que a vida acumulou", () => {
    const antes: Personagem = {
      ...noNivel(57),
      camada: 12,
      sucata: 4321,
      classe: 41,
    };
    const { personagem } = reviver(morrer(antes), custoDoRevive());
    assert.equal(personagem.nivel, 57);
    assert.equal(personagem.camada, 12);
    assert.equal(personagem.classe, 41);
    assert.equal(personagem.sucata, 4321);
  });

  it("não se revive quem está vivo", () => {
    assert.throws(() => reviver(novo(), 1e9), /túmulo/);
  });
});

describe("renascimento", () => {
  it("só na parede da camada", () => {
    const parede = Math.ceil(nivelDaParede(0));
    assert.ok(!prontoParaRenascer(noNivel(parede - 1)));
    assert.ok(prontoParaRenascer(noNivel(parede)));
    assert.throws(() => renascer(noNivel(parede - 1), 1), /ainda falta/);
  });

  it("sobe a camada, zera a vida e deixa escolher outra raiz", () => {
    const p = renascer(noNivel(Math.ceil(nivelDaParede(0))), 1);
    assert.equal(p.camada, 1);
    assert.equal(p.nivel, 1);
    assert.equal(p.xp, 0);
    assert.equal(p.classe, 1, "devia ter virado Wise");
    assert.equal(p.vida, vidaMaximaDe(p));
  });

  it("preserva a sucata — renascer é continuar, não recomeçar do zero", () => {
    // A moeda premium nem passa por aqui: ela é da conta, e renascer não
    // toca a conta.
    const rico = { ...noNivel(Math.ceil(nivelDaParede(0))), sucata: 900 };
    assert.equal(renascer(rico, 3).sucata, 900);
  });

  it("a parede da camada nova está mais longe", () => {
    const p = renascer(noNivel(Math.ceil(nivelDaParede(0))), 4);
    assert.ok(nivelDaParede(p.camada) > nivelDaParede(0));
    assert.ok(!prontoParaRenascer({ ...p, nivel: Math.ceil(nivelDaParede(0)) }));
  });

  it("quem está no túmulo não renasce", () => {
    const morto = morrer(noNivel(Math.ceil(nivelDaParede(0))));
    assert.ok(!prontoParaRenascer(morto));
  });
});

describe("progressão offline", () => {
  it("nada acontece sem tempo decorrido", () => {
    const r = progredirOffline(novo(), AGORA);
    assert.equal(r.batalhas, 0);
    assert.equal(r.xpGanho, 0);
  });

  it("rende de verdade depois de uma ausência", () => {
    const r = progredirOffline(noNivel(20), AGORA + 2 * HORA);
    assert.ok(r.batalhas > 0, "nenhuma batalha aconteceu");
    assert.ok(r.vitorias > 0, "não venceu nenhuma");
    assert.ok(r.xpGanho > 0);
    assert.ok(r.personagem.nivel >= 20);
  });

  it("o teto de 8 horas vale, por mais que a ausência tenha durado", () => {
    // Sem teto vira computação ilimitada por jogador e, pior, quem sumiu um
    // mês volta com o jogo resolvido.
    const umMes = progredirOffline(noNivel(20), AGORA + 720 * HORA);
    const oitoHoras = progredirOffline(noNivel(20), AGORA + 8 * HORA);
    assert.equal(umMes.horasCreditadas, OFFLINE_TETO_HORAS);
    assert.equal(umMes.batalhas, oitoHoras.batalhas);
  });

  it("é reproduzível — mesma entrada, mesmo resultado", () => {
    // O servidor recalcula isto na reconexão, e uma reclamação precisa poder
    // ser investigada.
    const a = progredirOffline(noNivel(25), AGORA + 3 * HORA);
    const b = progredirOffline(noNivel(25), AGORA + 3 * HORA);
    assert.deepEqual(a, b);
  });

  it("quem está no túmulo não rende nada", () => {
    const r = progredirOffline(morrer(noNivel(30)), AGORA + 8 * HORA);
    assert.equal(r.batalhas, 0);
    assert.equal(r.xpGanho, 0);
    assert.equal(r.personagem.estado, "tumulo");
  });

  it("derrota offline é recuo, nunca morte", () => {
    // Regra deliberada: só o julgamento mata, porque só nele a pessoa escolheu
    // arriscar. Offline não há julgamento — matar quem estava ausente seria
    // punir a ausência por uma aposta que ninguém fez.
    const condenado = { ...noNivel(1000), camada: 0 };
    const r = progredirOffline(condenado, AGORA + 8 * HORA);
    assert.equal(r.morreu, false);
    assert.equal(r.personagem.estado, "vivo");
    assert.ok(r.personagem.vida > 0, "recuou com vida");
    // E para na derrota, em vez de seguir perdendo enquanto ninguém olha.
    assert.ok(r.batalhas < 900, `seguiu por ${r.batalhas} batalhas`);
  });

  it("o relógio avança mesmo quando nada rende", () => {
    const r = progredirOffline(morrer(novo()), AGORA + 5 * HORA);
    assert.equal(r.personagem.visto, AGORA + 5 * HORA);
  });
});

describe("recompensa", () => {
  it("jogar ativo rende mais que ficar fora", () => {
    const ativo = recompensaDe(30, true);
    const offline = recompensaDe(30, false);
    assert.ok(ativo.xp > offline.xp);
    assert.ok(ativo.sucata > offline.sucata);
  });

  it("cresce com o nível", () => {
    assert.ok(recompensaDe(50, true).xp > recompensaDe(10, true).xp);
  });
});
