import {
  type EstadoDoCambio,
  estadoInicialDoCambio,
  normalizarCambio,
  registrarCompraDePremium,
  taxaDoCambio,
} from "@chaos/dominio";

/**
 * A bolsa, em memória — como `Batalhas` e `Sessoes`.
 *
 * Fica em memória de propósito, e o preço disso é sabido: um reinício do
 * servidor zera o contador de compras do mês, o que barateia a bolsa por
 * alguns instantes até alguém comprar de novo. Para o tamanho deste jogo
 * hoje, é um preço aceitável — persistir isso direito (num cofre de
 * verdade, sobrevivendo a reinício) é reforço real e fica **EM ABERTO**,
 * junto com o limite diário por conta que `cambio.ts` do domínio já
 * cita como ausente.
 *
 * O histórico é só o que esta instância viu — também não sobrevive a um
 * reinício, e também não faz falta agora: o gráfico é para dar sensação
 * de movimento, não para ser um registro contábil.
 */
export class Cambio {
  private estado: EstadoDoCambio;
  private readonly historico: { quando: number; taxa: number }[] = [];
  private ultimoRegistro = 0;

  constructor(agora: number) {
    this.estado = estadoInicialDoCambio(agora);
  }

  /** A taxa agora, e um ponto a mais no histórico — no máximo um por hora,
      para o gráfico não virar uma parede de pontos idênticos. */
  taxa(agora: number, premiumEmCirculacao: number): number {
    this.estado = normalizarCambio(this.estado, agora);
    const valor = taxaDoCambio(this.estado, premiumEmCirculacao);
    if (agora - this.ultimoRegistro >= 60 * 60 * 1000) {
      this.historico.push({ quando: agora, taxa: valor });
      if (this.historico.length > 200) this.historico.shift();
      this.ultimoRegistro = agora;
    }
    return valor;
  }

  registrarCompra(agora: number, premium: number): void {
    this.estado = normalizarCambio(this.estado, agora);
    this.estado = registrarCompraDePremium(this.estado, premium);
  }

  get premiumCompradoNoMes(): number {
    return this.estado.premiumCompradoNoMes;
  }

  get pontosDoHistorico(): readonly { quando: number; taxa: number }[] {
    return this.historico;
  }
}
