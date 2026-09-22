import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Conta, type Personagem } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * A vida atravessa as batalhas.
 *
 * Três formas de recuperá-la, e cada uma tem um teste aqui: subir de
 * nível (grátis e total), poção (custa sucata) e descanso (custa tempo,
 * acontece sozinho ao carregar).
 */

const AGORA = 1_700_000_000_000;
const HORA = 3_600_000;

const heroi = (extra: Partial<Personagem> = {}): Personagem => ({
  id: "h",
  nome: "Herói",
  classe: 4,
  nivel: 20,
  xp: 0,
  camada: 0,
  estado: "vivo",
  vida: 100,
  visto: AGORA,
  sucata: 0,
  mortes: 0,
  gastos: {},
  equipado: {},
  mochila: [],
  elo: 1000,
  duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
  dificuldade: "medio",
  vidasRestantes: 2,
  vidasGuardadas: 0,
  ...extra,
});

const conta = (personagens: string[]): Conta => ({
  id: "c1",
  email: "t@t.com",
  senha: "(direto)",
  criadaEm: AGORA,
  visto: AGORA,
  premium: 0,
  slotsComprados: 10,
  personagens,
});

function montar(p: Personagem) {
  const sessoes = new Sessoes();
  let relogio = AGORA;
  const armazenamento = emMemoria([p], [conta([p.id])]);
  const app = criarAplicacao({ armazenamento, agora: () => relogio, sessoes });
  return {
    app,
    armazenamento,
    headers: { authorization: `Bearer ${sessoes.abrir("c1", AGORA)}` },
    avancar: (ms: number) => {
      relogio += ms;
    },
  };
}

const ficha = async (
  app: ReturnType<typeof montar>["app"],
  headers: Record<string, string>,
) => (await app.inject({ method: "GET", url: "/personagens/h", headers })).json();

describe("a vida não se recupera sozinha ao vencer", () => {
  it("vencer uma batalha deixa o personagem mais machucado", async () => {
    /*
     * O ponto inteiro da mudança. O servidor gravava o personagem de
     * ANTES da batalha e só somava XP e sucata em cima dele — com cura
     * total isso não aparecia, porque o valor era sobrescrito pelo
     * máximo de qualquer jeito. Sem este teste a mudança volta a ser
     * enfeite em silêncio.
     */
    const { app, headers } = montar(heroi({ nivel: 60, vida: 5000 }));
    const antes = await ficha(app, headers);

    const { id } = (
      await app.inject({ method: "POST", url: "/personagens/h/batalhas", headers })
    ).json();

    let resultado = null;
    for (let i = 0; i < 100 && !resultado; i++) {
      resultado = (
        await app.inject({
          method: "POST",
          url: `/batalhas/${id}/turnos`,
          headers,
          payload: { habilidade: "golpe" },
        })
      ).json().resultado;
    }

    assert.ok(resultado, "a batalha não terminou");
    // Sem subir de nível: a vida tem de ter caído.
    if (resultado.niveisSubidos === 0) {
      assert.ok(
        resultado.personagem.vida < antes.vida,
        `saiu com ${resultado.personagem.vida} e entrou com ${antes.vida}`,
      );
    }
    await app.close();
  });
});

