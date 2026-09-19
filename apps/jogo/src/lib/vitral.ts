import { profundidadeDe, ramoDe, type Ramo } from "@chaos/dominio";

/**
 * Vitral de catedral, gerado por procedimento.
 *
 * 45 classes precisam de 45 imagens, e ilustrar 45 é caro. Mas vitral **é**
 * geometria — chumbo e vidro colorido —, e isso é exatamente o que SVG
 * expressa nativamente. Cada rosácea sai do próprio índice da classe: mesma
 * classe, mesmo vitral, sempre.
 *
 * A paleta vem do ramo raiz, então as 16 classes do ramo Wise se reconhecem
 * entre si; a complexidade vem da profundidade, então uma classe de nível 4
 * tem mais vidraças e renda mais fina que a raiz de onde veio. Escala em
 * qualquer tamanho e pesa quilobytes.
 */

export interface Paleta {
  readonly nome: string;
  /** Do centro para a borda. */
  readonly vidros: readonly string[];
  readonly chumbo: string;
  readonly fundo: string;
  readonly brilho: string;
}

export const PALETAS: Readonly<Record<Ramo, Paleta>> = {
  1: {
    nome: "Wise",
    vidros: ["#e8d9ff", "#a78bfa", "#6d43c8", "#3b1d78", "#241046"],
    chumbo: "#120a26",
    fundo: "#0b0618",
    brilho: "#c4a9ff",
  },
  2: {
    nome: "Support",
    vidros: ["#fff4d6", "#f5d27a", "#d9a441", "#8a6730", "#4a3418"],
    chumbo: "#231a0c",
    fundo: "#140f06",
    brilho: "#ffe3a3",
  },
  3: {
    nome: "Ranger",
    vidros: ["#ddf7e0", "#86d68f", "#3d9950", "#1d5c30", "#0d2f19"],
    chumbo: "#0a1c10",
    fundo: "#05130a",
    brilho: "#a6ecb0",
  },
  4: {
    nome: "Melee",
    vidros: ["#ffdcd4", "#f08a72", "#c8372b", "#7d1a16", "#3d0c0a"],
    chumbo: "#240b08",
    fundo: "#150605",
    brilho: "#ff9e88",
  },
  5: {
    nome: "Tank",
    vidros: ["#e6eef5", "#9fb6c9", "#5d7a92", "#33485c", "#1a2631"],
    chumbo: "#0f171e",
    fundo: "#080d12",
    brilho: "#bcd2e3",
  },
};

export function paletaDaClasse(indice: number): Paleta {
  return PALETAS[ramoDe(indice)];
}

/**
 * Ruído determinístico a partir do índice.
 *
 * `Math.random` está fora de questão: a mesma classe tem de dar sempre o mesmo
 * vitral, senão a arte muda a cada carregamento e deixa de ser identidade.
 */
function semear(indice: number, salto: number): number {
  let h = (indice * 2654435761 + salto * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const TAMANHO = 200;
const CENTRO = TAMANHO / 2;

function ponto(angulo: number, raio: number): string {
  const x = CENTRO + Math.cos(angulo) * raio;
  const y = CENTRO + Math.sin(angulo) * raio;
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** Um dos gomos de um anel, como setor de coroa circular. */
function goma(
  angulo: number,
  passo: number,
  interno: number,
  externo: number,
): string {
  const a1 = angulo;
  const a2 = angulo + passo;
  const grande = passo > Math.PI ? 1 : 0;
  return [
    `M ${ponto(a1, interno)}`,
    `L ${ponto(a1, externo)}`,
    `A ${externo} ${externo} 0 ${grande} 1 ${ponto(a2, externo)}`,
    `L ${ponto(a2, interno)}`,
    `A ${interno} ${interno} 0 ${grande} 0 ${ponto(a1, interno)}`,
    "Z",
  ].join(" ");
}

/**
 * A rosácea inteira, como SVG.
 *
 * Devolve string em vez de JSX de propósito: assim serve igual no servidor,
 * num `background-image`, ou gravado em arquivo — e não arrasta React para
 * quem só quer a imagem.
 */
export function vitralDaClasse(indice: number, tamanho = TAMANHO): string {
  const paleta = paletaDaClasse(indice);
  const profundidade = profundidadeDe(indice);

  // Mais fundo na árvore, mais elaborado: a raiz é sóbria, a folha é rendada.
  const aneis = 2 + profundidade;
  const gomosBase = 6 + profundidade * 2;
  const id = `v${indice}`;

  const partes: string[] = [];

  partes.push(
    `<defs>`,
    `<radialGradient id="${id}luz" cx="50%" cy="42%" r="62%">`,
    `<stop offset="0%" stop-color="${paleta.brilho}" stop-opacity="0.55"/>`,
    `<stop offset="55%" stop-color="${paleta.brilho}" stop-opacity="0.12"/>`,
    `<stop offset="100%" stop-color="${paleta.fundo}" stop-opacity="0"/>`,
    `</radialGradient>`,
    `</defs>`,
    `<rect width="${TAMANHO}" height="${TAMANHO}" fill="${paleta.fundo}"/>`,
  );

  for (let anel = 0; anel < aneis; anel++) {
    const interno = 16 + (anel * (CENTRO - 22)) / aneis;
    const externo = 16 + ((anel + 1) * (CENTRO - 22)) / aneis;
    // Anéis externos ganham mais gomos, como numa rosácea de verdade.
    const gomos = gomosBase + anel * 2;
    const passo = (Math.PI * 2) / gomos;
    // Gira cada anel um pouco: alinhados, as junções de chumbo formariam raios
    // retos atravessando a peça inteira, e o desenho perderia a trama.
    const giro = semear(indice, anel) * passo;

    for (let g = 0; g < gomos; g++) {
      const sorte = semear(indice, anel * 100 + g);
      const vidro =
        paleta.vidros[
          Math.min(
            paleta.vidros.length - 1,
            Math.floor(sorte * paleta.vidros.length),
          )
        ] ?? paleta.vidros[0]!;
      const opacidade = (0.72 + sorte * 0.28).toFixed(2);

      partes.push(
        `<path d="${goma(giro + g * passo, passo, interno, externo)}" ` +
          `fill="${vidro}" fill-opacity="${opacidade}" ` +
          `stroke="${paleta.chumbo}" stroke-width="2.2"/>`,
      );
    }
  }

  // O óculo central, e a luz por cima de tudo.
  partes.push(
    `<circle cx="${CENTRO}" cy="${CENTRO}" r="16" fill="${paleta.vidros[0]}" ` +
      `stroke="${paleta.chumbo}" stroke-width="2.6"/>`,
    `<circle cx="${CENTRO}" cy="${CENTRO}" r="7" fill="${paleta.brilho}" fill-opacity="0.9"/>`,
    `<rect width="${TAMANHO}" height="${TAMANHO}" fill="url(#${id}luz)"/>`,
    `<circle cx="${CENTRO}" cy="${CENTRO}" r="${CENTRO - 4}" fill="none" ` +
      `stroke="${paleta.chumbo}" stroke-width="5"/>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TAMANHO} ${TAMANHO}" ` +
    `width="${tamanho}" height="${tamanho}" role="img" ` +
    `aria-label="Vitral da classe">${partes.join("")}</svg>`
  );
}

/** O mesmo vitral pronto para `background-image` ou `src`. */
export function vitralComoUrl(indice: number, tamanho = TAMANHO): string {
  return `data:image/svg+xml,${encodeURIComponent(vitralDaClasse(indice, tamanho))}`;
}
