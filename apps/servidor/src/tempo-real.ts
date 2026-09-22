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
 */
export class SalasTempoReal {
  private contador = 0;

  novoId(): string {
    this.contador += 1;
    return `tr${this.contador}`;
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
  },
): void {
  const { armazenamento, agora, sessoes, salas } = deps;

  app.get("/combate-tempo-real/:id", { websocket: true }, async (socket, req) => {
    const token = tokenDoSubprotocolo(req.headers["sec-websocket-protocol"]);
    const contaId = sessoes.dono(token, agora());
    if (!contaId) {
      socket.close(4001, "sem sessão válida");
      return;
    }

    const { id: personagemId } = req.params as { id: string };
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

    const idDaSala = salas.novoId();
    let sala = iniciarSala({
      classeDoJogador: guardado.classe,
      nivelDoJogador: guardado.nivel,
      vidaDoJogador: guardado.vida,
      vidaMaximaDoJogador: guardado.vida, // Fase 1: entra com a vida atual como teto da sala
      semente: agora() + idDaSala.length,
    });

    let ultimaIntencaoEm = agora();
    let encerrada = false;

    async function concluir(): Promise<void> {
      if (encerrada) return;
      encerrada = true;
      clearInterval(tick);

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
      socket.close(1000, sala.fase);
    }

    const tick = setInterval(() => {
      if (encerrada) return;

      if (agora() - ultimaIntencaoEm > TIMEOUT_DE_DESCONEXAO_MS) {
        sala = { ...sala, fase: "derrota" };
      } else {
        sala = avancarTick(sala);
      }

      socket.send(JSON.stringify({ tipo: "estado", sala }));
      if (sala.fase !== "em-andamento") void concluir();
    }, 1000 / TICKS_POR_SEGUNDO);

    socket.on("message", (dados: Buffer) => {
      if (encerrada) return;
      ultimaIntencaoEm = agora();
      try {
        const msg = JSON.parse(dados.toString()) as Mensagem;
        sala = aplicarIntencao(sala, msg);
      } catch {
        // Mensagem malformada: ignora este tick, a sala segue como estava.
      }
    });

    socket.on("close", () => {
      /*
       * Desconectar com a sala ainda em andamento conta como derrota, na
       * hora — e não só depois de `TIMEOUT_DE_DESCONEXAO_MS`.
       *
       * O `close` já para o tick (via `concluir` → `clearInterval`), então
       * o timeout do intervalo nunca chegaria a rodar para pegar este caso.
       * Sem isto, fechar a aba no meio de uma luta perdida seria um jeito
       * de nunca pagar o risco — exatamente o que o timeout existe para
       * evitar, e ele não evita se o socket já fechou antes de o intervalo
       * rodar de novo.
       */
      if (!encerrada && sala.fase === "em-andamento") {
        sala = { ...sala, fase: "derrota" };
      }
      void concluir();
    });
  });
}
