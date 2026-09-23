"use client";

import { useState } from "react";
import { api, type Conta, ErroDaApi, type Personagem } from "@/lib/api";
import { n } from "@/lib/numero";
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
  conta,
  aoAtualizar,
  aoAtualizarConta,
  aoLutar,
  aoAbrirTempoReal,
  aoVoltarAPrateleira,
  ocupado,
}: {
  p: Personagem;
  conta: Conta;
  aoAtualizar: (p: Personagem) => void;
  /** O revive cobra da conta; a barra do herói precisa saber. */
  aoAtualizarConta: () => void;
  aoLutar: () => void;
  aoAbrirTempoReal: () => void;
  /** A saída do túmulo pra quem não vai (ou não pode) reviver agora — sem
      isso a única saída era descobrir sozinho que o retrato no HUD troca
      de personagem. */
  aoVoltarAPrateleira: () => void;
  ocupado: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const paleta = PALETAS[p.classe.ramo];

  async function tentar(acao: () => Promise<Personagem>) {
    setErro(null);
    try {
      aoAtualizar(await acao());
      aoAtualizarConta();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu certo");
    }
  }

  const noTumulo = p.estado === "tumulo";
  const fracaoXp = Math.min(1, p.xp / p.xpDoNivel);
  const rumoAParede = Math.min(1, p.nivel / p.parede);
  // Abaixo de um terço a vida vira aviso: é a diferença entre lutar sabendo
  // do risco e lutar sem perceber que está machucado.
  const ferido = p.vida / p.vidaMaxima < 0.35;

  return (
    <section className="flex flex-col gap-10">
      <header className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <Vitral classe={p.classe.indice} largura={124} aceso={!noTumulo} />

        <div className="flex-1 text-center sm:text-left">
          <p className="rotulo">
            {/* "camada 0" não quer dizer nada para quem acabou de começar; a
                camada só vira número depois que existiu um renascimento. */}
            {noTumulo
              ? "no túmulo"
              : p.camada === 0
                ? "primeira vida"
                : `camada ${p.camada}`}
          </p>

          {/* O nível vira selo em vez de continuar a frase da classe: é o
              número que o jogador repete em voz alta, e num jogo ele tem
              forma de medalha, não de texto corrido. */}
          <div className="mt-2 flex items-center justify-center gap-4 sm:justify-start">
            <span className="selo-nivel">
              <span>{p.nivel}</span>
              <small>nível</small>
            </span>
            <div className="min-w-0">
              <h1 className="titulo text-4xl leading-tight sm:text-5xl">
                {p.nome}
              </h1>
              <p className="mt-1 text-[1.05rem]" style={{ color: paleta.brilho }}>
                {p.classe.nome}
              </p>
            </div>
          </div>

          {/* Valor grande, rótulo miúdo — o inverso da lista de definição que
              estava aqui. De relance se lê o número; a palavra só desempata.

              As moedas saíram daqui: elas vivem na barra do herói, visível em
              todas as telas. Repetir o mesmo número em dois lugares da mesma
              tela só cria a dúvida sobre qual dos dois está certo. */}
          <ul className="mt-5 flex flex-wrap justify-center gap-2.5 sm:justify-start">
            <li className={`recurso ${ferido ? "recurso-perigo" : ""}`}>
              <span className="recurso-valor">{n(p.vida)}</span>
              <span className="rotulo">/ {n(p.vidaMaxima)} vida</span>
            </li>
            <li className="recurso">
              <span className="recurso-valor">{n(p.mortes)}</span>
              <span className="rotulo">
                {p.mortes === 1 ? "morte" : "mortes"}
              </span>
            </li>
          </ul>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="rotulo">Experiência</span>
            <span className="rotulo tabular-nums">
              {n(p.xp)} / {n(p.xpDoNivel)}
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
          {/* Fina de propósito: a parede é o arco da vida inteira, e com o
              mesmo corpo da barra de XP as duas competiriam pela atenção
              a cada batalha — que é quando só uma delas se move. */}
          <div className="barra barra-fina">
            <div
              style={{ width: `${rumoAParede * 100}%`, background: "var(--color-ouro)" }}
            />
          </div>
        </div>
      </div>

      {p.ausencia && (
        <p className="painel surge p-5 text-[0.88rem] leading-relaxed text-tinta-fraca">
          Enquanto você esteve fora por {p.ausencia.horas}h
          {p.ausencia.batalhas > 0 ? (
            <>
              , seu personagem travou {n(p.ausencia.batalhas)} batalhas e venceu{" "}
              {n(p.ausencia.vitorias)} — ganhando {n(p.ausencia.xp)} de
              experiência e {n(p.ausencia.sucata)} de sucata
            </>
          ) : (
            <>, seu personagem estava ferido demais para lutar</>
          )}
          {/* O descanso precisa ser dito: sem isto, "deixei AFK para curar"
              entrega a cura e nenhuma notícia dela. */}
          {p.ausencia.vidaRecuperada > 0 && (
            <>
              . Depois descansou {p.ausencia.horasDescansando}h e recuperou{" "}
              <strong className="text-verdete">
                {n(p.ausencia.vidaRecuperada)} de vida
              </strong>
            </>
          )}
          .
        </p>
      )}

      {erro && <p className="text-[0.88rem] text-sangue">{erro}</p>}

      {noTumulo ? (
        <div className="painel flex flex-col gap-4 p-6">
          <p className="titulo text-2xl">A última vida acabou.</p>
          <p className="text-[0.9rem] leading-relaxed text-tinta-fraca">
            O túmulo guarda tudo — nível, camada, classe e sucata voltam
            intactos. A saída custa {n(p.custoDoRevive)} de moeda premium da
            conta, e não há caminho por sucata.
          </p>
          <button
            type="button"
            onClick={() => tentar(() => api.reviver(p.id))}
            disabled={conta.premium < p.custoDoRevive}
            className="botao botao-grande self-start"
          >
            {conta.premium < p.custoDoRevive
              ? `faltam ${n(p.custoDoRevive - conta.premium)} de premium`
              : `Reviver por ${n(p.custoDoRevive)}`}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={aoVoltarAPrateleira}
              className="botao"
            >
              Voltar à prateleira
            </button>
            <p className="text-[0.8rem] text-tinta-fraca">
              Lá dá para apagar este personagem e começar outro — a vaga
              volta, as camadas não.
            </p>
          </div>
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
                parede seguinte para o nível {n(Math.round(p.parede * 1.2649))} —
                cerca de 26% mais longe.
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

          <p className="text-[0.82rem] leading-relaxed text-tinta-fraca">
            O desafio em tempo real é <strong className="text-tinta">três ondas e
            um chefe</strong>, tudo na mesma luta — a vida não se recupera entre
            ondas. Perder aqui{" "}
            <strong className="text-tinta">custa uma vida como qualquer luta</strong>,
            mas o prêmio por vencer o chefe também é maior.
          </p>

          <div className="flex flex-wrap gap-4">
            {/*
              * A poção fica JUNTO dos verbos de luta, e não numa tela de
              * itens: a decisão "bebo ou arrisco" acontece no instante de
              * apertar "enfrentar", e separá-las obrigaria a ir e voltar.
              */}
            {p.vida < p.vidaMaxima && (
              <button
                type="button"
                disabled={!p.pocao.podeBeber || ocupado}
                onClick={() => tentar(() => api.beberPocao(p.id))}
                className="botao botao-grande"
                title={p.pocao.impedimento ?? `Cura ${n(p.pocao.cura)} de vida`}
              >
                Poção · {n(p.pocao.preco)} suc
              </button>
            )}

            {/* Só um verbo de luta agora: toda batalha carrega risco, e
                quantas vidas amortecem isso é da dificuldade, não da
                escolha por luta. Na última vida, sem reserva, dois
                cliques — é a luta em que se morre de verdade, e um
                clique acidental não pode custar o personagem. */}
            {(() => {
              const naUltimaVida = p.vidasRestantes <= 1 && p.vidasGuardadas === 0;
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (!naUltimaVida) {
                      aoLutar();
                      return;
                    }
                    if (confirmando) {
                      setConfirmando(false);
                      aoLutar();
                    } else {
                      setConfirmando(true);
                      setTimeout(() => setConfirmando(false), 4000);
                    }
                  }}
                  disabled={ocupado}
                  className={`botao botao-grande ${naUltimaVida ? "botao-perigo" : ""}`}
                  title={
                    naUltimaVida
                      ? "sem vida de reserva — perder aqui é permanente"
                      : `${p.vidasRestantes} vida${p.vidasRestantes === 1 ? "" : "s"} de reserva`
                  }
                >
                  {naUltimaVida && confirmando
                    ? "Clique de novo — perder é permanente"
                    : naUltimaVida
                      ? "Lutar — última vida"
                      : `Lutar (${p.vidasRestantes} vida${p.vidasRestantes === 1 ? "" : "s"})`}
                </button>
              );
            })()}

            <button
              type="button"
              onClick={aoAbrirTempoReal}
              disabled={ocupado}
              className="botao botao-grande"
            >
              Desafio em tempo real
            </button>
          </div>
        </>
      )}
    </section>
  );
}
