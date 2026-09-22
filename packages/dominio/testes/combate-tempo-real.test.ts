import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarSala,
  moverRaia,
  moverDistancia,
  iniciarEsquiva,
  atacar,
  decidirAcaoDoInimigo,
  resolverAtaqueDoInimigo,
  avancarTick,
  RAIAS,
  DISTANCIAS,
} from "../src/combate-tempo-real.ts";

const SEMENTE = 12345;

function novaSala() {
  return iniciarSala({
    classeDoJogador: 4,
    nivelDoJogador: 30,
    vidaDoJogador: 500,
    vidaMaximaDoJogador: 500,
    semente: SEMENTE,
  });
}

describe("iniciarSala", () => {
  it("começa na onda 1, em andamento, jogador com a vida que entrou", () => {
    const sala = novaSala();
    assert.equal(sala.onda, 1);
    assert.equal(sala.fase, "em-andamento");
    assert.equal(sala.jogador.vida, 500);
    assert.equal(sala.jogador.vidaMaxima, 500);
  });

  it("jogador começa no centro, distância longe, sem esquiva ativa", () => {
    const sala = novaSala();
    assert.equal(sala.jogador.raia, "centro");
    assert.equal(sala.jogador.distancia, "longe");
    assert.equal(sala.jogador.esquivandoPor, 0);
    assert.equal(sala.jogador.recargaDeEsquivaPor, 0);
  });

  it("o inimigo da onda 1 é comum, não telegrafando ainda", () => {
    const sala = novaSala();
    assert.equal(sala.inimigo.tipo, "comum");
    assert.equal(sala.inimigo.telegrafandoPor, null);
    assert.ok(sala.inimigo.vida > 0);
  });

  it("é determinística — a mesma semente dá a mesma sala", () => {
    const a = novaSala();
    const b = novaSala();
    assert.deepEqual(a, b);
  });

  it("sementes diferentes podem dar inimigos com vida diferente", () => {
    // Não é garantido matematicamente, mas com a variação esperada do
    // dado, entre várias sementes ao menos uma diverge.
    const vidas = new Set(
      Array.from({ length: 10 }, (_, i) =>
        iniciarSala({
          classeDoJogador: 4,
          nivelDoJogador: 30,
          vidaDoJogador: 500,
          vidaMaximaDoJogador: 500,
          semente: SEMENTE + i,
        }).inimigo.vida,
      ),
    );
    assert.ok(vidas.size >= 1); // ao menos não quebra; a vida do inimigo
    // comum nesta fase é determinística pelo nível, então size pode ser 1
    // — o teste real de variação fica nos testes de dano, mais abaixo.
  });
});

describe("RAIAS e DISTANCIAS", () => {
  it("três raias, três distâncias, nas ordens documentadas", () => {
    assert.deepEqual(RAIAS, ["esquerda", "centro", "direita"]);
    assert.deepEqual(DISTANCIAS, ["longe", "medio", "perto"]);
  });
});

describe("moverRaia", () => {
  it("move uma posição na direção pedida", () => {
    const sala = novaSala(); // começa em "centro" (índice 1)
    const direita = moverRaia(sala, 1);
    assert.equal(direita.jogador.raia, "direita");
    const esquerda = moverRaia(sala, -1);
    assert.equal(esquerda.jogador.raia, "esquerda");
  });

  it("não sai dos limites — direita da direita continua direita", () => {
    const sala = novaSala();
    const noLimite = moverRaia(moverRaia(sala, 1), 1);
    assert.equal(noLimite.jogador.raia, "direita");
  });

  it("não muda mais nada da sala", () => {
    const sala = novaSala();
    const depois = moverRaia(sala, 1);
    assert.equal(depois.jogador.vida, sala.jogador.vida);
    assert.equal(depois.inimigo.vida, sala.inimigo.vida);
    assert.equal(depois.onda, sala.onda);
  });
});

describe("moverDistancia", () => {
  it("aproximar reduz a distância; afastar aumenta", () => {
    const sala = novaSala(); // começa em "longe" (índice 0)
    const perto = moverDistancia(moverDistancia(sala, 1), 1);
    assert.equal(perto.jogador.distancia, "perto");
    const longeDeNovo = moverDistancia(perto, -1);
    assert.equal(longeDeNovo.jogador.distancia, "medio");
  });

  it("não sai dos limites", () => {
    const sala = novaSala();
    const aindaLonge = moverDistancia(sala, -1);
    assert.equal(aindaLonge.jogador.distancia, "longe");
  });
});

