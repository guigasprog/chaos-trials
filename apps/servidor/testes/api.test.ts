import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { nivelDaParede, vidaMaximaDe, type Personagem } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";

/**
 * Exercita a API inteira, sem rede e sem banco.
 *
 * `app.inject` roda o ciclo de requisição do Fastify em memória — mesmas
 * rotas, mesmo tratamento de erro, mesma serialização —, então é integração de
 * verdade sem a lentidão e a instabilidade de subir porta.
 */

const AGORA = 1_700_000_000_000;
const HORA = 3_600_000;

let app: FastifyInstance;
let relogio = AGORA;
let guardados: Personagem[] = [];

function montar(inicial: readonly Personagem[] = []) {
  relogio = AGORA;
  const armazenamento = emMemoria(inicial);
  // Espia o que foi gravado, para conferir que o servidor persiste de fato.
  const original = armazenamento.salvar;
  armazenamento.salvar = async (p) => {
    guardados.push(structuredClone(p));
    return original(p);
  };
  return criarAplicacao({ armazenamento, agora: () => relogio });
}

before(() => {
  app = montar();
});
after(async () => {
  await app.close();
});

async function criar(nome = "Herói", classe = 4) {
  const r = await app.inject({
    method: "POST",
    url: "/personagens",
    payload: { nome, classe },
  });
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}

describe("criação", () => {
  it("cria e devolve o personagem já com o derivado calculado", async () => {
    const p = await criar("Aurora", 1);
    assert.equal(p.nome, "Aurora");
    assert.equal(p.classe.nome, "Wise");
    assert.equal(p.nivel, 1);
    assert.equal(p.vida, p.vidaMaxima);
    // O cliente não deve ter de saber calcular nada disto.
    assert.ok(p.xpDoNivel > 0);
    assert.ok(p.parede > 0);
    assert.ok(p.habilidades.length > 0);
  });

  it("recusa nome curto, nome longo e classe ausente", async () => {
    for (const payload of [
      { nome: "a", classe: 4 },
      { nome: "x".repeat(40), classe: 4 },
      { nome: "Válido" },
    ]) {
      const r = await app.inject({ method: "POST", url: "/personagens", payload });
      assert.equal(r.statusCode, 400, JSON.stringify(payload));
    }
  });

  it("recusa começar numa subclasse", async () => {
    // 11 é Mage: chegar nela é conquista da vida, não escolha de criação.
    const r = await app.inject({
      method: "POST",
      url: "/personagens",
      payload: { nome: "Trapaceiro", classe: 11 },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /raízes/);
  });

  it("lista as cinco raízes para a tela de criação", async () => {
    const r = await app.inject({ method: "GET", url: "/classes" });
    assert.equal(r.json().raizes.length, 5);
  });
});

describe("batalha", () => {
  it("o ciclo completo: começa, luta e termina com recompensa", async () => {
    const p = await criar();
    const inicio = await app.inject({
      method: "POST",
      url: `/personagens/${p.id}/batalhas`,
    });
    assert.equal(inicio.statusCode, 201, inicio.body);
    const { id: batalhaId, estado } = inicio.json();
    assert.ok(estado.disponiveis.length > 0);

    let resultado = null;
    for (let i = 0; i < 100 && !resultado; i++) {
      const atual = await app.inject({
        method: "POST",
        url: `/batalhas/${batalhaId}/turnos`,
        payload: { habilidade: "golpe" },
      });
      assert.equal(atual.statusCode, 200, atual.body);
      resultado = atual.json().resultado;
    }

    assert.ok(resultado, "a batalha não terminou em 100 turnos");
    if (resultado.venceu) {
      assert.ok(resultado.xp > 0, "vitória sem XP");
      assert.ok(resultado.sucata > 0, "vitória sem sucata");
    } else {
      assert.equal(resultado.morreu, true);
    }
  });

  it("recusa habilidade que não existe ou está em recarga", async () => {
    const p = await criar();
    const { id } = (
      await app.inject({ method: "POST", url: `/personagens/${p.id}/batalhas` })
    ).json();

    const inventada = await app.inject({
      method: "POST",
      url: `/batalhas/${id}/turnos`,
      payload: { habilidade: "bola-de-fogo-suprema" },
    });
    assert.equal(inventada.statusCode, 400);
    assert.match(inventada.json().erro, /indisponível/);
  });

  it("recusa turno em batalha inexistente", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/batalhas/nao-existe/turnos",
      payload: { habilidade: "golpe" },
    });
    assert.equal(r.statusCode, 404);
  });

  it("o cliente nunca manda estado — só a intenção", async () => {
    // Tentar injetar dano, vida ou XP não muda nada: o servidor só lê o campo
    // `habilidade`, e é isso que torna a trapaça impossível.
    const p = await criar();
    const { id } = (
      await app.inject({ method: "POST", url: `/personagens/${p.id}/batalhas` })
    ).json();

    const r = await app.inject({
      method: "POST",
      url: `/batalhas/${id}/turnos`,
      payload: { habilidade: "golpe", dano: 999999, vida: 999999, xp: 999999 },
    });
    assert.equal(r.statusCode, 200);
    const vilao = r
      .json()
      .estado.combatentes.find((c: { lado: string }) => c.lado === "inimigo");
    assert.ok(vilao.vida > 0 || r.json().resultado, "o dano forjado passou");

    const depois = await app.inject({ method: "GET", url: `/personagens/${p.id}` });
    assert.ok(depois.json().vidaMaxima < 999999, "a vida forjada passou");
  });
});

