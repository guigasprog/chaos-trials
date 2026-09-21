import { profundidadeDe, ramoDe, type Ramo } from "@chaos/dominio";

/**
 * A classe retratada como vitral de catedral.
 *
 * Uma **figura** numa janela em ogiva, como santo de nave: halo, manto em
 * dobras, o instrumento da classe na mão. Gerado, e não ilustrado, porque são
 * 45 classes — a paleta vem do ramo raiz, a riqueza vem da profundidade, e a
 * mesma classe dá sempre a mesma janela.
 *
 * O que faz isto ler como vidro e não como vetor chapado são cinco coisas, e
 * cada uma é uma camada separada aqui embaixo:
 *
 * 1. **O chumbo é camada própria, por grupo.** Dentro de um grupo ele é
 *    contínuo e passa por cima de todos os vidros dele; entre grupos, o vidro
 *    do grupo seguinte cobre o chumbo do anterior. É o que acontece numa
 *    janela: o fundo fica atrás e a rede dele não atravessa a figura.
 *
 *    Uma passada só, do fundo à insígnia, enterrava a figura sob a grade dos
 *    losangos.
 * 2. **O chumbo tem perfil.** É uma tira de metal em H, não uma linha: pega
 *    luz em cima e sombra embaixo. Duas passadas, uma escura larga e uma
 *    clara fina deslocada, e a rede ganha relevo.
 * 3. **O vidro é estirado.** Vidro antigo é soprado e puxado, então tem
 *    estrias verticais e bolhas. Ruído com frequência alta em X e baixa em Y
 *    reproduz isso.
 * 4. **Grisalha.** Rosto, dobras e sombras em vitral não são vidro de cor
 *    diferente: são tinta vitrificada, marrom-preta, PINTADA sobre o vidro e
 *    cozida. É o que permite traço fino onde o chumbo não cabe.
 * 5. **Halação.** Vidro claro ao lado de vidro escuro sangra por cima dele —
 *    o olho vê o claro invadindo. É por isso que o halo brilha.
 *
 * E as barras de ferro atravessando: sem elas, uma janela deste tamanho não
 * ficaria de pé, e a ausência é das coisas que a gente nota sem saber por quê.
 */

export interface Paleta {
  readonly nome: string;
  /** Do vidro mais claro ao mais escuro. */
  readonly vidros: readonly string[];
  readonly chumbo: string;
  /** A luz que o chumbo pega na aresta de cima. */
  readonly chumboLuz: string;
  readonly fundo: string;
  readonly brilho: string;
  readonly manto: string;
  readonly mantoEscuro: string;
  /** A carnação do rosto e das mãos. */
  readonly carne: string;
}

export const PALETAS: Readonly<Record<Ramo, Paleta>> = {
  1: {
    nome: "Wise",
    vidros: ["#ece0ff", "#b79dfa", "#7c52d8", "#4a2490", "#2a1258"],
    chumbo: "#120b24",
    chumboLuz: "#6b5f88",
    fundo: "#0b0618",
    brilho: "#d8c6ff",
    manto: "#6d43c8",
    mantoEscuro: "#3b1d78",
    carne: "#f6e3d2",
  },
  2: {
    nome: "Support",
    vidros: ["#fff6e0", "#f7dc95", "#e0ae4e", "#9c7534", "#543c1a"],
    chumbo: "#221a0d",
    chumboLuz: "#7e7259",
    fundo: "#140f06",
    brilho: "#ffeec0",
    manto: "#d9a441",
    mantoEscuro: "#8a6730",
    carne: "#f8e6cf",
  },
  3: {
    nome: "Ranger",
    vidros: ["#e6fbe9", "#96e0a0", "#45a85b", "#226b37", "#0f371d"],
    chumbo: "#0b1d11",
    chumboLuz: "#5b7a63",
    fundo: "#05130a",
    brilho: "#c3f5cb",
    manto: "#3d9950",
    mantoEscuro: "#1d5c30",
    carne: "#f4e3cd",
  },
  4: {
    nome: "Melee",
    vidros: ["#ffe6de", "#f59a83", "#d8422f", "#8c1e18", "#46100c"],
    chumbo: "#230d09",
    chumboLuz: "#836059",
    fundo: "#150605",
    brilho: "#ffc0ae",
    manto: "#c8372b",
    mantoEscuro: "#7d1a16",
    carne: "#f8e2ce",
  },
  5: {
    nome: "Tank",
    vidros: ["#eef4f9", "#adc3d4", "#68849c", "#3a5166", "#1e2c38"],
    chumbo: "#0e161d",
    chumboLuz: "#5f7387",
    fundo: "#080d12",
    brilho: "#d5e5f2",
    manto: "#5d7a92",
    mantoEscuro: "#33485c",
    carne: "#f2e4d6",
  },
};

