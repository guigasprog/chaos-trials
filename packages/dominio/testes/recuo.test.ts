import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atributosDe } from "../src/atributos.ts";
import {
  DESCANSO_POR_HORA,
  POCAO_CURA,
  VIDA_APOS_RECUAR,
} from "../src/balanceamento.ts";
import {
  criarCombatente,
  iniciarBatalha,
  resolverBatalha,
} from "../src/batalha.ts";
import { habilidadesDe } from "../src/habilidades.ts";
import {
  beberPocao,
  criarPersonagem,
  curaPorDescanso,
  ganharXp,
  type Personagem,
  podeBeberPocao,
  precoDaPocao,
  recompensaDe,
  recuar,
  vidaAposVitoria,
  vidaMaximaDe,
} from "../src/personagem.ts";
import { equilibrio, xpParaNivel } from "../src/progressao.ts";

/**
 * A vida atravessa as batalhas — e isso não pode virar um poço.
 *
 * ## O que este arquivo guardava antes
 *
 * Que a luta SEGUINTE a um recuo fosse vencível. Fazia sentido enquanto
 * vencer curava tudo: recuar era a única rede, e se ela não bastasse, o
 * personagem ficava preso perdendo para sempre — sem morrer e sem
 * voltar. Foi um defeito real, e caro: com 35% de vida a taxa de vitória
 * era 11% no nível 10 e ZERO no nível 3.
 *
 * ## O que ele guarda agora
 *
 * Vencer não cura mais. Recuar TAMBÉM não precisa mais — porque existem
 * três outras saídas: subir de nível (grátis e total), poção (custa
 * sucata) e descanso (custa tempo). A regra antiga virou errada pelo
 * lado oposto: com 70% no recuo, entrar numa luta com 30% e perder
 * DEVOLVIA vida, e perder seria a cura mais barata do jogo.
 *
 * Então o invariante mudou de "a próxima luta é vencível" para "sempre
 * existe caminho de volta, e ele é pagável". É o mesmo medo de antes —
 * ficar preso —, medido no lugar certo.
 */

const CLASSE = 4;
const NIVEIS = [3, 10, 25, 50] as const;

/** O mesmo oponente que o servidor monta em `batalhas.ts`. */
function oponente(nivel: number) {
  const base = atributosDe(4, nivel);
  const fator = Math.max(0.2, (1 / equilibrio(CLASSE, nivel, 0)) ** 0.5);
  const ajusta = (v: number) => Math.max(1, Math.round(v * fator));
  return {
    intelecto: ajusta(base.intelecto),
    presenca: ajusta(base.presenca),
    destreza: ajusta(base.destreza),
    forca: ajusta(base.forca),
    vigor: ajusta(base.vigor),
  };
}

const heroiNoNivel = (nivel: number): Personagem => {
  const base = criarPersonagem({ id: "p", nome: "P", classeRaiz: CLASSE, agora: 0 });
  const com = { ...base, nivel };
  return { ...com, vida: vidaMaximaDe(com) };
};

/** Uma luta do estado atual, com o resultado já aplicado ao personagem. */
function lutar(p: Personagem, semente: number) {
  const heroi = criarCombatente({
    id: "heroi",
    nome: "H",
    lado: "jogador",
    ramo: 4,
    atributos: atributosDe(CLASSE, p.nivel),
    habilidades: habilidadesDe(CLASSE, p.nivel).map((h) => h.id),
    vida: p.vida,
  });
  const { batalha } = resolverBatalha(
    iniciarBatalha(
      [
        heroi,
        criarCombatente({
          id: "vilao",
          nome: "V",
          lado: "inimigo",
          ramo: 4,
          atributos: oponente(p.nivel),
          habilidades: habilidadesDe(4, p.nivel)
            .map((h) => h.id)
            .filter((h) => h !== "recompor"),
        }),
      ],
      semente,
    ),
  );

  if (batalha.vencedor !== "jogador") return { p: recuar(p), venceu: false };

  const premio = recompensaDe(p.nivel, true);
  const ganho = ganharXp(p, premio.xp);
  const sobrou = batalha.combatentes.heroi?.vida ?? 1;
  return {
    p: {
      ...ganho.personagem,
      sucata: ganho.personagem.sucata + premio.sucata,
      vida:
        ganho.niveisSubidos > 0
          ? ganho.personagem.vida
          : vidaAposVitoria(ganho.personagem, sobrou),
    },
    venceu: true,
  };
}

