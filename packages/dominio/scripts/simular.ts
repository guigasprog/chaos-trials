/**
 * Simulação de balanceamento.
 *
 * A spec prometeu isto como a mitigação do risco dominante: progressão
 * infinita é fácil de escrever e difícil de tornar interessante, e sem medir a
 * curva antes o defeito só aparece com jogador dentro.
 *
 * Não é teste — não falha, não trava build. É um relatório para ler.
 *
 * `npm run simular --workspace @chaos/dominio`
 */
import {
  atributosDe,
  ATRIBUTO_DO_RAMO,
  chanceDeCritico,
  reducaoDeDano,
  vidaMaxima,
} from "../src/atributos.ts";
import { RAIZES, ramoDe } from "../src/classe.ts";
import { grande, potencia, produto, texto } from "../src/grande.ts";
import {
  AVANCO_DA_PAREDE_POR_CAMADA,
  NIVEL_DA_PAREDE_BASE,
  NIVEL_DA_SUBCLASSE,
  OFFLINE_RITMO,
  OFFLINE_TETO_HORAS,
  PRECO_REVIVE,
} from "../src/balanceamento.ts";
import {
  equilibrio,
  multiplicadorDaCamada,
  nivelDaParede,
  poderDoInimigo,
  poderDoPersonagem,
  xpAcumuladoAte,
  xpParaNivel,
} from "../src/progressao.ts";

const linha = (c = "─") => console.log(c.repeat(74));
const titulo = (t: string) => {
  console.log();
  linha("━");
  console.log(`  ${t}`);
  linha("━");
};

/**
 * Poder ofensivo, como proxy até o motor de combate existir.
 *
 * É o atributo do ramo somado ao ganho médio de crítico. Grosseiro de
 * propósito: serve para comparar curvas entre si, não para prever dano.
 */
function poderOfensivo(indiceClasse: number, nivel: number): number {
  const a = atributosDe(indiceClasse, nivel);
  const principal = a[ATRIBUTO_DO_RAMO[ramoDe(indiceClasse)]];
  return principal * (1 + chanceDeCritico(a));
}

/** Vida efetiva: quanto dano cru a pessoa aguenta depois da redução. */
function vidaEfetiva(indiceClasse: number, nivel: number): number {
  const a = atributosDe(indiceClasse, nivel);
  return vidaMaxima(a) / (1 - reducaoDeDano(a));
}

// ── Fichas ───────────────────────────────────────────────────────────────

titulo("FICHA — as cinco classes raiz, nível 1");
console.log(
  "  classe".padEnd(12) +
    "int  pre  des  for  vig".padEnd(26) +
    "vida".padEnd(8) +
    "redução".padEnd(10) +
    "crítico",
);
linha();
for (const c of RAIZES) {
  const a = atributosDe(c.indice, 1);
  console.log(
    `  ${c.nome}`.padEnd(12) +
      `${a.intelecto}    ${a.presenca}    ${a.destreza}    ${a.forca}    ${a.vigor}`.padEnd(26) +
      `${vidaMaxima(a)}`.padEnd(8) +
      `${(reducaoDeDano(a) * 100).toFixed(1)}%`.padEnd(10) +
      `${(chanceDeCritico(a) * 100).toFixed(1)}%`,
  );
}

titulo("FICHA — um Wise ao longo de uma vida inteira");
console.log(
  "  nível".padEnd(10) +
    "intelecto".padEnd(12) +
    "vida".padEnd(9) +
    "redução".padEnd(10) +
    "crítico".padEnd(10) +
    "vida efetiva",
);
linha();
for (const nivel of [1, 10, 30, 60, 100]) {
  const a = atributosDe(1, nivel);
  const abre = Object.entries(NIVEL_DA_SUBCLASSE).find(([, n]) => n === nivel);
  console.log(
    `  ${nivel}`.padEnd(10) +
      `${a.intelecto}`.padEnd(12) +
      `${vidaMaxima(a)}`.padEnd(9) +
      `${(reducaoDeDano(a) * 100).toFixed(1)}%`.padEnd(10) +
      `${(chanceDeCritico(a) * 100).toFixed(1)}%`.padEnd(10) +
      `${vidaEfetiva(1, nivel).toFixed(0)}` +
      (abre ? `   ← abre subclasse de nível ${abre[0]}` : ""),
  );
}

// ── Curva de XP ──────────────────────────────────────────────────────────

titulo("CURVA DE XP");
// As duas colunas respondem perguntas diferentes sobre a mesma linha, e sem
// dizer isso o nível 1 lê como erro: custa 50 e tem 0 acumulado, porque
// ninguém paga nada para já estar no nível 1.
console.log(
  "  nível".padEnd(10) + "para sair deste".padEnd(20) + "gasto até chegar aqui",
);
linha();
for (const n of [1, 10, 100, 1000, 100_000]) {
  console.log(
    `  ${n}`.padEnd(10) +
      texto(grande(xpParaNivel(n))).padEnd(20) +
      texto(xpAcumuladoAte(n)),
  );
}