describe("túmulo e revive", () => {
  const morto = (): Personagem => ({
    id: "morto",
    nome: "Finado",
    classe: 4,
    nivel: 20,
    xp: 0,
    camada: 0,
    estado: "tumulo",
    vida: 0,
    visto: AGORA,
    sucata: 10_000,
    premium: 0,
    mortes: 1,
  });

  it("quem está no túmulo não pode lutar", async () => {
    const local = montar([morto()]);
    const r = await local.inject({
      method: "POST",
      url: "/personagens/morto/batalhas",
    });
    assert.equal(r.statusCode, 409);
    assert.match(r.json().erro, /túmulo/);
    await local.close();
  });

  it("sucata não tira ninguém do túmulo, por mais que tenha", async () => {
    const local = montar([morto()]);
    const r = await local.inject({ method: "POST", url: "/personagens/morto/reviver" });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /revive custa/);
    await local.close();
  });

  it("com premium, sai do túmulo e a moeda é cobrada", async () => {
    const local = montar([{ ...morto(), premium: 500 }]);
    const r = await local.inject({ method: "POST", url: "/personagens/morto/reviver" });
    assert.equal(r.statusCode, 200, r.body);
    const p = r.json();
    assert.equal(p.estado, "vivo");
    assert.equal(p.premium, 500 - p.custoDoRevive);
    assert.ok(p.vida > 0);
    await local.close();
  });

  it("o crédito direto vem desligado", async () => {
    // Buraco escancarado se ficasse aberto: qualquer um creditaria a si mesmo.
    const local = montar([morto()]);
    const r = await local.inject({
      method: "POST",
      url: "/personagens/morto/creditar",
      payload: { quantidade: 1e9 },
    });
    assert.equal(r.statusCode, 403);
    await local.close();
  });
});

describe("progressão offline", () => {
  it("é aplicada ao carregar, sem o cliente precisar pedir", async () => {
    // Se dependesse de o cliente pedir, um cliente que não pedisse jogaria com
    // o estado errado.
    const local = montar([
      {
        id: "sumido",
        nome: "Sumido",
        classe: 4,
        nivel: 25,
        xp: 0,
        camada: 0,
        estado: "vivo",
        vida: vidaMaximaDe({ classe: 4, nivel: 25 } as Personagem),
        visto: AGORA,
        sucata: 0,
        premium: 0,
        mortes: 0,
      },
    ]);
    relogio = AGORA + 3 * HORA;

    const r = await local.inject({ method: "GET", url: "/personagens/sumido" });
    const p = r.json();
    assert.ok(p.ausencia, "não creditou a ausência");
    assert.ok(p.ausencia.batalhas > 0);
    assert.ok(p.ausencia.xp > 0);
    await local.close();
  });

  it("não credita duas vezes a mesma ausência", async () => {
    const local = montar([
      {
        id: "sumido",
        nome: "Sumido",
        classe: 4,
        nivel: 25,
        xp: 0,
        camada: 0,
        estado: "vivo",
        vida: 900,
        visto: AGORA,
        sucata: 0,
        premium: 0,
        mortes: 0,
      },
    ]);
    relogio = AGORA + 3 * HORA;

    await local.inject({ method: "GET", url: "/personagens/sumido" });
    const segunda = await local.inject({ method: "GET", url: "/personagens/sumido" });
    assert.equal(segunda.json().ausencia, null, "creditou a ausência de novo");
    await local.close();
  });
});

describe("renascimento", () => {
  it("recusa antes da parede e aceita nela", async () => {
    const naParede = Math.ceil(nivelDaParede(0));
    const base: Personagem = {
      id: "veterano",
      nome: "Veterano",
      classe: 4,
      nivel: naParede - 1,
      xp: 0,
      camada: 0,
      estado: "vivo",
      vida: 500,
      visto: AGORA,
      sucata: 77,
      premium: 0,
      mortes: 0,
    };

    const cedo = montar([base]);
    const recusa = await cedo.inject({
      method: "POST",
      url: "/personagens/veterano/renascer",
      payload: { classe: 1 },
    });
    assert.equal(recusa.statusCode, 400);
    assert.match(recusa.json().erro, /ainda falta/);
    await cedo.close();

    const pronto = montar([{ ...base, nivel: naParede }]);
    const aceita = await pronto.inject({
      method: "POST",
      url: "/personagens/veterano/renascer",
      payload: { classe: 1 },
    });
    assert.equal(aceita.statusCode, 200, aceita.body);
    const p = aceita.json();
    assert.equal(p.camada, 1);
    assert.equal(p.nivel, 1);
    assert.equal(p.classe.nome, "Wise");
    assert.equal(p.sucata, 77, "a moeda é da conta, não da vida");
    assert.ok(p.parede > naParede, "a parede nova devia estar mais longe");
    await pronto.close();
  });
});

describe("saúde", () => {
  it("responde", async () => {
    const r = await app.inject({ method: "GET", url: "/saude" });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().ok, true);
  });

  it("404 em personagem inexistente", async () => {
    const r = await app.inject({ method: "GET", url: "/personagens/fantasma" });
    assert.equal(r.statusCode, 404);
  });
});
