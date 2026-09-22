import type { Ramo } from "./classe.ts";
import { LOJA_TROCA_A_CADA_MS } from "./balanceamento.ts";
import { gerarItem, type Item, type Raridade } from "./item.ts";
import { precoSugerido, type Moeda } from "./mercado.ts";

/**
 * A loja: seis itens de um vendedor que não é ninguém.
 *
 * Diferente do mercado (jogador vende para jogador), aqui não há vendedor a
 * pagar — o preço inteiro vira dízimo, é o mesmo tipo de ralo que o mercado
 * já documenta precisar existir. E diferente de qualquer outra parte do
 * jogo com "sorteio", a loja não guarda estado nenhum: a HORA é a semente.
 * Perguntar duas vezes na mesma hora dá a mesma prateleira; a próxima hora
 * já é outra, sozinha, sem ninguém precisar trocar nada.
 */

export interface ItemDaLoja {
  readonly id: string;
  readonly item: Item;
  readonly preco: number;
  readonly moeda: Moeda;
}

/**
 * A receita de cada uma das seis vagas.
 *
 * Nível crescendo e moeda alternando: começa acessível em sucata e termina
 * caro em premium, para a loja servir tanto quem começou ontem quanto quem
 * já tem conta funda. `raridade` fixa evita que a vaga cara saia como
 * "bruto" por azar do sorteio — cada vaga tem seu teto de qualidade.
 */
const RECEITA: readonly { nivel: number; raridade: Raridade; moeda: Moeda }[] = [
  { nivel: 8, raridade: "lapidado", moeda: "sucata" },
  { nivel: 16, raridade: "vitral", moeda: "sucata" },
  { nivel: 28, raridade: "vitral", moeda: "sucata" },
  { nivel: 20, raridade: "relicario", moeda: "premium" },
  { nivel: 40, raridade: "relicario", moeda: "premium" },
  { nivel: 60, raridade: "sagrado", moeda: "premium" },
];

/** A hora, como número inteiro — é ela que faz o papel de semente. */
export function horaDaLoja(agora: number): number {
  return Math.floor(agora / LOJA_TROCA_A_CADA_MS);
}

/** Quanto falta, em ms, para a prateleira trocar de novo. */
export function proximaTrocaDaLojaEm(agora: number): number {
  return (horaDaLoja(agora) + 1) * LOJA_TROCA_A_CADA_MS - agora;
}

export function itensDaLoja(agora: number): ItemDaLoja[] {
  const hora = horaDaLoja(agora);
  return RECEITA.map((receita, indice) => {
    // O ramo roda com a hora, e não fica fixo por vaga: sem isso a vaga 0
    // seria "sempre Wise" para sempre, e a loja pareceria ter só cinco
    // prateleiras diferentes em vez de trinta (6 vagas × 5 ramos).
    const ramo = (((hora + indice) % 5) + 1) as Ramo;
    const item = gerarItem({
      nivel: receita.nivel,
      ramo,
      semente: hora * 97 + indice * 733,
      id: `loja-${hora}-${indice}`,
      raridade: receita.raridade,
    });
    return {
      id: `loja-${indice}`,
      item,
      preco: precoSugerido(item, receita.moeda),
      moeda: receita.moeda,
    };
  });
}
