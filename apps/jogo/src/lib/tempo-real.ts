import { BASE, tokenGuardado } from "./api.ts";

/**
 * O cliente WebSocket do combate em tempo real.
 *
 * Fino de propósito: manda intenção, recebe estado, nada de lógica de
 * jogo aqui — isso mora no componente que desenha a tela, e a fonte de
 * verdade é sempre o que o servidor manda de volta.
 */

const BASE_WS = BASE.replace(/^http/, "ws");

/**
 * O token vai como subprotocolo do WebSocket (`bearer.<token>`), não como
 * cabeçalho — o `WebSocket` nativo do navegador não aceita cabeçalhos
 * customizados no handshake, só subprotocolos. O servidor
 * (`apps/servidor/src/tempo-real.ts`, Task 6) já lê o token desse mesmo
 * jeito.
 */
export function conectarSalaTempoReal(
  personagemId: string,
  aoReceberEstado: (mensagem: { tipo: string; sala?: unknown }) => void,
  aoFechar: (codigo: number) => void,
): { mandar: (msg: object) => void; fechar: () => void } {
  const token = tokenGuardado() ?? "";
  const socket = new WebSocket(
    `${BASE_WS}/combate-tempo-real/${personagemId}`,
    [`bearer.${token}`],
  );

  socket.onmessage = (evento) => {
    aoReceberEstado(JSON.parse(evento.data as string));
  };
  socket.onclose = (evento) => aoFechar(evento.code);

  return {
    mandar: (msg) => socket.send(JSON.stringify(msg)),
    fechar: () => socket.close(),
  };
}
