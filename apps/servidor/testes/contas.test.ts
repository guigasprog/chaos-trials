import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { SLOTS_GRATIS } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { conferirSenha, guardarSenha } from "../src/senhas.ts";
import { Sessoes, tokenDoCabecalho } from "../src/sessoes.ts";

/**
 * Cadastro, entrada, sessão, slots e posse.
 *
 * Separado de `api.test.ts` porque aquele arquivo monta uma sessão pronta
 * para poder falar de jogo; aqui o assunto É a porta de entrada, e ela
 * precisa ser exercitada sem atalho.
 */

const AGORA = 1_700_000_000_000;

function montar() {
  const sessoes = new Sessoes();
  let relogio = AGORA;
  const app = criarAplicacao({
    armazenamento: emMemoria(),
    agora: () => relogio,
    sessoes,
  });
  return {
    app,
    sessoes,
    avancar: (ms: number) => {
      relogio += ms;
    },
  };
}

async function cadastrar(
  app: FastifyInstance,
  email = "quem@exemplo.com",
  senha = "uma senha comprida",
) {
  const r = await app.inject({
    method: "POST",
    url: "/contas",
    payload: { email, senha },
  });
  assert.equal(r.statusCode, 201, r.body);
  return r.json() as { token: string; conta: Record<string, never> };
}

const comToken = (token: string) => ({ authorization: `Bearer ${token}` });

