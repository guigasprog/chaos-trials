import type { FastifyInstance } from "fastify";
import {
  atacar,
  iniciarEsquiva,
  iniciarSala,
  moverDistancia,
  moverRaia,
  avancarTick,
  perderBatalha,
  type Sala,
  TICKS_POR_SEGUNDO,
  TIMEOUT_DE_DESCONEXAO_MS,
} from "@chaos/dominio";
import type { Armazenamento } from "./armazenamento.ts";
import { premioDe } from "./batalhas.ts";
import { chaveDoPersonagem, Filas } from "./filas.ts";
import { Sessoes } from "./sessoes.ts";

/**
 * O token chega como subprotocolo do WebSocket (`bearer.<token>`), não
 * como cabeçalho `Authorization` — o `WebSocket` nativo do navegador não
 * permite mandar cabeçalhos customizados no handshake, só subprotocolos.
 * Ver `apps/jogo/src/lib/tempo-real.ts` (Task 8), o lado que manda.
 */
function tokenDoSubprotocolo(cabecalho: string | string[] | undefined): string | null {
  const valor = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  if (!valor || !valor.startsWith("bearer.")) return null;
  return valor.slice("bearer.".length) || null;
}

/**
 * As salas de combate em tempo real, em memória — como `Batalhas` e
 * `Cambio`. Um reinício do servidor derruba toda sala em andamento; para
 * o tamanho deste jogo hoje, aceitável, e o pior caso é a sala contar
 * como derrota quando o cliente tentar reconectar e não achar nada.
 *
 * Guarda no máximo UMA sala por personagem — sem isto, duas conexões
 * simultâneas (duas abas, um reconnect que se sobrepõe ao antigo) abririam
 * duas salas para o mesmo personagem, cada uma com seu próprio laço de
 * tick, e a segunda a concluir apagaria o resultado da primeira.
 */
export class SalasTempoReal {
  private contador = 0;
  private readonly porPersonagem = new Map<string, string>();

  private novoId(): string {
    this.contador += 1;
    return `tr${this.contador}`;
  }

  /** `null` se já existe uma sala aberta para este personagem. */
  abrir(personagemId: string): string | null {
    if (this.porPersonagem.has(personagemId)) return null;
    const id = this.novoId();
    this.porPersonagem.set(personagemId, id);
    return id;
  }

  fechar(personagemId: string): void {
    this.porPersonagem.delete(personagemId);
  }
}

interface Mensagem {
  tipo: "mover-raia" | "mover-distancia" | "esquivar" | "atacar";
  direcao?: -1 | 1;
}

function aplicarIntencao(sala: Sala, msg: Mensagem): Sala {
  switch (msg.tipo) {
    case "mover-raia":
      return moverRaia(sala, msg.direcao === -1 ? -1 : 1);
    case "mover-distancia":
      return moverDistancia(sala, msg.direcao === -1 ? -1 : 1);
    case "esquivar":
      return iniciarEsquiva(sala);
    case "atacar":
      return atacar(sala);
    default:
      return sala;
  }
}

