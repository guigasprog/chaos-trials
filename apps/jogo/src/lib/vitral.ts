import { profundidadeDe, ramoDe, type Ramo } from "@chaos/dominio";

/**
 * A classe retratada como vitral de catedral.
 *
 * Não é ornamento abstrato: é uma **figura** numa janela em ogiva, como santo
 * de nave — halo, rosto, manto caindo em dobras, e o instrumento da classe na
 * mão. O chumbo desenha o corpo; o vidro colorido preenche.
 *
 * Gerado, e não ilustrado, porque são 45 classes. A paleta vem do ramo raiz,
 * então as 16 do ramo Wise se reconhecem entre si; a riqueza vem da
 * profundidade, então uma classe de nível 4 ganha aréola, mais dobras e renda
 * mais fina que a raiz de onde veio. Mesma classe, mesma janela, sempre.
 */

export interface Paleta {
  readonly nome: string;
  /** Do vidro mais claro ao mais escuro. */
  readonly vidros: readonly string[];
  readonly chumbo: string;
  readonly fundo: string;
  readonly brilho: string;
  /** O manto da figura. */
  readonly manto: string;
  readonly mantoEscuro: string;
}

export const PALETAS: Readonly<Record<Ramo, Paleta>> = {
  1: {
    nome: "Wise",
    vidros: ["#e8d9ff", "#b79dfa", "#7c52d8", "#4a2490", "#2a1258"],
    chumbo: "#0e0820",
    fundo: "#0b0618",
    brilho: "#c4a9ff",
    manto: "#6d43c8",
    mantoEscuro: "#3b1d78",
  },
  2: {
    nome: "Support",
    vidros: ["#fff4d6", "#f7dc95", "#e0ae4e", "#9c7534", "#543c1a"],
    chumbo: "#1d1509",
    fundo: "#140f06",
    brilho: "#ffe3a3",
    manto: "#d9a441",
    mantoEscuro: "#8a6730",
  },
  3: {
    nome: "Ranger",
    vidros: ["#ddf7e0", "#96e0a0", "#45a85b", "#226b37", "#0f371d"],
    chumbo: "#08180d",
    fundo: "#05130a",
    brilho: "#a6ecb0",
    manto: "#3d9950",
    mantoEscuro: "#1d5c30",
  },
  4: {
    nome: "Melee",
    vidros: ["#ffdcd4", "#f59a83", "#d8422f", "#8c1e18", "#46100c"],
    chumbo: "#1e0906",
    fundo: "#150605",
    brilho: "#ff9e88",
    manto: "#c8372b",
    mantoEscuro: "#7d1a16",
  },
  5: {
    nome: "Tank",
    vidros: ["#e6eef5", "#adc3d4", "#68849c", "#3a5166", "#1e2c38"],
    chumbo: "#0c1218",
    fundo: "#080d12",
    brilho: "#bcd2e3",
    manto: "#5d7a92",
    mantoEscuro: "#33485c",
  },
};

export function paletaDaClasse(indice: number): Paleta {
  return PALETAS[ramoDe(indice)];
}

/**
 * Ruído determinístico a partir do índice.
 *
 * `Math.random` está fora de questão: a mesma classe tem de dar sempre a mesma
 * janela, senão a arte muda a cada carregamento e deixa de ser identidade.
 */