describe("cadastro", () => {
  it("cria a conta e já devolve a sessão aberta", async () => {
    const { app } = montar();
    const { token, conta } = await cadastrar(app);
    assert.ok(token.length > 20);
    assert.equal((conta as Record<string, unknown>).email, "quem@exemplo.com");
    await app.close();
  });

  it("a senha NUNCA sai na resposta, em forma nenhuma", async () => {
    const { app } = montar();
    const r = await app.inject({
      method: "POST",
      url: "/contas",
      payload: { email: "a@b.com", senha: "segredo do mundo" },
    });
    assert.equal(r.body.includes("segredo do mundo"), false);
    assert.equal(r.body.includes("senha"), false);
    assert.equal(r.body.includes("scrypt"), false);
    await app.close();
  });

  it("e-mail repetido é recusado, mesmo com outra caixa", async () => {
    const { app } = montar();
    await cadastrar(app, "Guilherme@Exemplo.com");
    const r = await app.inject({
      method: "POST",
      url: "/contas",
      payload: { email: "guilherme@exemplo.COM", senha: "outra senha longa" },
    });
    assert.equal(r.statusCode, 409);
    await app.close();
  });

  it("senha curta é recusada com o motivo", async () => {
    const { app } = montar();
    const r = await app.inject({
      method: "POST",
      url: "/contas",
      payload: { email: "a@b.com", senha: "curta" },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /8 a 200/);
    await app.close();
  });

  it("e-mail inválido é recusado", async () => {
    const { app } = montar();
    const r = await app.inject({
      method: "POST",
      url: "/contas",
      payload: { email: "nem parece", senha: "uma senha comprida" },
    });
    assert.equal(r.statusCode, 400);
    await app.close();
  });
});

describe("entrada", () => {
  it("entra com a senha certa e recebe token novo", async () => {
    const { app } = montar();
    const primeiro = await cadastrar(app);
    const r = await app.inject({
      method: "POST",
      url: "/sessoes",
      payload: { email: "quem@exemplo.com", senha: "uma senha comprida" },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.notEqual(r.json().token, primeiro.token, "token reaproveitado");
    await app.close();
  });

  it("senha errada e e-mail inexistente dão a MESMA resposta", async () => {
    // Respostas diferentes contam ao atacante quais e-mails existem, e a
    // base inteira vira enumerável.
    const { app } = montar();
    await cadastrar(app);

    const senhaErrada = await app.inject({
      method: "POST",
      url: "/sessoes",
      payload: { email: "quem@exemplo.com", senha: "chute errado aqui" },
    });
    const semConta = await app.inject({
      method: "POST",
      url: "/sessoes",
      payload: { email: "ninguem@exemplo.com", senha: "chute errado aqui" },
    });

    assert.equal(senhaErrada.statusCode, 401);
    assert.equal(semConta.statusCode, 401);
    assert.equal(senhaErrada.body, semConta.body);
    await app.close();
  });

  it("sair invalida aquele token, e só aquele", async () => {
    const { app } = montar();
    const a = await cadastrar(app);
    const b = (
      await app.inject({
        method: "POST",
        url: "/sessoes",
        payload: { email: "quem@exemplo.com", senha: "uma senha comprida" },
      })
    ).json();

    await app.inject({
      method: "DELETE",
      url: "/sessoes",
      headers: comToken(a.token),
    });

    const comOAntigo = await app.inject({
      method: "GET",
      url: "/eu",
      headers: comToken(a.token),
    });
    const comOOutro = await app.inject({
      method: "GET",
      url: "/eu",
      headers: comToken(b.token),
    });
    assert.equal(comOAntigo.statusCode, 401);
    assert.equal(comOOutro.statusCode, 200);
    await app.close();
  });
});

describe("sessão exigida", () => {
  it("sem token, nenhuma rota de jogo responde", async () => {
    const { app } = montar();
    const rotas: [string, string][] = [
      ["GET", "/eu"],
      ["POST", "/eu/slots"],
      ["POST", "/personagens"],
      ["GET", "/personagens/qualquer"],
      ["DELETE", "/personagens/qualquer"],
      ["POST", "/personagens/qualquer/batalhas"],
      ["POST", "/personagens/qualquer/arvore"],
      ["POST", "/personagens/qualquer/subclasse"],
      ["POST", "/personagens/qualquer/renascer"],
      ["POST", "/personagens/qualquer/reviver"],
      ["POST", "/batalhas/b1/turnos"],
    ];
    for (const [method, url] of rotas) {
      const r = await app.inject({ method: method as "GET", url, payload: {} });
      assert.equal(r.statusCode, 401, `${method} ${url} respondeu ${r.statusCode}`);
    }
    await app.close();
  });

  it("token inventado não passa", async () => {
    const { app } = montar();
    const r = await app.inject({
      method: "GET",
      url: "/eu",
      headers: comToken("nada-disso"),
    });
    assert.equal(r.statusCode, 401);
    await app.close();
  });

  it("o que fica aberto é só o que não é de ninguém", async () => {
    const { app } = montar();
    for (const url of ["/saude", "/classes"]) {
      assert.equal((await app.inject({ method: "GET", url })).statusCode, 200, url);
    }
    await app.close();
  });
});

describe("posse", () => {
  it("o personagem de outra conta simplesmente não existe", async () => {
    /*
     * 404 e não 403: responder "existe, mas não é seu" conta a quem chuta
     * ids quais existem. Era o buraco do desenho anterior, em que o id do
     * personagem ERA a credencial.
     */
    const { app } = montar();
    const dono = await cadastrar(app, "dono@exemplo.com");
    const outro = await cadastrar(app, "outro@exemplo.com");

    const p = (
      await app.inject({
        method: "POST",
        url: "/personagens",
        headers: comToken(dono.token),
        payload: { nome: "Meu", classe: 4 },
      })
    ).json();

    const espiando = await app.inject({
      method: "GET",
      url: `/personagens/${p.id}`,
      headers: comToken(outro.token),
    });
    assert.equal(espiando.statusCode, 404);

    const jogando = await app.inject({
      method: "POST",
      url: `/personagens/${p.id}/batalhas`,
      headers: comToken(outro.token),
    });
    assert.equal(jogando.statusCode, 404);
    await app.close();
  });

  it("a batalha também tem dono", async () => {
    // O id da batalha é `b1`, `b2`, `b3`: adivinhar é trivial.
    const { app } = montar();
    const dono = await cadastrar(app, "dono@exemplo.com");
    const outro = await cadastrar(app, "outro@exemplo.com");

    const p = (
      await app.inject({
        method: "POST",
        url: "/personagens",
        headers: comToken(dono.token),
        payload: { nome: "Meu", classe: 4 },
      })
    ).json();
    const batalha = (
      await app.inject({
        method: "POST",
        url: `/personagens/${p.id}/batalhas`,
        headers: comToken(dono.token),
      })
    ).json();

    const invasao = await app.inject({
      method: "POST",
      url: `/batalhas/${batalha.id}/turnos`,
      headers: comToken(outro.token),
      payload: { habilidade: "golpe" },
    });
    assert.equal(invasao.statusCode, 404);
    await app.close();
  });
});

describe("slots", () => {
  async function encher(app: FastifyInstance, token: string, quantos: number) {
    const criados = [];
    for (let i = 0; i < quantos; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/personagens",
        headers: comToken(token),
        payload: { nome: `Herói ${i}`, classe: 4 },
      });
      criados.push(r);
    }
    return criados;
  }

  it("dois grátis, e o terceiro é recusado com o motivo", async () => {
    const { app } = montar();
    const { token } = await cadastrar(app);

    const primeiros = await encher(app, token, SLOTS_GRATIS);
    for (const r of primeiros) assert.equal(r.statusCode, 201, r.body);

    const excedente = (await encher(app, token, 1))[0]!;
    assert.equal(excedente.statusCode, 409);
    assert.match(excedente.json().erro, /sem slot livre/);
    await app.close();
  });

  it("sem premium, comprar slot é recusado dizendo quanto falta", async () => {
    const { app } = montar();
    const { token } = await cadastrar(app);
    const r = await app.inject({
      method: "POST",
      url: "/eu/slots",
      headers: comToken(token),
    });
    assert.equal(r.statusCode, 409);
    assert.match(r.json().erro, /custa \d+ e você tem 0/);
    await app.close();
  });

  it("com premium, o slot comprado abre vaga de verdade", async () => {
    process.env.CHAOS_PERMITIR_CREDITO = "sim";
    try {
      const { app } = montar();
      const { token } = await cadastrar(app);
      await encher(app, token, SLOTS_GRATIS);

      await app.inject({
        method: "POST",
        url: "/eu/creditar",
        headers: comToken(token),
        payload: { quantidade: 10_000 },
      });
      const compra = await app.inject({
        method: "POST",
        url: "/eu/slots",
        headers: comToken(token),
      });
      assert.equal(compra.statusCode, 200, compra.body);
      assert.equal(compra.json().conta.slots.total, SLOTS_GRATIS + 1);

      const terceiro = (await encher(app, token, 1))[0]!;
      assert.equal(terceiro.statusCode, 201, terceiro.body);
      await app.close();
    } finally {
      delete process.env.CHAOS_PERMITIR_CREDITO;
    }
  });

  it("apagar libera o slot", async () => {
    // A saída de quem não pode pagar o revive: sem ela, dois túmulos nos
    // dois slots gratuitos encerram o jogo.
    const { app } = montar();
    const { token } = await cadastrar(app);
    const criados = await encher(app, token, SLOTS_GRATIS);
    const alvo = criados[0]!.json().id;

    const apagou = await app.inject({
      method: "DELETE",
      url: `/personagens/${alvo}`,
      headers: comToken(token),
    });
    assert.equal(apagou.statusCode, 200);

    const eu = (
      await app.inject({ method: "GET", url: "/eu", headers: comToken(token) })
    ).json();
    assert.equal(eu.conta.slots.livres, 1);
    assert.equal(eu.personagens.length, SLOTS_GRATIS - 1);

    // E some mesmo: não fica acessível por id.
    const sumiu = await app.inject({
      method: "GET",
      url: `/personagens/${alvo}`,
      headers: comToken(token),
    });
    assert.equal(sumiu.statusCode, 404);
    await app.close();
  });

  it("/eu devolve a tela de slots inteira numa chamada", async () => {
    const { app } = montar();
    const { token } = await cadastrar(app);
    await encher(app, token, 1);

    const eu = (
      await app.inject({ method: "GET", url: "/eu", headers: comToken(token) })
    ).json();
    assert.equal(eu.conta.slots.total, SLOTS_GRATIS);
    assert.equal(eu.conta.slots.usados, 1);
    assert.ok(eu.conta.slots.precoDoProximo > 0);
    // O motivo vem resolvido do servidor, como na árvore.
    assert.equal(eu.conta.slots.podeComprar, false);
    assert.match(eu.conta.slots.impedimento, /custa/);
    assert.equal(eu.personagens[0].nome, "Herói 0");
    await app.close();
  });
});

describe("senhas", () => {
  it("o mesmo texto gera hashes diferentes, e os dois conferem", async () => {
    // Sal por senha: sem ele, duas pessoas com a mesma senha têm o mesmo
    // hash, e uma tabela pronta quebra as duas de uma vez.
    const a = await guardarSenha("a mesma senha");
    const b = await guardarSenha("a mesma senha");
    assert.notEqual(a, b);
    assert.ok((await conferirSenha("a mesma senha", a)).confere);
    assert.ok((await conferirSenha("a mesma senha", b)).confere);
  });

  it("senha errada não confere", async () => {
    const guardado = await guardarSenha("a senha certa");
    assert.equal((await conferirSenha("a senha errada", guardado)).confere, false);
  });

  it("hash com custo antigo confere e pede atualização", async () => {
    // O custo vive no formato gravado, e não numa constante: subir o
    // parâmetro não pode invalidar a senha de quem já se cadastrou.
    const antigo = "scrypt$16384$8$1$c2FsLXZlbGhv$cXVhbHF1ZXI";
    const { precisaAtualizar } = await conferirSenha("x", antigo);
    assert.equal(precisaAtualizar, true);
  });

  it("hash corrompido não confere — nem explode", async () => {
    for (const lixo of ["", "nada", "scrypt$x", "bcrypt$1$2$3$4$5"]) {
      const { confere } = await conferirSenha("x", lixo);
      assert.equal(confere, false, lixo);
    }
  });
});

describe("token no cabeçalho", () => {
  it("lê Bearer e ignora o resto", () => {
    assert.equal(tokenDoCabecalho({ authorization: "Bearer abc" }), "abc");
    assert.equal(tokenDoCabecalho({ authorization: "bearer abc" }), "abc");
    assert.equal(tokenDoCabecalho({ authorization: "Basic abc" }), null);
    assert.equal(tokenDoCabecalho({ authorization: "abc" }), null);
    assert.equal(tokenDoCabecalho({}), null);
  });

  it("o que é guardado não é o token", () => {
    // Vazar o banco de sessões não pode entregar nenhuma sessão viva.
    const sessoes = new Sessoes();
    const token = sessoes.abrir("c1", AGORA);
    assert.equal(
      JSON.stringify(sessoes).includes(token),
      false,
      "o token está guardado em claro",
    );
    assert.equal(sessoes.dono(token, AGORA), "c1");
  });

  it("derrubar tudo de uma conta fecha todas as sessões dela", () => {
    const sessoes = new Sessoes();
    const a = sessoes.abrir("c1", AGORA);
    const b = sessoes.abrir("c1", AGORA);
    const alheia = sessoes.abrir("c2", AGORA);

    assert.equal(sessoes.fecharTudoDe("c1"), 2);
    assert.equal(sessoes.dono(a, AGORA), null);
    assert.equal(sessoes.dono(b, AGORA), null);
    assert.equal(sessoes.dono(alheia, AGORA), "c2");
  });

  it("sessão vencida deixa de valer", () => {
    const sessoes = new Sessoes();
    const token = sessoes.abrir("c1", AGORA);
    const doisMeses = 60 * 24 * 60 * 60 * 1000;
    assert.equal(sessoes.dono(token, AGORA + doisMeses), null);
  });

  it("uso renova o prazo — sessão ativa não morre no meio da partida", () => {
    const sessoes = new Sessoes();
    const token = sessoes.abrir("c1", AGORA);
    const vinteDias = 20 * 24 * 60 * 60 * 1000;
    assert.equal(sessoes.dono(token, AGORA + vinteDias), "c1");
    assert.equal(sessoes.dono(token, AGORA + vinteDias * 2), "c1");
  });
});
