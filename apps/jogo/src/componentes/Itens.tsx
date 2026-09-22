"use client";

import { useState } from "react";
import {
  api,
  type Encaixe,
  ErroDaApi,
  type Item,
  type Personagem,
} from "@/lib/api";
import { n } from "@/lib/numero";

/**
 * O boneco e a mochila.
 *
 * Quatro encaixes à esquerda, o que está guardado à direita, e um painel de
 * detalhe embaixo do que estiver escolhido. Comparar é o gesto central
 * desta tela — "isto é melhor que aquilo?" —, então a peça escolhida na
 * mochila mostra, ao lado, o que já está no mesmo encaixe.
 *
 * Cor, nome de raridade e propriedades vêm prontos do servidor. Recalcular
 * aqui duplicaria regra, e regra duplicada diverge.
 */

const ENCAIXES: { id: Encaixe; nome: string; marca: string }[] = [
  { id: "arma", nome: "Arma", marca: "†" },
  { id: "elmo", nome: "Elmo", marca: "◇" },
  { id: "peito", nome: "Peito", marca: "▢" },
  { id: "talisma", nome: "Talismã", marca: "☘" },
];

/** Uma peça como cartão. A cor da borda é a raridade, e é a leitura rápida. */
function Peca({
  item,
  escolhida,
  aoEscolher,
}: {
  item: Item;
  escolhida: boolean;
  aoEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      className={`peca ${escolhida ? "peca-escolhida" : ""}`}
      style={{ "--raro": item.cor } as React.CSSProperties}
      title={`${item.nome} — ${item.raridadeNome}`}
    >
      <span className="peca-nome" style={{ color: item.cor }}>
        {item.nome}
      </span>
      <span className="peca-linha">
        <span className="rotulo">{item.encaixeNome}</span>
        <strong className="peca-poder">{n(item.poder)}</strong>
      </span>
    </button>
  );
}