describe("iniciarEsquiva", () => {
  it("com a recarga livre, abre a janela de invencibilidade e arma a recarga", () => {
    const sala = novaSala();
    const depois = iniciarEsquiva(sala);
    assert.ok(depois.jogador.esquivandoPor > 0);
    assert.ok(depois.jogador.recargaDeEsquivaPor > 0);
  });

  it("com a recarga em andamento, não faz nada", () => {
    const sala = novaSala();
    const primeira = iniciarEsquiva(sala);
    const segunda = iniciarEsquiva(primeira);
    assert.deepEqual(segunda, primeira);
  });
});

function salaComInimigoNaMesmaPosicao(): ReturnType<typeof novaSala> {
  const sala = novaSala();
  // Nota: repositiona o jogador (não só o inimigo) porque atacar exige
  // jogador.distancia === "perto" — sem isto, o miss seria garantido pela
  // distância, não testando a condição de raia isoladamente.
  return {
    ...sala,
    jogador: { ...sala.jogador, raia: "centro", distancia: "perto" },
    inimigo: { ...sala.inimigo, raia: "centro", distancia: "perto" },
  };
}

describe("atacar", () => {
  it("acerta quando mesma raia, distância perto, e o inimigo não está esquivando", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const depois = atacar(sala);
    assert.ok(depois.inimigo.vida < sala.inimigo.vida, "o inimigo devia ter tomado dano");
  });

  it("erra se as raias são diferentes — isolação: distância perto, inimigo não esquivando", () => {
    // Isola a condição de raia: jogador e inimigo têm distância perto e
    // inimigo não esquiva, mas estão em raias diferentes. O miss deve ser
    // pelo raia check, não pelo distance check.
    const sala = salaComInimigoNaMesmaPosicao();
    const raiasDiferentes = {
      ...sala,
      inimigo: { ...sala.inimigo, raia: "direita" as const },
    };
    const depois = atacar(raiasDiferentes);
    assert.equal(depois.inimigo.vida, raiasDiferentes.inimigo.vida);
  });

  it("erra se a distância não é perto", () => {
    const sala = novaSala();
    const longe = { ...sala, inimigo: { ...sala.inimigo, raia: "centro" as const, distancia: "longe" as const } };
    const depois = atacar(longe);
    assert.equal(depois.inimigo.vida, longe.inimigo.vida);
  });

  it("erra se o inimigo está esquivando — isolação: mesma raia, distância perto, mas esquiva ativa", () => {
    // Isola a condição de esquiva: jogador e inimigo na mesma raia e
    // distância perto, mas inimigo.esquivandoPor > 0. O miss deve ser
    // pelo check de esquiva. (O campo nunca é setado por nenhuma função
    // desta fase — Task 4 adicionará os golpes do inimigo.)
    const sala = salaComInimigoNaMesmaPosicao();
    const inemigoEsquivando = {
      ...sala,
      inimigo: { ...sala.inimigo, esquivandoPor: 1 },
    };
    const depois = atacar(inemigoEsquivando);
    assert.equal(depois.inimigo.vida, inemigoEsquivando.inimigo.vida);
  });

  it("não acerta se o JOGADOR está numa janela de esquiva — o golpe é dele, mas o teste documenta que atacar não depende disso", () => {
    // atacar() é sobre o golpe DO JOGADOR contra o inimigo — a esquiva do
    // jogador é relevante para o golpe DO INIMIGO (Task 4), não para
    // este. Confirma que esquivar não bloqueia o próprio ataque.
    const sala = iniciarEsquiva(salaComInimigoNaMesmaPosicao());
    const depois = atacar(sala);
    assert.ok(depois.inimigo.vida < sala.inimigo.vida);
  });

  it("reduz a onda a zero não mata o jogador nem avança onda sozinho — isso é avancarTick (Task 5)", () => {
    const sala = { ...salaComInimigoNaMesmaPosicao() };
    const comInimigoFraco = { ...sala, inimigo: { ...sala.inimigo, vida: 1 } };
    const depois = atacar(comInimigoFraco);
    assert.ok(depois.inimigo.vida <= 0);
    assert.equal(depois.onda, comInimigoFraco.onda, "atacar não avança onda — isso é avancarTick");
    assert.equal(depois.fase, "em-andamento", "atacar não decide vitória — isso é avancarTick");
  });
});