export function paletaDaClasse(indice: number): Paleta {
  return PALETAS[ramoDe(indice)];
}

/** Ruído determinístico: a mesma classe dá sempre a mesma janela. */
function semear(indice: number, salto: number): number {
  let h = (indice * 2654435761 + salto * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const L = 200;
const A = 300;

/**
 * Uma casa decimal, e sem o zero à toa.
 *
 * Parece detalhe e não é: cada peça entra três vezes no arquivo — vidro,
 * chumbo e luz do chumbo — e a janela inteira vira `data:` URL percentualmente
 * codificada dentro do CSS, onde cada caractere de pontuação ocupa três. Sem
 * arredondar, a página com as cinco lâminas pesava 1090 KB.
 */
const n = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  // Âncora no começo, e não `replace("0.", ".")`: sem ela o corte pegava a
  // primeira ocorrência em qualquer lugar da string, e "80.3" virava "8.3".
  // Um terço dos vértices saía teleportado, e o fundo de losangos aparecia
  // como um emaranhado de riscos — que foi o defeito que levou três rodadas
  // para eu parar de atribuir a outra coisa.
  return String(r).replace(/^(-?)0\./, "$1.");
};

/**
 * Uma peça de vidro: o recorte e a cor.
 *
 * Só isto — o chumbo dela sai depois, junto com o de todas as outras, porque
 * a rede precisa ser contínua.
 */
interface Peca {
  d: string;
  cor: string;
  opacidade: number;
  /** Peças finas levam chumbo mais leve, senão a linha engole o vidro. */
  fino?: boolean;
  /** Clarão, não peça: entra como cor e sai sem contorno. */
  semChumbo?: boolean;
}

/** A ogiva: dois arcos que se encontram em ponta, como janela de nave. */
const OGIVA = `M 18 292 L 18 104 A 118 118 0 0 1 100 12 A 118 118 0 0 1 182 104 L 182 292 Z`;

/* ─────────────────────── as peças ─────────────────────── */

/**
 * Fundo em losangos — os "quarries" que preenchem o campo em volta da figura.
 *
 * Os centros ficam num xadrez, e não em linhas deslocadas: losango só ladrilha
 * quando o vizinho de cima-direita está a (meio, -meio) do centro, o que dá
 * uma grade onde a soma dos índices é par. Deslocando linhas inteiras — que
 * foi a primeira tentativa —, as peças de linhas vizinhas não dividem vértice,
 * se sobrepõem, e o fundo vira rabisco em vez de vidraça.
 *
 * Os vértices saem do lugar exato por um fio, porque vidro cortado à mão não
 * fecha perfeito e a grade impecável é o que mais denuncia desenho vetorial.
 * O desvio é amarrado ao PONTO, não à peça: quem divide um canto concorda
 * sobre onde ele está.
 */
function losangos(p: Paleta, indice: number): Peca[] {
  const pecas: Peca[] = [];
  const meio = 16;

  /** O desvio de um canto, igual para todas as peças que o dividem. */
  const canto = (x: number, y: number): [number, number] => {
    const chave = Math.round(x / meio) * 1009 + Math.round(y / meio) * 7919;
    return [
      (semear(indice, 4000 + chave) - 0.5) * 2.4,
      (semear(indice, 5000 + chave) - 0.5) * 2.4,
    ];
  };

  for (let linha = -1; linha * meio < A + meio; linha++) {
    for (let coluna = -1; coluna * meio < L + meio; coluna++) {
      // Xadrez: só onde a soma é par existe um losango.
      if ((linha + coluna) % 2 !== 0) continue;

      const cx = coluna * meio;
      const cy = linha * meio;
      const s = semear(indice, 900 + linha * 97 + coluna);

      const [ax, ay] = canto(cx, cy - meio);
      const [bx, by] = canto(cx + meio, cy);
      const [ccx, ccy] = canto(cx, cy + meio);
      const [dx, dy] = canto(cx - meio, cy);

      pecas.push({
        d:
          `M${n(cx + ax)} ${n(cy - meio + ay)}` +
          `L${n(cx + meio + bx)} ${n(cy + by)}` +
          `L${n(cx + ccx)} ${n(cy + meio + ccy)}` +
          `L${n(cx - meio + dx)} ${n(cy + dy)}Z`,
        cor: p.vidros[s > 0.84 ? 2 : 3] ?? p.vidros[3]!,
        opacidade: Math.round((0.55 + s * 0.3) * 100) / 100,
        fino: true,
      });
    }
  }
  return pecas;
}

/**
 * Aréola de raios atrás da figura — a luz que a janela deixa passar.
 *
 * Sem chumbo, e isto custou uma rodada para descobrir: com contorno, os doze
 * raios viravam uma teia de linhas finas cruzando o campo inteiro, e o fundo
 * parecia riscado a estilete. Clarão é cor, não peça de vidro — a vidraça ali
 * continua sendo a dos losangos, por baixo.
 */
function aureola(p: Paleta, raios: number, indice: number): Peca[] {
  const pecas: Peca[] = [];
  const cx = 100;
  const cy = 132;

  for (let i = 0; i < raios; i++) {
    const a1 = (i / raios) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / raios) * Math.PI * 2 - Math.PI / 2;
    const r = 104 + semear(indice, 300 + i) * 16;
    pecas.push({
      d:
        `M${cx} ${cy}L${n(cx + Math.cos(a1) * r)} ${n(cy + Math.sin(a1) * r)}` +
        `L${n(cx + Math.cos(a2) * r)} ${n(cy + Math.sin(a2) * r)}Z`,
      cor: (i % 2 === 0 ? p.vidros[1] : p.vidros[2]) ?? p.vidros[1]!,
      opacidade: 0.22,
      semChumbo: true,
    });
  }
  return pecas;
}