function semear(indice: number, salto: number): number {
  let h = (indice * 2654435761 + salto * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const L = 200;
const A = 300;

/** Uma lâmina de vidro: preenchimento com o chumbo em volta. */
function vidro(d: string, cor: string, p: Paleta, opacidade = 1, largura = 2.6): string {
  return (
    `<path d="${d}" fill="${cor}" fill-opacity="${opacidade}" ` +
    `stroke="${p.chumbo}" stroke-width="${largura}" stroke-linejoin="round"/>`
  );
}

/** A ogiva: dois arcos que se encontram em ponta, como janela de nave. */
const OGIVA = `M 18 292 L 18 104 A 118 118 0 0 1 100 12 A 118 118 0 0 1 182 104 L 182 292 Z`;

/**
 * Fundo em losangos.
 *
 * Vitral de catedral raramente tem fundo liso: tem "quarries", losangos
 * pequenos de vidro claro que preenchem o campo em volta da figura. É o que
 * faz a peça ler como janela e não como desenho vetorial.
 */
function losangos(p: Paleta, indice: number): string {
  const partes: string[] = [];
  const passo = 22;
  let n = 0;
  for (let y = 0; y < A + passo; y += passo) {
    for (let x = -passo; x < L + passo; x += passo) {
      const deslocado = (Math.floor(y / passo) % 2) * (passo / 2);
      const cx = x + deslocado;
      const sorte = semear(indice, 900 + n++);
      const cor = p.vidros[sorte > 0.82 ? 2 : 3] ?? p.vidros[3]!;
      partes.push(
        vidro(
          `M ${cx} ${y - passo / 2} L ${cx + passo / 2} ${y} L ${cx} ${y + passo / 2} L ${cx - passo / 2} ${y} Z`,
          cor,
          p,
          0.5 + sorte * 0.3,
          1.6,
        ),
      );
    }
  }
  return partes.join("");
}

/** Aréola de raios atrás da figura — a luz que a janela deixa passar. */
function aureola(p: Paleta, raios: number, indice: number): string {
  const partes: string[] = [];
  const cx = 100;
  const cy = 132;
  for (let i = 0; i < raios; i++) {
    const a1 = (i / raios) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / raios) * Math.PI * 2 - Math.PI / 2;
    const r = 104 + semear(indice, 300 + i) * 16;
    partes.push(
      vidro(
        `M ${cx} ${cy} L ${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r} ` +
          `L ${cx + Math.cos(a2) * r} ${cy + Math.sin(a2) * r} Z`,
        (i % 2 === 0 ? p.vidros[1] : p.vidros[2]) ?? p.vidros[1]!,
        p,
        0.32,
        1.8,
      ),
    );
  }
  return partes.join("");
}

/**
 * A figura: halo, rosto, ombros e o manto em dobras.
 *
 * Cada dobra é uma lâmina própria, com tom ligeiramente diferente — é assim
 * que vitral representa pano, porque não há como sombrear vidro colorido: o
 * volume vem da divisão em peças, não do degradê.
 */
function figura(p: Paleta, dobras: number, indice: number): string {
  const partes: string[] = [];

  // Halo atrás de tudo, com o anel interno que o chumbo desenha.
  partes.push(
    `<circle cx="100" cy="88" r="40" fill="${p.vidros[1]}" fill-opacity="0.9" ` +
      `stroke="${p.chumbo}" stroke-width="3.2"/>`,
    `<circle cx="100" cy="88" r="31" fill="${p.vidros[0]}" fill-opacity="0.75" ` +
      `stroke="${p.chumbo}" stroke-width="2.2"/>`,
  );

  // Manto: dos ombros à base, fatiado em dobras verticais.
  const topo = 138;
  const base = 288;
  const meiaLarguraTopo = 40;
  const meiaLarguraBase = 66;

  for (let i = 0; i < dobras; i++) {
    const e0 = i / dobras;
    const e1 = (i + 1) / dobras;
    const xt0 = 100 - meiaLarguraTopo + e0 * meiaLarguraTopo * 2;
    const xt1 = 100 - meiaLarguraTopo + e1 * meiaLarguraTopo * 2;
    const xb0 = 100 - meiaLarguraBase + e0 * meiaLarguraBase * 2;
    const xb1 = 100 - meiaLarguraBase + e1 * meiaLarguraBase * 2;

    // Alterna claro e escuro: é o que dá a leitura de pano dobrado.
    const cor = i % 2 === 0 ? p.manto : p.mantoEscuro;
    // Uma barriga leve, para o pano não parecer papelão.
    const curva = 5 + semear(indice, 500 + i) * 7;

    partes.push(
      vidro(
        `M ${xt0} ${topo} L ${xt1} ${topo} ` +
          `Q ${(xt1 + xb1) / 2 + curva} ${(topo + base) / 2} ${xb1} ${base} ` +
          `L ${xb0} ${base} ` +
          `Q ${(xt0 + xb0) / 2 + curva} ${(topo + base) / 2} ${xt0} ${topo} Z`,
        cor,
        p,
        0.95,
      ),
    );
  }

  // Ombros: uma capa que sai do pescoço e assenta sobre o manto. Sem ela a
  // cabeça flutuava, desligada do corpo.
  partes.push(
    vidro(
      `M 100 112 Q 138 116 152 158 L 132 164 Q 118 138 100 136 ` +
        `Q 82 138 68 164 L 48 158 Q 62 116 100 112 Z`,
      p.vidros[2] ?? p.manto,
      p,
      0.96,
    ),
  );

  // Rosto: sem feição, como em vitral antigo — o chumbo não desenha olhos, e
  // tentar isso nesta escala vira borrão. A silhueta faz o trabalho.
  partes.push(
    vidro(
      `M 100 58 Q 122 58 122 88 Q 122 120 100 124 Q 78 120 78 88 Q 78 58 100 58 Z`,
      p.vidros[0] ?? "#fff",
      p,
      0.95,
    ),
    // Capuz: silhueta sem exigir traços.
    vidro(
      `M 78 90 Q 76 54 100 54 Q 124 54 122 90 Q 116 70 100 70 Q 84 70 78 90 Z`,
      p.mantoEscuro,
      p,
      0.94,
    ),
  );

  return partes.join("");
}

/**
 * O instrumento da classe, empunhado de lado.
 *
 * É o que separa um Wise de um Melee numa janela do tamanho de um polegar,
 * então é silhueta grossa, não detalhe: tudo aqui precisa continuar legível a
 * 76 pixels de largura.
 */
function insignia(ramo: Ramo, p: Paleta): string {
  /** A mão que segura, como um nó de chumbo. */
  const mao = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="7" fill="${p.vidros[1]}" ` +
    `stroke="${p.chumbo}" stroke-width="2.4"/>`;

  switch (ramo) {
    // Wise: cajado com o orbe aceso no alto.
    case 1:
      return (
        vidro(`M 150 108 L 162 108 L 162 284 L 150 284 Z`, p.vidros[3]!, p, 0.96) +
        vidro(`M 156 74 L 176 104 L 156 134 L 136 104 Z`, p.brilho, p, 0.92) +
        `<circle cx="156" cy="104" r="9" fill="${p.vidros[0]}" stroke="${p.chumbo}" stroke-width="2.4"/>` +
        mao(156, 168)
      );

    // Support: harpa, com a moldura curva e as cordas em chumbo.
    case 2:
      return (
        vidro(
          `M 128 272 Q 122 176 158 112 L 176 122 Q 146 180 148 272 Z`,
          p.vidros[1]!,
          p,
          0.94,
        ) +
        [0, 1, 2, 3, 4]
          .map(
            (i) =>
              `<line x1="${134 + i * 4}" y1="${262 - i * 10}" x2="${163 - i * 3}" y2="${138 + i * 16}" ` +
              `stroke="${p.chumbo}" stroke-width="2.2"/>`,
          )
          .join("") +
        mao(140, 206)
      );

    // Ranger: arco retesado, com a flecha encaixada.
    case 3:
      return (
        vidro(
          `M 150 92 Q 192 190 150 288 Q 176 190 150 92 Z`,
          p.vidros[2]!,
          p,
          0.96,
        ) +
        `<line x1="150" y1="92" x2="150" y2="288" stroke="${p.chumbo}" stroke-width="3"/>` +
        vidro(`M 120 184 L 178 178 L 178 192 L 120 198 Z`, p.brilho, p, 0.92, 2.2) +
        mao(152, 190)
      );

    // Melee: espada de ponta para baixo, como em jazigo de cavaleiro.
    case 4:
      return (
        vidro(`M 144 118 L 164 118 L 168 240 L 154 276 L 140 240 Z`, p.vidros[1]!, p, 0.96) +
        vidro(`M 122 112 L 186 112 L 186 130 L 122 130 Z`, p.vidros[3]!, p, 0.96) +
        vidro(`M 148 84 L 160 84 L 160 112 L 148 112 Z`, p.vidros[3]!, p, 0.96) +
        `<circle cx="154" cy="80" r="10" fill="${p.brilho}" stroke="${p.chumbo}" stroke-width="2.6"/>` +
        mao(154, 144)
      );

    // Tank: escudo em ogiva, ecoando a própria janela.
    case 5:
      return (
        vidro(
          `M 116 124 L 188 124 L 188 216 Q 152 278 116 216 Z`,
          p.vidros[2]!,
          p,
          0.96,
        ) +
        vidro(`M 146 134 L 158 134 L 158 252 L 146 252 Z`, p.brilho, p, 0.88, 2.2) +
        vidro(`M 124 164 L 180 164 L 180 178 L 124 178 Z`, p.brilho, p, 0.88, 2.2) +
        mao(120, 190)
      );
  }
}

/**
 * A janela inteira, como SVG.
 *
 * Devolve string em vez de JSX de propósito: assim serve igual no servidor,
 * num `background-image`, ou gravada em arquivo — e não arrasta React para
 * quem só quer a imagem.
 */
export function vitralDaClasse(indice: number, tamanho = 200): string {
  const p = paletaDaClasse(indice);
  const ramo = ramoDe(indice);
  const profundidade = profundidadeDe(indice);
  const id = `v${indice}`;

  // Mais fundo na árvore, mais elaborada a janela.
  const raios = 10 + profundidade * 2;
  const dobras = 4 + profundidade;

  const corpo =
    losangos(p, indice) +
    aureola(p, raios, indice) +
    figura(p, dobras, indice) +
    insignia(ramo, p);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}" ` +
    `width="${tamanho}" height="${(tamanho * A) / L}" role="img" ` +
    `aria-label="Vitral da classe">` +
    `<defs>` +
    `<clipPath id="${id}og"><path d="${OGIVA}"/></clipPath>` +
    `<radialGradient id="${id}luz" cx="50%" cy="34%" r="70%">` +
    `<stop offset="0%" stop-color="${p.brilho}" stop-opacity="0.34"/>` +
    `<stop offset="60%" stop-color="${p.brilho}" stop-opacity="0.06"/>` +
    `<stop offset="100%" stop-color="${p.fundo}" stop-opacity="0.55"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="${L}" height="${A}" fill="${p.fundo}"/>` +
    `<g clip-path="url(#${id}og)">${corpo}` +
    // A luz por cima de tudo, dentro da ogiva: é o sol atravessando o vidro.
    `<rect width="${L}" height="${A}" fill="url(#${id}luz)"/>` +
    `</g>` +
    // O caixilho de pedra, por fim.
    `<path d="${OGIVA}" fill="none" stroke="${p.chumbo}" stroke-width="7"/>` +
    `<path d="${OGIVA}" fill="none" stroke="${p.vidros[3]}" stroke-width="2" stroke-opacity="0.6"/>` +
    `</svg>`
  );
}

/** A mesma janela pronta para `background-image` ou `src`. */
export function vitralComoUrl(indice: number, tamanho = 200): string {
  return `data:image/svg+xml,${encodeURIComponent(vitralDaClasse(indice, tamanho))}`;
}
