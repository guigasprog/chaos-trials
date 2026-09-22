import { type Atributos, ATRIBUTO_DO_RAMO, somar } from "./atributos.ts";
import type { Ramo } from "./classe.ts";
import { type Bonus, SEM_BONUS } from "./arvore.ts";
import { chance, escolher, sortear } from "./aleatorio.ts";

/**
 * Equipamento.
 *
 * O item soma no MESMO `Bonus` que a árvore produz. Não é economia de
 * código: é o que garante que "mais 8% de dano" signifique exatamente a
 * mesma coisa vindo dos dois lados. Dois caminhos paralelos para o mesmo
 * efeito é onde a regra diverge sem ninguém notar.
 *
 * Quatro encaixes, e não dez. Cada encaixe a mais divide o mesmo poder em
 * pedaços menores e faz cada achado importar menos — e uma tela de boneco
 * com dez caixas vazias pesa mais do que rende.
 */

export type Encaixe = "arma" | "elmo" | "peito" | "talisma";

export const ENCAIXES: readonly Encaixe[] = ["arma", "elmo", "peito", "talisma"];

export const NOME_DO_ENCAIXE: Readonly<Record<Encaixe, string>> = {
  arma: "Arma",
  elmo: "Elmo",
  peito: "Peito",
  talisma: "Talismã",
};

/**
 * Raridade, no vocabulário do vitral.
 *
 * Vidro bruto vira vidro lapidado, vira vitral, vira relicário, vira
 * sagrado. Nomear pela matéria em vez de "comum/raro/épico" dá ao achado
 * um lugar no mundo — e é grátis.
 */
export type Raridade = "bruto" | "lapidado" | "vitral" | "relicario" | "sagrado";

export const RARIDADES: readonly Raridade[] = [
  "bruto",
  "lapidado",
  "vitral",
  "relicario",
  "sagrado",
];

export interface PerfilDeRaridade {
  readonly nome: string;
  /** Peso no sorteio. Relativo, não percentual. */
  readonly peso: number;
  /** Quantas propriedades o item carrega. */
  readonly afixos: number;
  /** Multiplica a potência de cada propriedade. */
  readonly potencia: number;
  /** Cor da borda e do nome na tela. */
  readonly cor: string;
}

/**
 * Os pesos.
 *
 * Sagrado em 1 contra 1.000 de bruto: cerca de 0,05% por queda. Parece
 * pouco e não é — com queda em boa parte das vitórias, é uma peça sagrada
 * a cada poucas horas de jogo, que é a frequência em que um achado desses
 * ainda é acontecimento.
 */
export const PERFIL: Readonly<Record<Raridade, PerfilDeRaridade>> = {
  bruto: { nome: "Bruto", peso: 1000, afixos: 1, potencia: 1, cor: "#8e8598" },
  lapidado: { nome: "Lapidado", peso: 420, afixos: 2, potencia: 1.25, cor: "#7fb3d5" },
  vitral: { nome: "Vitral", peso: 130, afixos: 3, potencia: 1.6, cor: "#c39bf0" },
  relicario: { nome: "Relicário", peso: 28, afixos: 4, potencia: 2.1, cor: "#d9a441" },
  sagrado: { nome: "Sagrado", peso: 1, afixos: 5, potencia: 3, cor: "#f2f0d8" },
};

export interface Item {
  readonly id: string;
  readonly encaixe: Encaixe;
  readonly raridade: Raridade;
  /** O nível do conteúdo que o largou. Define a potência das propriedades. */
  readonly nivel: number;
  readonly nome: string;
  readonly atributos: Atributos;
  readonly danoPercentual: number;
  readonly vidaPercentual: number;
  readonly criticoAdicional: number;
  readonly reducaoAdicional: number;
  readonly roubodeVida: number;
}

const SEM_ATRIBUTOS: Atributos = {
  intelecto: 0,
  presenca: 0,
  destreza: 0,
  forca: 0,
  vigor: 0,
};

// ── Nomes ────────────────────────────────────────────────────────────────

