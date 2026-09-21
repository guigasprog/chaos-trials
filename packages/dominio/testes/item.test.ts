import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bonusDoEquipamento,
  bonusDoItem,
  ENCAIXES,
  gerarItem,
  type Item,
  ordemDaRaridade,
  PERFIL,
  poderDoItem,
  precoDeDesmanche,
  propriedadesDe,
  RARIDADES,
  somarBonus,
  sortearQueda,
} from "../src/item.ts";
import { ATRIBUTO_DO_RAMO, atributosDe } from "../src/atributos.ts";
import { SEM_BONUS } from "../src/arvore.ts";
import {
  criarCombatente,
  iniciarBatalha,
  resolverBatalha,
} from "../src/batalha.ts";
import {
  criarPersonagem,
  desequipar,
  desmanchar,
  equipar,
  guardarItem,
  MOCHILA_MAXIMA,
  normalizar,
  type Personagem,
  bonusDoPersonagem,
  vidaMaximaDe,
} from "../src/personagem.ts";

const item = (semente: number, extra: Partial<Parameters<typeof gerarItem>[0]> = {}) =>
  gerarItem({ nivel: 30, ramo: 4, semente, id: `i${semente}`, ...extra });

describe("geração", () => {
  it("a mesma semente dá o mesmo item, sempre", () => {
    // Determinismo é o que permite ao servidor recalcular uma batalha e
    // auditar uma reclamação de economia sem acreditar em ninguém.
    assert.deepEqual(item(7), item(7));
  });

  it("sementes diferentes dão itens diferentes", () => {
    const nomes = new Set(Array.from({ length: 40 }, (_, i) => item(i).nome));
    assert.ok(nomes.size > 10, `só ${nomes.size} nomes diferentes em 40`);
  });

  it("todo item cai num encaixe conhecido e tem pelo menos uma propriedade", () => {
    for (let s = 0; s < 200; s++) {
      const i = item(s);
      assert.ok(ENCAIXES.includes(i.encaixe), i.encaixe);
      assert.ok(
        propriedadesDe(i).length > 0,
        `item ${s} saiu sem nenhuma propriedade`,
      );
    }
  });

  it("raridade mais alta rende mais poder", () => {
    // Sem isto, a raridade seria só uma cor: o jogador aprenderia a
    // ignorá-la, e o sistema inteiro de itens perderia o eixo.
    const medias = RARIDADES.map((raridade) => {
      const total = Array.from({ length: 60 }, (_, s) =>
        poderDoItem(item(s, { raridade })),
      ).reduce((a, b) => a + b, 0);
      return total / 60;
    });
    for (let i = 1; i < medias.length; i++) {
      assert.ok(
        medias[i]! > medias[i - 1]!,
        `${RARIDADES[i]} (${medias[i]!.toFixed(0)}) não supera ${RARIDADES[i - 1]} (${medias[i - 1]!.toFixed(0)})`,
      );
    }
  });

  it("item de nível alto é melhor, mas não absurdamente", () => {
    // Cresce com a raiz do nível: linear faria o item do 400 valer
    // quarenta vezes o do 10, e nenhuma build sobreviveria à sorte.
    const medio = (nivel: number) =>
      Array.from({ length: 40 }, (_, s) =>
        poderDoItem(item(s, { nivel, raridade: "vitral" })),
      ).reduce((a, b) => a + b, 0) / 40;

    const baixo = medio(10);
    const alto = medio(400);
    assert.ok(alto > baixo, "nível não influi");
    assert.ok(alto < baixo * 12, `${alto.toFixed(0)} contra ${baixo.toFixed(0)} é demais`);
  });

  it("o afixo do ramo dá o atributo daquele ramo", () => {
    for (const ramo of [1, 2, 3, 4, 5] as const) {
      const esperado = ATRIBUTO_DO_RAMO[ramo];
      const algum = Array.from({ length: 60 }, (_, s) =>
        item(s, { ramo, raridade: "sagrado" }),
      ).some((i) => i.atributos[esperado] > 0);
      assert.ok(algum, `nenhum item do ramo ${ramo} deu ${esperado}`);
    }
  });

  it("a raridade sorteada respeita a ordem dos pesos", () => {
    const conta = new Map(RARIDADES.map((r) => [r, 0]));
    for (let s = 0; s < 20_000; s++) {
      const i = item(s);
      conta.set(i.raridade, conta.get(i.raridade)! + 1);
    }
    for (let i = 1; i < RARIDADES.length; i++) {
      const raro = conta.get(RARIDADES[i]!)!;
      const comum = conta.get(RARIDADES[i - 1]!)!;
      assert.ok(
        raro < comum,
        `${RARIDADES[i]} saiu ${raro} vezes e ${RARIDADES[i - 1]} ${comum}`,
      );
    }
    // E o sagrado existe: peso 1 em 1.579 não pode virar peso 0 na prática.
    assert.ok(conta.get("sagrado")! > 0, "sagrado nunca caiu em 20 mil");
  });
});