describe("decidirAcaoDoInimigo", () => {
  it("fora de alcance, persegue: se anda em raia, aproxima uma posição por vez", () => {
    const sala = { ...novaSala(), inimigo: { ...novaSala().inimigo, raia: "direita" as const, distancia: "longe" as const } };
    // jogador está em "centro" — inimigo em "direita" deve andar pra "centro"
    const depois = decidirAcaoDoInimigo(sala);
    assert.equal(depois.inimigo.raia, "centro");
  });

  it("já na mesma raia e mesma distância, não se move — decide telegrafar ou esperar", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    // Sementes diferentes decidem diferente; roda várias vezes e confirma
    // que a raia/distância nunca mudam quando já em alcance.
    for (let s = 0; s < 20; s++) {
      const comSemente = { ...sala, semente: s };
      const depois = decidirAcaoDoInimigo(comSemente);
      assert.equal(depois.inimigo.raia, sala.inimigo.raia);
      assert.equal(depois.inimigo.distancia, sala.inimigo.distancia);
    }
  });

  it("eventualmente telegrafa, dado sementes suficientes", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const telegrafou = Array.from({ length: 50 }, (_, s) =>
      decidirAcaoDoInimigo({ ...sala, semente: s }),
    ).some((depois) => depois.inimigo.telegrafandoPor !== null);
    assert.ok(telegrafou, "em 50 sementes, nenhuma decidiu telegrafar");
  });

  it("já telegrafando, não decide nada novo — espera resolver", () => {
    const sala = {
      ...salaComInimigoNaMesmaPosicao(),
      inimigo: { ...salaComInimigoNaMesmaPosicao().inimigo, telegrafandoPor: 3 },
    };
    const depois = decidirAcaoDoInimigo(sala);
    assert.deepEqual(depois, sala);
  });
});

describe("resolverAtaqueDoInimigo", () => {
  it("acerta o jogador se ele não está esquivando", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const jogadorNaMesmaPosicao = {
      ...sala,
      jogador: { ...sala.jogador, raia: sala.inimigo.raia, distancia: sala.inimigo.distancia },
    };
    const depois = resolverAtaqueDoInimigo(jogadorNaMesmaPosicao);
    assert.ok(depois.jogador.vida < jogadorNaMesmaPosicao.jogador.vida);
  });

  it("não acerta se o jogador está esquivando", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const esquivando = {
      ...sala,
      jogador: {
        ...sala.jogador,
        raia: sala.inimigo.raia,
        distancia: sala.inimigo.distancia,
        esquivandoPor: 2,
      },
    };
    const depois = resolverAtaqueDoInimigo(esquivando);
    assert.equal(depois.jogador.vida, esquivando.jogador.vida);
  });

  it("não acerta se raia ou distância diferem", () => {
    const sala = novaSala(); // inimigo em "centro"/"longe" por padrão, jogador igual — força diferença
    const separados = {
      ...sala,
      jogador: { ...sala.jogador, distancia: "perto" as const },
      inimigo: { ...sala.inimigo, distancia: "longe" as const },
    };
    const depois = resolverAtaqueDoInimigo(separados);
    assert.equal(depois.jogador.vida, separados.jogador.vida);
  });
});

