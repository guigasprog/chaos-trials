"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type Batalha,
  type Conta,
  type Entrada as Sessao,
  ErroDaApi,
  esquecerId,
  esquecerToken,
  guardarId,
  guardarToken,
  idGuardado,
  type Personagem,
  type Resultado,
  tokenGuardado,
} from "@/lib/api";
import { Arena } from "@/componentes/Arena";
import { Arvore } from "@/componentes/Arvore";
import { Combate } from "@/componentes/Combate";
import { CombateTempoReal } from "@/componentes/CombateTempoReal";
import { Criacao } from "@/componentes/Criacao";
import { Entrada } from "@/componentes/Entrada";
import { Ficha } from "@/componentes/Ficha";
import { Hud } from "@/componentes/Hud";
import { Itens } from "@/componentes/Itens";
import { Mercado } from "@/componentes/Mercado";
import { Slots } from "@/componentes/Slots";

/**
 * O jogo.
 *
 * Quatro lugares, e qual aparece depende só do estado: sem sessão, a porta;
 * com sessão e sem personagem escolhido, a prateleira de slots; criando, a
 * faixa de classes; jogando, a ficha — com combate e árvore por cima.
 *
 * Nenhuma regra de jogo mora aqui. Esta página pede e mostra; quem decide é
 * o servidor.
 */

/** Onde estamos. `null` enquanto ainda não se sabe. */
type Lugar = "carregando" | "porta" | "slots" | "criando" | "jogando";

