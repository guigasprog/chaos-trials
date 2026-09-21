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
import { Arvore } from "@/componentes/Arvore";
import { Combate } from "@/componentes/Combate";
import { Criacao } from "@/componentes/Criacao";
import { Entrada } from "@/componentes/Entrada";
import { Ficha } from "@/componentes/Ficha";
import { Hud } from "@/componentes/Hud";
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
  const [naArvore, setNaArvore] = useState(false);
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
    setNaArvore(false);
    setLugar("jogando");
  }, []);

  const criado = useCallback(
    (novo: Personagem) => {
      void recarregar();
      escolher(novo);
    },
    [escolher, recarregar],
  );

  async function lutar(tipo: "comum" | "julgamento") {
    if (!p) return;
    setOcupado(true);
    setErro(null);
    setResultado(null);
    try {
      setBatalha(await api.iniciarBatalha(p.id, tipo));
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
      // A conta pode ter mudado junto — e se este foi o julgamento fatal, a
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
        aoAbrirArvore={() => setNaArvore(true)}
        aoTrocar={() => {
          esquecerId();
          setP(null);
          setLugar("slots");
        }}
        travado={emCombate || naArvore}
      />

      <div className="pt-10">
        {erro && (
          <p className="painel mb-8 p-4 text-[0.88rem] text-sangue">{erro}</p>
        )}

        {naArvore ? (
          <Arvore p={p} aoAtualizar={setP} aoFechar={() => setNaArvore(false)} />
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
                  {resultado.venceu
                    ? "Você venceu."
                    : resultado.morreu
                      ? "Você caiu."
                      : "Você recuou."}
                </p>
                <p className="text-[0.9rem] leading-relaxed text-tinta-fraca">
                  {resultado.venceu
                    ? `+${resultado.xp} de experiência, +${resultado.sucata} de sucata` +
                      (resultado.niveisSubidos > 0
                        ? ` — e ${resultado.niveisSubidos} nível${resultado.niveisSubidos > 1 ? "s" : ""}.`
                        : ".")
                    : resultado.morreu
                      ? "O julgamento cobrou o que prometeu. Seu personagem está no túmulo."
                      : "Ferido, mas vivo. Batalha comum não mata — só julgamento."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setResultado(null);
                    setBatalha(null);
                  }}
                  className="botao self-start"
                >
                  Seguir
                </button>
              </div>
            )}

            <Ficha
              p={p}
              conta={conta}
              aoAtualizar={setP}
              aoAtualizarConta={() => void recarregar()}
              aoLutar={lutar}
              ocupado={ocupado}
            />
          </>
        )}
      </div>
    </main>
  );
}
