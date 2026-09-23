"use client";

import { useEffect, useRef, useState } from "react";
import { conectarSalaTempoReal } from "@/lib/tempo-real.ts";

/**
 * Tudo que a tela sabe sobre a sala vem do servidor, a cada tick — o
 * mesmo convênio "cliente manda intenção, nunca estado" que rege o resto
 * do jogo, só que aqui o "estado" chega em ~10 mensagens por segundo em
 * vez de uma por pedido HTTP.
 */
interface EstadoDaSala {
  jogador: { vida: number; vidaMaxima: number; raia: string; distancia: string; esquivandoPor: number; recargaDeEsquivaPor: number };
  inimigo: { vida: number; vidaMaxima: number; raia: string; distancia: string; tipo: "comum" | "chefe"; telegrafandoPor: number | null };
  onda: number;
  fase: "em-andamento" | "vitoria" | "derrota";
}

export function CombateTempoReal({
  personagemId,
  aoFechar,
}: {
  personagemId: string;
  aoFechar: () => void;
}) {
  const [sala, setSala] = useState<EstadoDaSala | null>(null);
  const [terminou, setTerminou] = useState<"vitoria" | "derrota" | null>(null);
  const conexao = useRef<ReturnType<typeof conectarSalaTempoReal> | null>(null);

  useEffect(() => {
    const c = conectarSalaTempoReal(
      personagemId,
      (mensagem) => {
        if (mensagem.tipo === "estado" && mensagem.sala) {
          const s = mensagem.sala as EstadoDaSala;
          setSala(s);
          if (s.fase !== "em-andamento") setTerminou(s.fase);
        }
      },
      () => {
        // A conexão fechou — se a sala já tinha terminado, `terminou` já
        // está setado e a tela de resultado aparece. Se fechou sem
        // terminar (rede caiu antes do primeiro estado), não há o que
        // desenhar além de voltar.
      },
    );
    conexao.current = c;
    return () => c.fechar();
  }, [personagemId]);

  if (terminou) {
    return (
      <section className="surge flex flex-col gap-4 p-6">
        <p className="titulo text-3xl">
          {terminou === "vitoria" ? "Você venceu." : "Você caiu."}
        </p>
        <button type="button" onClick={aoFechar} className="botao botao-grande self-start">
          Voltar
        </button>
      </section>
    );
  }

  if (!sala) {
    return <p className="rotulo">entrando na sala…</p>;
  }

  return (
    <section className="surge flex flex-col gap-6">
      <header className="painel flex items-center justify-between p-5">
        <p className="rotulo">
          Onda {sala.onda} {sala.inimigo.tipo === "chefe" ? "— chefe" : ""}
        </p>
        <button type="button" onClick={aoFechar} className="botao">
          Sair
        </button>
      </header>

      <div className="painel p-5">
        <p className="rotulo">Você</p>
        <p>{sala.jogador.vida} / {sala.jogador.vidaMaxima} vida</p>
        <p className="text-[0.8rem] text-tinta-fraca">
          raia {sala.jogador.raia} · distância {sala.jogador.distancia}
        </p>
      </div>

      <div className="painel p-5">
        <p className="rotulo">{sala.inimigo.tipo === "chefe" ? "Chefe" : "Inimigo"}</p>
        <p>{sala.inimigo.vida} / {sala.inimigo.vidaMaxima} vida</p>
        <p className="text-[0.8rem] text-tinta-fraca">
          raia {sala.inimigo.raia} · distância {sala.inimigo.distancia}
          {sala.inimigo.telegrafandoPor !== null && " · PREPARANDO GOLPE"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-raia", direcao: -1 })}>
          ◄ Raia
        </button>
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-raia", direcao: 1 })}>
          Raia ►
        </button>
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-distancia", direcao: 1 })}>
          Aproximar
        </button>
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-distancia", direcao: -1 })}>
          Afastar
        </button>
        <button type="button" className="botao botao-grande" onClick={() => conexao.current?.mandar({ tipo: "atacar" })}>
          Atacar
        </button>
        <button
          type="button"
          className="botao botao-grande"
          disabled={sala.jogador.recargaDeEsquivaPor > 0}
          onClick={() => conexao.current?.mandar({ tipo: "esquivar" })}
        >
          Esquivar
        </button>
      </div>
    </section>
  );
}