/** Taxa de vitória entrando com `fracao` da vida máxima. */
function taxaDeVitoria(nivel: number, fracao: number, amostra = 120): number {
  let vitorias = 0;
  for (let s = 0; s < amostra; s++) {
    const cheio = heroiNoNivel(nivel);
    const ferido = {
      ...cheio,
      vida: Math.max(1, Math.round(vidaMaximaDe(cheio) * fracao)),
    };
    if (lutar(ferido, s).venceu) vitorias += 1;
  }
  return vitorias / amostra;
}

describe("recuar nunca cura", () => {
  it("quem entra machucado não sai melhor", () => {
    /*
     * Com 0,70 e vida persistente, entrar com 30%, perder e sair com 70%
     * fazia de perder a cura mais barata do jogo. O piso de recuo tem de
     * ficar abaixo de qualquer estado em que valha a pena lutar.
     */
    assert.ok(
      VIDA_APOS_RECUAR < 0.3,
      `o piso de recuo (${VIDA_APOS_RECUAR}) está alto demais para não curar`,
    );
    for (const nivel of NIVEIS) {
      const p = heroiNoNivel(nivel);
      const depois = recuar(p);
      assert.ok(
        depois.vida < p.vida,
        `nível ${nivel}: recuar de ${p.vida} devolveu ${depois.vida}`,
      );
      assert.ok(depois.vida >= 1, "recuar não pode zerar a vida");
    }
  });

  it("vencer TAMBÉM não cura — a vida atravessa a batalha", () => {
    // Era o oposto, e era a única rede. Sem este teste, a mudança inteira
    // pode voltar a ser inerte sem ninguém notar.
    const p = heroiNoNivel(25);
    const machucado = { ...p, vida: Math.round(vidaMaximaDe(p) * 0.5) };
    assert.equal(vidaAposVitoria(machucado, 80), 80);
    assert.equal(
      vidaAposVitoria(machucado, vidaMaximaDe(p) * 10),
      vidaMaximaDe(p),
      "a vida não pode passar do máximo",
    );
  });

  it("subir de nível cura por completo", () => {
    /*
     * É a única cura grátis, e ela existe porque o nível novo aumenta a
     * vida máxima: chegar nele com a barra pela metade transformaria a
     * recompensa em "agora você tem mais vida faltando".
     */
    const p = heroiNoNivel(10);
    const quaseMorto = { ...p, vida: 1 };
    const ganho = ganharXp(quaseMorto, xpParaNivel(10));
    assert.equal(ganho.niveisSubidos, 1);
    assert.equal(ganho.personagem.vida, vidaMaximaDe(ganho.personagem));
  });
});

