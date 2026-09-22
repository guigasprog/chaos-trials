import {
  CAMBIO_ESCALA_DE_CIRCULACAO,
  CAMBIO_ESCALA_DE_VOLUME,
  TAXA_BASE_DO_CAMBIO,
} from "./balanceamento.ts";

/**
 * A bolsa: sucata compra premium, a um preço que sobe sozinho.
 *
 * ## Por que isto existe apesar do resto do jogo dizer o contrário
 *
 * `mercado.ts` é explícito: "NÃO existe troca direta de sucata por
 * premium... um câmbio direto seria uma máquina de imprimir premium".
 * Isso continua verdade para um câmbio de preço FIXO — com fixo, quem
 * farma sucata sem parar imprime premium sem limite, e em duas semanas
 * o preço de tudo que se vende em premium desmorona.
 *
 * A diferença aqui é que o preço NÃO é fixo: ele sobe com o volume
 * comprado no mês inteiro (quanto mais gente usa a bolsa, mais caro fica
 * pra todo mundo — o próprio uso se autolimita) e com o premium já em
 * circulação nas contas (mais premium parado no mundo, mais caro
 * imprimir mais). A bolsa não fecha o buraco — ela o encarece até doer,
 * o que é uma resposta de produto diferente de fingir que ele não existe.
 *
 * ## O que fica de fora, de propósito
 *
 * Sem limite diário por conta, sem histórico de preço persistido entre
 * reinícios do servidor — ambos são reforços razoáveis e NENHUM dos
 * dois está aqui ainda. Medir o comportamento real da taxa primeiro,
 * decidir depois se falta trava. Isso fica **EM ABERTO**.
 */

export interface EstadoDoCambio {
  /** "2026-09" — o mês em que o contador de compra está valendo. */
  readonly mes: string;
  /** Quanto premium já foi comprado pela bolsa NESTE mês. */
  readonly premiumCompradoNoMes: number;
}

/** O mês corrente, no formato que identifica a janela do contador. */
export function mesDe(agora: number): string {
  const d = new Date(agora);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function estadoInicialDoCambio(agora: number): EstadoDoCambio {
  return { mes: mesDe(agora), premiumCompradoNoMes: 0 };
}

/** Se o mês virou desde o último registro, o contador zera sozinho. */
export function normalizarCambio(
  estado: EstadoDoCambio,
  agora: number,
): EstadoDoCambio {
  const mes = mesDe(agora);
  return estado.mes === mes ? estado : { mes, premiumCompradoNoMes: 0 };
}

/**
 * Quanto de sucata vale 1 de premium, agora.
 *
 * Os dois fatores multiplicam a base, e os dois só sobem: mais comprado
 * este mês, mais caro; mais premium já circulando nas contas, mais caro
 * ainda. O preço nunca cai abaixo da base — é o preço "de tabela", sem
 * ninguém tendo usado a bolsa ainda.
 */
export function taxaDoCambio(
  estado: EstadoDoCambio,
  premiumEmCirculacao: number,
): number {
  const fatorDeVolume = 1 + estado.premiumCompradoNoMes / CAMBIO_ESCALA_DE_VOLUME;
  const fatorDeCirculacao = 1 + Math.max(0, premiumEmCirculacao) / CAMBIO_ESCALA_DE_CIRCULACAO;
  return Math.round(TAXA_BASE_DO_CAMBIO * fatorDeVolume * fatorDeCirculacao);
}

/** Só a compra (sucata→premium) alimenta o contador — é ela que cria
    premium novo na mão de alguém. Vender premium de volta não. */
export function registrarCompraDePremium(
  estado: EstadoDoCambio,
  premium: number,
): EstadoDoCambio {
  return { ...estado, premiumCompradoNoMes: estado.premiumCompradoNoMes + premium };
}

/**
 * Sucata equivalente a esta quantidade de premium, na taxa dada — o
 * mesmo número serve para comprar (paga isto) e para vender (recebe
 * isto): não há spread entre as duas pontas, de propósito. Um spread
 * imitaria uma casa de câmbio de verdade, mas aqui não há ninguém do
 * outro lado ganhando a diferença — é a mesma bolsa nos dois sentidos.
 */
export function sucataNaTaxa(taxa: number, premium: number): number {
  return Math.round(taxa * premium);
}