// ── Prestígio ────────────────────────────────────────────────────────────

titulo("PRESTÍGIO — multiplicador permanente por camada");
console.log("  camada".padEnd(12) + "multiplicador".padEnd(20) + "cabe em double?");
linha();
for (const camada of [0, 1, 5, 10, 20, 40, 79, 80, 200, 1000]) {
  const mult = multiplicadorDaCamada(camada);
  const cabe = mult.e < 15;
  console.log(
    `  ${camada}`.padEnd(12) +
      texto(mult).padEnd(20) +
      (cabe ? "sim" : "NÃO — exige o tipo Grande"),
  );
}

// ── O confronto ──────────────────────────────────────────────────────────

titulo("A RAMPA — dentro de uma vida, o inimigo alcança o jogador");
console.log(
  "  nível".padEnd(9) +
    "jogador".padEnd(14) +
    "inimigo".padEnd(16) +
    "razão jogador/inimigo",
);
linha();
for (const nivel of [1, 10, 25, 50, 75, 100, 120]) {
  const r = equilibrio(4, nivel);
  const nota =
    nivel === NIVEL_DA_PAREDE_BASE
      ? "   ← A PAREDE: hora de renascer"
      : r < 1
        ? "   ← além da parede, sem camada nova"
        : "";
  console.log(
    `  ${nivel}`.padEnd(9) +
      texto(poderDoPersonagem(4, nivel)).padEnd(14) +
      texto(poderDoInimigo(nivel)).padEnd(16) +
      `${r.toFixed(2)}${nota}`,
  );
}

titulo("A PAREDE AVANÇA — é isso que torna a progressão infinita");
console.log(
  "  camada".padEnd(10) +
    "multiplicador".padEnd(18) +
    "parede no nível".padEnd(20) +
    "razão ali",
);
linha();
for (const camada of [0, 1, 5, 10, 20, 30, 50, 100]) {
  const parede = Math.round(nivelDaParede(camada));
  console.log(
    `  ${camada}`.padEnd(10) +
      texto(multiplicadorDaCamada(camada)).padEnd(18) +
      texto(grande(parede)).padEnd(20) +
      equilibrio(4, parede, camada).toFixed(3),
  );
}
console.log(`
  A dificuldade de um nível é FIXA — o inimigo do nível 500 é o mesmo na camada
  1 e na camada 90. A camada multiplica só o jogador, e por isso a parede se
  afasta ${AVANCO_DA_PAREDE_POR_CAMADA.toFixed(3)}x a cada renascimento em vez de o conteúdo virar enfeite.

  Foi exatamente este ponto que quebrou na versão anterior: jogador e inimigo
  escalavam os dois por camada, o jogador mais rápido, e a vantagem composta
  não tinha onde ser gasta — na camada 35 já não havia resistência nenhuma.
`);

titulo("EQUILÍBRIO ENTRE OS CINCO RAMOS (nível 50)");
console.log("  classe".padEnd(12) + "razão");
linha();
let pior = Infinity;
for (const c of RAIZES) {
  const r = equilibrio(c.indice, 50);
  pior = Math.min(pior, r);
  console.log(`  ${c.nome}`.padEnd(12) + r.toFixed(2));
}
for (const c of RAIZES) {
  for (let n = 1; n <= NIVEL_DA_PAREDE_BASE; n++) {
    pior = Math.min(pior, equilibrio(c.indice, n));
  }
}

// ── Veredito ─────────────────────────────────────────────────────────────

titulo("VEREDITO");
if (pior < 0.9) {
  console.log(`
  QUEBRADO — algum nível antes da parede ficou intransponível (razão ${pior.toFixed(2)}).`);
} else {
  console.log(`
  Rampa contínua nos cinco ramos, do nível 1 até a parede.
  Pior razão antes da parede: ${pior.toFixed(2)}.
  A parede sempre existe, e sempre está mais longe que na vida anterior.`);
}

titulo("OUTROS NÚMEROS");
console.log(`
  Offline:  teto de ${OFFLINE_TETO_HORAS}h, rendendo ${(OFFLINE_RITMO * 100).toFixed(0)}% do ritmo ativo
            uma noite de 8h equivale a ${(OFFLINE_TETO_HORAS * OFFLINE_RITMO).toFixed(1)}h de jogo ativo
  Revive:   ${PRECO_REVIVE} de moeda premium
  Subclasse abre nos níveis: ${Object.values(NIVEL_DA_SUBCLASSE).join(", ")}
`);
