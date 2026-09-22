import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adicionarPersonagem,
  comprarSlot,
  type Conta,
  contasNoMesmoIp,
  creditarPremium,
  criarConta,
  debitarPremium,
  emailPlausivel,
  normalizarConta,
  normalizarEmail,
  podeComprarSlot,
  precoDoProximoSlot,
  removerPersonagem,
  senhaAceitavel,
  slotsLivres,
  slotsTotais,
} from "../src/conta.ts";
import {
  PRECO_DO_PRIMEIRO_SLOT,
  SLOTS_GRATIS,
  SLOTS_MAXIMO,
} from "../src/balanceamento.ts";

const AGORA = 1_700_000_000_000;

function nova(premium = 0): Conta {
  return criarConta({
    id: "c1",
    email: "quem@exemplo.com",
    senha: "(opaco)",
    agora: AGORA,
    premium,
  });
}

describe("identidade", () => {
  it("o e-mail é normalizado, senão a mesma pessoa vira duas contas", () => {
    assert.equal(normalizarEmail("  Guilherme@Exemplo.COM "), "guilherme@exemplo.com");
    assert.equal(nova().email, "quem@exemplo.com");
  });

  it("recusa e-mail sem cara de e-mail", () => {
    for (const ruim of ["", "sem-arroba", "a@b", "a b@c.com", "@x.com"]) {
      assert.equal(emailPlausivel(ruim), false, ruim);
    }
    assert.ok(emailPlausivel("a.b+c@d.co.uk"));
  });

  it("a senha é julgada só pelo tamanho", () => {
    // Exigir maiúscula, número e símbolo produz "Senha1!" em toda parte.
    assert.equal(senhaAceitavel("1234567"), false);
    assert.ok(senhaAceitavel("uma frase comprida e boba"));
    assert.equal(senhaAceitavel("x".repeat(201)), false);
  });

  it("criar com e-mail inválido falha alto, e não guarda lixo", () => {
    assert.throws(
      () => criarConta({ id: "c", email: "nada", senha: "x", agora: AGORA }),
      /e-mail inválido/,
    );
  });
});

describe("slots", () => {
  it("começa com os gratuitos, todos livres", () => {
    const c = nova();
    assert.equal(slotsTotais(c), SLOTS_GRATIS);
    assert.equal(slotsLivres(c), SLOTS_GRATIS);
  });

  it("dois grátis, e não um", () => {
    /*
     * Com um só, perder o personagem para o permadeath encerra a conta até
     * alguém pagar — o jogo passaria a cobrar para continuar existindo.
     * Este teste existe para que reduzir o número seja uma decisão, e não
     * um ajuste de constante.
     */
    assert.ok(SLOTS_GRATIS >= 2);
  });

  it("ocupar slot reduz os livres, e sem slot não entra mais ninguém", () => {
    let c = nova();
    for (let i = 0; i < SLOTS_GRATIS; i++) c = adicionarPersonagem(c, `p${i}`);
    assert.equal(slotsLivres(c), 0);
    assert.throws(() => adicionarPersonagem(c, "sobra"), /sem slot livre/);
  });

  it("o mesmo personagem duas vezes não consome dois slots", () => {
    let c = adicionarPersonagem(nova(), "p1");
    c = adicionarPersonagem(c, "p1");
    assert.equal(c.personagens.length, 1);
  });

  it("apagar libera o slot — é a saída de quem não pode pagar o revive", () => {
    // Sem ela, dois túmulos nos dois slots gratuitos encerram o jogo.
    let c = adicionarPersonagem(nova(), "p1");
    c = removerPersonagem(c, "p1");
    assert.equal(slotsLivres(c), SLOTS_GRATIS);
  });

  it("o preço sobe a cada slot comprado", () => {
    // Slot é permanente, não consumo: a preço fixo, ter vinte personagens
    // vira gasto trivial e a decisão de qual manter desaparece.
    let c = nova(1_000_000);
    assert.equal(precoDoProximoSlot(c), PRECO_DO_PRIMEIRO_SLOT);
    let anterior = 0;
    for (let i = 0; i < 4; i++) {
      const preco = precoDoProximoSlot(c);
      assert.ok(preco > anterior, `slot ${i}: ${preco} não é maior que ${anterior}`);
      anterior = preco;
      c = comprarSlot(c);
    }
  });

  it("comprar cobra e entrega", () => {
    const c = nova(PRECO_DO_PRIMEIRO_SLOT + 7);
    const depois = comprarSlot(c);
    assert.equal(depois.premium, 7);
    assert.equal(slotsTotais(depois), SLOTS_GRATIS + 1);
  });

  it("sem saldo, o motivo diz quanto falta", () => {
    const { pode, motivo } = podeComprarSlot(nova(10));
    assert.equal(pode, false);
    assert.match(motivo!, /custa \d+ e você tem 10/);
    assert.throws(() => comprarSlot(nova(10)), /não dá para comprar slot/);
  });

  it("existe teto, e ele é dito", () => {
    let c = nova(1e9);
    while (slotsTotais(c) < SLOTS_MAXIMO) c = comprarSlot(c);
    const { pode, motivo } = podeComprarSlot(c);
    assert.equal(pode, false);
    assert.match(motivo!, /máximo/);
  });
});