const BASE: Readonly<Record<Encaixe, readonly string[]>> = {
  arma: ["Lâmina", "Malho", "Estilete", "Báculo", "Foice"],
  elmo: ["Elmo", "Coroa", "Capuz", "Diadema", "Máscara"],
  peito: ["Couraça", "Manto", "Cota", "Casula", "Peitoral"],
  talisma: ["Relicário", "Camafeu", "Cordão", "Selo", "Cálice"],
};

/** O epíteto só aparece de vitral para cima: raridade merece nome próprio. */
const EPITETO: readonly string[] = [
  "do Nártex",
  "da Nave",
  "do Coro",
  "da Rosácea",
  "do Vitralista",
  "das Sete Chagas",
  "do Sino Rachado",
  "da Última Luz",
  "do Chumbo Frio",
  "do Anjo Cego",
];

// ── Geração ──────────────────────────────────────────────────────────────

/** As propriedades que um item pode ter, e quanto cada uma vale por nível. */
type Afixo =
  | { tipo: "atributo"; qual: keyof Atributos }
  | { tipo: "doRamo" }
  | { tipo: "dano" }
  | { tipo: "vida" }
  | { tipo: "critico" }
  | { tipo: "reducao" }
  | { tipo: "roubo" };

const AFIXOS: readonly Afixo[] = [
  { tipo: "doRamo" },
  { tipo: "doRamo" },
  { tipo: "atributo", qual: "vigor" },
  { tipo: "atributo", qual: "destreza" },
  { tipo: "dano" },
  { tipo: "vida" },
  { tipo: "critico" },
  { tipo: "reducao" },
  { tipo: "roubo" },
];

/**
 * Um item sorteado para o nível dado.
 *
 * Determinístico pela semente, como todo o resto do jogo: a mesma batalha
 * replicada larga o mesmo item. Sem isso não dá para reproduzir um bug de
 * economia, e o servidor não poderia recalcular nada.
 */
export function gerarItem(dados: {
  nivel: number;
  ramo: Ramo;
  semente: number;
  id: string;
  /** Força uma raridade. Só para teste e para recompensa garantida. */
  raridade?: Raridade;
}): Item {
  /*
   * A semente é passada e devolvida a cada sorteio, como no resto do
   * domínio. Fecho-a num contador local só para o corpo desta função não
   * virar uma fila de `s1`, `s2`, `s3` — o gerador continua o mesmo, e a
   * mesma semente continua dando o mesmo item.
   */
  let semente = dados.semente;
  const dado = () => {
    const s = sortear(semente);
    semente = s.semente;
    return s.valor;
  };
  const umDe = <T>(itens: readonly T[]): T => {
    const s = escolher(semente, itens);
    semente = s.semente;
    return s.item;
  };

  const encaixe = umDe(ENCAIXES);
  const raridade = dados.raridade ?? sortearRaridade(dado);
  const perfil = PERFIL[raridade];

  // A potência cresce com a raiz do nível, e não com ele: linear faria o
  // item do nível 400 valer quarenta vezes o do 10, e nenhuma escolha de
  // build sobreviveria a uma queda de sorte.
  const escala = Math.sqrt(Math.max(1, dados.nivel)) * perfil.potencia;

  let atributos = SEM_ATRIBUTOS;
  let danoPercentual = 0;
  let vidaPercentual = 0;
  let criticoAdicional = 0;
  let reducaoAdicional = 0;
  let roubodeVida = 0;

  const usados = new Set<string>();
  for (let i = 0; i < perfil.afixos; i++) {
    const afixo = umDe(AFIXOS);
    // Repetir o mesmo afixo empilharia dois números iguais na mesma linha
    // da tela; pular é mais barato que somar e explicar. O item sai com um
    // afixo a menos, e a variação é bem-vinda.
    const chave = afixo.tipo === "atributo" ? `atr:${afixo.qual}` : afixo.tipo;
    if (usados.has(chave)) continue;
    usados.add(chave);

    const forca = 0.75 + dado() * 0.5;
    switch (afixo.tipo) {
      case "doRamo":
        atributos = somar(atributos, {
          ...SEM_ATRIBUTOS,
          [ATRIBUTO_DO_RAMO[dados.ramo]]: Math.max(1, Math.round(escala * 1.6 * forca)),
        });
        break;
      case "atributo":
        atributos = somar(atributos, {
          ...SEM_ATRIBUTOS,
          [afixo.qual]: Math.max(1, Math.round(escala * 1.2 * forca)),
        });
        break;
      case "dano":
        danoPercentual += arredondar(0.05 * perfil.potencia * forca);
        break;
      case "vida":
        vidaPercentual += arredondar(0.06 * perfil.potencia * forca);
        break;
      case "critico":
        criticoAdicional += arredondar(0.03 * perfil.potencia * forca);
        break;
      case "reducao":
        reducaoAdicional += arredondar(0.03 * perfil.potencia * forca);
        break;
      case "roubo":
        roubodeVida += arredondar(0.025 * perfil.potencia * forca);
        break;
    }
  }

  return {
    id: dados.id,
    encaixe,
    raridade,
    nivel: dados.nivel,
    nome: nomearItem(umDe, encaixe, raridade),
    atributos,
    danoPercentual,
    vidaPercentual,
    criticoAdicional,
    reducaoAdicional,
    roubodeVida,
  };
}

