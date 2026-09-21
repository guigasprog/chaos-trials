import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derivar = promisify(scrypt) as (
  senha: string | Buffer,
  sal: string | Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Como a senha é guardada.
 *
 * **scrypt**, do próprio Node, e não bcrypt nem argon2 de pacote: os dois
 * exigem compilação nativa, e uma dependência binária a mais é uma dor de
 * instalação garantida em troca de nada aqui. scrypt é memory-hard, está na
 * biblioteca padrão desde o Node 10, e é recomendado pela OWASP.
 *
 * O custo está no formato gravado, e não numa constante do código. Subir o
 * parâmetro daqui a dois anos não pode invalidar as senhas de quem já se
 * cadastrou: cada hash carrega os parâmetros com que foi feito, e quem entra
 * com um hash antigo é reescrito com os novos.
 *
 * Formato: `scrypt$N$r$p$sal$hash`, tudo em base64url menos os números.
 */

/**
 * Custo atual.
 *
 * N = 2^16 leva ~100 ms nesta máquina e usa 64 MiB por derivação. É o ponto
 * em que uma tentativa de força bruta fica cara e um login honesto continua
 * imperceptível. `maxmem` precisa acompanhar N: o padrão do Node é 32 MiB e
 * o scrypt simplesmente falha acima dele.
 */
const CUSTO = { N: 2 ** 16, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const TAMANHO = 32;

const b64 = (b: Buffer) => b.toString("base64url");

export async function guardarSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha.normalize("NFKC"), sal, TAMANHO, CUSTO);
  return `scrypt$${CUSTO.N}$${CUSTO.r}$${CUSTO.p}$${b64(sal)}$${b64(hash)}`;
}

export interface Conferencia {
  readonly confere: boolean;
  /** Verdadeiro quando o hash foi feito com custo menor que o de hoje. */
  readonly precisaAtualizar: boolean;
}

/**
 * Confere a senha contra o hash guardado.
 *
 * A comparação é `timingSafeEqual`, e não `===`: comparação de string sai no
 * primeiro byte diferente, e o tempo dessa saída conta quantos bytes
 * acertaram. Aqui isso vale pouco — o hash já é aleatório —, mas é o hábito
 * que evita o mesmo descuido onde ele custa caro.
 */
export async function conferirSenha(
  senha: string,
  guardado: string,
): Promise<Conferencia> {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") {
    return { confere: false, precisaAtualizar: false };
  }

  const [, n, r, p, salB64, hashB64] = partes;
  const N = Number(n);
  const opcoes = {
    N,
    r: Number(r),
    p: Number(p),
    maxmem: Math.max(CUSTO.maxmem, 256 * Number(r) * N * 2),
  };
  const esperado = Buffer.from(hashB64!, "base64url");

  let obtido: Buffer;
  try {
    obtido = await derivar(
      senha.normalize("NFKC"),
      Buffer.from(salB64!, "base64url"),
      esperado.length,
      opcoes,
    );
  } catch {
    // Parâmetros gravados fora do que o Node aceita: hash inutilizável, e
    // dizer "confere" nesse caso seria abrir a porta.
    return { confere: false, precisaAtualizar: false };
  }

  return {
    confere: obtido.length === esperado.length && timingSafeEqual(obtido, esperado),
    precisaAtualizar: N < CUSTO.N,
  };
}

/**
 * Consome tempo parecido com o de uma conferência real.
 *
 * Quando o e-mail não existe, responder na hora conta ao atacante que aquele
 * e-mail não está cadastrado — dá para enumerar a base inteira cronometrando
 * respostas. Com isto, o caminho do e-mail inexistente custa o mesmo do
 * e-mail existente com senha errada.
 */
export async function gastarTempoDeConferencia(): Promise<void> {
  await derivar("senha-que-nao-existe", randomBytes(16), TAMANHO, CUSTO);
}
