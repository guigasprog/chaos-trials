"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Anuncio,
  api,
  type Conta,
  ErroDaApi,
  type Item,
  type Moeda,
  type Personagem,
  type VagaDaLoja,
} from "@/lib/api";
import { n } from "@/lib/numero";

/**
 * O mercado.
 *
 * Duas abas, e a divisão é por PAPEL e não por tipo de dado: comprando ou
 * vendendo. Quem entra aqui já sabe qual dos dois está fazendo, e uma
 * vitrine misturada com formulário de anúncio não serve bem a nenhum.
 *
 * O dízimo aparece no cabeçalho e no formulário, antes de publicar. Saber
 * a taxa depois da venda é a forma mais rápida de perder confiança num
 * mercado.
 */

const MOEDAS: { id: Moeda; nome: string; curto: string }[] = [
  { id: "sucata", nome: "Sucata", curto: "suc" },
  { id: "premium", nome: "Premium", curto: "prm" },
];

function Moedinha({ valor, moeda }: { valor: number; moeda: Moeda }) {
  return (
    <span className={`moeda-valor ${moeda === "premium" ? "moeda-premium" : ""}`}>
      {n(valor)}
      <span className="rotulo"> {MOEDAS.find((m) => m.id === moeda)!.curto}</span>
    </span>
  );
}

