"use client";

import { useState } from "react";
import { api, type Conta, ErroDaApi, type Personagem } from "@/lib/api";
import { n } from "@/lib/numero";
import { PALETAS } from "@/lib/vitral";
import { Vitral } from "./Vitral";

/**
 * A prateleira de personagens.
 *
 * Cada slot é uma vaga com nome: ou tem alguém, ou está vazia esperando, ou
 * é um cadeado com preço. Três estados no MESMO lugar da grade, porque é
 * assim que se lê "eu tenho dois e posso ter mais" de relance — uma lista só
 * dos que existem não conta a segunda metade.
 *
 * O túmulo aparece aqui, e não escondido: é um personagem que existe, que
 * guarda tudo, e que custa para voltar. Esconder transformaria a morte em
 * "sumiu", que é a leitura errada.
 */
export function Slots({
  conta,
  personagens,
  aoEscolher,
  aoCriar,
  aoAtualizar,
  aoSair,
}: {
  conta: Conta;
  personagens: Personagem[];
  aoEscolher: (p: Personagem) => void;
  aoCriar: () => void;
  aoAtualizar: () => void;
  aoSair: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);

  async function tentar(acao: () => Promise<unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      aoAtualizar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu certo");
    } finally {
      setOcupado(false);
    }
  }

  // Uma posição por slot: os ocupados primeiro, depois as vagas livres, e por
  // fim o cadeado do próximo — que só aparece se ainda cabe comprar.
  const vagas = Math.max(0, conta.slots.total - personagens.length);
  const cabeMais = conta.slots.total < conta.slots.maximo;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* Sem versalete: e-mail em maiúsculas fica ilegível e não é um
              rótulo, é um dado. */}
          <p className="text-[0.75rem] tracking-wide text-tinta-fraca">
            {conta.email}
          </p>
          <h1 className="titulo mt-1 text-4xl leading-tight sm:text-5xl">
            Seus personagens
          </h1>
          <p className="mt-2 text-[0.88rem] text-tinta-fraca">
            {personagens.length} de {conta.slots.total} slots
            {conta.slots.comprados > 0
              ? ` · ${conta.slots.gratis} grátis e ${conta.slots.comprados} comprado${conta.slots.comprados > 1 ? "s" : ""}`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="recurso recurso-ouro">
            <span className="recurso-valor">{n(conta.premium)}</span>
            <span className="rotulo">premium</span>
          </span>
          <button type="button" onClick={aoSair} className="botao">
            Sair
          </button>
        </div>
      </header>

      {erro && <p className="painel mb-6 p-4 text-[0.88rem] text-sangue">{erro}</p>}

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {personagens.map((p) => {
          const paleta = PALETAS[p.classe.ramo];
          const noTumulo = p.estado === "tumulo";
          const confirmando = apagando === p.id;

          return (
            <li key={p.id}>
              <article className={`slot ${noTumulo ? "slot-tumulo" : ""}`}>
                <button
                  type="button"
                  onClick={() => aoEscolher(p)}
                  className="slot-abrir"
                >
                  <Vitral
                    classe={p.classe.indice}
                    largura={86}
                    aceso={!noTumulo}
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="rotulo block">
                      {noTumulo
                        ? "no túmulo"
                        : p.camada === 0
                          ? "primeira vida"
                          : `camada ${p.camada}`}
                    </span>
                    <strong className="titulo mt-1 block truncate text-2xl font-normal">
                      {p.nome}
                    </strong>
                    <span
                      className="mt-0.5 block text-[0.85rem]"
                      style={{ color: paleta.brilho }}
                    >
                      {p.classe.nome} · nível {p.nivel}
                    </span>
                    <span className="mt-2 block text-[0.78rem] text-tinta-fraca">
                      {n(p.sucata)} de sucata
                      {p.mortes > 0 &&
                        ` · ${p.mortes} morte${p.mortes > 1 ? "s" : ""}`}
                    </span>
                  </span>
                </button>

                {/* Dois cliques: apagar leva junto todas as camadas, e não
                    volta. Um clique acidental não pode custar isso. */}
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    if (!confirmando) {
                      setApagando(p.id);
                      setTimeout(
                        () => setApagando((atual) => (atual === p.id ? null : atual)),
                        5000,
                      );
                      return;
                    }
                    setApagando(null);
                    void tentar(() => api.apagar(p.id));
                  }}
                  className={`slot-apagar ${confirmando ? "slot-apagar-armado" : ""}`}
                >
                  {confirmando ? "clique de novo — não volta" : "apagar"}
                </button>
              </article>
            </li>
          );
        })}

        {Array.from({ length: vagas }, (_, i) => (
          <li key={`vaga${i}`}>
            <button type="button" onClick={aoCriar} className="slot slot-vago">
              <span className="slot-cruz" aria-hidden="true">
                +
              </span>
              <span className="titulo text-2xl">Slot livre</span>
              <span className="text-[0.82rem] text-tinta-fraca">
                Criar um personagem
              </span>
            </button>
          </li>
        ))}

        {cabeMais && (
          <li>
            <div className="slot slot-fechado">
              <span className="slot-cadeado" aria-hidden="true">
                ⟡
              </span>
              <span className="titulo text-2xl">Mais um slot</span>
              <span className="text-[0.82rem] leading-relaxed text-tinta-fraca">
                {/* O preço sobe a cada compra: slot é permanente, e a preço
                    fixo a decisão de qual personagem manter sumiria. */}
                Permanente. O seguinte custa mais.
              </span>
              <button
                type="button"
                disabled={!conta.slots.podeComprar || ocupado}
                onClick={() => tentar(() => api.comprarSlot())}
                className="botao mt-1"
                title={conta.slots.impedimento ?? "Comprar este slot"}
              >
                Comprar por {n(conta.slots.precoDoProximo)}
              </button>
              {/* O motivo embaixo do botão, e não DENTRO dele: botão que
                  muda de texto para explicar por que está apagado deixa de
                  dizer o que faz. */}
              {conta.slots.impedimento && (
                <span className="text-[0.75rem] text-tinta-fraca">
                  {conta.slots.impedimento}
                </span>
              )}
            </div>
          </li>
        )}
      </ul>

      <p className="mt-10 text-[0.8rem] leading-relaxed text-tinta-fraca">
        Morrer num julgamento é permanente. O personagem fica no túmulo com
        tudo intacto e volta pagando o revive — ou você apaga e abre a vaga,
        perdendo as camadas. A moeda comprada é da conta e sobrevive aos dois
        caminhos.
      </p>
    </main>
  );
}
