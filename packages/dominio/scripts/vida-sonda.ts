/**
 * A vida passou a atravessar as batalhas. Quantas lutas dá para fazer
 * antes de precisar parar, e quanto custa voltar?
 *
 * Errei exatamente aqui uma vez: escolhi 35% de recuo por parecer "um bom
 * susto" e criei um poço sem saída. Então isto mede antes.
 */
import { atributosDe } from "../src/atributos.ts";
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
  precoDaPocao,
  recuar,
  recompensaDe,
  vidaAposVitoria,
  vidaMaximaDe,
} from "../src/personagem.ts";
import { equilibrio } from "../src/progressao.ts";
import { DESCANSO_POR_HORA, POCAO_CURA } from "../src/balanceamento.ts";

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

/** Uma luta a partir do estado atual. Devolve o personagem depois. */
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

  const venceu = batalha.vencedor === "jogador";
  if (!venceu) return { p: recuar(p), venceu };

  const sobrou = Math.max(1, batalha.combatentes.heroi?.vida ?? 1);
  const premio = recompensaDe(p.nivel, true);
  const ganho = ganharXp(p, premio.xp);
  return {
    p: {
      ...ganho.personagem,
      sucata: ganho.personagem.sucata + premio.sucata,
      // A vida com que SAIU da luta. Antes isto passava o personagem de
      // antes da batalha, e a sonda media uma ficção: vencer não custava
      // vida nenhuma, que é exatamente o defeito que a mudança corrigiu.
      vida:
        ganho.niveisSubidos > 0
          ? ganho.personagem.vida
          : vidaAposVitoria(ganho.personagem, sobrou),
    },
    venceu,
    subiu: ganho.niveisSubidos > 0,
  };
}

const novo = (nivel: number): Personagem => {
  const base = criarPersonagem({ id: "p", nome: "P", classeRaiz: CLASSE, agora: 0 });
  const com = { ...base, nivel, sucata: 0 };
  return { ...com, vida: vidaMaximaDe(com) };
};

console.log("A VIDA ATRAVESSA AS BATALHAS — quanto dá para jogar seguido\n");
console.log("nível | lutas até parar | vitórias | subiu de nível? | sucata");
console.log("──────┼─────────────────┼──────────┼─────────────────┼────────");

for (const nivel of [3, 10, 25, 50, 120]) {
  const lutas: number[] = [];
  let subidas = 0;
  let sucataMedia = 0;

  for (let corrida = 0; corrida < 300; corrida++) {
    let p = novo(nivel);
    let n = 0;
    let subiu = false;
    // Joga até ficar abaixo de 30% ou perder duas vezes.
    let derrotas = 0;
    for (let i = 0; i < 60; i++) {
      if (p.vida < vidaMaximaDe(p) * 0.3 || derrotas >= 2) break;
      const r = lutar(p, corrida * 100 + i);
      p = r.p;
      n += 1;
      if (r.subiu) subiu = true;
      if (!r.venceu) derrotas += 1;
    }
    lutas.push(n);
    if (subiu) subidas += 1;
    sucataMedia += p.sucata;
  }

  lutas.sort((a, b) => a - b);
  const mediana = lutas[lutas.length >> 1];
  const pior = lutas[Math.floor(lutas.length * 0.05)];
  console.log(
    `${String(nivel).padStart(5)} | ${`${mediana} (pior ${pior})`.padStart(15)} | ` +
      `${String(Math.round((lutas.reduce((a, b) => a + b, 0) / lutas.length) * 10) / 10).padStart(8)} | ` +
      `${`${Math.round((subidas / 300) * 100)}%`.padStart(15)} | ` +
      `${Math.round(sucataMedia / 300)}`,
  );
}

console.log("\nQUANTO CUSTA VOLTAR AO CHEIO\n");
console.log("nível | poção cura | poção custa | sucata de 1 vitória | poções que a vitória paga");
console.log("──────┼────────────┼─────────────┼─────────────────────┼──────────────────────────");
for (const nivel of [3, 10, 25, 50, 120]) {
  const p = novo(nivel);
  const cura = Math.ceil(vidaMaximaDe(p) * POCAO_CURA);
  const preco = precoDaPocao(p);
  const porVitoria = recompensaDe(nivel, true).sucata;
  console.log(
    `${String(nivel).padStart(5)} | ${String(cura).padStart(10)} | ` +
      `${String(preco).padStart(11)} | ${String(porVitoria).padStart(19)} | ` +
      `${(porVitoria / preco).toFixed(1)}`,
  );
}

console.log(
  `\nDescanso: ${Math.round(DESCANSO_POR_HORA * 100)}% da vida por hora — ` +
    `do zero ao cheio em ${(1 / DESCANSO_POR_HORA).toFixed(1)}h.`,
);

/*
 * A pergunta que decide tudo: o laço FECHA?
 *
 * Jogando muito tempo seguido, a sucata das vitórias paga as poções que
 * as vitórias exigem — ou o jogador afunda até só poder descansar?
 */
console.log("\nO LAÇO FECHA? 200 passos, comprando poção quando precisa\n");
console.log("nível | lutas | poções | descansos | sucata: início → fim | subiu");
console.log("──────┼───────┼────────┼───────────┼──────────────────────┼──────");
for (const nivelInicial of [3, 10, 50]) {
  // Começa com o que duas vitórias rendem: é o que se tem ao chegar
  // aqui, e zero não é um estado real depois do primeiro nível.
  let p = {
    ...novo(nivelInicial),
    sucata: recompensaDe(nivelInicial, true).sucata * 2,
  };
  const sucataInicial = p.sucata;
  let lutas = 0;
  let pocoes = 0;
  let descansos = 0;

  for (let i = 0; i < 200; i++) {
    if (p.vida >= vidaMaximaDe(p) * 0.45) {
      p = lutar(p, 7000 + i).p;
      lutas += 1;
    } else if (p.sucata >= precoDaPocao(p)) {
      p = beberPocao(p).personagem;
      pocoes += 1;
    } else {
      // Sem sucata: descansa uma hora. É a saída que o jogo sempre tem,
      // e contá-la é o que distingue "difícil" de "travado".
      p = { ...p, vida: p.vida + curaPorDescanso(p, 1) };
      descansos += 1;
    }
  }

  console.log(
    `${String(nivelInicial).padStart(5)} | ${String(lutas).padStart(5)} | ` +
      `${String(pocoes).padStart(6)} | ${String(descansos).padStart(9)} | ` +
      `${`${sucataInicial} → ${p.sucata}`.padStart(20)} | ` +
      `+${p.nivel - nivelInicial}`,
  );
}

console.log("\n(antigo, para comparar)");
for (const nivel of [10, 50]) {
  let p = novo(nivel);
  let lutas = 0;
  let pocoes = 0;
  let parou = "60 lutas";
  for (let i = 0; i < 60; i++) {
    if (p.vida < vidaMaximaDe(p) * 0.45) {
      if (precoDaPocao(p) > p.sucata) {
        parou = `sem sucata para poção na luta ${i}`;
        break;
      }
      p = beberPocao(p).personagem;
      pocoes += 1;
      continue;
    }
    p = lutar(p, 7000 + i).p;
    lutas += 1;
  }
  console.log(
    `  nível ${nivel}: ${lutas} lutas, ${pocoes} poções, ` +
      `sucata final ${p.sucata}, nível final ${p.nivel} — parou por ${parou}`,
  );
}
