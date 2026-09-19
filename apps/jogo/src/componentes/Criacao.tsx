"use client";

import { useEffect, useState } from "react";
import { api, ErroDaApi, type Personagem } from "@/lib/api";
import { PALETAS } from "@/lib/vitral";
import { Vitral } from "./Vitral";

/** O que cada raiz é, em uma frase — a escolha precisa significar algo. */
const ESSENCIA: Record<number, string> = {
  1: "Sabe. O intelecto rasga o que a força não alcança.",
  2: "Sustenta. A presença decide quem continua de pé.",
  3: "Acerta. A destreza encontra a fresta antes de todos.",
  4: "Quebra. A força não negocia com o que está na frente.",
  5: "Aguenta. O vigor transforma o tempo em arma.",
};

export function Criacao({ aoCriar }: { aoCriar: (p: Personagem) => void }) {
  const [raizes, setRaizes] = useState<{ indice: number; nome: string }[]>([]);
  const [classe, setClasse] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .classes()
      .then((r) => setRaizes(r.raizes))
      .catch((e: ErroDaApi) => setErro(e.message));
  }, []);

  async function criar() {
    if (classe === null) return;
    setEnviando(true);
    setErro(null);
    try {
      aoCriar(await api.criar(nome.trim(), classe));
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu para criar");
      setEnviando(false);
    }
  }

  const escolhida = raizes.find((r) => r.indice === classe);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-6 py-16">
      <header className="surge mb-14 text-center">
        <p className="rotulo">Chaos Trials</p>
        <h1 className="titulo mt-4 text-5xl leading-tight sm:text-6xl">
          Escolha o que você é
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[0.95rem] leading-relaxed text-tinta-fraca">
          A raiz decide como você luta. Ela se ramifica em 45 caminhos, e você
          só conhece os seus vivendo até eles. Perder um julgamento é
          permanente.
        </p>
      </header>

      {erro && !raizes.length && (
        <p className="painel mx-auto max-w-md p-5 text-center text-[0.9rem] text-sangue">
          {erro}
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {raizes.map((r, i) => {
          const ativa = classe === r.indice;
          return (
            <li key={r.indice} className="surge" style={{ animationDelay: `${i * 70}ms` }}>
              <button
                type="button"
                onClick={() => setClasse(r.indice)}
                aria-pressed={ativa}
                className={`painel flex w-full flex-col items-center gap-4 p-5 transition-colors ${
                  ativa ? "border-ouro" : "hover:border-tinta-fraca"
                }`}
              >
                <Vitral classe={r.indice} tamanho={116} aceso={ativa} />
                <span className="titulo text-2xl">{r.nome}</span>
                <span className="text-[0.78rem] leading-snug text-tinta-fraca">
                  {ESSENCIA[r.indice]}
                </span>
                <span
                  className="rotulo"
                  style={{ color: ativa ? PALETAS[r.indice as 1].brilho : undefined }}
                >
                  {ativa ? "escolhida" : " "}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {escolhida && (
        <div className="surge mx-auto mt-12 flex w-full max-w-md flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="rotulo">Seu nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={24}
              placeholder="entre 2 e 24 letras"
              className="painel px-4 py-3 text-[0.95rem] outline-none focus:border-ouro"
            />
          </label>

          {erro && <p className="text-[0.85rem] text-sangue">{erro}</p>}

          <button
            type="button"
            onClick={criar}
            disabled={nome.trim().length < 2 || enviando}
            className="botao"
          >
            {enviando ? "entrando…" : `Começar como ${escolhida.nome}`}
          </button>
        </div>
      )}
    </main>
  );
}
