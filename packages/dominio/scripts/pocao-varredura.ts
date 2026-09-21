/**
 * Varredura: qual par (cura, preço) faz o laço fechar?
 *
 * Chutei dois pares e os dois falharam — o segundo só pareceu bom porque
 * a sonda media o comportamento antigo. Varrer é mais barato que chutar
 * uma terceira vez, e a tabela fica no repositório para quem for mexer.
 *
 * O critério é o do jogador: em 200 passos, ele AVANÇA sem ficar parado
 * esperando descanso, e a sucata sobra para o mercado existir?
 */
import { atributosDe } from "../src/atributos.ts";
import {
  criarCombatente,
  iniciarBatalha,
  resolverBatalha,
} from "../src/batalha.ts";
import { habilidadesDe } from "../src/habilidades.ts";
import {
  criarPersonagem,
  ganharXp,
  type Personagem,
  recompensaDe,
  recuar,
  vidaAposVitoria,
  vidaMaximaDe,
} from "../src/personagem.ts";
import { equilibrio } from "../src/progressao.ts";
import { DESCANSO_POR_HORA } from "../src/balanceamento.ts";

const CLASSE = 4;

function oponente(nivel: number) {
  const base = atributosDe(4, nivel);
  const f = Math.max(0.2, (1 / equilibrio(CLASSE, nivel, 0)) ** 0.5);
  const a = (v: number) => Math.max(1, Math.round(v * f));
  return {
    intelecto: a(base.intelecto),
    presenca: a(base.presenca),
    destreza: a(base.destreza),
    forca: a(base.forca),
    vigor: a(base.vigor),
  };
}

function lutar(p: Personagem, semente: number) {
  const { batalha } = resolverBatalha(
    iniciarBatalha(
      [
        criarCombatente({
          id: "heroi",
          nome: "H",
          lado: "jogador",
          ramo: 4,
          atributos: atributosDe(CLASSE, p.nivel),
          habilidades: habilidadesDe(CLASSE, p.nivel).map((h) => h.id),
          vida: p.vida,
        }),
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

const novo = (nivel: number): Personagem => {
  const base = criarPersonagem({ id: "p", nome: "P", classeRaiz: CLASSE, agora: 0 });
  const com = { ...base, nivel, sucata: recompensaDe(nivel, true).sucata * 2 };
  return { ...com, vida: vidaMaximaDe(com) };
};

/** Uma corrida de 200 passos com um par (cura, preço) hipotético. */
function corrida(
  nivel: number,
  cura: number,
  emVitorias: number,
  semente = 0,
) {
  let p = novo(nivel);
  const sucataInicial = p.sucata;
  let lutas = 0;
  let descansos = 0;

  for (let i = 0; i < 200; i++) {
    const maxima = vidaMaximaDe(p);
    const preco = Math.max(3, Math.round(recompensaDe(p.nivel, true).sucata * emVitorias));

    if (p.vida >= maxima * 0.45) {
      p = lutar(p, semente * 9973 + i * 13 + nivel).p;
      lutas += 1;
    } else if (p.sucata >= preco) {
      p = {
        ...p,
        vida: Math.min(maxima, p.vida + Math.ceil(maxima * cura)),
        sucata: p.sucata - preco,
      };
    } else {
      p = {
        ...p,
        vida: Math.min(maxima, p.vida + Math.round(maxima * DESCANSO_POR_HORA)),
      };
      descansos += 1;
    }
  }

  return {
    lutas,
    descansos,
    niveis: p.nivel - nivel,
    sucata: p.sucata - sucataInicial,
  };
}

/*
 * MÉDIA de 25 corridas por célula, e não uma.
 *
 * A primeira versão desta varredura rodava uma corrida por combinação, e
 * a tabela contradizia a sonda para os MESMOS valores — a única
 * diferença era a semente. Corrida única é ruído: a mesma combinação
 * dava 0 e 37 descansos dependendo do sorteio. É o terceiro erro do
 * mesmo tipo neste projeto (chamar amostra de medição), e a correção é
 * sempre a mesma: repetir e olhar a cauda, não um ponto.
 */
const CORRIDAS = 25;

function media(nivel: number, cura: number, preco: number) {
  const rs = Array.from({ length: CORRIDAS }, (_, c) =>
    corrida(nivel, cura, preco, c),
  );
  const m = (f: (r: (typeof rs)[number]) => number) =>
    rs.reduce((s, r) => s + f(r), 0) / rs.length;
  return {
    lutas: Math.round(m((r) => r.lutas)),
    descansos: Math.round(m((r) => r.descansos)),
    piorDescanso: Math.max(...rs.map((r) => r.descansos)),
    niveis: Math.round(m((r) => r.niveis)),
    sucata: Math.round(m((r) => r.sucata)),
    piorSucata: Math.min(...rs.map((r) => r.sucata)),
  };
}

console.log(
  `média de ${CORRIDAS} corridas por célula — "pior" é a pior das ${CORRIDAS}
`,
);
console.log(
  "cura | preço | nível | lutas | descansos (pior) | níveis | sucata (pior)",
);
console.log(
  "─────┼───────┼───────┼───────┼──────────────────┼────────┼──────────────",
);

const CURAS = [0.6, 0.75, 0.9, 1.0];
const PRECOS = [0.8, 0.6, 0.4];

for (const cura of CURAS) {
  for (const preco of PRECOS) {
    for (const nivel of [10, 50]) {
      const r = media(nivel, cura, preco);
      // O critério é do jogador: nunca parar por falta de sucata, nem na
      // pior das corridas, e sobrar moeda para o mercado existir.
      const fecha = r.piorDescanso === 0 && r.piorSucata > 0;
      console.log(
        `${cura.toFixed(2)} | ${preco.toFixed(2)}v | ` +
          `${String(nivel).padStart(5)} | ${String(r.lutas).padStart(5)} | ` +
          `${`${r.descansos} (${r.piorDescanso})`.padStart(16)} | ` +
          `${String(r.niveis).padStart(6)} | ` +
          `${`${r.sucata} (${r.piorSucata})`.padStart(13)}${fecha ? "  <== fecha" : ""}`,
      );
    }
  }
}
