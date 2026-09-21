import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sessões.
 *
 * O token é opaco e aleatório — 32 bytes do gerador criptográfico —, e o que
 * o servidor guarda é o SHA-256 dele, nunca o token. Um vazamento do banco de
 * sessões não entrega nenhuma sessão viva, do mesmo jeito que um vazamento da
 * tabela de senhas não entrega nenhuma senha.
 *
 * ## Por que não token assinado (JWT/Ed25519)
 *
 * O pedido original falava em criptografia assimétrica. Aqui ela custaria e
 * não pagaria: token assinado se verifica sem consultar nada, o que só
 * importa quando há muitos serviços verificando — e o preço é não conseguir
 * revogar. "Sair de todos os aparelhos", trocar de senha e derrubar sessão
 * roubada viram impossíveis, ou voltam a exigir a consulta que a assinatura
 * queria evitar. Com um servidor só, a consulta é um `Map`.
 *
 * Assimetria entra onde ela decide algo: assinar o extrato do mercado, em que
 * um terceiro precisa verificar sem poder forjar.
 *
 * Em memória, como as batalhas: reiniciar o servidor desconecta todo mundo,
 * o que é aceitável enquanto é um processo só e o pior caso é entrar de novo.
 */

/** Quanto tempo uma sessão dura sem uso. */
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

/** Teto de sessões por conta. A mais antiga cai quando estoura. */
const POR_CONTA = 10;

interface Registro {
  readonly contaId: string;
  readonly criadaEm: number;
  usadaEm: number;
}

const digerir = (token: string) =>
  createHash("sha256").update(token).digest("base64url");

export class Sessoes {
  /** Chave: o digest do token. Valor: a quem ele pertence. */
  private readonly porDigest = new Map<string, Registro>();

  /**
   * Abre uma sessão e devolve o token — a ÚNICA vez em que ele existe fora
   * do navegador de quem entrou.
   */
  abrir(contaId: string, agora: number): string {
    this.recolher(agora);

    const daConta = [...this.porDigest.entries()].filter(
      ([, r]) => r.contaId === contaId,
    );
    if (daConta.length >= POR_CONTA) {
      daConta.sort((a, b) => a[1].usadaEm - b[1].usadaEm);
      this.porDigest.delete(daConta[0]![0]);
    }

    const token = randomBytes(32).toString("base64url");
    this.porDigest.set(digerir(token), {
      contaId,
      criadaEm: agora,
      usadaEm: agora,
    });
    return token;
  }

  /**
   * De quem é este token, se ainda vale.
   *
   * Renova o uso na leitura: sessão ativa não deve expirar no meio de uma
   * partida só porque foi aberta há trinta dias.
   */
  dono(token: string | null, agora: number): string | null {
    if (!token) return null;
    const registro = this.porDigest.get(digerir(token));
    if (!registro) return null;
    if (agora - registro.usadaEm > VALIDADE_MS) {
      this.porDigest.delete(digerir(token));
      return null;
    }
    registro.usadaEm = agora;
    return registro.contaId;
  }

  fechar(token: string | null): void {
    if (token) this.porDigest.delete(digerir(token));
  }

  /** Derruba tudo de uma conta. Para troca de senha e "sair de todo lugar". */
  fecharTudoDe(contaId: string): number {
    let quantas = 0;
    for (const [digest, r] of this.porDigest) {
      if (r.contaId !== contaId) continue;
      this.porDigest.delete(digest);
      quantas += 1;
    }
    return quantas;
  }

  private recolher(agora: number): void {
    for (const [digest, r] of this.porDigest) {
      if (agora - r.usadaEm > VALIDADE_MS) this.porDigest.delete(digest);
    }
  }

  get ativas(): number {
    return this.porDigest.size;
  }
}

/**
 * Lê o token do cabeçalho `Authorization: Bearer <token>`.
 *
 * No cabeçalho e não em cookie: o cliente é uma página estática noutra
 * origem, cookie de origem cruzada exige `SameSite=None; Secure` e vira uma
 * negociação com cada navegador. Bearer é explícito e não viaja sozinho —
 * o que, de quebra, elimina CSRF por construção.
 */
export function tokenDoCabecalho(
  cabecalhos: Record<string, unknown>,
): string | null {
  const bruto = cabecalhos["authorization"];
  if (typeof bruto !== "string") return null;
  const [esquema, valor] = bruto.split(" ");
  if (!valor || esquema?.toLowerCase() !== "bearer") return null;
  return valor.trim() || null;
}

/**
 * Compara dois segredos sem vazar onde eles diferem.
 *
 * Exportado porque o crédito de moeda e o gancho de pagamento também
 * conferem segredo, e cada lugar reinventando `===` é um lugar a menos de
 * proteção.
 */
export function segredoConfere(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // Comprimentos diferentes vazam pelo próprio tamanho; comparar digests de
  // tamanho fixo tira até isso do caminho.
  const dx = createHash("sha256").update(x).digest();
  const dy = createHash("sha256").update(y).digest();
  return timingSafeEqual(dx, dy);
}