describe("poção", () => {
  it("cura uma porção e cobra sucata", async () => {
    const { app, headers } = montar(heroi({ vida: 50, sucata: 500 }));
    const antes = await ficha(app, headers);
    assert.ok(antes.pocao.preco > 0);
    assert.ok(antes.pocao.podeBeber);

    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/pocao",
      headers,
    });
    assert.equal(r.statusCode, 200, r.body);
    const p = r.json();
    assert.ok(p.vida > antes.vida, "não curou");
    assert.ok(p.vida < p.vidaMaxima, "curou tudo — era para ser uma porção");
    assert.equal(p.sucata, 500 - antes.pocao.preco);
    assert.equal(p.curou, p.vida - antes.vida);
    await app.close();
  });

  it("sem sucata, recusa dizendo quanto falta", async () => {
    const { app, headers } = montar(heroi({ vida: 10, sucata: 0 }));
    const antes = await ficha(app, headers);
    assert.equal(antes.pocao.podeBeber, false);
    assert.match(antes.pocao.impedimento, /custa \d+ e você tem 0/);

    const r = await app.inject({
      method: "POST",
      url: "/personagens/h/pocao",
      headers,
    });
    assert.equal(r.statusCode, 409);
    await app.close();
  });

  it("com a vida cheia, não desperdiça a poção", async () => {
    // Beber à toa gastaria sucata por nada, e o jogador só descobriria
    // depois. O servidor recusa em vez de cobrar.
    const cheio = heroi({ sucata: 5000 });
    const { app, headers } = montar(cheio);
    const atual = await ficha(app, headers);
    const { app: a2, headers: h2 } = montar(
      heroi({ vida: atual.vidaMaxima, sucata: 5000 }),
    );

    const r = await a2.inject({ method: "POST", url: "/personagens/h/pocao", headers: h2 });
    assert.equal(r.statusCode, 409);
    assert.match(r.json().erro, /já está cheia/);
    await app.close();
    await a2.close();
  });

  it("o preço acompanha o que uma vitória rende", async () => {
    // Atrelado ao ganho e não a uma fórmula paralela: é o que faz o laço
    // fechar sozinho em qualquer nível.
    const baixo = montar(heroi({ nivel: 5, vida: 10, sucata: 1e6 }));
    const alto = montar(heroi({ nivel: 200, vida: 10, sucata: 1e6 }));
    const a = await ficha(baixo.app, baixo.headers);
    const b = await ficha(alto.app, alto.headers);
    assert.ok(b.pocao.preco > a.pocao.preco);
    await baixo.app.close();
    await alto.app.close();
  });
});

describe("descanso", () => {
  it("o tempo fora cura, e o relatório conta quanto", async () => {
    /*
     * "Deixar AFK para curar" tem de entregar o que promete. Sem o
     * limiar de descanso, o offline gastaria a vida inteira em batalhas,
     * perderia a última e devolveria o personagem ferido — o oposto.
     */
    const { app, headers, avancar } = montar(heroi({ nivel: 60, vida: 200 }));
    const antes = await ficha(app, headers);

    avancar(6 * HORA);
    const depois = await ficha(app, headers);

    assert.ok(
      depois.vida > antes.vida,
      `seis horas fora e a vida foi de ${antes.vida} para ${depois.vida}`,
    );
    assert.ok(depois.ausencia, "nenhum relatório de ausência");
    await app.close();
  });

  it("quem volta cheio não perde tempo descansando", async () => {
    // O offline luta ENQUANTO dá e descansa o resto; com a vida cheia,
    // todo o tempo tem de virar batalha.
    const { app, headers, avancar } = montar(heroi({ nivel: 60, vida: 100_000 }));
    avancar(4 * HORA);
    const depois = await ficha(app, headers);
    assert.ok(depois.ausencia.batalhas > 0, "não lutou nada estando cheio");
    await app.close();
  });

  it("no túmulo não se descansa nem se bebe", async () => {
    const { app, headers, avancar } = montar(
      heroi({ estado: "tumulo", vida: 0, sucata: 1e6 }),
    );
    avancar(8 * HORA);
    const p = await ficha(app, headers);
    assert.equal(p.vida, 0, "o túmulo curou");
    assert.equal(p.pocao.podeBeber, false);

    const r = await app.inject({ method: "POST", url: "/personagens/h/pocao", headers });
    assert.equal(r.statusCode, 409);
    await app.close();
  });

  it("a rota de poção exige sessão e dono", async () => {
    const { app } = montar(heroi());
    const r = await app.inject({ method: "POST", url: "/personagens/h/pocao" });
    assert.equal(r.statusCode, 401);
    await app.close();
  });
});
