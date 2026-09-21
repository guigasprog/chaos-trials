import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Conta, Personagem } from "@chaos/dominio";

/**
 * Onde o estado vive.
 *
 * A interface existe separada da implementação porque a troca é certa: para a
 * fatia jogável, arquivo basta e evita dependência nativa; quando houver
 * economia e mercado, isto vira banco de verdade, com transação. Guardando o
 * contrato aqui, essa troca fica contida num arquivo em vez de espalhada pelas
 * rotas.
 *
 * Era uma interface só, com `buscar/salvar/listar` de personagem. Virou um
 * `Cofre<T>` genérico por coleção quando entraram contas: repetir os mesmos
 * três métodos por tipo teria triplicado a escrita atômica e a fila de
 * escrita, que é justamente a parte difícil de acertar.
 */
export interface Cofre<T> {
  buscar(id: string): Promise<T | null>;
  salvar(valor: T): Promise<void>;
  remover(id: string): Promise<void>;
  listar(): Promise<T[]>;
}

export interface Armazenamento {
  readonly personagens: Cofre<Personagem>;
  readonly contas: Cofre<Conta>;
}

/** Tudo que o cofre precisa saber sobre o que guarda: como tirar o id. */
type ComId = { readonly id: string };

/**
 * Guarda em memória. Para teste, e só.
 *
 * Clona na entrada e na saída: sem isso, quem chamou continuaria segurando uma
 * referência ao estado guardado e poderia alterá-lo pelas costas — exatamente
 * o tipo de acoplamento que um banco de verdade não permitiria, e que
 * portanto não pode existir aqui também.
 */
export function cofreEmMemoria<T extends ComId>(
  inicial: readonly T[] = [],
): Cofre<T> {
  const dados = new Map<string, T>(
    inicial.map((v) => [v.id, structuredClone(v)]),
  );

  return {
    async buscar(id) {
      const v = dados.get(id);
      return v ? structuredClone(v) : null;
    },
    async salvar(v) {
      dados.set(v.id, structuredClone(v));
    },
    async remover(id) {
      dados.delete(id);
    },
    async listar() {
      return [...dados.values()].map((v) => structuredClone(v));
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
export function cofreEmArquivo<T extends ComId>(caminho: string): Cofre<T> {
  let cache: Map<string, T> | null = null;
  let fila: Promise<unknown> = Promise.resolve();

  async function carregar(): Promise<Map<string, T>> {
    if (cache) return cache;
    try {
      const bruto = await readFile(caminho, "utf8");
      const lista = JSON.parse(bruto) as T[];
      cache = new Map(lista.map((v) => [v.id, v]));
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
  function enfileirar<R>(tarefa: () => Promise<R>): Promise<R> {
    const proxima = fila.then(tarefa, tarefa);
    // A fila segue mesmo se esta tarefa falhar — senão um erro travaria todas
    // as escritas seguintes para sempre.
    fila = proxima.catch(() => undefined);
    return proxima;
  }

  return {
    async buscar(id) {
      const dados = await carregar();
      const v = dados.get(id);
      return v ? structuredClone(v) : null;
    },
    salvar(v) {
      return enfileirar(async () => {
        const dados = await carregar();
        dados.set(v.id, structuredClone(v));
        await gravar();
      });
    },
    remover(id) {
      return enfileirar(async () => {
        const dados = await carregar();
        if (!dados.delete(id)) return;
        await gravar();
      });
    },
    async listar() {
      const dados = await carregar();
      return [...dados.values()].map((v) => structuredClone(v));
    },
  };
}

export function emMemoria(
  personagens: readonly Personagem[] = [],
  contas: readonly Conta[] = [],
): Armazenamento {
  return {
    personagens: cofreEmMemoria(personagens),
    contas: cofreEmMemoria(contas),
  };
}

export function emArquivo(pasta: string): Armazenamento {
  return {
    personagens: cofreEmArquivo(join(pasta, "personagens.json")),
    contas: cofreEmArquivo(join(pasta, "contas.json")),
  };
}

/** Pasta padrão dos dados. */
export function pastaPadrao(): string {
  return process.env.CHAOS_DADOS ?? join(process.cwd(), "dados");
}