/** Halo, manto em dobras, ombros e rosto. */
function figura(p: Paleta, dobras: number, indice: number): Peca[] {
  const pecas: Peca[] = [];

  pecas.push(
    { d: circulo(100, 88, 40), cor: p.vidros[1]!, opacidade: 0.92 },
    { d: circulo(100, 88, 31), cor: p.vidros[0]!, opacidade: 0.8 },
  );

  const topo = 138;
  const base = 288;
  const lTopo = 40;
  const lBase = 66;

  for (let i = 0; i < dobras; i++) {
    const e0 = i / dobras;
    const e1 = (i + 1) / dobras;
    const xt0 = 100 - lTopo + e0 * lTopo * 2;
    const xt1 = 100 - lTopo + e1 * lTopo * 2;
    const xb0 = 100 - lBase + e0 * lBase * 2;
    const xb1 = 100 - lBase + e1 * lBase * 2;
    const curva = 5 + semear(indice, 500 + i) * 7;

    pecas.push({
      // Alterna claro e escuro: é assim que vitral representa pano, porque não
      // há como sombrear vidro colorido — o volume vem da divisão em peças.
      d:
        `M ${xt0} ${topo} L ${xt1} ${topo} ` +
        `Q ${(xt1 + xb1) / 2 + curva} ${(topo + base) / 2} ${xb1} ${base} ` +
        `L ${xb0} ${base} ` +
        `Q ${(xt0 + xb0) / 2 + curva} ${(topo + base) / 2} ${xt0} ${topo} Z`,
      cor: i % 2 === 0 ? p.manto : p.mantoEscuro,
      opacidade: 0.96,
    });
  }

  pecas.push(
    // Capa dos ombros: sem ela a cabeça flutuava, desligada do corpo.
    {
      d:
        `M 100 112 Q 138 116 152 158 L 132 164 Q 118 138 100 136 ` +
        `Q 82 138 68 164 L 48 158 Q 62 116 100 112 Z`,
      cor: p.vidros[2] ?? p.manto,
      opacidade: 0.96,
    },
    {
      d: `M 100 58 Q 122 58 122 88 Q 122 120 100 124 Q 78 120 78 88 Q 78 58 100 58 Z`,
      cor: p.carne,
      opacidade: 0.97,
    },
    {
      d: `M 78 90 Q 76 54 100 54 Q 124 54 122 90 Q 116 70 100 70 Q 84 70 78 90 Z`,
      cor: p.mantoEscuro,
      opacidade: 0.95,
    },
  );

  return pecas;
}

