"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Alvo,
  api,
  type Duelo,
  ErroDaApi,
  type Personagem,
} from "@/lib/api";
import { n } from "@/lib/numero";
import { PALETAS } from "@/lib/vitral";
import { Vitral } from "./Vitral";

/**
 * A arena.
 *
 * PvP assíncrono: você desafia a FICHA de outro jogador, exatamente como
 * ela está, e o servidor resolve o duelo inteiro de uma vez. Ninguém
 * precisa estar on-line dos dois lados — num jogo de sessões curtas,
 * exigir isso é garantir fila vazia.
 *
 * A tela diz três coisas antes de qualquer botão: que o defensor não
 * perde nada, que você paga com vida, e que ninguém morre aqui. São as
 * perguntas que a pessoa faz antes de clicar, e escondê-las faria o
 * primeiro duelo ser um susto.
 */

function Desfecho({ duelo, aoFechar }: { duelo: Duelo; aoFechar: () => void }) {
  return (
    <div className="painel surge flex flex-col gap-4 p-6">
      <p className="titulo text-3xl">
        {duelo.venci ? "Você venceu o duelo." : "Você perdeu o duelo."}
      </p>
      <p className="text-[0.9rem] leading-relaxed text-tinta-fraca">
        {duelo.rodadas} rodada{duelo.rodadas === 1 ? "" : "s"} contra{" "}
        {duelo.defensor.nome}.{" "}
        {duelo.venci
          ? `+${n(duelo.premio)} de sucata.`
          : "Nada de sucata — e nada perdido além do cansaço."}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <span className="recurso recurso-ouro">
          <span className="recurso-valor">{n(duelo.elo.depois)}</span>
          <span className="rotulo">elo</span>
        </span>
        <span
          className={`text-[1.1rem] tabular-nums ${
            duelo.elo.depois >= duelo.elo.antes ? "text-verdete" : "text-sangue"
          }`}
        >
          {duelo.elo.depois >= duelo.elo.antes ? "+" : "−"}
          {n(Math.abs(duelo.elo.depois - duelo.elo.antes))}
        </span>
      </div>

      <button type="button" onClick={aoFechar} className="botao self-start">
        Seguir
      </button>
    </div>
  );
}

export function Arena({
  p,
  aoAtualizar,
  aoFechar,
}: {
  p: Personagem;
  aoAtualizar: (p: Personagem) => void;
  aoFechar: () => void;
}) {
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [faixa, setFaixa] = useState<{ minimo: number; maximo: number } | null>(
    null,
  );
  const [impedimento, setImpedimento] = useState<string | null>(null);
  const [duelo, setDuelo] = useState<Duelo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.arena(p.id);
      setAlvos(r.alvos);
      setFaixa(r.faixa);
      setImpedimento(r.impedimento);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "a arena não abriu");
    } finally {
      setCarregando(false);
    }
  }, [p.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function desafiar(alvo: Alvo) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.duelar(alvo.id, p.id);
      setDuelo(r);
      if (r.personagem) aoAtualizar(r.personagem);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "o duelo não aconteceu");
    } finally {
      setOcupado(false);
    }
  }

  const vitorias = p.duelos.vitorias;
  const derrotas = p.duelos.derrotas;
  const total = vitorias + derrotas;

  return (
    <section className="surge flex flex-col gap-6">
      <header className="painel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="rotulo">Arena</p>
          <p className="titulo mt-1 text-3xl">
            <span className="text-ouro-claro">{n(p.elo)}</span> de elo
          </p>
          <p className="mt-1 text-[0.82rem] text-tinta-fraca">
            {total === 0
              ? "Nenhum duelo ainda."
              : `${vitorias} vitória${vitorias === 1 ? "" : "s"}, ${derrotas} derrota${derrotas === 1 ? "" : "s"} · ${p.duelos.defesas} defesa${p.duelos.defesas === 1 ? "" : "s"} bem-sucedida${p.duelos.defesas === 1 ? "" : "s"}`}
          </p>
        </div>
        <button type="button" onClick={aoFechar} className="botao">
          Voltar
        </button>
      </header>

      {/* As três perguntas que a pessoa faz antes de clicar. */}
      <p className="text-[0.82rem] leading-relaxed text-tinta-fraca">
        Você desafia a ficha do outro jogador, sem ele precisar estar aqui.{" "}
        <strong className="text-tinta">Ele não perde nada</strong> — nem
        sucata, nem item, nem nível; só elo, que é reputação. Você paga com
        vida e <strong className="text-tinta">não morre na arena</strong>:
        permadeath é só de perder a última vida numa luta de verdade, onde
        você escolheu a dificuldade.
      </p>

      {erro && <p className="painel p-4 text-[0.88rem] text-sangue">{erro}</p>}

      {duelo && <Desfecho duelo={duelo} aoFechar={() => setDuelo(null)} />}

      {impedimento && (
        <p className="painel p-4 text-[0.88rem] text-sangue">
          {impedimento} — cure-se antes de desafiar.
        </p>
      )}

      {carregando ? (
        <p className="rotulo">procurando adversários…</p>
      ) : alvos.length === 0 ? (
        <p className="painel p-6 text-[0.9rem] leading-relaxed text-tinta-fraca">
          Ninguém na sua faixa de nível
          {faixa ? ` (${faixa.minimo} a ${faixa.maximo})` : ""} agora. A arena
          pareia por nível, e não por elo: num jogo de progressão infinita é o
          nível que decide o duelo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alvos.map((a) => {
            const paleta = PALETAS[a.classe.ramo];
            const diferenca = a.elo - p.elo;
            return (
              <li key={a.id} className="anuncio" style={{ "--raro": paleta.brilho } as React.CSSProperties}>
                <Vitral classe={a.classe.indice} largura={54} aceso />

                <div className="min-w-0 flex-1">
                  <p className="titulo text-xl">{a.nome}</p>
                  <p className="rotulo mt-0.5">
                    {a.classe.nome} · nível {a.nivel}
                    {a.camada > 0 ? ` · camada ${a.camada}` : ""}
                    {a.defesas > 0 ? ` · ${a.defesas} defesas` : ""}
                  </p>
                  {/* A diferença de elo é o que diz se o duelo vale: vencer
                      quem está acima rende muito, quem está abaixo quase
                      nada. Esconder isso faria escolher às cegas. */}
                  <p className="mt-2 text-[0.78rem] text-tinta-fraca">
                    {diferenca > 30
                      ? "acima de você — vale mais"
                      : diferenca < -30
                        ? "abaixo de você — vale pouco"
                        : "páreo parelho"}
                  </p>
                </div>

                <div className="flex flex-none flex-col items-end gap-2">
                  <span className="moeda-valor moeda-premium">
                    {n(a.elo)}
                    <span className="rotulo"> elo</span>
                  </span>
                  <button
                    type="button"
                    disabled={ocupado || impedimento !== null}
                    onClick={() => desafiar(a)}
                    className="botao"
                  >
                    Desafiar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
