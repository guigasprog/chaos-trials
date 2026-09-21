/**
 * Uma fila por chave.
 *
 * ## O problema que ela resolve
 *
 * Toda rota faz ler → decidir → gravar. O cofre serializa as GRAVAÇÕES,
 * mas não o ciclo: dois pedidos simultâneos leem o mesmo estado, os dois
 * decidem em cima dele, e o segundo grava por cima do primeiro. É o
 * "lost update" clássico, e num jogo com economia ele não é uma
 * inconsistência — é uma impressora.
 *
 * Medido antes de escrever isto: duas compras simultâneas do MESMO
 * anúncio responderam 200 as duas. A peça acabou em duas mochilas, o
 * vendedor recebeu duas vezes, e a sucata total do mundo caiu 10 onde
 * devia cair 5. O teste sequencial que existia passava — porque
 * sequencial é outra história.
 *
 * ## Como funciona
 *
 * `executar` encadeia a tarefa na cauda daquela chave: a próxima só
 * começa quando a anterior termina, e as chaves não se estorvam. É o
 * mesmo mecanismo da fila de escrita do cofre, com uma diferença que é o
 * ponto inteiro: aqui o trecho protegido é o CICLO, e não só o `write`.
 *
 * ## Por que não threads
 *
 * O pedido original falava em distribuição de threads. Aqui elas
 * piorariam: o problema não é CPU, é ordem. Node tem um laço de eventos
 * só, então nada roda em paralelo de verdade dentro do processo — o que
 * existe é intercalação em cada `await`, e é exatamente isso que a fila
 * disciplina. Uma `worker_thread` só ajudaria em trabalho que bloqueia a
 * CPU por muito tempo; se aparecer, o lugar dela é a simulação offline,
 * não isto.
 *
 * Quando houver mais de um processo, isto vira trava no banco — e é por
 * isso que está atrás de uma interface pequena.
 */
export class Filas {
  /** A última tarefa enfileirada de cada chave. */
  private readonly cauda = new Map<string, Promise<unknown>>();

  /**
   * Roda a tarefa com exclusividade sobre `chave`.
   *
   * O resultado devolvido é o da TAREFA, e não o da cauda: quem chamou
   * precisa do valor e do erro dela, não do que aconteceu antes.
   */
  executar<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
    const anterior = this.cauda.get(chave) ?? Promise.resolve();
    // `then(tarefa, tarefa)` porque a fila segue mesmo se a anterior
    // falhou: um erro não pode travar a chave para sempre.
    const resultado = anterior.then(tarefa, tarefa);

    const marcador = resultado.then(
      () => undefined,
      () => undefined,
    );
    this.cauda.set(chave, marcador);
    // Some do mapa quando esta for a última da fila. Sem isto, o mapa
    // guarda uma entrada por personagem que já jogou — vazamento lento,
    // do tipo que só aparece depois de semanas no ar.
    void marcador.then(() => {
      if (this.cauda.get(chave) === marcador) this.cauda.delete(chave);
    });

    return resultado;
  }

  /**
   * Exclusividade sobre VÁRIAS chaves ao mesmo tempo.
   *
   * Em ordem alfabética, sempre, e é isso que impede abraço mortal: dois
   * pedidos que precisam das mesmas duas chaves as pegam na mesma ordem,
   * então um espera o outro em vez de cada um segurar metade.
   *
   * Uma compra precisa de cinco: o anúncio, os dois personagens e as duas
   * contas. Travar só o anúncio deixaria a mochila do comprador exposta a
   * uma batalha terminando ao mesmo tempo.
   */
  executarEm<T>(chaves: readonly string[], tarefa: () => Promise<T>): Promise<T> {
    const ordenadas = [...new Set(chaves)].sort();
    const encadear = (i: number): Promise<T> =>
      i >= ordenadas.length
        ? tarefa()
        : this.executar(ordenadas[i]!, () => encadear(i + 1));
    return encadear(0);
  }

  /** Quantas chaves estão ocupadas agora. Para `/saude` e para teste. */
  get ocupadas(): number {
    return this.cauda.size;
  }
}

/*
 * Os prefixos existem para duas chaves de tipos diferentes nunca
 * colidirem: um personagem e uma conta podem ter o mesmo id em teste, e
 * uma colisão aqui seria uma trava que ninguém entende.
 */
export const chaveDoPersonagem = (id: string) => `p:${id}`;
export const chaveDaConta = (id: string) => `c:${id}`;
export const chaveDoAnuncio = (id: string) => `a:${id}`;
