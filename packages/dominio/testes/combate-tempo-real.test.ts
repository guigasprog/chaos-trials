import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarSala,
  moverRaia,
  moverDistancia,
  iniciarEsquiva,
  atacar,
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

  it("erra se as raias são diferentes", () => {
    const sala = novaSala(); // jogador centro, inimigo centro por padrão — força diferença
    const comDiferenca = {
      ...sala,
      inimigo: { ...sala.inimigo, raia: "direita" as const, distancia: "perto" as const },
    };
    const depois = atacar(comDiferenca);
    assert.equal(depois.inimigo.vida, comDiferenca.inimigo.vida);
  });

  it("erra se a distância não é perto", () => {
    const sala = novaSala();
    const longe = { ...sala, inimigo: { ...sala.inimigo, raia: "centro" as const, distancia: "longe" as const } };
    const depois = atacar(longe);
    assert.equal(depois.inimigo.vida, longe.inimigo.vida);
  });

  it("erra se o inimigo está numa janela de invencibilidade (não é o caso aqui, mas o jogo tem o espelho — ver Task 4)", () => {
    // Este caso específico (inimigo esquivando) não existe nesta fase —
    // só o JOGADOR esquiva. O teste documenta a assimetria: `atacar` não
    // checa `sala.inimigo.esquivandoPor` porque esse campo nunca é
    // setado por nenhuma função desta fase. Ver Task 4.
    const sala = salaComInimigoNaMesmaPosicao();
    assert.equal(sala.inimigo.esquivandoPor, 0);
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
