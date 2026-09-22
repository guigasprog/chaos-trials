import { PRECO_DO_PRIMEIRO_SLOT, PRECO_DO_SLOT_CRESCE, SLOTS_GRATIS, SLOTS_MAXIMO } from "./balanceamento.ts";

/**
 * A conta: quem entra, e o que é dela e não de um personagem.
 *
 * A divisão importa e é de produto, não de arquitetura:
 *
 * - **Sucata** é do personagem. Ganhou jogando com ele, morre com ele.
 * - **Moeda premium** é da CONTA. Foi comprada com dinheiro de verdade, e
 *   dinheiro de verdade não pode evaporar num permadeath — seria vender algo
 *   que o jogo destrói sozinho.
 *
 * É também o que faz o revive funcionar: o personagem no túmulo não tem nada,
 * e quem paga é a conta. O túmulo prende o personagem, nunca a conta.
 *
 * A senha entra aqui como texto opaco. O domínio não conhece scrypt nem
 * nenhum algoritmo: ele guarda o que o servidor produziu e devolve para o
 * servidor conferir. Criptografia mora onde há `node:crypto`, e o domínio
 * continua puro e testável sem ele.
 */
export interface Conta {
  readonly id: string;
  /** Normalizado: minúsculas e sem espaço nas pontas. É o identificador. */
  readonly email: string;
  /** Opaco para o domínio. Formato e verificação são do servidor. */
  readonly senha: string;
  readonly criadaEm: number;
  /** Última entrada, para a tela dizer "bem-vindo de volta". */
  readonly visto: number;
  /** Moeda comprada. Da conta, e não de nenhum personagem. */
  readonly premium: number;
  /** Quantos slots foram comprados ALÉM dos gratuitos. */
  readonly slotsComprados: number;
  /** Os personagens desta conta, na ordem em que foram criados. */
  readonly personagens: readonly string[];
  /**
   * O IP de onde a conta nasceu. Opaco para o domínio, como a senha — quem
   * resolve o IP de verdade é o servidor.
   *
   * É SINAL, não trava. VPN, proxy e NAT compartilhado (wifi de escritório,
   * provedor com CG-NAT) fazem contas legítimas dividirem IP o tempo todo,
   * e quem realmente quer abusar troca de rede de graça — um IP sozinho
   * nunca prova multi-conta. Ver `contasNoMesmoIp`: ele conta, não julga.
   */
  readonly ip?: string;
}

export function criarConta(dados: {
  id: string;
  email: string;
  senha: string;
  agora: number;
  /** Só para testes e para semear conta de demonstração. */
  premium?: number;
  ip?: string;
}): Conta {
  const email = normalizarEmail(dados.email);
  if (!emailPlausivel(email)) throw new Error(`e-mail inválido: ${dados.email}`);
  return {
    id: dados.id,
    email,
    senha: dados.senha,
    criadaEm: dados.agora,
    visto: dados.agora,
    premium: dados.premium ?? 0,
    slotsComprados: 0,
    personagens: [],
    ...(dados.ip ? { ip: dados.ip } : {}),
  };
}

/**
 * Quantas OUTRAS contas nasceram do mesmo IP que `conta`.
 *
 * Pura contagem — decidir o que fazer com o número é de quem chama. Sem
 * IP (não capturado, ou o cadastro é anterior a este campo existir),
 * conta zero: não dá pra sinalizar o que não se sabe.
 */
export function contasNoMesmoIp(
  todas: readonly Conta[],
  conta: Conta,
): number {
  if (!conta.ip) return 0;
  return todas.filter((c) => c.id !== conta.id && c.ip === conta.ip).length;
}

/**
 * Minúsculas e sem espaço nas pontas.
 *
 * Sem isto, "Guilherme@x.com" e "guilherme@x.com" viram duas contas, e a
 * segunda pessoa a se cadastrar descobre isso tentando entrar na primeira.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validação deliberadamente frouxa.
 *
 * Uma parte antes da arroba, uma depois, um ponto na segunda. Regex de
 * e-mail "completa" rejeita endereços válidos e aceita inválidos; quem
 * decide de verdade é o envio da mensagem de confirmação.
 */