export function registrarRotasDeTempoReal(
  app: FastifyInstance,
  deps: {
    armazenamento: Armazenamento;
    agora: () => number;
    sessoes: Sessoes;
    salas: SalasTempoReal;
    filas: Filas;
  },
): void {
  const { armazenamento, agora, sessoes, salas, filas } = deps;

  app.get("/combate-tempo-real/:id", { websocket: true }, async (socket, req) => {
    const token = tokenDoSubprotocolo(req.headers["sec-websocket-protocol"]);
    const contaId = sessoes.dono(token, agora());
    if (!contaId) {
      socket.close(4001, "sem sessão válida");
      return;
    }

    const { id: personagemId } = req.params as { id: string };

    /*
     * O socket pode fechar enquanto ainda buscamos conta/personagem (os
     * dois `await`s abaixo) — sem este sinal cedo, um cliente que
     * desconecta nessa janela nunca dispararia `concluir()`, e o tick
     * criado mais adiante rodaria pra sempre contra um socket morto.
     */
    let fechouAntesDeComecar = false;
    socket.once("close", () => {
      fechouAntesDeComecar = true;
    });

    const conta = await armazenamento.contas.buscar(contaId);
    if (!conta || !conta.personagens.includes(personagemId)) {
      socket.close(4004, "personagem não encontrado");
      return;
    }
    const guardado = await armazenamento.personagens.buscar(personagemId);
    if (!guardado || guardado.estado === "tumulo") {
      socket.close(4004, "personagem indisponível");
      return;
    }
    if (fechouAntesDeComecar) return;

    const idDaSala = salas.abrir(personagemId);
    if (!idDaSala) {
      socket.close(4009, "já existe uma sala de combate em tempo real para este personagem");
      return;
    }

    let sala = iniciarSala({
      classeDoJogador: guardado.classe,
      nivelDoJogador: guardado.nivel,
      vidaDoJogador: guardado.vida,
      vidaMaximaDoJogador: guardado.vida, // Fase 1: entra com a vida atual como teto da sala
      semente: agora() + idDaSala.length,
    });

    let ultimaIntencaoEm = agora();
    let intencaoPendente: Mensagem | null = null;
    let recebeuIntencao = false;
    let encerrada = false;

    async function concluir(): Promise<void> {
      if (encerrada) return;
      encerrada = true;
      clearInterval(tick);
      salas.fechar(personagemId);

      /*
       * Sob a mesma trava que toda outra escrita de personagem — a
       * conclusão da batalha por turnos incluída, o análogo direto disto.
       * Sem ela, a sala terminando ao mesmo tempo que uma rota HTTP
       * (comprar item, evoluir árvore) lê o mesmo personagem, os dois
       * decidem em cima do estado velho, e o segundo grava por cima do
       * primeiro — o mesmo "lost update" que `Filas` já existe para evitar
       * (ver o comentário em `filas.ts`).
       */
      await filas.executar(chaveDoPersonagem(personagemId), async () => {
        const atual = await armazenamento.personagens.buscar(personagemId);
        if (!atual) return;

        if (sala.fase === "derrota") {
          await armazenamento.personagens.salvar(perderBatalha(atual));
        } else if (sala.fase === "vitoria") {
          const premio = premioDe(atual.nivel, atual.dificuldade);
          await armazenamento.personagens.salvar({
            ...atual,
            sucata: atual.sucata + premio.sucata,
          });
        }
      });
      // Fecha mesmo se o personagem sumiu no meio (`atual` nulo): o socket
      // não pode ficar aberto para sempre só porque não houve o que gravar.
      socket.close(1000, sala.fase);
    }

    const tick = setInterval(() => {
      if (encerrada) return;

      /*
       * Um `throw` daqui dentro — de `avancarTick`, de `JSON.stringify`,
       * do próprio `socket.send` — é uma exceção não pega num callback de
       * timer, e isso derruba o PROCESSO inteiro no Node, não só esta
       * sala: toda outra sala e a API HTTP caem juntas por causa de uma
       * combinação de estado que só esta sala pisou. Na dúvida, encerra só
       * esta sala como derrota — o mesmo tratamento da desconexão.
       */
      try {
        if (agora() - ultimaIntencaoEm > TIMEOUT_DE_DESCONEXAO_MS) {
          sala = { ...sala, fase: "derrota" };
        } else {
          /*
           * No máximo UMA intenção por tick — é o que a spec chama de
           * "uma ação por tick" (seção 4). Sem este buffer, um cliente
           * podia mandar uma rajada de mensagens no mesmo instante e
           * resolver a sala inteira em milissegundos: o servidor era
           * autoritativo sobre o ESTADO, mas o CLIENTE ainda controlava
           * o relógio. Mensagens em excesso no mesmo tick simplesmente
           * substituem a pendente — a mais recente vence, como um jogo de
           * ação de verdade.
           */
          if (intencaoPendente) {
            sala = aplicarIntencao(sala, intencaoPendente);
            intencaoPendente = null;
          }
          sala = avancarTick(sala);
        }

        socket.send(JSON.stringify({ tipo: "estado", sala }));
        if (sala.fase !== "em-andamento") void concluir();
      } catch {
        sala = { ...sala, fase: "derrota" };
        void concluir();
      }
    }, 1000 / TICKS_POR_SEGUNDO);
    tick.unref();

    socket.on("message", (dados: Buffer) => {
      if (encerrada) return;
      ultimaIntencaoEm = agora();
      try {
        intencaoPendente = JSON.parse(dados.toString()) as Mensagem;
        recebeuIntencao = true;
      } catch {
        // Mensagem malformada: ignora, a sala segue como estava.
      }
    });

    socket.on("close", () => {
      /*
       * Desconectar com a sala ainda em andamento conta como derrota —
       * MAS só se o jogador já mandou alguma intenção. Sem essa condição,
       * um remount imediato (o StrictMode do React em dev remontando o
       * componente, ou um clique acidental seguido de "voltar"
       * instantâneo) queimaria uma vida sem a pessoa ter feito uma única
       * jogada — a sala nunca chegou a acontecer de verdade.
       *
       * O timeout de silêncio (no laço do tick, acima) continua valendo
       * mesmo sem nenhuma intenção — ficar quieto por 15s depois de
       * entrar é diferente de desconectar na hora, sem ter feito nada.
       */
      if (!encerrada && recebeuIntencao && sala.fase === "em-andamento") {
        sala = { ...sala, fase: "derrota" };
      }
      void concluir();
    });
  });
}
