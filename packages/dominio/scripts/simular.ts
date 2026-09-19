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
  CRESCIMENTO_POR_CAMADA,
  DERIVA_DA_VIDA,
  NIVEL_DA_SUBCLASSE,
  NIVEL_MAXIMO,
  OFFLINE_RITMO,
  OFFLINE_TETO_HORAS,
  PRECO_REVIVE,
} from "../src/balanceamento.ts";
import {
  equilibrio,
  multiplicadorDaCamada,
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

titulo("CURVA DE XP — custo por nível e acumulado");
console.log("  nível".padEnd(10) + "custo do nível".padEnd(20) + "acumulado");
linha();
for (const n of [1, 10, 30, 60, 100]) {
  console.log(
    `  ${n}`.padEnd(10) +
      texto(grande(xpParaNivel(n))).padEnd(20) +
      texto(grande(xpAcumuladoAte(n))),
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

titulo("CONFRONTO — poder do jogador contra o do inimigo, por nível");
console.log(
  "  nível".padEnd(9) +
    "jogador".padEnd(14) +
    "inimigo".padEnd(16) +
    "razão jogador/inimigo",
);
linha();

for (const nivel of [1, 2, 5, 10, 30, 50, 70, 100]) {
  const r = equilibrio(1, nivel);
  const aviso = r < 0.5 ? "   ← intransponível" : r > 12 ? "   ← trivial" : "";
  console.log(
    `  ${nivel}`.padEnd(9) +
      texto(poderDoPersonagem(1, nivel)).padEnd(14) +
      texto(poderDoInimigo(nivel)).padEnd(16) +
      `${r.toFixed(2)}${aviso}`,
  );
}

titulo("CONFRONTO — a mesma razão, por camada de prestígio (nível 50)");
console.log("  camada".padEnd(12) + "razão jogador/inimigo");
linha();
for (const camada of [0, 1, 5, 10, 25, 50, 100]) {
  const r = equilibrio(1, 50, camada);
  const aviso = r > 100 ? "   ← conteúdo virou enfeite" : "";
  console.log(
    `  ${camada}`.padEnd(12) +
      (r > 1e4 ? r.toExponential(2) : r.toFixed(2)) +
      aviso,
  );
}

const camadaTrivial = [...Array(200).keys()].find((c) => equilibrio(1, 50, c) > 100);
if (camadaTrivial !== undefined) {
  console.log(`
  EM ABERTO — a partir da camada ${camadaTrivial} o jogador está 100x acima do
  inimigo, e o conteúdo da camada deixa de oferecer resistência.

  A causa: o jogador ganha 1,6 por camada e o inimigo 1,45, e essa diferença
  composta cresce sem limite. É o mesmo mecanismo que faz a progressão nunca
  parar — não dá para removê-lo sem tornar o prestígio decorativo.

  O que falta é a outra metade do desenho: algo que consuma a vantagem
  acumulada. Nos jogos do gênero isso costuma ser o teto de nível subindo a
  cada camada, de modo que o multiplicador leve mais longe em vez de tornar o
  mesmo trecho trivial. Hoje o teto é fixo em ${NIVEL_MAXIMO}, então não há
  para onde a vantagem ir.

  Decisão de produto, não de implementação — está registrada nos riscos.`);
}

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
  for (let n = 1; n <= NIVEL_MAXIMO; n++) pior = Math.min(pior, equilibrio(c.indice, n));
}

// ── Veredito ─────────────────────────────────────────────────────────────

titulo("VEREDITO");
if (pior < 0.1) {
  console.log(`
  QUEBRADO. O jogador fica ${(1 / pior).toFixed(0)}x atrás do inimigo.

  Algum nível ficou intransponível.`);
} else {
  console.log(`
  Curva sustentável em todos os níveis das cinco classes.
  Pior razão jogador/inimigo encontrada: ${pior.toFixed(2)} (piso aceitável: 0,50).
  Deriva ao longo de uma vida: nivel^${DERIVA_DA_VIDA} — cerca de ${(100 ** DERIVA_DA_VIDA).toFixed(1)}x do nível 1 ao 100.`);
}

titulo("OUTROS NÚMEROS");
console.log(`
  Offline:  teto de ${OFFLINE_TETO_HORAS}h, rendendo ${(OFFLINE_RITMO * 100).toFixed(0)}% do ritmo ativo
            uma noite de 8h equivale a ${(OFFLINE_TETO_HORAS * OFFLINE_RITMO).toFixed(1)}h de jogo ativo
  Revive:   ${PRECO_REVIVE} de moeda premium
  Subclasse abre nos níveis: ${Object.values(NIVEL_DA_SUBCLASSE).join(", ")}
`);