/** As propriedades de uma peça, e o que ela substitui. */
function Detalhe({
  item,
  atual,
  acoes,
}: {
  item: Item;
  /** O que já está no encaixe, para comparar. */
  atual?: Item;
  acoes: React.ReactNode;
}) {
  const diferenca = atual ? item.poder - atual.poder : null;

  return (
    <div className="painel surge flex flex-col gap-4 p-5">
      <div>
        <p className="titulo text-2xl" style={{ color: item.cor }}>
          {item.nome}
        </p>
        <p className="rotulo mt-1">
          {item.raridadeNome} · {item.encaixeNome} · nível {item.nivel}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {item.propriedades.map((p) => (
          <li key={p.nome} className="flex items-baseline justify-between gap-6">
            <span className="text-[0.88rem] text-tinta-fraca">{p.nome}</span>
            <strong className="tabular-nums text-ouro-claro">{p.valor}</strong>
          </li>
        ))}
      </ul>

      {/* A comparação é o gesto central: "isto é melhor que aquilo?" */}
      {atual && (
        <p className="text-[0.82rem] leading-relaxed text-tinta-fraca">
          No lugar de <span style={{ color: atual.cor }}>{atual.nome}</span> —{" "}
          {diferenca === 0 ? (
            "o mesmo poder."
          ) : (
            <strong className={diferenca! > 0 ? "text-verdete" : "text-sangue"}>
              {diferenca! > 0 ? "+" : "−"}
              {n(Math.abs(diferenca!))} de poder
            </strong>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-3">{acoes}</div>
    </div>
  );
}

export function Itens({
  p,
  aoAtualizar,
  aoFechar,
}: {
  p: Personagem;
  aoAtualizar: (p: Personagem) => void;
  aoFechar: () => void;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [encaixeAberto, setEncaixeAberto] = useState<Encaixe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function tentar(acao: () => Promise<Personagem>, depois?: string) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      aoAtualizar(await acao());
      setEscolhida(null);
      setEncaixeAberto(null);
      if (depois) setAviso(depois);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu certo");
    } finally {
      setOcupado(false);
    }
  }

  const naMochila = p.mochila.find((i) => i.id === escolhida) ?? null;
  const noEncaixe = encaixeAberto ? (p.equipado[encaixeAberto] ?? null) : null;
  const poderVestido = ENCAIXES.reduce(
    (s, e) => s + (p.equipado[e.id]?.poder ?? 0),
    0,
  );

  return (
    <section className="surge flex flex-col gap-6">
      <header className="painel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="rotulo">Equipamento</p>
          <p className="titulo mt-1 text-3xl">
            <span className="text-ouro-claro">{n(poderVestido)}</span> de poder
            vestido
          </p>
          {/* O aviso só quando ele é aviso: como frase fixa, lia-se como
              "a mochila ESTÁ cheia" com duas peças dentro. */}
          <p className="mt-1 text-[0.82rem] text-tinta-fraca">
            Mochila: {p.mochila.length} de {p.mochilaMaxima}.
            {p.mochila.length >= p.mochilaMaxima ? (
              <strong className="text-sangue">
                {" "}
                Cheia — o que cair agora vira sucata sozinho.
              </strong>
            ) : (
              ""
            )}
          </p>
        </div>
        <button type="button" onClick={aoFechar} className="botao">
          Voltar
        </button>
      </header>

      {erro && <p className="painel p-4 text-[0.88rem] text-sangue">{erro}</p>}
      {aviso && (
        <p className="painel p-4 text-[0.88rem] text-verdete">{aviso}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-3">
          <p className="rotulo">Vestido</p>
          {ENCAIXES.map((e) => {
            const item = p.equipado[e.id];
            const aberto = encaixeAberto === e.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setEncaixeAberto(aberto ? null : e.id);
                  setEscolhida(null);
                }}
                disabled={!item}
                className={`encaixe ${item ? "" : "encaixe-vazio"} ${aberto ? "encaixe-aberto" : ""}`}
                style={{ "--raro": item?.cor ?? "#2a2340" } as React.CSSProperties}
              >
                <span className="encaixe-marca" aria-hidden="true">
                  {e.marca}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="rotulo block">{e.nome}</span>
                  {item ? (
                    <>
                      <span
                        className="block truncate text-[1.02rem]"
                        style={{ color: item.cor }}
                      >
                        {item.nome}
                      </span>
                      <span className="rotulo">{n(item.poder)} de poder</span>
                    </>
                  ) : (
                    <span className="block text-[0.9rem] text-tinta-fraca">
                      vazio
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <p className="rotulo">
            Mochila — o de mais poder primeiro
          </p>
          {p.mochila.length === 0 ? (
            <p className="painel p-5 text-[0.88rem] leading-relaxed text-tinta-fraca">
              Nada guardado. Vitórias largam peças de vez em quando —
              dificuldades maiores largam mais, e largam melhor.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {p.mochila.map((item) => (
                <li key={item.id}>
                  <Peca
                    item={item}
                    escolhida={escolhida === item.id}
                    aoEscolher={() => {
                      setEscolhida(escolhida === item.id ? null : item.id);
                      setEncaixeAberto(null);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {naMochila && (
        <Detalhe
          item={naMochila}
          atual={p.equipado[naMochila.encaixe]}
          acoes={
            <>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => tentar(() => api.equipar(p.id, naMochila.id))}
                className="botao botao-grande"
              >
                Vestir
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() =>
                  tentar(
                    () => api.desmanchar(p.id, naMochila.id),
                    `Desmanchada por ${n(naMochila.desmanchePor)} de sucata.`,
                  )
                }
                className="botao botao-perigo"
              >
                Desmanchar por {n(naMochila.desmanchePor)}
              </button>
            </>
          }
        />
      )}

      {noEncaixe && encaixeAberto && (
        <Detalhe
          item={noEncaixe}
          acoes={
            <button
              type="button"
              disabled={ocupado}
              onClick={() => tentar(() => api.desequipar(p.id, encaixeAberto))}
              className="botao botao-grande"
            >
              Tirar
            </button>
          }
        />
      )}

      <p className="text-[0.8rem] leading-relaxed text-tinta-fraca">
        Só se desmancha o que está na mochila — o que está vestido sai do
        corpo primeiro. É um gesto a mais de propósito: desmanchar a arma
        equipada por engano é caro.
      </p>
    </section>
  );
}