/** "1h23min" — sem casas de segundo, que ninguém vai cronometrar a troca. */
function tempoRestante(ms: number): string {
  const minutos = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h}h${m > 0 ? `${m}min` : ""}` : `${m}min`;
}

/** As propriedades da peça, compactas — é o que decide a compra. */
function Propriedades({ item }: { item: Item }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {item.propriedades.map((prop) => (
        <li key={prop.nome} className="text-[0.78rem] text-tinta-fraca">
          {prop.nome} <strong className="text-ouro-claro">{prop.valor}</strong>
        </li>
      ))}
    </ul>
  );
}

/**
 * A linha do preço ao longo do tempo, num SVG simples.
 *
 * Sem biblioteca de gráfico — é uma polyline só, normalizada pelo maior
 * e menor ponto da própria série. Com um ponto só (bolsa nova, sem
 * histórico ainda), não há o que desenhar: uma linha reta não diz nada,
 * então a mensagem substitui o gráfico em vez de fingir uma tendência.
 */
function GraficoDaBolsa({ pontos }: { pontos: { quando: number; taxa: number }[] }) {
  if (pontos.length < 2) {
    return (
      <p className="painel p-4 text-[0.8rem] text-tinta-fraca">
        Sem histórico suficiente ainda — volte daqui a algumas horas de uso
        da bolsa para ver a linha se formar.
      </p>
    );
  }

  const LARGURA = 600;
  const ALTURA = 120;
  const valores = pontos.map((p) => p.taxa);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const alcance = Math.max(1, maximo - minimo);

  const coords = pontos.map((p, i) => {
    const x = (i / (pontos.length - 1)) * LARGURA;
    const y = ALTURA - ((p.taxa - minimo) / alcance) * ALTURA;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="painel p-4">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-24 w-full"
        preserveAspectRatio="none"
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="var(--color-ouro-claro)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[0.72rem] text-tinta-fraca">
        <span>{n(minimo)} suc</span>
        <span>{n(maximo)} suc</span>
      </div>
    </div>
  );
}

function BolsaTab({
  taxa,
  historico,
  premium,
  sucata,
  premiumParaComprar,
  setPremiumParaComprar,
  premiumParaVender,
  setPremiumParaVender,
  ocupado,
  aoComprar,
  aoVender,
}: {
  taxa: number;
  historico: { quando: number; taxa: number }[];
  /** Da CONTA — é ela que segura o premium. */
  premium: number;
  /** Do personagem — é ele que segura a sucata. */
  sucata: number;
  premiumParaComprar: string;
  setPremiumParaComprar: (v: string) => void;
  premiumParaVender: string;
  setPremiumParaVender: (v: string) => void;
  ocupado: boolean;
  aoComprar: () => void;
  aoVender: () => void;
}) {
  const qtdComprar = Number(premiumParaComprar);
  const comprarOk = Number.isInteger(qtdComprar) && qtdComprar >= 1;
  const custoDaCompra = comprarOk ? qtdComprar * taxa : 0;
  const semSucata = comprarOk && custoDaCompra > sucata;

  const qtdVender = Number(premiumParaVender);
  const venderOk = Number.isInteger(qtdVender) && qtdVender >= 1;
  const semPremium = venderOk && qtdVender > premium;
  const recebidoAoVender = venderOk ? qtdVender * taxa : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="painel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="rotulo">Taxa agora</p>
          <p className="titulo text-3xl">
            <span className="text-ouro-claro">{n(taxa)}</span>
            <span className="text-[1rem] text-tinta-fraca"> sucata = 1 premium</span>
          </p>
        </div>
        <p className="max-w-sm text-[0.8rem] leading-relaxed text-tinta-fraca">
          O preço sobe sozinho com o quanto se compra no mês e com o
          quanto de premium já está parado nas contas — quanto mais a
          bolsa é usada, mais cara ela fica para todo mundo.
        </p>
      </div>

      <GraficoDaBolsa pontos={historico} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="painel flex flex-col gap-3 p-5">
          <p className="titulo text-xl">Comprar premium</p>
          <p className="text-[0.8rem] text-tinta-fraca">
            Paga em sucata do personagem, recebe na conta.
          </p>
          <label className="flex flex-col gap-2">
            <span className="rotulo">Quanto premium</span>
            <input
              type="number"
              min={1}
              value={premiumParaComprar}
              onChange={(e) => setPremiumParaComprar(e.target.value)}
              placeholder="inteiro"
              className="campo"
            />
          </label>
          {comprarOk && (
            <p className="text-[0.85rem] text-tinta-fraca">
              Custa{" "}
              <strong className={semSucata ? "text-sangue" : "text-ouro-claro"}>
                {n(custoDaCompra)}
              </strong>{" "}
              de sucata. Você tem {n(sucata)}.
            </p>
          )}
          <button
            type="button"
            disabled={!comprarOk || semSucata || ocupado}
            onClick={aoComprar}
            className="botao self-start"
          >
            Comprar
          </button>
        </div>

        <div className="painel flex flex-col gap-3 p-5">
          <p className="titulo text-xl">Vender premium</p>
          <p className="text-[0.8rem] text-tinta-fraca">
            Paga em premium da conta, recebe sucata no personagem.
          </p>
          <label className="flex flex-col gap-2">
            <span className="rotulo">Quanto premium</span>
            <input
              type="number"
              min={1}
              value={premiumParaVender}
              onChange={(e) => setPremiumParaVender(e.target.value)}
              placeholder="inteiro"
              className="campo"
            />
          </label>
          {venderOk && (
            <p className="text-[0.85rem] text-tinta-fraca">
              Recebe{" "}
              <strong className="text-ouro-claro">{n(recebidoAoVender)}</strong> de
              sucata. Você tem {n(premium)} de premium.
            </p>
          )}
          <button
            type="button"
            disabled={!venderOk || semPremium || ocupado}
            onClick={aoVender}
            className="botao self-start"
          >
            Vender
          </button>
        </div>
      </div>
    </div>
  );
}

export function Mercado({
  p,
  conta,
  aoAtualizar,
  aoAtualizarConta,
  aoFechar,
}: {
  p: Personagem;
  conta: Conta;
  aoAtualizar: (p: Personagem) => void;
  aoAtualizarConta: () => void;
  aoFechar: () => void;
}) {
  const [aba, setAba] = useState<"vitrine" | "meus" | "loja" | "bolsa">("vitrine");
  const [moedaFiltro, setMoedaFiltro] = useState<Moeda | "todas">("todas");
  const [vitrine, setVitrine] = useState<Anuncio[]>([]);
  const [meus, setMeus] = useState<Anuncio[]>([]);
  const [dizimo, setDizimo] = useState(0.08);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // A prateleira da casa — sem vendedor, sem "meus anúncios", troca sozinha.
  const [vagasDaLoja, setVagasDaLoja] = useState<VagaDaLoja[]>([]);
  const [trocaDaLojaEm, setTrocaDaLojaEm] = useState(0);
  const [carregandoLoja, setCarregandoLoja] = useState(true);
  // O amuleto não roda: é sempre a mesma vaga, à parte das seis.
  const [amuleto, setAmuleto] = useState<{ preco: number; moeda: Moeda } | null>(null);

  // A bolsa: sucata compra premium, a um preço que sobe sozinho.
  const [taxa, setTaxa] = useState(0);
  const [historicoDaBolsa, setHistoricoDaBolsa] = useState<
    { quando: number; taxa: number }[]
  >([]);
  const [carregandoBolsa, setCarregandoBolsa] = useState(true);
  const [premiumParaComprar, setPremiumParaComprar] = useState("");
  const [premiumParaVender, setPremiumParaVender] = useState("");

  // Rascunho do anúncio: qual peça, por quanto, em qual moeda.
  const [aVender, setAVender] = useState<string | null>(null);
  const [preco, setPreco] = useState("");
  const [moeda, setMoeda] = useState<Moeda>("sucata");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.mercado(moedaFiltro === "todas" ? undefined : moedaFiltro);
      setVitrine(r.anuncios);
      setMeus(r.meus);
      setDizimo(r.dizimo);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "o mercado não abriu");
    } finally {
      setCarregando(false);
    }
  }, [moedaFiltro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarLoja = useCallback(async () => {
    setCarregandoLoja(true);
    try {
      const r = await api.loja();
      setVagasDaLoja(r.vagas);
      setTrocaDaLojaEm(r.proximaTrocaEm);
      setAmuleto(r.amuleto);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "a loja não abriu");
    } finally {
      setCarregandoLoja(false);
    }
  }, []);

  useEffect(() => {
    if (aba === "loja") void carregarLoja();
  }, [aba, carregarLoja]);

  const carregarBolsa = useCallback(async () => {
    setCarregandoBolsa(true);
    try {
      const r = await api.cambio();
      setTaxa(r.taxa);
      setHistoricoDaBolsa(r.historico);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "a bolsa não abriu");
    } finally {
      setCarregandoBolsa(false);
    }
  }, []);

  useEffect(() => {
    if (aba === "bolsa") void carregarBolsa();
  }, [aba, carregarBolsa]);

  async function tentar(acao: () => Promise<unknown>, depois?: string) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await acao();
      await carregar();
      aoAtualizarConta();
      if (depois) setAviso(depois);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu certo");
    } finally {
      setOcupado(false);
    }
  }

  const peca = p.mochila.find((i) => i.id === aVender) ?? null;
  const precoNumero = Number(preco);
  const precoOk = Number.isInteger(precoNumero) && precoNumero >= 1;
  const liquido = precoOk ? precoNumero - Math.max(1, Math.ceil(precoNumero * dizimo)) : 0;

  function saldoDe(m: Moeda) {
    return m === "premium" ? conta.premium : p.sucata;
  }

  return (
    <section className="surge flex flex-col gap-6">
      <header className="painel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="rotulo">Mercado</p>
          <p className="titulo mt-1 text-3xl">O que os outros largaram</p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-tinta-fraca">
            Toda venda queima {Math.round(dizimo * 100)}% em dízimo. É o único
            ralo de moeda do jogo — sem ele, a economia fechada só acumula.
          </p>
        </div>
        <button type="button" onClick={aoFechar} className="botao">
          Voltar
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {/* Por PAPEL, e não por tipo de dado: quem entra já sabe se está
            comprando, vendendo, na prateleira da casa, ou trocando moeda. */}
        {(["vitrine", "meus", "loja", "bolsa"] as const).map((qual) => (
          <button
            key={qual}
            type="button"
            onClick={() => setAba(qual)}
            className={`aba ${aba === qual ? "aba-ativa" : ""}`}
          >
            {qual === "vitrine"
              ? "Comprar"
              : qual === "meus"
                ? `Vender (${meus.filter((a) => a.estado === "aberto").length})`
                : qual === "loja"
                  ? "Loja"
                  : "Bolsa"}
          </button>
        ))}

        {aba === "vitrine" && (
          <div className="ml-auto flex items-center gap-2">
            <span className="rotulo">Moeda</span>
            {(["todas", "sucata", "premium"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoedaFiltro(m)}
                className={`aba aba-pequena ${moedaFiltro === m ? "aba-ativa" : ""}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {erro && <p className="painel p-4 text-[0.88rem] text-sangue">{erro}</p>}
      {aviso && <p className="painel p-4 text-[0.88rem] text-verdete">{aviso}</p>}

      {aba === "vitrine" ? (
        carregando ? (
          <p className="rotulo">abrindo as portas do mercado…</p>
        ) : vitrine.length === 0 ? (
          <p className="painel p-6 text-[0.9rem] leading-relaxed text-tinta-fraca">
            Ninguém anunciou nada ainda. O mercado é dos jogadores: o que
            estiver aqui saiu da mochila de alguém.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {vitrine.map((a) => {
              const caro = saldoDe(a.moeda) < a.preco;
              return (
                <li
                  key={a.id}
                  className="anuncio"
                  style={{ "--raro": a.item.cor } as React.CSSProperties}
                >
                  <div className="min-w-0 flex-1">
                    <p className="titulo text-xl" style={{ color: a.item.cor }}>
                      {a.item.nome}
                    </p>
                    <p className="rotulo mt-0.5">
                      {a.item.raridadeNome} · {a.item.encaixeNome} · nível{" "}
                      {a.item.nivel} · {n(a.item.poder)} de poder
                    </p>
                    <Propriedades item={a.item} />
                    <p className="mt-2 text-[0.76rem] text-tinta-fraca">
                      de {a.vendedorNome}
                    </p>
                  </div>

                  <div className="flex flex-none flex-col items-end gap-2">
                    <Moedinha valor={a.preco} moeda={a.moeda} />
                    <button
                      type="button"
                      disabled={ocupado || a.meu || caro}
                      onClick={() =>
                        tentar(async () => {
                          const r = await api.comprarAnuncio(a.id, p.id);
                          // Sem isto a compra funcionava no servidor e a
                          // peça só aparecia depois de trocar de tela: a
                          // ficha em memória (`p`) nunca sabia que a
                          // mochila tinha mudado.
                          aoAtualizar(r.personagem);
                        }, `${a.item.nome} está na mochila.`)
                      }
                      className="botao"
                      title={
                        a.meu
                          ? "é seu"
                          : caro
                            ? `você tem ${n(saldoDe(a.moeda))}`
                            : "Comprar"
                      }
                    >
                      {/* Com o preço dentro, e não só "Comprar": a aba
                          também se chama Comprar, e dois botões com o
                          mesmo texto na mesma tela são dois botões que a
                          pessoa confunde. */}
                      {a.meu
                        ? "seu"
                        : caro
                          ? "sem saldo"
                          : `Comprar por ${n(a.preco)}`}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : aba === "meus" ? (
        <div className="flex flex-col gap-6">
          <div className="painel flex flex-col gap-4 p-5">
            <p className="titulo text-2xl">Anunciar uma peça</p>

            {p.mochila.length === 0 ? (
              <p className="text-[0.88rem] text-tinta-fraca">
                A mochila está vazia. Só se vende o que está guardado — o
                que está vestido sai do corpo primeiro.
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {p.mochila.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setAVender(aVender === item.id ? null : item.id);
                          setPreco("");
                        }}
                        className={`peca ${aVender === item.id ? "peca-escolhida" : ""}`}
                        style={{ "--raro": item.cor } as React.CSSProperties}
                      >
                        <span className="peca-nome" style={{ color: item.cor }}>
                          {item.nome}
                        </span>
                        <span className="peca-linha">
                          <span className="rotulo">{item.encaixeNome}</span>
                          <strong className="peca-poder">{n(item.poder)}</strong>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {peca && (
                  <div className="surge flex flex-col gap-4 border-t-2 border-borda pt-4">
                    <p className="text-[0.9rem]">
                      Anunciando{" "}
                      <strong style={{ color: peca.cor }}>{peca.nome}</strong>.
                      Ela sai da mochila agora e volta se você retirar o
                      anúncio.
                    </p>

                    <div className="flex flex-wrap items-end gap-4">
                      <label className="flex flex-col gap-2">
                        <span className="rotulo">Preço</span>
                        <input
                          type="number"
                          min={1}
                          value={preco}
                          onChange={(e) => setPreco(e.target.value)}
                          placeholder="inteiro"
                          className="campo w-40"
                        />
                      </label>

                      <div className="flex flex-col gap-2">
                        <span className="rotulo">Moeda</span>
                        <div className="flex gap-2">
                          {MOEDAS.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setMoeda(m.id)}
                              className={`aba ${moeda === m.id ? "aba-ativa" : ""}`}
                            >
                              {m.nome}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* O líquido ANTES de publicar. */}
                    {precoOk && (
                      <p className="text-[0.85rem] text-tinta-fraca">
                        Você recebe{" "}
                        <strong className="text-ouro-claro">{n(liquido)}</strong>{" "}
                        de {moeda}; {n(precoNumero - liquido)} vira dízimo e
                        desaparece do mundo.
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={!precoOk || ocupado}
                      onClick={() =>
                        tentar(async () => {
                          const r = await api.anunciar(
                            p.id,
                            peca.id,
                            precoNumero,
                            moeda,
                          );
                          aoAtualizar(r.personagem);
                          setAVender(null);
                          setPreco("");
                        }, "Anunciado. A peça saiu da mochila.")
                      }
                      className="botao botao-grande self-start"
                    >
                      Anunciar por {precoOk ? n(precoNumero) : "…"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <p className="rotulo">Meus anúncios</p>
            {meus.length === 0 ? (
              <p className="painel p-5 text-[0.88rem] text-tinta-fraca">
                Nada anunciado ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {meus.map((a) => (
                  <li
                    key={a.id}
                    className={`anuncio ${a.estado !== "aberto" ? "anuncio-fechado" : ""}`}
                    style={{ "--raro": a.item.cor } as React.CSSProperties}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="titulo text-xl" style={{ color: a.item.cor }}>
                        {a.item.nome}
                      </p>
                      <p className="rotulo mt-0.5">
                        {a.estado === "aberto"
                          ? `à venda — você recebe ${n(a.aoVendedor)}`
                          : a.estado === "vendido"
                            ? `vendido por ${n(a.preco)}`
                            : "retirado"}
                      </p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-2">
                      <Moedinha valor={a.preco} moeda={a.moeda} />
                      {a.estado === "aberto" && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() =>
                            tentar(async () => {
                              const r = await api.retirarAnuncio(a.id);
                              aoAtualizar(r.personagem);
                            }, "Retirado. A peça voltou para a mochila.")
                          }
                          className="botao"
                        >
                          Retirar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : aba === "loja" ? (
        carregandoLoja ? (
          <p className="rotulo">abrindo a prateleira…</p>
        ) : (
        <div className="flex flex-col gap-4">
          {amuleto && (
            <div className="painel flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="rotulo">Amuleto de vida extra</p>
                <p className="titulo text-xl">
                  {p.vidasGuardadas} / {p.vidasGuardadasMaximo} guardadas
                </p>
                <p className="mt-1 text-[0.8rem] leading-relaxed text-tinta-fraca">
                  Cobre a próxima derrota que mataria de vez. Não roda — está
                  sempre à venda, e não ocupa a mochila.
                </p>
              </div>
              <div className="flex flex-none flex-col items-end gap-2">
                <Moedinha valor={amuleto.preco} moeda={amuleto.moeda} />
                <button
                  type="button"
                  disabled={
                    ocupado ||
                    p.vidasGuardadas >= p.vidasGuardadasMaximo ||
                    saldoDe(amuleto.moeda) < amuleto.preco
                  }
                  onClick={() =>
                    tentar(async () => {
                      const r = await api.comprarAmuleto(p.id);
                      aoAtualizar(r.personagem);
                    }, "Vida extra guardada.")
                  }
                  className="botao"
                  title={
                    p.vidasGuardadas >= p.vidasGuardadasMaximo
                      ? "já está no teto"
                      : saldoDe(amuleto.moeda) < amuleto.preco
                        ? `você tem ${n(saldoDe(amuleto.moeda))}`
                        : "Comprar"
                  }
                >
                  {p.vidasGuardadas >= p.vidasGuardadasMaximo
                    ? "no teto"
                    : saldoDe(amuleto.moeda) < amuleto.preco
                      ? "sem saldo"
                      : `Comprar por ${n(amuleto.preco)}`}
                </button>
              </div>
            </div>
          )}

          <p className="text-[0.82rem] text-tinta-fraca">
            Seis vagas, de um vendedor que não é ninguém. Trocam em{" "}
            <strong className="text-ouro-claro">
              {tempoRestante(trocaDaLojaEm)}
            </strong>
            .
          </p>
          <ul className="flex flex-col gap-3">
            {vagasDaLoja.map((v) => {
              const caro = saldoDe(v.moeda) < v.preco;
              return (
                <li
                  key={v.id}
                  className="anuncio"
                  style={{ "--raro": v.item.cor } as React.CSSProperties}
                >
                  <div className="min-w-0 flex-1">
                    <p className="titulo text-xl" style={{ color: v.item.cor }}>
                      {v.item.nome}
                    </p>
                    <p className="rotulo mt-0.5">
                      {v.item.raridadeNome} · {v.item.encaixeNome} · nível{" "}
                      {v.item.nivel} · {n(v.item.poder)} de poder
                    </p>
                    <Propriedades item={v.item} />
                  </div>

                  <div className="flex flex-none flex-col items-end gap-2">
                    <Moedinha valor={v.preco} moeda={v.moeda} />
                    <button
                      type="button"
                      disabled={ocupado || caro}
                      onClick={() =>
                        tentar(async () => {
                          const r = await api.comprarDaLoja(v.id, p.id);
                          aoAtualizar(r.personagem);
                        }, `${v.item.nome} está na mochila.`)
                      }
                      className="botao"
                      title={caro ? `você tem ${n(saldoDe(v.moeda))}` : "Comprar"}
                    >
                      {caro ? "sem saldo" : `Comprar por ${n(v.preco)}`}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        )
      ) : carregandoBolsa ? (
        <p className="rotulo">abrindo a bolsa…</p>
      ) : (
        <BolsaTab
          taxa={taxa}
          historico={historicoDaBolsa}
          premium={conta.premium}
          sucata={p.sucata}
          premiumParaComprar={premiumParaComprar}
          setPremiumParaComprar={setPremiumParaComprar}
          premiumParaVender={premiumParaVender}
          setPremiumParaVender={setPremiumParaVender}
          ocupado={ocupado}
          aoComprar={() =>
            tentar(async () => {
              const quantidade = Number(premiumParaComprar);
              await api.comprarPremium(p.id, quantidade);
              await carregarBolsa();
              setPremiumParaComprar("");
            }, `Comprou ${premiumParaComprar} de premium.`)
          }
          aoVender={() =>
            tentar(async () => {
              const quantidade = Number(premiumParaVender);
              const r = await api.venderPremium(p.id, quantidade);
              aoAtualizar(r.personagem);
              await carregarBolsa();
              setPremiumParaVender("");
            }, `Vendeu ${premiumParaVender} de premium.`)
          }
        />
      )}

      <p className="text-[0.8rem] leading-relaxed text-tinta-fraca">
        A moeda premium entra no mundo de um jeito só — alguém comprou com
        dinheiro de verdade — e nunca sai. Não existe saque nem câmbio de
        sucata para premium: o único caminho até ela é outro jogador pagando
        por algo que você achou.
      </p>
    </section>
  );
}