/** Duas casas: 0,0734 na tela vira "+7%" e o resto é ruído guardado. */
const arredondar = (v: number) => Math.round(v * 1000) / 1000;

function sortearRaridade(dado: () => number): Raridade {
  const total = RARIDADES.reduce((s, x) => s + PERFIL[x].peso, 0);
  let alvo = dado() * total;
  for (const raridade of RARIDADES) {
    alvo -= PERFIL[raridade].peso;
    if (alvo <= 0) return raridade;
  }
  return "bruto";
}

function nomearItem(
  umDe: <T>(itens: readonly T[]) => T,
  encaixe: Encaixe,
  raridade: Raridade,
): string {
  const base = umDe(BASE[encaixe]);
  // O epíteto só aparece de vitral para cima: raridade merece nome próprio,
  // e "Lâmina Bruta do Anjo Cego" tira o peso do nome quando ele importa.
  const nobre =
    raridade === "vitral" || raridade === "relicario" || raridade === "sagrado";
  return nobre ? `${base} ${umDe(EPITETO)}` : `${base} ${PERFIL[raridade].nome}`;
}

// ── Queda ────────────────────────────────────────────────────────────────

/**
 * O que a vitória larga, se largar.
 *
 * Determinístico pela semente, como tudo: o servidor pode recalcular a
 * mesma batalha e chegar na mesma peça, que é o que permite auditar uma
 * reclamação de economia sem acreditar em ninguém.
 *
 * `chanceDeCair` e `sorteios` vêm prontos de quem chama — este arquivo não
 * sabe o que é dificuldade, só sabe sortear. Quem decide os dois números
 * por dificuldade é `balanceamento.ts` (`CHANCE_DE_QUEDA_POR_DIFICULDADE`,
 * `SORTEIOS_POR_DIFICULDADE`). Mais de um sorteio pesa mais na cauda do
 * que na média — e é a cauda que faz alguém aceitar arriscar o personagem.
 */
export function sortearQueda(dados: {
  nivel: number;
  ramo: Ramo;
  semente: number;
  id: string;
  chanceDeCair: number;
  sorteios: number;
}): Item | null {
  const rolo = chance(dados.semente, dados.chanceDeCair);
  if (!rolo.acertou) return null;

  let melhor: Item | null = null;
  let semente = rolo.semente;
  for (let i = 0; i < dados.sorteios; i++) {
    const item = gerarItem({ ...dados, semente });
    if (!melhor || ordemDaRaridade(item.raridade) > ordemDaRaridade(melhor.raridade)) {
      melhor = item;
    }
    semente = sortear(semente).semente;
  }
  return melhor;
}

export const ordemDaRaridade = (r: Raridade) => RARIDADES.indexOf(r);