function circulo(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`;
}

/** O instrumento da classe: silhueta grossa, legível a 76 pixels de largura. */
function insignia(ramo: Ramo, p: Paleta): Peca[] {
  const mao = (cx: number, cy: number): Peca => ({
    d: circulo(cx, cy, 7),
    cor: p.carne,
    opacidade: 0.97,
  });

  switch (ramo) {
    case 1: // cajado com orbe
      return [
        { d: `M 150 108 L 162 108 L 162 284 L 150 284 Z`, cor: p.vidros[3]!, opacidade: 0.96 },
        { d: `M 156 74 L 176 104 L 156 134 L 136 104 Z`, cor: p.brilho, opacidade: 0.94 },
        { d: circulo(156, 104, 9), cor: p.vidros[0]!, opacidade: 0.98 },
        mao(156, 168),
      ];
    case 2: // harpa
      return [
        {
          d: `M 128 272 Q 122 176 158 112 L 176 122 Q 146 180 148 272 Z`,
          cor: p.vidros[1]!,
          opacidade: 0.94,
        },
        mao(140, 206),
      ];
    case 3: // arco e flecha
      return [
        { d: `M 150 92 Q 192 190 150 288 Q 176 190 150 92 Z`, cor: p.vidros[2]!, opacidade: 0.96 },
        { d: `M 120 184 L 178 178 L 178 192 L 120 198 Z`, cor: p.brilho, opacidade: 0.93, fino: true },
        mao(152, 190),
      ];
    case 4: // espada de ponta para baixo
      return [
        { d: `M 144 118 L 164 118 L 168 240 L 154 276 L 140 240 Z`, cor: p.vidros[1]!, opacidade: 0.96 },
        { d: `M 122 112 L 186 112 L 186 130 L 122 130 Z`, cor: p.vidros[3]!, opacidade: 0.96 },
        { d: `M 148 84 L 160 84 L 160 112 L 148 112 Z`, cor: p.vidros[3]!, opacidade: 0.96 },
        { d: circulo(154, 80, 10), cor: p.brilho, opacidade: 0.95 },
        mao(154, 144),
      ];
    case 5: // escudo em ogiva
      return [
        { d: `M 116 124 L 188 124 L 188 216 Q 152 278 116 216 Z`, cor: p.vidros[2]!, opacidade: 0.96 },
        { d: `M 146 134 L 158 134 L 158 252 L 146 252 Z`, cor: p.brilho, opacidade: 0.9, fino: true },
        { d: `M 124 164 L 180 164 L 180 178 L 124 178 Z`, cor: p.brilho, opacidade: 0.9, fino: true },
        mao(120, 190),
      ];
  }
}

/* ─────────────────────── as camadas ─────────────────────── */

/**
 * Grisalha: a tinta vitrificada.
 *
 * Em vitral, rosto e sombra de dobra não são vidro de outra cor — são tinta
 * marrom-preta pintada sobre o vidro e cozida no forno. É o que permite traço
 * fino onde o chumbo, que tem milímetros de largura, não caberia.
 *
 * Sem isto a figura fica com cara de adesivo recortado. Com isto, ganha o
 * desenho por cima do vidro que é a assinatura da técnica.
 */
function grisalha(p: Paleta, dobras: number): string {
  const tinta = `stroke="#2a1a10" fill="none" stroke-linecap="round"`;
  const partes: string[] = [];

  // Traço do rosto: sobrancelhas, nariz e boca, como em vitral românico. Os
  // olhos ficam fechados — santo em contemplação, e olho aberto nesta escala
  // vira mancha.
  partes.push(
    `<path d="M 88 84 Q 93 81 98 84" ${tinta} stroke-width="1.5" stroke-opacity="0.72"/>`,
    `<path d="M 102 84 Q 107 81 112 84" ${tinta} stroke-width="1.5" stroke-opacity="0.72"/>`,
    `<path d="M 100 84 L 100 98 Q 98 101 96 100" ${tinta} stroke-width="1.3" stroke-opacity="0.55"/>`,
    `<path d="M 93 108 Q 100 111 107 108" ${tinta} stroke-width="1.5" stroke-opacity="0.68"/>`,
    // Sombra sob o queixo: é o que tira o rosto do plano.
    `<path d="M 84 106 Q 100 128 116 106" ${tinta} stroke-width="3.4" stroke-opacity="0.2"/>`,
  );

  // Dobras do pano: cada uma ganha um traço de sombra acompanhando a curva.
  for (let i = 1; i < dobras; i++) {
    const e = i / dobras;
    const xt = 100 - 40 + e * 80;
    const xb = 100 - 66 + e * 132;
    partes.push(
      `<path d="M ${xt} 150 Q ${(xt + xb) / 2 + 9} 215 ${xb} 282" ` +
        `${tinta} stroke-width="1.6" stroke-opacity="0.34"/>`,
    );
  }

  // Bainha do manto, e a sombra que ela lança.
  partes.push(
    `<path d="M 36 274 Q 100 264 164 274" ${tinta} stroke-width="2" stroke-opacity="0.4"/>`,
    `<path d="M 60 160 Q 100 150 140 160" ${tinta} stroke-width="1.6" stroke-opacity="0.3"/>`,
  );

  // Raios finos dentro do halo — hachura de grisalha, não peça de vidro. Num
  // caminho só, em vez de 24 elementos: mesmo desenho, um sexto do texto.
  const hachura: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    hachura.push(
      `M${n(100 + Math.cos(a) * 32)} ${n(88 + Math.sin(a) * 32)}` +
        `L${n(100 + Math.cos(a) * 39)} ${n(88 + Math.sin(a) * 39)}`,
    );
  }
  partes.push(
    `<path d="${hachura.join("")}" stroke="${p.chumbo}" stroke-width="1.2" ` +
      `stroke-opacity=".5" fill="none"/>`,
  );

  return partes.join("");
}

/**
 * Um grupo de peças: o vidro, e logo em seguida o chumbo dele.
 *
 * Nesta ordem, e por grupo, porque é o que acontece na janela: a rede de um
 * grupo é contínua, mas o vidro do grupo seguinte passa por cima dela. Numa
 * passada só, do fundo à insígnia, o chumbo dos losangos atravessava a figura
 * e ela ficava atrás de uma grade.
 *
 * O chumbo sai em duas passadas porque é uma tira em H, não uma linha: a
 * larga escura é o corpo, e a fina e clara deslocada para cima e para a
 * esquerda é a luz batendo na aresta. Numa passada só fica plano.
 */
function camada(pecas: readonly Peca[], p: Paleta): string {
  const vidro = pecas
    .map((c) => `<path d="${c.d}" fill="${c.cor}" fill-opacity="${c.opacidade}"/>`)
    .join("");

  const corpo = pecas
    .filter((c) => !c.semChumbo)
    .map(
      (c) =>
        `<path d="${c.d}" fill="none" stroke="${p.chumbo}" ` +
        `stroke-width="${c.fino ? 1.3 : 2.4}" stroke-linejoin="round" ` +
        `stroke-opacity="${c.fino ? 0.72 : 0.95}"/>`,
    )
    .join("");

  // A aresta de luz só nas peças grossas. Nas finas ela some no próprio
  // chumbo, e eram elas que respondiam por um terço do peso do arquivo.
  const luz = pecas
    .filter((c) => !c.fino && !c.semChumbo)
    .map(
      (c) =>
        `<path d="${c.d}" fill="none" stroke="${p.chumboLuz}" ` +
        `stroke-width=".9" stroke-linejoin="round" ` +
        `stroke-opacity=".45" transform="translate(-.6,-.6)"/>`,
    )
    .join("");

  return vidro + corpo + luz;
}

/**
 * Barras de ferro atravessando a janela.
 *
 * Uma janela deste tamanho não fica de pé sem elas — o chumbo é mole e a
 * gravidade fecha a peça em poucos anos. São das coisas que a gente nota pela
 * ausência sem saber nomear.
 */
function barras(p: Paleta): string {
  return [96, 186, 262]
    .map(
      (y) =>
        `<rect x="18" y="${y}" width="164" height="3.4" fill="${p.chumbo}" fill-opacity="0.85"/>` +
        `<rect x="18" y="${y}" width="164" height="1" fill="${p.chumboLuz}" fill-opacity="0.4"/>`,
    )
    .join("");
}

/* ─────────────────────── a janela ─────────────────────── */

export function vitralDaClasse(indice: number, tamanho = 200): string {
  const p = paletaDaClasse(indice);
  const ramo = ramoDe(indice);
  const profundidade = profundidadeDe(indice);
  const id = `v${indice}`;

  const raios = 10 + profundidade * 2;
  const dobras = 4 + profundidade;

  const fundo = losangos(p, indice);
  const luzAtras = aureola(p, raios, indice);
  const corpo = figura(p, dobras, indice);
  const arma = insignia(ramo, p);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}" ` +
    `width="${tamanho}" height="${(tamanho * A) / L}" role="img" ` +
    `aria-label="Vitral da classe">` +
    `<defs>` +
    `<clipPath id="${id}og"><path d="${OGIVA}"/></clipPath>` +
    // Vidro soprado e puxado tem estria vertical e bolha. Frequência alta em X
    // e baixa em Y é o que produz o risco vertical em vez de granulado.
    `<filter id="${id}grao" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9 0.035" numOctaves="4" ` +
    `seed="${Math.floor(semear(indice, 77) * 9999)}"/>` +
    `<feColorMatrix type="saturate" values="0"/>` +
    `</filter>` +
    // Halação: o vidro claro sangra por cima do escuro ao lado.
    `<filter id="${id}halo" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feGaussianBlur stdDeviation="7"/>` +
    `</filter>` +
    `<radialGradient id="${id}luz" cx="50%" cy="32%" r="72%">` +
    `<stop offset="0%" stop-color="${p.brilho}" stop-opacity="0.3"/>` +
    `<stop offset="58%" stop-color="${p.brilho}" stop-opacity="0.05"/>` +
    `<stop offset="100%" stop-color="${p.fundo}" stop-opacity="0.6"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="${L}" height="${A}" fill="${p.fundo}"/>` +
    `<g clip-path="url(#${id}og)">` +
    camada(fundo, p) +
    camada(luzAtras, p) +
    // Halação: a luz do halo vaza por cima do vidro escuro ao lado, antes de a
    // figura entrar.
    `<circle cx="100" cy="88" r="33" fill="${p.brilho}" fill-opacity="0.45" ` +
    `filter="url(#${id}halo)" style="mix-blend-mode:screen"/>` +
    camada(corpo, p) +
    camada(arma, p) +
    grisalha(p, dobras) +
    // A estria do vidro por cima de tudo que é vidro, mas por baixo das barras
    // de ferro: a textura está no vidro, não no metal.
    `<rect width="${L}" height="${A}" filter="url(#${id}grao)" opacity="0.2" ` +
    `style="mix-blend-mode:overlay"/>` +
    barras(p) +
    `<rect width="${L}" height="${A}" fill="url(#${id}luz)"/>` +
    `</g>` +
    `<path d="${OGIVA}" fill="none" stroke="${p.chumbo}" stroke-width="8"/>` +
    `<path d="${OGIVA}" fill="none" stroke="${p.chumboLuz}" stroke-width="1.6" ` +
    `stroke-opacity="0.5" transform="translate(-1,-1)"/>` +
    `</svg>`
  );
}

/** A mesma janela pronta para `background-image` ou `src`. */
export function vitralComoUrl(indice: number, tamanho = 200): string {
  return `data:image/svg+xml,${encodeURIComponent(vitralDaClasse(indice, tamanho))}`;
}
