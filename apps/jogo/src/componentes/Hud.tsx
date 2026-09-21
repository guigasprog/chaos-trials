"use client";

import { type Personagem } from "@/lib/api";
import { n } from "@/lib/numero";
import { PALETAS } from "@/lib/vitral";
import { Vitral } from "./Vitral";

/**
 * A barra do herói, presente em todas as telas.
 *
 * Antes, quem estava no combate ou na árvore não via mais nome, nível nem
 * moeda: cada tela redesenhava o seu pedaço e a sensação era de três páginas
 * separadas. Jogo tem HUD — a mesma faixa acompanhando o jogador é o que faz
 * as telas serem lugares dentro de uma coisa só.
 *
 * Fica grudada no topo porque o valor que interessa durante a luta é o que
 * você tem para gastar depois dela, e rolar para conferir quebra o ritmo.
 *
 * A vida NÃO está aqui de propósito: no combate ela já está no retrato, e
 * duas barras de vida na mesma tela com números que se atualizam em momentos
 * diferentes é a receita para a pessoa acreditar na errada.
 */
export function Hud({
  p,
  aoAbrirArvore,
  travado,
}: {
  p: Personagem;
  aoAbrirArvore: () => void;
  /** Em combate a árvore não abre: gastar ponto no meio da luta é trapaça. */
  travado: boolean;
}) {
  const paleta = PALETAS[p.classe.ramo];
  const noTumulo = p.estado === "tumulo";

  return (
    <header className="hud">
      <Vitral classe={p.classe.indice} largura={34} aceso={!noTumulo} />

      <div className="min-w-0 flex-1">
        <p className="hud-nome">{p.nome}</p>
        <p className="hud-classe" style={{ color: paleta.brilho }}>
          {noTumulo ? "no túmulo" : p.classe.nome}
        </p>
      </div>

      <span className="hud-nivel">
        <span>{p.nivel}</span>
        <small>nv</small>
      </span>

      <span className="hud-moeda" title="Sucata — ganha jogando">
        <strong>{n(p.sucata)}</strong>
        <span className="rotulo">suc</span>
      </span>

      <span className="hud-moeda hud-moeda-ouro" title="Moeda premium">
        <strong>{n(p.premium)}</strong>
        <span className="rotulo">prm</span>
      </span>

      {/* O ponto parado é a coisa mais fácil de esquecer que se tem, e aqui
          ele aparece mesmo quando a pessoa está em outra tela. */}
      <button
        type="button"
        onClick={aoAbrirArvore}
        disabled={travado}
        className={`hud-arvore ${p.arvore.pontos > 0 ? "hud-arvore-cheia" : ""}`}
        title={
          travado
            ? "a árvore não abre no meio de uma luta"
            : "Árvore de habilidade"
        }
      >
        Árvore
        {p.arvore.pontos > 0 && (
          <span className="hud-pontos">{p.arvore.pontos}</span>
        )}
      </button>
    </header>
  );
}