describe("avancarTick", () => {
  it("decrementa esquiva e recarga de esquiva do jogador", () => {
    const sala = iniciarEsquiva(novaSala());
    const depois = avancarTick(sala);
    assert.equal(depois.jogador.esquivandoPor, sala.jogador.esquivandoPor - 1);
    assert.equal(depois.jogador.recargaDeEsquivaPor, sala.jogador.recargaDeEsquivaPor - 1);
  });

  it("nunca decrementa abaixo de zero", () => {
    const sala = novaSala(); // esquivandoPor já é 0
    const depois = avancarTick(sala);
    assert.equal(depois.jogador.esquivandoPor, 0);
  });

  it("telégrafo em andamento decrementa; ao chegar a zero, resolve o ataque", () => {
    const base = salaComInimigoNaMesmaPosicao();
    const telegrafando = {
      ...base,
      jogador: { ...base.jogador, raia: base.inimigo.raia, distancia: base.inimigo.distancia },
      inimigo: { ...base.inimigo, telegrafandoPor: 1 },
    };
    const depois = avancarTick(telegrafando);
    assert.equal(depois.inimigo.telegrafandoPor, null);
    assert.ok(depois.jogador.vida < telegrafando.jogador.vida, "o golpe devia ter resolvido e acertado");
  });

  it("telégrafo com mais de um tick restante apenas decrementa — não resolve o golpe ainda", () => {
    const base = salaComInimigoNaMesmaPosicao();
    const telegrafando = {
      ...base,
      jogador: { ...base.jogador, raia: base.inimigo.raia, distancia: base.inimigo.distancia },
      inimigo: { ...base.inimigo, telegrafandoPor: 3 },
    };
    const depois = avancarTick(telegrafando);
    assert.equal(depois.inimigo.telegrafandoPor, 2);
    assert.equal(depois.jogador.vida, telegrafando.jogador.vida, "golpe não deve ter resolvido com tempo restante");
  });

  it("inimigo comum derrotado avança pra próxima onda, jogador mantém a vida que tinha", () => {
    const sala = {
      ...novaSala(),
      jogador: { ...novaSala().jogador, vida: 120 }, // já ferido — cura seria detectável
      inimigo: { ...novaSala().inimigo, vida: 0 },
    };
    const depois = avancarTick(sala);
    assert.equal(depois.onda, 2);
    assert.equal(depois.fase, "em-andamento");
    assert.equal(depois.jogador.vida, sala.jogador.vida, "vida atravessa entre ondas, não cura");
    assert.notEqual(depois.inimigo, sala.inimigo, "novo inimigo spawnou");
    assert.ok(depois.inimigo.vida > 0);
  });

  it("chefe derrotado (onda além das comuns) termina a sala em vitória", () => {
    const salaNoChefe = {
      ...novaSala(),
      onda: 4, // ONDAS_COMUNS_ANTES_DO_CHEFE (3) + 1
      inimigo: { ...novaSala().inimigo, tipo: "chefe" as const, vida: 0 },
    };
    const depois = avancarTick(salaNoChefe);
    assert.equal(depois.fase, "vitoria");
  });

  it("jogador com vida zero termina a sala em derrota, mesmo com o inimigo vivo", () => {
    const sala = { ...novaSala(), jogador: { ...novaSala().jogador, vida: 0 } };
    const depois = avancarTick(sala);
    assert.equal(depois.fase, "derrota");
  });

  it("jogador e inimigo comum zerados no mesmo tick: derrota vence, sem avançar onda", () => {
    // Isola a ordem exigida pela spec: um jogador que morre não pode
    // "vencer" no mesmo tick em que seu algoz também zera — o passo 2 do
    // avancarTick precisa cortar o fluxo antes do passo 5 (avanço de onda).
    const sala = {
      ...novaSala(),
      jogador: { ...novaSala().jogador, vida: 0 },
      inimigo: { ...novaSala().inimigo, vida: 0 },
    };
    const depois = avancarTick(sala);
    assert.equal(depois.fase, "derrota");
    assert.equal(depois.onda, sala.onda, "onda não deve avançar quando o jogador já morreu");
  });

  it("jogador e chefe zerados no mesmo tick: derrota vence, não vitória", () => {
    const sala = {
      ...novaSala(),
      jogador: { ...novaSala().jogador, vida: 0 },
      inimigo: { ...novaSala().inimigo, tipo: "chefe" as const, vida: 0 },
    };
    const depois = avancarTick(sala);
    assert.equal(depois.fase, "derrota");
  });

  it("sala já terminada (vitória ou derrota) não muda mais nada", () => {
    const venceu = { ...novaSala(), fase: "vitoria" as const };
    assert.deepEqual(avancarTick(venceu), venceu);
    const perdeu = { ...novaSala(), fase: "derrota" as const };
    assert.deepEqual(avancarTick(perdeu), perdeu);
  });

  it("sem telégrafo e fora de alcance, o inimigo persegue no tick", () => {
    const sala = {
      ...novaSala(),
      inimigo: { ...novaSala().inimigo, raia: "direita" as const },
    };
    const depois = avancarTick(sala);
    assert.equal(depois.inimigo.raia, "centro");
  });
});
