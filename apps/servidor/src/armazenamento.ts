import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Personagem } from "@chaos/dominio";

/**
 * Onde o estado vive.
 *
 * A interface existe separada da implementação porque a troca é certa: para a
 * fatia jogável, arquivo basta e evita dependência nativa; quando houver
 * economia e mercado, isto vira banco de verdade, com transação. Guardando o
 * contrato aqui, essa troca fica contida num arquivo em vez de espalhada pelas
 * rotas.
 */
export interface Armazenamento {
  buscar(id: string): Promise<Personagem | null>;
  salvar(p: Personagem): Promise<void>;
  listar(): Promise<Personagem[]>;
}

/**
 * Guarda em memória. Para teste, e só.
 *
 * Clona na entrada e na saída: sem isso, quem chamou continuaria segurando uma
 * referência ao estado guardado e poderia alterá-lo pelas costas — exatamente
 * o tipo de acoplamento que um banco de verdade não permitiria, e que
 * portanto não pode existir aqui também.
 */
export function emMemoria(inicial: readonly Personagem[] = []): Armazenamento {
  const dados = new Map<string, Personagem>(
    inicial.map((p) => [p.id, structuredClone(p)]),
  );

  return {
    async buscar(id) {
      const p = dados.get(id);
      return p ? structuredClone(p) : null;
    },
    async salvar(p) {
      dados.set(p.id, structuredClone(p));
    },
    async listar() {
      return [...dados.values()].map((p) => structuredClone(p));
    },
  };
}

/**
 * Guarda num arquivo JSON.
 *
 * A escrita é atômica — grava num temporário e renomeia — porque `rename` é
 * atômico no sistema de arquivos e escrita direta não é. Sem isso, o processo
 * morrendo no meio de um `writeFile` deixaria o arquivo truncado, e todo mundo
 * perderia o progresso de uma vez.
 *
 * Serializa as escritas numa fila: duas requisições simultâneas chamando
 * `salvar` gravariam por cima uma da outra, e a última leitura venceria. Com a
 * fila, cada escrita enxerga o resultado da anterior.
 */
export function emArquivo(caminho: string): Armazenamento {
  let cache: Map<string, Personagem> | null = null;
  let fila: Promise<unknown> = Promise.resolve();

  async function carregar(): Promise<Map<string, Personagem>> {
    if (cache) return cache;
    try {
      const bruto = await readFile(caminho, "utf8");
      const lista = JSON.parse(bruto) as Personagem[];
      cache = new Map(lista.map((p) => [p.id, p]));
    } catch (erro) {
      // Arquivo ainda não existe é o caso normal da primeira execução; o
      // resto precisa aparecer, e não ser engolido como "banco vazio".
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
      cache = new Map();
    }
    return cache;
  }

  async function gravar(): Promise<void> {
    const dados = await carregar();
    await mkdir(dirname(caminho), { recursive: true });
    const temporario = `${caminho}.${process.pid}.tmp`;
    await writeFile(temporario, JSON.stringify([...dados.values()], null, 2));
    await rename(temporario, caminho);
  }

  /** Enfileira, e devolve o resultado desta tarefa e não o da fila inteira. */
  function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    const proxima = fila.then(tarefa, tarefa);
    // A fila segue mesmo se esta tarefa falhar — senão um erro travaria todas
    // as escritas seguintes para sempre.
    fila = proxima.catch(() => undefined);
    return proxima;
  }

  return {
    async buscar(id) {
      const dados = await carregar();
      const p = dados.get(id);
      return p ? structuredClone(p) : null;
    },
    salvar(p) {
      return enfileirar(async () => {
        const dados = await carregar();
        dados.set(p.id, structuredClone(p));
        await gravar();
      });
    },
    async listar() {
      const dados = await carregar();
      return [...dados.values()].map((p) => structuredClone(p));
    },
  };
}

/** Caminho padrão do arquivo de dados. */
export function caminhoPadrao(): string {
  return process.env.CHAOS_DADOS ?? join(process.cwd(), "dados", "personagens.json");
}