// ── O que o item rende ───────────────────────────────────────────────────

export function bonusDoItem(item: Item): Bonus {
  return {
    atributos: item.atributos,
    danoPercentual: item.danoPercentual,
    vidaPercentual: item.vidaPercentual,
    criticoAdicional: item.criticoAdicional,
    reducaoAdicional: item.reducaoAdicional,
    roubodeVida: item.roubodeVida,
    recargaReduzida: 0,
    magias: [],
  };
}

/** Soma dois bônus. É como árvore e equipamento chegam juntos ao combate. */
export function somarBonus(a: Bonus, b: Bonus): Bonus {
  return {
    atributos: somar(a.atributos, b.atributos),
    danoPercentual: a.danoPercentual + b.danoPercentual,
    vidaPercentual: a.vidaPercentual + b.vidaPercentual,
    criticoAdicional: a.criticoAdicional + b.criticoAdicional,
    reducaoAdicional: a.reducaoAdicional + b.reducaoAdicional,
    roubodeVida: a.roubodeVida + b.roubodeVida,
    recargaReduzida: a.recargaReduzida + b.recargaReduzida,
    // Sem repetidas: a mesma magia vinda de dois lados apareceria duas
    // vezes na barra de ações.
    magias: [...new Set([...a.magias, ...b.magias])],
  };
}

export function bonusDoEquipamento(
  equipado: Partial<Record<Encaixe, Item>>,
): Bonus {
  let total = SEM_BONUS;
  for (const encaixe of ENCAIXES) {
    const item = equipado[encaixe];
    if (item) total = somarBonus(total, bonusDoItem(item));
  }
  return total;
}

/**
 * Um número só para comparar dois itens.
 *
 * Grosseiro de propósito: serve para ordenar a mochila e para precificar,
 * não para prever combate. A ordem por poder é o que faz a mochila ser
 * legível sem o jogador abrir peça por peça.
 */
export function poderDoItem(item: Item): number {
  const a = item.atributos;
  const soma = a.intelecto + a.presenca + a.destreza + a.forca + a.vigor;
  return Math.round(
    soma +
      (item.danoPercentual +
        item.vidaPercentual +
        item.criticoAdicional +
        item.reducaoAdicional +
        item.roubodeVida) *
        220,
  );
}

/**
 * Quanto a sucata paga por desmanchar.
 *
 * Deliberadamente baixo perto do que uma vitória rende: desmanchar é para
 * limpar a mochila, não para virar a forma principal de ganhar sucata. Se
 * pagasse bem, o melhor jogo seria repetir a luta mais fácil para sempre.
 */
export function precoDeDesmanche(item: Item): number {
  return Math.max(1, Math.round(poderDoItem(item) * 0.4));
}

/** Como a tela mostra as propriedades, já em ordem e em texto. */
export function propriedadesDe(
  item: Item,
): readonly { nome: string; valor: string }[] {
  const linhas: { nome: string; valor: string }[] = [];
  const pct = (v: number) => `+${Math.round(v * 100)}%`;

  for (const [chave, nome] of [
    ["forca", "Força"],
    ["destreza", "Destreza"],
    ["intelecto", "Intelecto"],
    ["presenca", "Presença"],
    ["vigor", "Vigor"],
  ] as const) {
    const v = item.atributos[chave];
    if (v > 0) linhas.push({ nome, valor: `+${v}` });
  }
  if (item.danoPercentual > 0) linhas.push({ nome: "Dano", valor: pct(item.danoPercentual) });
  if (item.vidaPercentual > 0) linhas.push({ nome: "Vida", valor: pct(item.vidaPercentual) });
  if (item.criticoAdicional > 0)
    linhas.push({ nome: "Crítico", valor: pct(item.criticoAdicional) });
  if (item.reducaoAdicional > 0)
    linhas.push({ nome: "Redução", valor: pct(item.reducaoAdicional) });
  if (item.roubodeVida > 0)
    linhas.push({ nome: "Roubo de vida", valor: pct(item.roubodeVida) });

  return linhas;
}