export default function Jogo() {
  const [lugar, setLugar] = useState<Lugar>("carregando");
  const [conta, setConta] = useState<Conta | null>(null);
  const [personagens, setPersonagens] = useState<Personagem[]>([]);
  const [p, setP] = useState<Personagem | null>(null);
  const [batalha, setBatalha] = useState<Batalha | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  /** Qual painel está por cima da ficha. */
  const [painel, setPainel] = useState<
    "ficha" | "arvore" | "itens" | "mercado" | "arena" | "tempo-real"
  >("ficha");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Recarrega conta e personagens do servidor.
   *
   * Uma chamada só para as duas coisas: a tela de slots precisa das duas ao
   * mesmo tempo, e duas chamadas dariam um instante em que o saldo e os
   * slots discordam.
   */
  const recarregar = useCallback(async (): Promise<Personagem[]> => {
    const { conta: c, personagens: lista } = await api.eu();
    setConta(c);
    setPersonagens(lista);
    return lista;
  }, []);

  // Retoma a sessão guardada, e dentro dela o personagem em que se estava.
  useEffect(() => {
    if (!tokenGuardado()) {
      setLugar("porta");
      return;
    }
    void (async () => {
      try {
        const lista = await recarregar();
        const ultimo = lista.find((x) => x.id === idGuardado());
        if (ultimo) {
          setP(ultimo);
          setLugar("jogando");
        } else {
          // Personagem guardado que não existe mais nesta conta: volta para
          // a prateleira em vez de prender numa tela de erro.
          esquecerId();
          setLugar("slots");
        }
      } catch (e) {
        if (!(e instanceof ErroDaApi) || e.status !== 401) {
          setErro(e instanceof ErroDaApi ? e.message : "não deu para carregar");
        }
        setLugar("porta");
      }
    })();
  }, [recarregar]);

  function entrou(sessao: Sessao) {
    guardarToken(sessao.token);
    setConta(sessao.conta);
    setErro(null);
    void (async () => {
      const lista = await recarregar();
      // Conta nova entra direto na criação: uma prateleira de dois slots
      // vazios não é uma escolha, é um clique a mais.
      setLugar(lista.length === 0 ? "criando" : "slots");
    })();
  }

  async function sair() {
    try {
      await api.sair();
    } catch {
      /* o token pode já estar morto; o que importa é limpar daqui */
    }
    esquecerToken();
    esquecerId();
    setConta(null);
    setPersonagens([]);
    setP(null);
    setBatalha(null);
    setLugar("porta");
  }

  const escolher = useCallback((escolhido: Personagem) => {
    guardarId(escolhido.id);
    setP(escolhido);
    setBatalha(null);
    setResultado(null);
    setPainel("ficha");
    setLugar("jogando");
  }, []);

  const criado = useCallback(
    (novo: Personagem) => {
      void recarregar();
      escolher(novo);
    },
    [escolher, recarregar],
  );

  async function lutar() {
    if (!p) return;
    setOcupado(true);
    setErro(null);
    setResultado(null);
    try {
      setBatalha(await api.iniciarBatalha(p.id));
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "a batalha não começou");
    } finally {
      setOcupado(false);
    }
  }

  /** Recarrega do servidor: é ele quem sabe o estado verdadeiro depois da luta. */
  async function terminar(r: Resultado) {
    setResultado(r);
    if (!p) return;
    try {
      setP(await api.buscar(p.id));
      // A conta pode ter mudado junto — e se esta foi a última vida, a
      // prateleira precisa saber.
      void recarregar();
    } catch {
      /* a ficha segue com o que tem; a próxima carga corrige */
    }
  }

  if (lugar === "carregando") {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="rotulo">abrindo as portas…</p>
      </main>
    );
  }

  if (lugar === "porta" || !conta) return <Entrada aoEntrar={entrou} />;

  if (lugar === "slots") {
    return (
      <Slots
        conta={conta}
        personagens={personagens}
        aoEscolher={escolher}
        aoCriar={() => setLugar("criando")}
        aoAtualizar={() => void recarregar()}
        aoSair={sair}
      />
    );
  }

  if (lugar === "criando") {
    return (
      <Criacao
        aoCriar={criado}
        aoVoltar={personagens.length > 0 ? () => setLugar("slots") : undefined}
      />
    );
  }

  if (!p) {
    setLugar("slots");
    return null;
  }

  const emCombate = Boolean(batalha) && !resultado;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      {/* A mesma faixa nas três telas: é o que faz combate, ficha e árvore
          serem lugares dentro de um jogo em vez de três páginas. */}
      <Hud
        p={p}
        conta={conta}
        aoAbrirArvore={() => setPainel("arvore")}
        aoAbrirItens={() => setPainel("itens")}
        aoAbrirMercado={() => setPainel("mercado")}
        aoAbrirArena={() => setPainel("arena")}
        aoTrocar={() => {
          esquecerId();
          setP(null);
          setLugar("slots");
        }}
        aoSair={sair}
        travado={emCombate || painel !== "ficha"}
      />

      <div className="pt-10">
        {erro && (
          <p className="painel mb-8 p-4 text-[0.88rem] text-sangue">{erro}</p>
        )}

        {painel === "arvore" ? (
          <Arvore p={p} aoAtualizar={setP} aoFechar={() => setPainel("ficha")} />
        ) : painel === "itens" ? (
          <Itens p={p} aoAtualizar={setP} aoFechar={() => setPainel("ficha")} />
        ) : painel === "mercado" ? (
          <Mercado
            p={p}
            conta={conta}
            aoAtualizar={setP}
            aoAtualizarConta={() => void recarregar()}
            aoFechar={() => setPainel("ficha")}
          />
        ) : painel === "arena" ? (
          <Arena p={p} aoAtualizar={setP} aoFechar={() => setPainel("ficha")} />
        ) : painel === "tempo-real" ? (
          <CombateTempoReal
            personagemId={p.id}
            aoFechar={() => {
              setPainel("ficha");
              // Mesmo refresh de depois de uma luta comum: a sala mexe em
              // vida/vidas/sucata do personagem, que só o servidor sabe ao certo.
              void (async () => {
                try {
                  setP(await api.buscar(p.id));
                } catch {
                  /* a ficha segue com o que tem; a próxima carga corrige */
                }
                void recarregar();
              })();
            }}
          />
        ) : batalha && !resultado ? (
          <Combate
            batalha={batalha}
            ramo={p.classe.ramo}
            classe={p.classe.indice}
            aoTerminar={terminar}
          />
        ) : (
          <>
            {resultado && (
              <div className="painel surge mb-10 flex flex-col gap-3 p-6">
                <p className="titulo text-3xl">
                  {resultado.fugiu
                    ? "Você fugiu."
                    : resultado.venceu
                      ? "Você venceu."
                      : resultado.morreu
                        ? "Você caiu."
                        : "Você recuou."}
                </p>
                <p className="text-[0.9rem] leading-relaxed text-tinta-fraca">
                  {resultado.fugiu
                    ? "Sem prêmio, sem vida perdida — a luta acabou aqui."
                    : resultado.venceu
                      ? `+${resultado.xp} de experiência, +${resultado.sucata} de sucata` +
                        (resultado.niveisSubidos > 0
                          ? ` — e ${resultado.niveisSubidos} nível${resultado.niveisSubidos > 1 ? "s" : ""}.`
                          : ".") +
                        (resultado.vidaExtra ? " Achou uma vida extra guardada!" : "")
                      : resultado.morreu
                        ? "Sem vida de reserva, a queda foi de vez. Seu personagem está no túmulo."
                        : resultado.vidaGuardadaUsada
                          ? "Uma vida guardada cobriu a queda — por pouco."
                          : `Ferido, mas vivo. Restam ${resultado.vidasRestantes} vida${resultado.vidasRestantes === 1 ? "" : "s"}.`}
                </p>

                {/* A queda tem cartão próprio: um achado no meio de uma
                    frase de recompensa passa despercebido, e o achado é o
                    motivo de lutar de novo. */}
                {resultado.queda && (
                  <div
                    className="queda"
                    style={
                      { "--raro": resultado.queda.cor } as React.CSSProperties
                    }
                  >
                    <p className="rotulo">
                      {resultado.queda.viroSucata
                        ? "caiu, mas a mochila estava cheia"
                        : "caiu no chão"}
                    </p>
                    <p
                      className="titulo text-2xl"
                      style={{ color: resultado.queda.cor }}
                    >
                      {resultado.queda.nome}
                    </p>
                    <p className="text-[0.82rem] text-tinta-fraca">
                      {resultado.queda.raridadeNome} ·{" "}
                      {resultado.queda.encaixeNome} · {resultado.queda.poder} de
                      poder
                      {resultado.queda.viroSucata
                        ? ` — virou ${resultado.queda.viroSucata} de sucata`
                        : ""}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setResultado(null);
                      setBatalha(null);
                    }}
                    className="botao"
                  >
                    Seguir
                  </button>
                  {resultado.queda && !resultado.queda.viroSucata && (
                    <button
                      type="button"
                      onClick={() => {
                        setResultado(null);
                        setBatalha(null);
                        setPainel("itens");
                      }}
                      className="botao"
                    >
                      Ver na mochila
                    </button>
                  )}
                </div>
              </div>
            )}

            <Ficha
              p={p}
              conta={conta}
              aoAtualizar={setP}
              aoAtualizarConta={() => void recarregar()}
              aoLutar={lutar}
              aoAbrirTempoReal={() => setPainel("tempo-real")}
              aoVoltarAPrateleira={() => {
                esquecerId();
                setP(null);
                setLugar("slots");
              }}
              ocupado={ocupado}
            />
          </>
        )}
      </div>
    </main>
  );
}
