"use client";

import { useState } from "react";
import { api, ErroDaApi, type Personagem } from "@/lib/api";
import { PALETAS } from "@/lib/vitral";
import { Vitral } from "./Vitral";

/**
 * A ficha: quem você é agora, e as decisões disponíveis.
 *
 * Cada decisão aparece só quando existe. A escolha de subclasse não fica
 * apagada esperando o nível 10 — ela simplesmente não está lá, e quando
 * aparece, é acontecimento.
 */
export function Ficha({
  p,
  aoAtualizar,
  aoLutar,
  aoAbrirArvore,
  ocupado,
}: {
  p: Personagem;
  aoAtualizar: (p: Personagem) => void;
  aoLutar: (tipo: "comum" | "julgamento") => void;
  aoAbrirArvore: () => void;
  ocupado: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const paleta = PALETAS[p.classe.ramo];

  async function tentar(acao: () => Promise<Personagem>) {
    setErro(null);
    try {
      aoAtualizar(await acao());
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu certo");
    }
  }

  const noTumulo = p.estado === "tumulo";
  const fracaoXp = Math.min(1, p.xp / p.xpDoNivel);
  const rumoAParede = Math.min(1, p.nivel / p.parede);

  return (
    <section className="flex flex-col gap-10">
      <header className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <Vitral classe={p.classe.indice} largura={124} aceso={!noTumulo} />

        <div className="flex-1 text-center sm:text-left">
          <p className="rotulo">
            {noTumulo ? "no túmulo" : `camada ${p.camada}`}
          </p>
          <h1 className="titulo mt-2 text-4xl leading-tight sm:text-5xl">{p.nome}</h1>
          <p className="mt-1 text-[1.05rem]" style={{ color: paleta.brilho }}>
            {p.classe.nome} · nível {p.nivel}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-[0.85rem] sm:grid-cols-4">
            <div>
              <dt className="rotulo">Vida</dt>
              <dd className="mt-1">
                {p.vida} / {p.vidaMaxima}
              </dd>
            </div>
            <div>
              <dt className="rotulo">Sucata</dt>
              <dd className="mt-1">{p.sucata}</dd>
            </div>
            <div>
              <dt className="rotulo">Premium</dt>
              <dd className="mt-1">{p.premium}</dd>
            </div>
            <div>
              <dt className="rotulo">Mortes</dt>
              <dd className="mt-1">{p.mortes}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="rotulo">Experiência</span>
            <span className="rotulo">
              {p.xp} / {p.xpDoNivel}
            </span>
          </div>
          <div className="barra">
            <div style={{ width: `${fracaoXp * 100}%`, background: paleta.brilho }} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="rotulo">Rumo à parede</span>
            {/* A parede não é teto por regra: é onde o inimigo alcança você. */}
            <span className="rotulo">
              nível {p.nivel} de {p.parede}
            </span>
          </div>
          <div className="barra">
            <div
              style={{ width: `${rumoAParede * 100}%`, background: "var(--color-ouro)" }}
            />
          </div>
        </div>
      </div>

      {p.ausencia && (
        <p className="painel surge p-5 text-[0.88rem] leading-relaxed text-tinta-fraca">
          Enquanto você esteve fora por {p.ausencia.horas}h, seu personagem
          travou {p.ausencia.batalhas} batalhas e venceu {p.ausencia.vitorias} —
          ganhando {p.ausencia.xp} de experiência e {p.ausencia.sucata} de
          sucata.
        </p>
      )}

      {erro && <p className="text-[0.88rem] text-sangue">{erro}</p>}

      {noTumulo ? (
        <div className="painel flex flex-col gap-4 p-6">
          <p className="titulo text-2xl">Você caiu num julgamento.</p>
          <p className="text-[0.9rem] leading-relaxed text-tinta-fraca">
            O túmulo guarda tudo — nível, camada, classe e moedas voltam
            intactos. A saída custa {p.custoDoRevive} de moeda premium, e não há
            caminho por sucata.
          </p>
          <button
            type="button"
            onClick={() => tentar(() => api.reviver(p.id))}
            disabled={p.premium < p.custoDoRevive}
            className="botao self-start"
          >
            {p.premium < p.custoDoRevive
              ? `faltam ${p.custoDoRevive - p.premium} de premium`
              : `Reviver por ${p.custoDoRevive}`}
          </button>
        </div>
      ) : (
        <>
          {p.subclasses.length > 0 && (
            <div className="painel surge flex flex-col gap-4 p-6">
              <p className="titulo text-2xl">Seu caminho se divide.</p>
              <p className="text-[0.88rem] text-tinta-fraca">
                A escolha vale para esta vida inteira.
              </p>
              <ul className="flex flex-wrap gap-4">
                {p.subclasses.map((s) => (
                  <li key={s.indice}>
                    <button
                      type="button"
                      onClick={() =>
                        tentar(() => api.escolherSubclasse(p.id, s.indice))
                      }
                      className="painel flex flex-col items-center gap-3 p-4 hover:border-ouro"
                    >
                      <Vitral classe={s.indice} largura={76} aceso />
                      <span className="titulo text-lg">{s.nome}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.podeRenascer && (
            <div className="painel surge flex flex-col gap-4 p-6">
              <p className="titulo text-2xl">Você chegou à parede.</p>
              <p className="text-[0.88rem] leading-relaxed text-tinta-fraca">
                Daqui o inimigo é mais forte que você, e nenhum nível resolve.
                Renascer zera o nível e a classe, mantém as moedas, e leva a
                parede seguinte {Math.round((p.parede * 1.265) / p.parede * 26.5)}%
                mais longe.
              </p>
              <ul className="flex flex-wrap gap-3">
                {[1, 2, 3, 4, 5].map((raiz) => (
                  <li key={raiz}>
                    <button
                      type="button"
                      onClick={() => tentar(() => api.renascer(p.id, raiz))}
                      className="botao"
                    >
                      Renascer como {PALETAS[raiz as 1].nome}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={aoAbrirArvore} className="botao">
              Árvore
              {/* O número no botão, e não só dentro da tela: ponto parado é a
                  coisa mais fácil de esquecer que se tem. */}
              {p.arvore.pontos > 0 && (
                <span className="ml-2 font-bold text-ouro">
                  {p.arvore.pontos}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => aoLutar("comum")}
              disabled={ocupado}
              className="botao"
            >
              Enfrentar uma sombra
            </button>

            {/* Dois cliques: é a luta em que se morre, e um clique acidental
                não pode custar o personagem. */}
            <button
              type="button"
              onClick={() => {
                if (confirmando) {
                  setConfirmando(false);
                  aoLutar("julgamento");
                } else {
                  setConfirmando(true);
                  setTimeout(() => setConfirmando(false), 4000);
                }
              }}
              disabled={ocupado}
              className="botao botao-perigo"
            >
              {confirmando
                ? "Clique de novo — perder é permanente"
                : "Encarar um julgamento"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