export function emailPlausivel(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * A senha só é recusada por comprimento.
 *
 * Exigir maiúscula, número e símbolo produz "Senha1!" em toda parte — pior
 * que uma frase longa, e mais irritante. O que protege é o tamanho e o
 * custo do hash, e os dois estão cobertos.
 */
export function senhaAceitavel(senha: string): boolean {
  return senha.length >= 8 && senha.length <= 200;
}

// ── Slots ────────────────────────────────────────────────────────────────

/** Quantos personagens esta conta pode ter ao mesmo tempo. */
export function slotsTotais(c: Conta): number {
  return SLOTS_GRATIS + c.slotsComprados;
}

export function slotsLivres(c: Conta): number {
  return slotsTotais(c) - c.personagens.length;
}

/**
 * Preço do PRÓXIMO slot, em moeda premium.
 *
 * Cresce a cada compra porque slot não é consumo, é permanente: preço fixo
 * transformaria "ter 20 personagens" num gasto trivial, e a decisão de qual
 * personagem manter — que é o que dá peso ao permadeath — desapareceria.
 */
export function precoDoProximoSlot(c: Conta): number {
  return Math.round(PRECO_DO_PRIMEIRO_SLOT * PRECO_DO_SLOT_CRESCE ** c.slotsComprados);
}

export function podeComprarSlot(c: Conta): { pode: boolean; motivo?: string } {
  if (slotsTotais(c) >= SLOTS_MAXIMO) {
    return { pode: false, motivo: `o máximo é ${SLOTS_MAXIMO} slots` };
  }
  const preco = precoDoProximoSlot(c);
  if (c.premium < preco) {
    return { pode: false, motivo: `custa ${preco} e você tem ${c.premium}` };
  }
  return { pode: true };
}

export function comprarSlot(c: Conta): Conta {
  const { pode, motivo } = podeComprarSlot(c);
  if (!pode) throw new Error(`não dá para comprar slot: ${motivo}`);
  return {
    ...c,
    premium: c.premium - precoDoProximoSlot(c),
    slotsComprados: c.slotsComprados + 1,
  };
}

// ── Personagens da conta ─────────────────────────────────────────────────

export function adicionarPersonagem(c: Conta, id: string): Conta {
  if (c.personagens.includes(id)) return c;
  if (slotsLivres(c) <= 0) {
    throw new Error(
      `sem slot livre: ${c.personagens.length} de ${slotsTotais(c)} ocupados`,
    );
  }
  return { ...c, personagens: [...c.personagens, id] };
}

/**
 * Apagar um personagem libera o slot, e isso é de propósito.
 *
 * Sem esta saída, quem não pode pagar o revive ficaria com um slot morto
 * para sempre — e com os dois slots gratuitos ocupados por túmulos, sem
 * jogo. O custo de apagar já é alto: vão junto todas as camadas, que é o
 * progresso que não volta. Esse é o peso do permadeath; o slot não precisa
 * ser refém também.
 */
export function removerPersonagem(c: Conta, id: string): Conta {
  return { ...c, personagens: c.personagens.filter((p) => p !== id) };
}

// ── Moeda premium ────────────────────────────────────────────────────────

export function creditarPremium(c: Conta, quanto: number): Conta {
  if (!Number.isFinite(quanto) || quanto <= 0) {
    throw new Error(`crédito inválido: ${quanto}`);
  }
  return { ...c, premium: c.premium + Math.round(quanto) };
}

export function debitarPremium(c: Conta, quanto: number): Conta {
  const valor = Math.round(quanto);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(`débito inválido: ${quanto}`);
  }
  if (c.premium < valor) {
    throw new Error(`saldo insuficiente: precisa de ${valor} e tem ${c.premium}`);
  }
  return { ...c, premium: c.premium - valor };
}

/**
 * Preenche o que faltar numa conta vinda do armazenamento.
 *
 * Mesmo motivo de `normalizar` em personagem: campo novo em dado gravado
 * chega `undefined` e estoura três camadas adiante, longe da causa.
 */
export function normalizarConta(c: Conta): Conta {
  return {
    ...c,
    premium: c.premium ?? 0,
    slotsComprados: c.slotsComprados ?? 0,
    personagens: c.personagens ?? [],
    visto: c.visto ?? c.criadaEm,
  };
}
