import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance, InjectOptions } from "fastify";
import {
  type Conta,
  nivelDaParede,
  vidaMaximaDe,
  type Personagem,
} from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * Exercita a API inteira, sem rede e sem banco.
 *
 * `app.inject` roda o ciclo de requisição do Fastify em memória — mesmas
 * rotas, mesmo tratamento de erro, mesma serialização —, então é integração de
 * verdade sem a lentidão e a instabilidade de subir porta.
 */

const AGORA = 1_700_000_000_000;
const HORA = 3_600_000;

let app: Bancada;
let relogio = AGORA;
let guardados: Personagem[] = [];

/**
 * Um servidor montado com uma conta já dentro e uma sessão já aberta.
 *
 * `inject` acrescenta o `Authorization` sozinho, porque toda rota de jogo
 * exige sessão e repetir o cabeçalho em sessenta chamadas esconderia o que
 * cada teste está de fato verificando. Quem quer testar SEM sessão passa
 * `anonimo: true`, e é o único lugar onde isso aparece.
 */
/** O que `inject` devolve, sem depender do nome do tipo em `light-my-request`. */
type Resposta = Awaited<ReturnType<FastifyInstance["inject"]>>;

interface Bancada {
  inject(
    opcoes: InjectOptions & { anonimo?: boolean; token?: string },
  ): Promise<Resposta>;
  close(): Promise<void>;
  readonly cru: FastifyInstance;
  readonly token: string;
  readonly contaId: string;
  readonly sessoes: Sessoes;
}