describe("sempre existe caminho de volta", () => {
  it("o descanso sozinho traz de volta, em todo nível", () => {
    /*
     * A garantia que substitui a regra antiga. Descanso é grátis e não
     * depende de sucata, de sorte nem de vitória — é o que torna
     * impossível ficar preso, que era o medo original.
     */
    for (const nivel of NIVEIS) {
      const derrotado = recuar(heroiNoNivel(nivel));
      const maxima = vidaMaximaDe(derrotado);
      const horas = Math.ceil((1 - VIDA_APOS_RECUAR) / DESCANSO_POR_HORA);
      const curado = {
        ...derrotado,
        vida: derrotado.vida + curaPorDescanso(derrotado, horas),
      };
      assert.equal(curado.vida, maxima, `nível ${nivel} não encheu em ${horas}h`);
      assert.ok(horas <= 4, `${horas}h é espera demais`);
    }
  });

  it("com a vida cheia, a luta volta a ser vencível", () => {
    // O poço antigo era "recuperar não basta". Aqui se confirma que, de
    // volta ao cheio, o jogo continua ganhável.
    for (const nivel of NIVEIS) {
      const taxa = taxaDeVitoria(nivel, 1);
      assert.ok(taxa > 0.5, `nível ${nivel}: só ${Math.round(taxa * 100)}% cheio`);
    }
  });

  it("uma poção basta para voltar a lutar", () => {
    // Se fosse preciso mais de uma, o custo de uma derrota dobraria e a
    // poção deixaria de ser a saída rápida que ela promete ser.
    for (const nivel of NIVEIS) {
      const derrotado = recuar(heroiNoNivel(nivel));
      const depois = beberPocao({ ...derrotado, sucata: 1e6 }).personagem;
      const fracao = depois.vida / vidaMaximaDe(depois);
      assert.ok(
        fracao > 0.5,
        `nível ${nivel}: uma poção deixa em ${Math.round(fracao * 100)}%`,
      );
      assert.ok(POCAO_CURA > VIDA_APOS_RECUAR);
    }
  });

  it("a poção é pagável com o que o jogo rende", () => {
    /*
     * O número que faz o laço fechar. A primeira tentativa custava 5,5
     * vitórias por poção, num ritmo de duas lutas por poção — impagável,
     * e o jogador ficaria parado esperando as três horas de descanso
     * para sempre.
     */
    for (const nivel of NIVEIS) {
      const p = heroiNoNivel(nivel);
      const porVitoria = recompensaDe(nivel, true).sucata;
      const emVitorias = precoDaPocao(p) / porVitoria;
      assert.ok(
        emVitorias < 2,
        `nível ${nivel}: a poção custa ${emVitorias.toFixed(1)} vitórias`,
      );
    }
  });

  it("o ARRANQUE FRIO: nascer, perder a primeira luta, e ainda pagar a poção", () => {
    /*
     * O caso que faltava, e que um playtest de ponta a ponta achou: toda
     * medição acima parte de `heroiNoNivel`, que já carrega o presente de
     * partida — mas nenhuma delas testava o momento exato em que ele
     * existe PARA resolver: o personagem que acabou de nascer, perdeu a
     * primeira luta (a pior sorte possível, cedo demais para ter
     * aprendido a usar a habilidade de recarga), e precisa da poção para
     * continuar.
     *
     * Sem `SUCATA_INICIAL`, esta é a luta perdida número um: sucata some
     * a 0, e sem sucata a poção não sai. Simulado em
     * `scripts/arranque-frio-golpe.ts` (removido depois de medir): sem
     * presente de partida, 33,7% dos personagens travavam já nas
     * primeiras 15 ações — o pior tipo de bug, porque acontece no
     * PRIMEIRO minuto de jogo.
     */
    const recemNascido = criarPersonagem({
      id: "p",
      nome: "P",
      classeRaiz: CLASSE,
      agora: 0,
    });
    const perdeuAPrimeira = recuar(recemNascido);
    assert.equal(
      podeBeberPocao(perdeuAPrimeira),
      null,
      `sem sucata para a primeira poção: tem ${perdeuAPrimeira.sucata}, precisa de ${precoDaPocao(perdeuAPrimeira)}`,
    );
  });
});

describe("a corrida longa não trava", () => {
  it("em 200 passos ninguém fica preso, e a sucata cresce", () => {
    /*
     * O teste que substitui o da cauda. Ele não pergunta "a próxima luta
     * é vencível" — pergunta o que de fato importa: jogando muito tempo
     * seguido, o jogador AVANÇA, ou afunda até só poder descansar?
     *
     * A regra do laço é a do jogo: luta quando dá, bebe quando pode,
     * descansa quando não pode. Contar os descansos é o que distingue
     * "difícil" de "travado".
     */
    for (const nivelInicial of [3, 10, 50]) {
      let p = {
        ...heroiNoNivel(nivelInicial),
        sucata: recompensaDe(nivelInicial, true).sucata * 2,
      };
      const sucataInicial = p.sucata;
      let lutas = 0;
      let descansos = 0;

      for (let i = 0; i < 200; i++) {
        if (p.vida >= vidaMaximaDe(p) * 0.45) {
          p = lutar(p, i * 13 + nivelInicial).p;
          lutas += 1;
        } else if (p.sucata >= precoDaPocao(p)) {
          p = beberPocao(p).personagem;
        } else {
          p = { ...p, vida: p.vida + curaPorDescanso(p, 1) };
          descansos += 1;
        }
      }

      assert.ok(
        p.nivel > nivelInicial,
        `nível ${nivelInicial}: 200 passos e não subiu nenhum nível`,
      );
      assert.ok(
        p.sucata > sucataInicial,
        `nível ${nivelInicial}: a sucata caiu de ${sucataInicial} para ${p.sucata}`,
      );
      assert.ok(
        lutas > 100,
        `nível ${nivelInicial}: só ${lutas} lutas em 200 passos`,
      );
      assert.equal(
        descansos,
        0,
        `nível ${nivelInicial}: precisou parar ${descansos} vezes por falta de sucata`,
      );
    }
  });
});
