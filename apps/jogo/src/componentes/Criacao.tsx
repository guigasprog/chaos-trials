"use client";

import { useEffect, useState } from "react";
import { api, ErroDaApi, type Personagem } from "@/lib/api";
import { PALETAS } from "@/lib/vitral";
import { ArteDaClasse, vitralComoUrl } from "./Vitral";

/** O que cada raiz é, em uma frase — a escolha precisa significar algo. */
const ESSENCIA: Record<number, string> = {
  1: "Sabe. O intelecto rasga o que a força não alcança.",
  2: "Sustenta. A presença decide quem continua de pé.",
  3: "Acerta. A destreza encontra a fresta antes de todos.",
  4: "Quebra. A força não negocia com o que está na frente.",
  5: "Aguenta. O vigor transforma o tempo em arma.",
};

/** O atributo que o ramo favorece, para a lâmina aberta dizer o porquê. */
const ATRIBUTO: Record<number, string> = {
  1: "Intelecto",
  2: "Presença",
  3: "Destreza",
  4: "Força",
  5: "Vigor",
};

type Dificuldade = "facil" | "medio" | "dificil";

/** Fixa depois de escolhida: muda a curva de monstro e de recompensa, e
    trocar no meio da vida do personagem quebraria a curva medida. */
const DIFICULDADES: {
  id: Dificuldade;
  nome: string;
  vidas: number;
  descricao: string;
}[] = [
  { id: "facil", nome: "Fácil", vidas: 3, descricao: "Monstros mais fracos. Prêmio menor." },
  { id: "medio", nome: "Médio", vidas: 2, descricao: "O equilíbrio de sempre." },
  { id: "dificil", nome: "Difícil", vidas: 1, descricao: "Monstros mais fortes. Prêmio bem maior." },
];

/**
 * A escolha da classe como faixa de lâminas inclinadas.
 *
 * As cinco se encaixam em vez de ficarem lado a lado: o corte diagonal de uma
 * é o da vizinha, então a faixa lê como um vitral inteiro repartido, e não
 * como cinco cartões soltos. Tamanho é o mesmo para todas por construção — a
 * largura vem do `flex`, não de conteúdo, então nenhuma classe fica maior
 * porque o texto dela é mais longo.
 *
 * O detalhe abre no hover porque cinco descrições abertas ao mesmo tempo
 * competem entre si; uma de cada vez é leitura, cinco é ruído.
 */
export function Criacao({
  aoCriar,
  aoVoltar,
}: {
  aoCriar: (p: Personagem) => void;
  /** Ausente na primeira criação da conta: não há prateleira para voltar. */
  aoVoltar?: () => void;
}) {
  const [raizes, setRaizes] = useState<{ indice: number; nome: string }[]>([]);
  const [classe, setClasse] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [dificuldade, setDificuldade] = useState<Dificuldade>("medio");
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
      aoCriar(await api.criar(nome.trim(), classe, dificuldade));
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu para criar");
      setEnviando(false);
    }
  }

  const escolhida = raizes.find((r) => r.indice === classe);
  // Aberta é a que o ponteiro visita; sem ponteiro, a escolhida. No toque não
  // existe hover, e sem esta segunda regra a faixa ficaria sempre fechada.
  const aberta = sobre ?? classe;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1400px] flex-col justify-center gap-10 px-4 py-12">
      {aoVoltar && (
        <button
          type="button"
          onClick={aoVoltar}
          className="botao surge self-start"
        >
          Voltar aos personagens
        </button>
      )}

      <header className="surge text-center">
        <p className="rotulo">Chaos Trials</p>
        <h1 className="titulo mt-3 text-5xl leading-tight sm:text-6xl">
          Escolha o que você é
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-tinta-fraca">
          A raiz decide como você luta. Ela se ramifica em 45 caminhos, e você
          só conhece os seus vivendo até eles. Toda luta arrisca uma vida —
          quantas você tem é a dificuldade que escolher a seguir.
        </p>
      </header>

      {erro && !raizes.length && (
        <p className="painel mx-auto max-w-md p-5 text-center text-[0.9rem] text-sangue">
          {erro}
        </p>
      )}

      {raizes.length > 0 && (
        <div className="faixa surge" onMouseLeave={() => setSobre(null)}>
          {raizes.map((r, i) => {
            const paleta = PALETAS[r.indice as 1];
            const estaAberta = aberta === r.indice;
            const escolhidaAqui = classe === r.indice;

            return (
              <button
                key={r.indice}
                type="button"
                onClick={() => setClasse(r.indice)}
                onMouseEnter={() => setSobre(r.indice)}
                onFocus={() => setSobre(r.indice)}
                aria-pressed={escolhidaAqui}
                className={`lamina ${estaAberta ? "lamina-aberta" : ""} ${
                  escolhidaAqui ? "lamina-escolhida" : ""
                }`}
                style={
                  {
                    "--acento": paleta.brilho,
                    "--fundo": paleta.fundo,
                    // O `z-index` cresce para a direita, então a borda de luz
                    // de cada lâmina fica por cima da vizinha, e não por baixo.
                    zIndex: estaAberta ? 20 : 10 - i,
                    backgroundImage: `url("${vitralComoUrl(r.indice, 420)}")`,
                  } as React.CSSProperties
                }
              >
                {/* A ilustração, quando existe. O vitral gerado fica no
                    `background` por baixo, e aparece sozinho quando não há
                    arquivo — ver public/classes/LEIA-ME.md. */}
                <ArteDaClasse classe={r.indice} />

                <span className="lamina-conteudo">
                  <span className="titulo text-3xl leading-none">{r.nome}</span>

                  <span className="lamina-detalhe">
                    <span className="rotulo" style={{ color: paleta.brilho }}>
                      {ATRIBUTO[r.indice]}
                    </span>
                    <span className="mt-2 block text-[0.84rem] leading-snug text-tinta">
                      {ESSENCIA[r.indice]}
                    </span>
                    <span className="rotulo mt-4 block">
                      {escolhidaAqui ? "escolhida" : "clique para escolher"}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {escolhida && (
        <div className="surge mx-auto flex w-full max-w-md flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="rotulo">Seu nome</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={24}
              placeholder="entre 2 e 24 letras"
              /* O mesmo campo da porta: afundado, borda de 2px. Antes era um
                 `.painel`, e painel é onde a informação SAI — campo é onde
                 ela entra, e as duas coisas não podem ter a mesma forma. */
              className="campo"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="rotulo">Dificuldade</span>
            {/* Fixa depois de criado — não é um filtro de batalha, é o
                personagem inteiro. Por isso pede decisão aqui, não "troco
                depois se não gostar". */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {DIFICULDADES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDificuldade(d.id)}
                  aria-pressed={dificuldade === d.id}
                  className={`painel flex-1 p-3 text-left transition-colors ${
                    dificuldade === d.id ? "border-ouro" : ""
                  }`}
                >
                  <span className="flex items-baseline justify-between">
                    <span className="titulo text-lg">{d.nome}</span>
                    <span className="rotulo">
                      {d.vidas} vida{d.vidas > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="mt-1 block text-[0.78rem] text-tinta-fraca">
                    {d.descricao}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {erro && <p className="text-[0.85rem] text-sangue">{erro}</p>}

          <button
            type="button"
            onClick={criar}
            disabled={nome.trim().length < 2 || enviando}
            className="botao botao-grande justify-center"
          >
            {enviando ? "entrando…" : `Começar como ${escolhida.nome}`}
          </button>
        </div>
      )}
    </main>
  );
}