function montar(inicial: readonly Personagem[] = [], premium = 0): Bancada {
  relogio = AGORA;
  const sessoes = new Sessoes();
  const contaId = "conta-de-teste";
  const conta: Conta = {
    id: contaId,
    email: "teste@chaos.local",
    // A senha não é exercitada por aqui: a sessão é aberta direto. Os testes
    // de cadastro e entrada usam contas próprias, criadas pela rota.
    senha: "(sem hash — sessão aberta direto)",
    criadaEm: AGORA,
    visto: AGORA,
    premium,
    // Folga de slots: estes testes criam personagens à vontade, e o limite
    // tem teste próprio.
    slotsComprados: 98,
    personagens: inicial.map((p) => p.id),
  };

  const armazenamento = emMemoria(inicial, [conta]);
  // Espia o que foi gravado, para conferir que o servidor persiste de fato.
  const original = armazenamento.personagens.salvar;
  armazenamento.personagens.salvar = async (p) => {
    guardados.push(structuredClone(p));
    return original(p);
  };

  const cru = criarAplicacao({ armazenamento, agora: () => relogio, sessoes });
  const token = sessoes.abrir(contaId, AGORA);

  return {
    inject({ anonimo, token: outro, ...opcoes }) {
      if (anonimo) return cru.inject(opcoes);
      return cru.inject({
        ...opcoes,
        headers: {
          ...(opcoes.headers ?? {}),
          authorization: `Bearer ${outro ?? token}`,
        },
      });
    },
    close: () => cru.close(),
    cru,
    token,
    contaId,
    sessoes,
  };
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
      /*
       * Perder uma batalha COMUM é recuar, não morrer.
       *
       * Aqui dizia `assert.equal(resultado.morreu, true)`, contradizendo a
       * regra que o próprio arquivo testa mais abaixo. Passava quase
       * sempre porque o id do personagem sai de `Math.random()`, entra na
       * semente da batalha e o herói de nível 1 costuma vencer — o teste
       * falhava uma vez a cada tantas execuções, sem ninguém mexer em
       * nada. Teste instável não é ruído: é uma afirmação errada esperando
       * a semente certa.
       */
      assert.equal(resultado.morreu, false, "batalha comum não pode matar");
      assert.equal(resultado.recuou, true, "derrota comum é recuo");
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

describe("comum contra julgamento", () => {
  it("perder uma batalha comum é recuar, não morrer", async () => {
    // A regra que a medição obrigou: com ~25% de derrota por luta, derrota
    // significando morte dava uma morte a cada 3 ou 4 batalhas — com revive
    // pago, isso é extração, não dificuldade.
    const fraco: Personagem = {
      id: "fraco", nome: "Fraco", classe: 4, nivel: 1500, xp: 0, camada: 0,
      estado: "vivo", vida: 5000, visto: AGORA, sucata: 0, mortes: 0, gastos: {}, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
    };
    const local = montar([fraco]);

    const inicio = await local.inject({
      method: "POST", url: "/personagens/fraco/batalhas", payload: { tipo: "comum" },
    });
    assert.equal(inicio.json().mortal, false);

    let resultado = null;
    for (let i = 0; i < 300 && !resultado; i++) {
      const r = await local.inject({
        method: "POST",
        url: `/batalhas/${inicio.json().id}/turnos`,
        payload: { habilidade: "golpe" },
      });
      if (r.statusCode !== 200) break;
      resultado = r.json().resultado;
    }

    assert.ok(resultado, "a batalha não terminou");
    assert.equal(resultado.venceu, false, "o cenário era de derrota certa");
    assert.equal(resultado.morreu, false, "derrota comum matou");
    assert.equal(resultado.recuou, true);
    assert.equal(resultado.personagem.estado, "vivo");
    await local.close();
  });

  it("o julgamento se anuncia como mortal antes de começar", async () => {
    const p = await criar();
    const r = await app.inject({
      method: "POST", url: `/personagens/${p.id}/batalhas`,
      payload: { tipo: "julgamento" },
    });
    assert.equal(r.statusCode, 201);
    // A tela precisa poder avisar: esta é a luta em que se morre de verdade.
    assert.equal(r.json().mortal, true);
    assert.equal(r.json().tipo, "julgamento");
  });

  it("perder um julgamento leva ao túmulo", async () => {
    const condenado: Personagem = {
      id: "condenado", nome: "Condenado", classe: 4, nivel: 1500, xp: 0,
      camada: 0, estado: "vivo", vida: 5000, visto: AGORA, sucata: 0,
      mortes: 0, gastos: {}, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
    };
    const local = montar([condenado]);

    const inicio = await local.inject({
      method: "POST", url: "/personagens/condenado/batalhas",
      payload: { tipo: "julgamento" },
    });

    let resultado = null;
    for (let i = 0; i < 300 && !resultado; i++) {
      const r = await local.inject({
        method: "POST",
        url: `/batalhas/${inicio.json().id}/turnos`,
        payload: { habilidade: "golpe" },
      });
      if (r.statusCode !== 200) break;
      resultado = r.json().resultado;
    }

    assert.ok(resultado);
    assert.equal(resultado.venceu, false);
    assert.equal(resultado.morreu, true, "o julgamento devia matar");
    assert.equal(resultado.personagem.estado, "tumulo");
    await local.close();
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
    
    mortes: 1,
      gastos: {}, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
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

  it("com premium NA CONTA, sai do túmulo e a moeda é cobrada", async () => {
    // A moeda é da conta e não do personagem: comprada com dinheiro de
    // verdade, ela não pode evaporar no permadeath — e é justamente o que
    // torna o revive possível, já que quem está no túmulo não tem nada.
    const local = montar([morto()], 500);
    const r = await local.inject({ method: "POST", url: "/personagens/morto/reviver" });
    assert.equal(r.statusCode, 200, r.body);
    const p = r.json();
    assert.equal(p.estado, "vivo");
    assert.ok(p.vida > 0);

    const eu = (await local.inject({ method: "GET", url: "/eu" })).json();
    assert.equal(eu.conta.premium, 500 - p.custoDoRevive);
    await local.close();
  });

  it("o crédito direto vem desligado", async () => {
    // Buraco escancarado se ficasse aberto: qualquer um creditaria a si mesmo.
    const local = montar([morto()]);
    const r = await local.inject({
      method: "POST",
      url: "/eu/creditar",
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
        
        mortes: 0,
      gastos: {}, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
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
        
        mortes: 0,
      gastos: {}, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
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
      
      mortes: 0, gastos: {}, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
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

describe("origem cruzada", () => {
  it("responde com os cabeçalhos que o navegador exige", async () => {
    // Faltou até o primeiro clique de verdade: `app.inject` e `curl` não
    // aplicam política de origem, só o navegador aplica. Vinte testes de API
    // passavam e a tela não conseguia falar com o servidor.
    const r = await app.inject({
      method: "OPTIONS",
      url: "/classes",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
    });
    assert.ok(
      r.headers["access-control-allow-origin"],
      "sem access-control-allow-origin o navegador recusa antes de chamar",
    );
  });

  it("libera também os pedidos com corpo JSON", async () => {
    const r = await app.inject({
      method: "OPTIONS",
      url: "/personagens",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.ok(r.headers["access-control-allow-headers"]);
  });
});

describe("árvore de habilidade", () => {
  it("o personagem novo tem pontos zerados e nenhum nó comprado", async () => {
    const p = await criar();
    assert.equal(p.arvore.pontos, 0, "nível 1 não dá ponto");
    assert.ok(p.arvore.nos.length > 0);
    assert.ok(p.arvore.nos.every((no: { comprados: number }) => no.comprados === 0));
  });

  it("o servidor diz POR QUE cada nó está fechado, já resolvido", async () => {
    // A tela não recalcula requisito nem ponto: regra duplicada nos dois
    // lados é regra que diverge.
    const p = await criar();
    const fechado = p.arvore.nos.find((n: { podeComprar: boolean }) => !n.podeComprar);
    assert.ok(fechado.impedimento, "nó fechado sem motivo");
    assert.ok(["requisito", "pontos", "maximo"].includes(fechado.impedimento.motivo));
  });

  it("comprar um nó gasta o ponto e aplica o bônus", async () => {
    const veterano: Personagem = {
      // `Gume` exige `Vocação` antes; o tronco já comprado é o cenário real.
      id: "vet", nome: "Vet", classe: 4, nivel: 40, xp: 0, camada: 0,
      estado: "vivo", vida: 500, visto: AGORA, sucata: 0,
      mortes: 0, gastos: { raiz: 1 }, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
    };
    const local = montar([veterano]);

    const antes = (await local.inject({ method: "GET", url: "/personagens/vet" })).json();
    assert.equal(antes.arvore.pontos, 38, "39 do nível menos 1 já gasto");

    const r = await local.inject({
      method: "POST", url: "/personagens/vet/arvore", payload: { no: "gume" },
    });
    assert.equal(r.statusCode, 200, r.body);
    const p = r.json();
    assert.equal(p.arvore.pontos, 38 - 2, "o custo do nó não foi descontado");
    assert.ok(p.arvore.bonus.danoPercentual > 0, "a passiva não virou bônus");
    await local.close();
  });

  it("nó de magia aparece na lista de habilidades do personagem", async () => {
    // Um ponto gasto numa magia que não chega ao combate é um ponto perdido
    // sem o jogador saber.
    const veterano: Personagem = {
      id: "mago", nome: "Mago", classe: 4, nivel: 40, xp: 0, camada: 0,
      estado: "vivo", vida: 500, visto: AGORA, sucata: 0,
      mortes: 0, gastos: { raiz: 1, gume: 1 }, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
    };
    const local = montar([veterano]);

    const r = await local.inject({
      method: "POST", url: "/personagens/mago/arvore", payload: { no: "sangria-no" },
    });
    assert.equal(r.statusCode, 200, r.body);
    const ids = r.json().habilidades.map((h: { id: string }) => h.id);
    assert.ok(ids.includes("sangria"), `habilidades: ${ids.join(", ")}`);
    await local.close();
  });

  it("recusa nó sem requisito, dizendo o que falta", async () => {
    const veterano: Personagem = {
      id: "afoito", nome: "Afoito", classe: 4, nivel: 40, xp: 0, camada: 0,
      estado: "vivo", vida: 500, visto: AGORA, sucata: 0,
      mortes: 0, gastos: {}, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
    };
    const local = montar([veterano]);
    const r = await local.inject({
      method: "POST", url: "/personagens/afoito/arvore", payload: { no: "olho" },
    });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().erro, /precisa de Gume antes/);
    await local.close();
  });

  it("renascer zera a árvore", async () => {
    // O nó do tronco aponta para o atributo DO RAMO, e renascer troca o ramo.
    const naParede = Math.ceil(nivelDaParede(0));
    const pronto: Personagem = {
      id: "renasce", nome: "Renasce", classe: 4, nivel: naParede, xp: 0,
      camada: 0, estado: "vivo", vida: 500, visto: AGORA, sucata: 0,
      mortes: 0, gastos: { raiz: 5, gume: 3 }, equipado: {}, mochila: [], elo: 1000, duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
    };
    const local = montar([pronto]);
    const r = await local.inject({
      method: "POST", url: "/personagens/renasce/renascer", payload: { classe: 1 },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(r.json().arvore.nos.every((n: { comprados: number }) => n.comprados === 0));
    await local.close();
  });

  it("personagem gravado antes da árvore existir não quebra", async () => {
    // Campo novo em dado já gravado chega indefinido. O `as` aqui é
    // deliberado: representa exatamente o que está no arquivo de quem jogou
    // antes desta versão.
    const antigo = {
      id: "velho", nome: "Velho", classe: 4, nivel: 20, xp: 0, camada: 0,
      estado: "vivo", vida: 300, visto: AGORA, sucata: 5, premium: 0, mortes: 0,
    } as unknown as Personagem;
    const local = montar([antigo]);

    const r = await local.inject({ method: "GET", url: "/personagens/velho" });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().arvore.pontos, 19);
    await local.close();
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