describe("queda", () => {
  const queda = (semente: number, mortal = false) =>
    sortearQueda({ nivel: 20, ramo: 4, semente, id: `q${semente}`, mortal });

  it("a batalha comum nem sempre larga", () => {
    const caiu = Array.from({ length: 400 }, (_, s) => queda(s)).filter(Boolean);
    assert.ok(caiu.length > 40, `caiu só ${caiu.length} em 400`);
    assert.ok(caiu.length < 360, `caiu ${caiu.length} em 400 — quase sempre`);
  });

  it("o julgamento SEMPRE larga", () => {
    // É a luta em que se morre de verdade; sair de mãos vazias
    // transformaria o risco em aposta ruim.
    for (let s = 0; s < 100; s++) {
      assert.ok(queda(s, true), `julgamento ${s} não largou nada`);
    }
  });

  it("o julgamento larga melhor, na cauda", () => {
    const media = (mortal: boolean) => {
      const itens = Array.from({ length: 3000 }, (_, s) => queda(s, mortal)).filter(
        (i): i is Item => i !== null,
      );
      return (
        itens.reduce((soma, i) => soma + ordemDaRaridade(i.raridade), 0) / itens.length
      );
    };
    assert.ok(media(true) > media(false));
  });
});

describe("o que o item rende", () => {
  it("o bônus do item tem a mesma forma do bônus da árvore", () => {
    // Uma forma só: "mais 8% de dano" tem de significar exatamente a mesma
    // coisa vindo dos dois lados.
    const b = bonusDoItem(item(3, { raridade: "sagrado" }));
    assert.deepEqual(Object.keys(b).sort(), Object.keys(SEM_BONUS).sort());
  });

  it("somar bônus soma tudo e não repete magia", () => {
    const a = { ...SEM_BONUS, danoPercentual: 0.1, magias: ["sangria"] };
    const b = { ...SEM_BONUS, danoPercentual: 0.2, magias: ["sangria", "fulgor"] };
    const total = somarBonus(a, b);
    assert.equal(Math.round(total.danoPercentual * 100), 30);
    assert.deepEqual([...total.magias].sort(), ["fulgor", "sangria"]);
  });

  it("os quatro encaixes somam juntos", () => {
    const equipado = Object.fromEntries(
      ENCAIXES.map((e, i) => [e, item(100 + i, { raridade: "relicario" })]),
    );
    const total = bonusDoEquipamento(equipado);
    const umSo = bonusDoItem(item(100, { raridade: "relicario" }));
    assert.ok(poderTotal(total) > poderTotal(umSo));
  });
});

function poderTotal(b: ReturnType<typeof bonusDoItem>) {
  const a = b.atributos;
  return (
    a.intelecto + a.presenca + a.destreza + a.forca + a.vigor +
    (b.danoPercentual + b.vidaPercentual + b.criticoAdicional) * 100
  );
}

describe("mochila e encaixes", () => {
  const novo = (): Personagem =>
    criarPersonagem({ id: "p1", nome: "T", classeRaiz: 4, agora: 0 });

  it("nasce com a mochila vazia e nada vestido", () => {
    const p = novo();
    assert.deepEqual(p.mochila, []);
    assert.deepEqual(p.equipado, {});
  });

  it("guardar põe na mochila, e o teto é respeitado", () => {
    let p = novo();
    for (let i = 0; i < MOCHILA_MAXIMA; i++) p = guardarItem(p, item(i));
    assert.equal(p.mochila.length, MOCHILA_MAXIMA);
    assert.throws(() => guardarItem(p, item(999)), /cheia/);
  });

  it("equipar tira da mochila e veste", () => {
    const peca = item(1);
    const p = equipar(guardarItem(novo(), peca), peca.id);
    assert.equal(p.mochila.length, 0);
    assert.equal(p.equipado[peca.encaixe]?.id, peca.id);
  });

  it("trocar de peça devolve a antiga para a mochila, num passo só", () => {
    // Em dois passos haveria um instante com a mochila cheia e a peça
    // antiga sem lugar.
    const antiga = item(1, { raridade: "bruto" });
    let p = equipar(guardarItem(novo(), antiga), antiga.id);

    // Uma peça nova do MESMO encaixe.
    let nova = item(2);
    for (let s = 3; nova.encaixe !== antiga.encaixe && s < 200; s++) nova = item(s);
    p = equipar(guardarItem(p, nova), nova.id);

    assert.equal(p.equipado[antiga.encaixe]?.id, nova.id);
    assert.deepEqual(p.mochila.map((i) => i.id), [antiga.id]);
  });

  it("desequipar volta para a mochila, e recusa se não couber", () => {
    const peca = item(1);
    let p = equipar(guardarItem(novo(), peca), peca.id);
    p = desequipar(p, peca.encaixe);
    assert.equal(p.equipado[peca.encaixe], undefined);
    assert.equal(p.mochila.length, 1);

    let cheio = equipar(guardarItem(novo(), peca), peca.id);
    for (let i = 0; i < MOCHILA_MAXIMA; i++) cheio = guardarItem(cheio, item(500 + i));
    assert.throws(() => desequipar(cheio, peca.encaixe), /cheia/);
  });

  it("desequipar encaixe vazio diz qual está vazio", () => {
    assert.throws(() => desequipar(novo(), "elmo"), /Elmo/);
  });

  it("desmanchar troca a peça por sucata", () => {
    const base = novo();
    const peca = item(1, { raridade: "vitral" });
    const p = guardarItem(base, peca);
    const { personagem, sucata } = desmanchar(p, peca.id);
    assert.equal(sucata, precoDeDesmanche(peca));
    assert.ok(sucata > 0);
    assert.equal(personagem.mochila.length, 0);
    // Soma à sucata que já havia — não substitui. `base.sucata` é o
    // presente de partida (`SUCATA_INICIAL`), não zero.
    assert.equal(personagem.sucata, base.sucata + sucata);
  });

  it("não se desmancha o que está vestido — tem de sair do corpo antes", () => {
    const peca = item(1);
    const p = equipar(guardarItem(novo(), peca), peca.id);
    assert.throws(() => desmanchar(p, peca.id), /não está na mochila/);
  });
});

