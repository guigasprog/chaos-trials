import { DIZIMO_DO_MERCADO, PRECO_MAXIMO, PRECO_MINIMO } from "./balanceamento.ts";
import { type Item, poderDoItem } from "./item.ts";

/**
 * O mercado.
 *
 * ## A regra que manda em tudo: economia fechada
 *
 * Moeda premium entra no mundo de um jeito só — alguém comprou com
 * dinheiro de verdade — e NUNCA sai. Não há saque, não há conversão para
 * fora, e não vai haver. Vender uma peça não cria moeda: move moeda de uma
 * conta para outra, e destrói uma parte no caminho.
 *
 * Por isso NÃO existe troca direta de sucata por premium. Sucata é
 * infinitamente farmável; um câmbio direto seria uma máquina de imprimir
 * premium, e em duas semanas o preço de tudo estaria na casa dos milhões.
 * O único caminho de um jogador para o premium é OUTRO jogador pagando por
 * algo que ele fez — que é o que torna difícil de pegar, como tinha de ser.
 *
 * ## O dízimo
 *
 * Toda venda destrói uma fatia. É o único ralo de moeda do jogo, e sem
 * ralo a economia fechada só acumula: cada compra com dinheiro real
 * empurra o total para cima e nada nunca puxa para baixo. O nome é do
 * vocabulário da catedral, e a taxa está em `DIZIMO_DO_MERCADO`.
 *
 * ## Custódia
 *
 * A peça anunciada SAI da mochila na hora do anúncio. Enquanto está
 * anunciada, ela não está em lugar nenhum que o vendedor alcance — senão
 * daria para anunciar, vestir, desmanchar e ainda receber pela venda.
 */

export type Moeda = "sucata" | "premium";

export type EstadoDoAnuncio = "aberto" | "vendido" | "retirado";

export interface Anuncio {
  readonly id: string;
  /** A conta dona. A peça volta para ela se o anúncio for retirado. */
  readonly vendedor: string;
  /** Qual personagem anunciou — é para a mochila dele que a peça volta. */
  readonly personagem: string;
  /** O nome do vendedor, para a vitrine. Não é credencial de nada. */
  readonly vendedorNome: string;
  readonly item: Item;
  readonly preco: number;
  readonly moeda: Moeda;
  readonly criadoEm: number;
  readonly estado: EstadoDoAnuncio;
  /** Quem levou, quando vendido. */
  readonly comprador?: string;
  readonly fechadoEm?: number;
}

export function precoSugerido(item: Item, moeda: Moeda): number {
  // Em sucata o item vale perto do que renderia desmanchado, com um prêmio
  // por já estar pronto; em premium, muito menos, porque premium é escasso
  // por construção.
  const base = poderDoItem(item);
  return moeda === "sucata"
    ? Math.max(PRECO_MINIMO, Math.round(base * 1.6))
    : Math.max(PRECO_MINIMO, Math.round(base / 12));
}

export interface Impedimento {
  readonly motivo: "preco" | "moeda" | "estado" | "proprio" | "saldo";
  readonly detalhe: string;
}

/** Se este preço pode ser anunciado. */
export function precoValido(preco: number, moeda: Moeda): Impedimento | null {
  if (!Number.isInteger(preco)) {
    return { motivo: "preco", detalhe: "o preço tem de ser um número inteiro" };
  }
  if (preco < PRECO_MINIMO) {
    return { motivo: "preco", detalhe: `o mínimo é ${PRECO_MINIMO}` };
  }
  if (preco > PRECO_MAXIMO) {
    // Teto contra o anúncio-piada e contra o golpe do dedo escorregado:
    // um preço de dez dígitos na vitrine não vende nada e atrapalha todo
    // mundo que está tentando comparar.
    return { motivo: "preco", detalhe: `o máximo é ${PRECO_MAXIMO}` };
  }
  if (moeda !== "sucata" && moeda !== "premium") {
    return { motivo: "moeda", detalhe: "moeda desconhecida" };
  }
  return null;
}

export function criarAnuncio(dados: {
  id: string;
  vendedor: string;
  vendedorNome: string;
  personagem: string;
  item: Item;
  preco: number;
  moeda: Moeda;
  agora: number;
}): Anuncio {
  const impede = precoValido(dados.preco, dados.moeda);
  if (impede) throw new Error(impede.detalhe);
  return {
    id: dados.id,
    vendedor: dados.vendedor,
    vendedorNome: dados.vendedorNome,
    personagem: dados.personagem,
    item: dados.item,
    preco: dados.preco,
    moeda: dados.moeda,
    criadoEm: dados.agora,
    estado: "aberto",
  };
}

/** O dízimo desta venda, e o que sobra para o vendedor. */
export function contaDaVenda(preco: number): {
  dizimo: number;
  aoVendedor: number;
} {
  // Arredonda o dízimo para cima: assim o ralo nunca some por arredondar,
  // nem em venda de 1 de preço.
  const dizimo = Math.min(preco, Math.max(1, Math.ceil(preco * DIZIMO_DO_MERCADO)));
  return { dizimo, aoVendedor: preco - dizimo };
}

/**
 * Se esta conta pode comprar este anúncio.
 *
 * O saldo entra por parâmetro porque ele mora na conta (premium) ou no
 * personagem (sucata), e o domínio do mercado não conhece nenhum dos dois.
 */
export function podeComprar(
  anuncio: Anuncio,
  comprador: { conta: string; saldo: number },
): Impedimento | null {
  if (anuncio.estado !== "aberto") {
    return { motivo: "estado", detalhe: "este anúncio não está mais aberto" };
  }
  if (anuncio.vendedor === comprador.conta) {
    // Comprar de si mesmo não é troca: é lavar moeda entre personagens da
    // mesma conta, pagando só o dízimo pelo privilégio.
    return { motivo: "proprio", detalhe: "não dá para comprar o próprio anúncio" };
  }
  if (comprador.saldo < anuncio.preco) {
    return {
      motivo: "saldo",
      detalhe: `custa ${anuncio.preco} e você tem ${comprador.saldo}`,
    };
  }
  return null;
}

export function marcarVendido(
  anuncio: Anuncio,
  comprador: string,
  agora: number,
): Anuncio {
  if (anuncio.estado !== "aberto") throw new Error("este anúncio já foi fechado");
  return { ...anuncio, estado: "vendido", comprador, fechadoEm: agora };
}

export function marcarRetirado(anuncio: Anuncio, agora: number): Anuncio {
  if (anuncio.estado !== "aberto") throw new Error("este anúncio já foi fechado");
  return { ...anuncio, estado: "retirado", fechadoEm: agora };
}

/**
 * A vitrine: só o que está aberto, do mais novo para o mais velho.
 *
 * Mais novo primeiro, e não mais barato: ordenar por preço faz a primeira
 * página ser sempre a mesma lista de bugigangas de 1 de sucata, e o
 * mercado parece morto mesmo cheio.
 */
export function vitrine(
  anuncios: readonly Anuncio[],
  filtro?: { moeda?: Moeda; encaixe?: string; raridade?: string },
): readonly Anuncio[] {
  return anuncios
    .filter((a) => a.estado === "aberto")
    .filter((a) => !filtro?.moeda || a.moeda === filtro.moeda)
    .filter((a) => !filtro?.encaixe || a.item.encaixe === filtro.encaixe)
    .filter((a) => !filtro?.raridade || a.item.raridade === filtro.raridade)
    .sort((a, b) => b.criadoEm - a.criadoEm);
}
