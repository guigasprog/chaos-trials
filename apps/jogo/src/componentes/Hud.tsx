"use client";

import { useState } from "react";
import { type Conta, type Personagem } from "@/lib/api";
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
  conta,
  aoAbrirArvore,
  aoAbrirItens,
  aoAbrirMercado,
  aoAbrirArena,
  aoTrocar,
  aoSair,
  travado,
}: {
  p: Personagem;
  conta: Conta;
  aoAbrirArvore: () => void;
  aoAbrirItens: () => void;
  aoAbrirMercado: () => void;
  aoAbrirArena: () => void;
  aoTrocar: () => void;
  aoSair: () => void;
  /** Em combate a árvore não abre: gastar ponto no meio da luta é trapaça. */
  travado: boolean;
}) {
  const paleta = PALETAS[p.classe.ramo];
  const noTumulo = p.estado === "tumulo";
  /** Antes a única saída da conta, de dentro do jogo, era descobrir que o
      retrato troca de personagem e DEPOIS achar "Sair" na prateleira — dois
      passos escondidos atrás de um ícone sem rótulo. Um menu de verdade,
      com as duas ações escritas. */
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <header className="hud">
      <div className="hud-menu">
        <button
          type="button"
          onClick={() => setMenuAberto((a) => !a)}
          disabled={travado}
          title={travado ? "termine a luta primeiro" : "Menu"}
          aria-label="Menu"
          aria-expanded={menuAberto}
          className="hud-retrato"
        >
          <Vitral classe={p.classe.indice} largura={34} aceso={!noTumulo} />
        </button>

        {menuAberto && (
          <div className="hud-menu-painel painel">
            <button
              type="button"
              onClick={() => {
                setMenuAberto(false);
                aoTrocar();
              }}
              className="hud-menu-item"
            >
              Trocar de personagem
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuAberto(false);
                aoSair();
              }}
              className="hud-menu-item"
            >
              Sair da conta
            </button>
          </div>
        )}
      </div>

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

      {!noTumulo && (
        <span
          className="hud-moeda"
          title={`${p.vidasRestantes} vida${p.vidasRestantes === 1 ? "" : "s"} de reserva${
            p.vidasGuardadas > 0
              ? ` · ${p.vidasGuardadas} guardada${p.vidasGuardadas === 1 ? "" : "s"}`
              : ""
          } — dificuldade ${p.dificuldade}`}
        >
          <strong>{"♥".repeat(Math.max(1, p.vidasRestantes))}</strong>
          {p.vidasGuardadas > 0 && (
            <span className="rotulo" style={{ color: "var(--color-ouro)" }}>
              +{p.vidasGuardadas}
            </span>
          )}
        </span>
      )}

      <span className="hud-moeda" title="Sucata — ganha jogando">
        <strong>{n(p.sucata)}</strong>
        <span className="rotulo">suc</span>
      </span>

      {/* Da CONTA, e não do personagem: moeda comprada não morre junto. */}
      <span className="hud-moeda hud-moeda-ouro" title="Moeda premium da conta">
        <strong>{n(conta.premium)}</strong>
        <span className="rotulo">prm</span>
      </span>

      {/*
       * As quatro ações num grupo à parte, de propósito.
       *
       * Com árvore, mochila, mercado e arena, a barra parou de caber numa
       * linha só de telefone — um playtest de ponta a ponta pegou a tela
       * inteira ganhando rolagem lateral, coisa que nenhum teste de API
       * detectaria. `.hud-acoes` quebra para a própria linha no telefone
       * (`flex-wrap` no pai) e, se mesmo assim faltar espaço num aparelho
       * bem estreito, rola por dentro de si mesma — nunca a página inteira.
       */}
      <nav className="hud-acoes">
        {/* O ponto parado é a coisa mais fácil de esquecer que se tem, e
            aqui ele aparece mesmo quando a pessoa está em outra tela. */}
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

        <button
          type="button"
          onClick={aoAbrirItens}
          disabled={travado}
          className="hud-arvore"
          title={
            travado ? "a mochila não abre no meio de uma luta" : "Equipamento"
          }
        >
          Mochila
          {/* O número só aparece quando a mochila está cheia: aí ele é um
              aviso, e não decoração — o que cair vira sucata sozinho. */}
          {p.mochila.length >= p.mochilaMaxima && (
            <span className="hud-pontos hud-pontos-cheio">cheia</span>
          )}
        </button>

        <button
          type="button"
          onClick={aoAbrirMercado}
          disabled={travado}
          className="hud-arvore"
          title={travado ? "o mercado não abre no meio de uma luta" : "Mercado"}
        >
          Mercado
        </button>

        <button
          type="button"
          onClick={aoAbrirArena}
          disabled={travado}
          className="hud-arvore"
          title={travado ? "a arena não abre no meio de uma luta" : "Arena"}
        >
          Arena
        </button>
      </nav>
    </header>
  );
}