describe("o equipamento muda o combate", () => {
  const novo = (): Personagem =>
    criarPersonagem({ id: "p1", nome: "T", classeRaiz: 4, agora: 0 });

  it("o que está vestido entra no bônus do personagem", () => {
    const peca = item(1, { raridade: "sagrado" });
    const p = equipar(guardarItem(novo(), peca), peca.id);
    const b = bonusDoPersonagem(p);
    assert.ok(poderTotal(b) > 0, "o equipamento não chegou ao bônus");
  });

  it("uma peça com vida sobe a vida máxima da FICHA", () => {
    // O mesmo defeito que a árvore teve: somar no objeto e ninguém ler.
    let peca = item(1);
    for (let s = 2; peca.vidaPercentual === 0 && s < 400; s++) {
      peca = item(s, { raridade: "sagrado" });
    }
    const antes = vidaMaximaDe(novo());
    const depois = vidaMaximaDe(equipar(guardarItem(novo(), peca), peca.id));
    assert.ok(depois > antes, `${depois} não é maior que ${antes}`);
  });

  it("vestido de sagrado se vence mais do que pelado", () => {
    /*
     * O teste que prova que o item não é enfeite. A árvore já teve esse
     * defeito exato — bônus somado num objeto que o combate não lia —, e
     * ele não foi pego por seis testes que olhavam o objeto.
     */
    const equipado = Object.fromEntries(
      ENCAIXES.map((e, i) => {
        let peca = item(700 + i * 37, { raridade: "sagrado" });
        for (let s = 0; peca.encaixe !== e && s < 300; s++) {
          peca = item(s, { raridade: "sagrado" });
        }
        return [e, peca];
      }),
    );

    const duelo = (bonus: ReturnType<typeof bonusDoItem> | undefined, s: number) =>
      resolverBatalha(
        iniciarBatalha(
          [
            criarCombatente({
              id: "heroi", nome: "H", lado: "jogador", ramo: 4,
              atributos: atributosDe(4, 30), habilidades: ["golpe"],
              ...(bonus ? { bonus } : {}),
            }),
            criarCombatente({
              id: "vilao", nome: "V", lado: "inimigo", ramo: 4,
              atributos: atributosDe(4, 30), habilidades: ["golpe"],
            }),
          ],
          s,
        ),
      );

    let vestido = 0;
    let pelado = 0;
    for (let s = 0; s < 60; s++) {
      if (duelo(bonusDoEquipamento(equipado), s).batalha.vencedor === "jogador") vestido++;
      if (duelo(undefined, s).batalha.vencedor === "jogador") pelado++;
    }
    assert.ok(vestido > pelado, `vestido venceu ${vestido}, pelado ${pelado}`);
  });
});

describe("dado gravado antes dos itens", () => {
  it("personagem sem mochila nem equipamento não quebra", () => {
    // Como o dado sai do arquivo: sem os campos que ainda não existiam.
    const { mochila, equipado, ...antigo } = criarPersonagem({
      id: "p",
      nome: "V",
      classeRaiz: 4,
      agora: 0,
    });
    void mochila;
    void equipado;

    const p = normalizar(antigo as Personagem);
    assert.deepEqual(p.mochila, []);
    assert.deepEqual(p.equipado, {});
    assert.doesNotThrow(() => bonusDoPersonagem(p));
    assert.doesNotThrow(() => vidaMaximaDe(p));
  });
});

describe("preço de desmanche", () => {
  it("nunca é zero, nem negativo", () => {
    for (let s = 0; s < 300; s++) {
      assert.ok(precoDeDesmanche(item(s, { nivel: 1 })) >= 1);
    }
  });

  it("paga pouco perto do que uma vitória rende", () => {
    /*
     * Se desmanchar pagasse bem, o melhor jogo seria repetir a luta mais
     * fácil para sempre — e o sistema de itens viraria uma máquina de
     * moeda em vez de uma decisão de build.
     */
    const peca = item(1, { nivel: 30, raridade: "relicario" });
    assert.ok(precoDeDesmanche(peca) < poderDoItem(peca));
  });
});