describe("moeda premium", () => {
  it("credita e debita", () => {
    const c = creditarPremium(nova(), 100);
    assert.equal(c.premium, 100);
    assert.equal(debitarPremium(c, 40).premium, 60);
  });

  it("não debita mais do que existe, e o erro diz os dois números", () => {
    assert.throws(() => debitarPremium(nova(10), 11), /precisa de 11 e tem 10/);
  });

  it("recusa valor zero ou negativo em vez de virar crédito às avessas", () => {
    for (const v of [0, -5, Number.NaN]) {
      assert.throws(() => creditarPremium(nova(), v), /inválido/);
      assert.throws(() => debitarPremium(nova(100), v), /inválido/);
    }
  });
});

describe("dado gravado antes", () => {
  it("conta sem os campos novos não quebra", () => {
    // Mesmo motivo do `normalizar` de personagem: `undefined` circulando
    // estoura três camadas adiante, longe da causa.
    const antiga = {
      id: "c9",
      email: "velha@exemplo.com",
      senha: "(opaco)",
      criadaEm: AGORA,
    } as Conta;
    const c = normalizarConta(antiga);
    assert.equal(c.premium, 0);
    assert.equal(c.slotsComprados, 0);
    assert.deepEqual(c.personagens, []);
    assert.equal(c.visto, AGORA);
    assert.equal(slotsLivres(c), SLOTS_GRATIS);
  });
});

describe("sinal de IP", () => {
  const de = (id: string, ip?: string) =>
    criarConta({
      id,
      email: `${id}@t.com`,
      senha: "(direto)",
      agora: AGORA,
      ...(ip ? { ip } : {}),
    });

  it("conta o quanto de OUTRAS contas nascem do mesmo IP", () => {
    const a = de("a", "1.2.3.4");
    const b = de("b", "1.2.3.4");
    const c = de("c", "5.6.7.8");
    assert.equal(contasNoMesmoIp([a, b, c], a), 1);
    assert.equal(contasNoMesmoIp([a, b, c], c), 0);
  });

  it("sem IP capturado, o sinal é zero — não dá pra sinalizar o que não se sabe", () => {
    const sem = de("s");
    const outra = de("o", "1.2.3.4");
    assert.equal(contasNoMesmoIp([sem, outra], sem), 0);
  });

  it("nunca conta a própria conta", () => {
    const sozinha = de("a", "1.2.3.4");
    assert.equal(contasNoMesmoIp([sozinha], sozinha), 0);
  });
});
