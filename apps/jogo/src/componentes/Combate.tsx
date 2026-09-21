"use client";

import { useEffect, useRef, useState } from "react";
import {
  api,
  type Batalha,
  type Combatente,
  ErroDaApi,
  type EstadoDaBatalha,
  type Evento,
  type Resultado,
} from "@/lib/api";
import { n } from "@/lib/numero";
import { OGIVA, PALETAS } from "@/lib/vitral";
import { PROPORCAO, Vitral } from "./Vitral";

/**
 * A tela de combate.
 *
 * O cliente não decide nada — manda a habilidade escolhida e recebe o estado
 * novo com o log. O que ele faz é narrar: transforma a lista de eventos em
 * frases, porque números pulando sem explicação não contam história nenhuma.
 */

const NOME_DO_EFEITO: Record<string, string> = {
  veneno: "envenenado",
  queimadura: "em chamas",
  reforco: "reforçado",
  fraqueza: "enfraquecido",
  atordoamento: "atordoado",
  oculto: "oculto",
};

function narrar(evento: Evento, nomes: Record<string, string>): string | null {
  const quem = (id: unknown) => nomes[String(id)] ?? String(id);
  // O log é onde mais se lê número, e é onde uma casa decimal do servidor
  // apareceria primeiro.
  const val = (v: unknown) => (typeof v === "number" ? n(v) : String(v));
  switch (evento.tipo) {
    case "rodada":
      return `— rodada ${evento.numero} —`;
    case "usou":
      return `${quem(evento.quem)} usa ${evento.habilidade}`;
    case "dano":
      return evento.fonte === "efeito"
        ? `${quem(evento.alvo)} sofre ${val(evento.valor)} do que carrega`
        : `${quem(evento.alvo)} leva ${val(evento.valor)}${evento.critico ? " — crítico!" : ""}`;
    case "cura":
      return `${quem(evento.alvo)} recupera ${val(evento.valor)}`;
    case "efeito":
      return `${quem(evento.alvo)} fica ${NOME_DO_EFEITO[String(evento.efeito)] ?? evento.efeito}`;
    case "resistiu":
      return `${quem(evento.alvo)} resiste`;
    case "expirou":
      return `${quem(evento.alvo)} se livra de ${NOME_DO_EFEITO[String(evento.efeito)] ?? evento.efeito}`;
    case "limpou":
      return `${quem(evento.alvo)} se purga`;
    case "impedido":
      return `${quem(evento.quem)} não consegue agir`;
    case "morreu":
      return `${quem(evento.quem)} cai`;
    default:
      return null;
  }
}

/** Um número que sobe sobre um retrato e some. */
interface Golpe {
  chave: number;
  alvo: string;
  valor: number;
  tipo: "dano" | "critico" | "cura";
}

/** Quanto tempo o número fica na tela. Igual à animação em `globals.css`. */
const GOLPE_MS = 1000;

/**
 * Chave crescente e global.
 *
 * Fora do componente porque o compilador do React não deixa mutar valor
 * vindo de hook, e porque a unicidade só precisa valer dentro da página.
 */
let proximaChave = 0;

/**
 * Um combatente como retrato: a peça de vitral, o nome e a vida.
 *
 * O vitral apaga conforme a vida cai — é o mesmo vidro perdendo a luz que
 * vinha de trás. Custa nada e diz o estado antes de a pessoa ler o número.
 */
function Retrato({
  c,
  cor,
  classe,
  espelhado = false,
  golpes = [],
}: {
  c: Combatente;
  cor: string;
  classe: number | null;
  espelhado?: boolean;
  /** Os números que sobem por cima deste combatente agora. */
  golpes?: Golpe[];
}) {
  const fracao = Math.max(0, c.vida / c.vidaMaxima);
  const caido = c.vida <= 0;
  const apanhando = golpes.some((g) => g.tipo !== "cura");

  return (
    <div
      className={`flex flex-1 flex-col gap-3 ${espelhado ? "items-end text-right" : "items-start"}`}
    >
      <div
        className={`relative transition-all duration-500 ${apanhando ? "tremer" : ""}`}
        style={{
          opacity: caido ? 0.2 : 0.35 + fracao * 0.65,
          filter: caido ? "grayscale(1)" : `saturate(${0.5 + fracao * 0.8})`,
        }}
      >
        {classe !== null ? (
          <Vitral classe={classe} largura={92} aceso={fracao > 0.35} />
        ) : (
          <SeloDaSombra intensidade={fracao} />
        )}

        {/* Os números sobem sobre o retrato, e não no log.
            O log conta a história depois; isto é o que se sente na hora, e é
            a diferença entre uma tabela que muda de valor e uma pancada. */}
        {golpes.map((g, i) => (
          <span
            key={g.chave}
            className={`golpe golpe-${g.tipo}`}
            style={{
              // Escalonados: dois números no mesmo pixel viram um borrão.
              left: `${28 + ((i * 37) % 44)}%`,
              animationDelay: `${i * 90}ms`,
            }}
          >
            {g.tipo === "cura" ? "+" : "−"}
            {n(g.valor)}
          </span>
        ))}
      </div>

      <div className="w-full">
        <div
          className={`mb-2 flex items-baseline gap-3 ${espelhado ? "flex-row-reverse" : ""}`}
        >
          <span className="titulo text-2xl leading-none">{c.nome}</span>
          {/* Tabular e do tamanho de número de jogo: a vida é o valor que a
              pessoa persegue a cada turno, e em versalete miúdo ela some. */}
          <span
            className="text-[1.05rem] leading-none tabular-nums"
            style={{ color: fracao > 0.3 ? "var(--color-tinta)" : "#f0938a" }}
          >
            {n(c.vida)}
            <span className="text-[0.8rem] text-tinta-fraca">
              {" "}
              / {n(c.vidaMaxima)}
            </span>
          </span>
        </div>
        <div className="barra">
          <div
            style={{
              width: `${fracao * 100}%`,
              background: fracao > 0.3 ? cor : "var(--color-sangue)",
              marginLeft: espelhado ? "auto" : undefined,
            }}
          />
        </div>
        {c.efeitos.length > 0 && (
          <ul
            className={`mt-2 flex flex-wrap gap-2 ${espelhado ? "justify-end" : ""}`}
          >
            {c.efeitos.map((e, i) => (
              <li key={`${e.tipo}${i}`} className="efeito">
                {NOME_DO_EFEITO[e.tipo] ?? e.tipo} · {e.rodadas}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * O inimigo não tem classe, então não tem vitral: tem a mesma janela, quebrada.
 *
 * Na mesma ogiva e na mesma caixa do `Vitral` (92 × 138) de propósito. Quando
 * eram um retrato alto e um disco de 104, as duas colunas do combate tinham
 * alturas diferentes e nada se alinhava — o inimigo flutuava acima do herói.
 * Além do alinhamento, a forma repetida é o que faz a leitura: é a janela do
 * herói com o vidro estilhaçado.
 */
function SeloDaSombra({
  intensidade,
  largura = 92,
}: {
  intensidade: number;
  largura?: number;
}) {
  return (
    <svg
      viewBox="0 0 200 300"
      width={largura}
      height={largura * PROPORCAO}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="sombra" cx="50%" cy="55%" r="62%">
          <stop offset="0%" stopColor="#c8372b" stopOpacity={0.55 * intensidade} />
          <stop offset="70%" stopColor="#3d0c0a" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#0a0810" stopOpacity="0.9" />
        </radialGradient>
        <clipPath id="sombra-ogiva">
          <path d={OGIVA} />
        </clipPath>
      </defs>

      <path d={OGIVA} fill="url(#sombra)" />

      {/* Estilhaços, como um vitral quebrado: o oposto exato do herói. Os
          raios passam da moldura de propósito e o recorte os corta — é
          assim que o estilhaço encosta no chumbo em vez de parar antes. */}
      <g clipPath="url(#sombra-ogiva)">
        {Array.from({ length: 13 }, (_, i) => {
          const a = (i / 13) * Math.PI * 2 - Math.PI / 2;
          const r1 = 26 + (i % 3) * 18;
          const r2 = 200 + (i % 4) * 22;
          const cx = 100;
          const cy = 158;
          return (
            <path
              key={i}
              d={`M ${cx} ${cy} L ${cx + Math.cos(a) * r1} ${cy + Math.sin(a) * r1} L ${cx + Math.cos(a + 0.38) * r2} ${cy + Math.sin(a + 0.38) * r2} Z`}
              fill="#7d1a16"
              fillOpacity={0.28 + (i % 3) * 0.16}
              stroke="#240b08"
              strokeWidth="3"
            />
          );
        })}
      </g>

      {/* O chumbo da moldura, nas mesmas espessuras do vitral gerado — a
          janela do inimigo continua sendo a mesma janela. */}
      <path d={OGIVA} fill="none" stroke="#240b08" strokeWidth="8" />
      <path
        d={OGIVA}
        fill="none"
        stroke="#4a1512"
        strokeWidth="1.6"
        strokeOpacity="0.7"
      />
    </svg>
  );
}

export function Combate({
  batalha,
  ramo,
  classe,
  aoTerminar,
}: {
  batalha: Batalha;
  ramo: 1 | 2 | 3 | 4 | 5;
  classe: number;
  aoTerminar: (r: Resultado) => void;
}) {
  const [estado, setEstado] = useState<EstadoDaBatalha>(batalha.estado);
  const [registro, setRegistro] = useState<string[]>([]);
  const [golpes, setGolpes] = useState<Golpe[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  const nomes = Object.fromEntries(
    batalha.estado.combatentes.map((c) => [c.id, c.nome]),
  );
  const cor = PALETAS[ramo].brilho;

  /** Acrescenta ao log e rola para o fim — o que acabou de acontecer importa. */
  function registrar(eventos: Evento[]) {
    const frases = eventos.map((e) => narrar(e, nomes)).filter(Boolean) as string[];
    if (frases.length > 0) setRegistro((antes) => [...antes, ...frases]);
    mostrarGolpes(eventos);
  }

  /**
   * Os números que sobem sobre os retratos.
   *
   * Saem dos mesmos eventos que viram frase no log — nada de novo é pedido
   * ao servidor. Somem sozinhos depois de `GOLPE_MS`; o `setTimeout` limpa
   * pela chave, e não por índice, porque outra leva pode chegar antes desta
   * terminar.
   */
  function mostrarGolpes(eventos: Evento[]) {
    const novos = eventos.flatMap<Golpe>((e) => {
      if (e.tipo !== "dano" && e.tipo !== "cura") return [];
      if (typeof e.valor !== "number" || e.valor <= 0) return [];
      proximaChave += 1;
      return [
        {
          chave: proximaChave,
          alvo: String(e.alvo),
          valor: e.valor,
          tipo: e.tipo === "cura" ? "cura" : e.critico ? "critico" : "dano",
        },
      ];
    });
    if (novos.length === 0) return;

    setGolpes((antes) => [...antes, ...novos]);
    const chaves = new Set(novos.map((g) => g.chave));
    setTimeout(
      () => setGolpes((antes) => antes.filter((g) => !chaves.has(g.chave))),
      GOLPE_MS + novos.length * 90,
    );
  }

  useEffect(() => {
    registrar(batalha.eventos);
    if (batalha.resultado) aoTerminar(batalha.resultado);
    // Só na montagem: os eventos da abertura chegam uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [registro]);

  async function agir(habilidade: string) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.agir(batalha.id, habilidade);
      setEstado(r.estado);
      registrar(r.eventos);
      if (r.resultado) aoTerminar(r.resultado);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "o turno não passou");
    } finally {
      setOcupado(false);
    }
  }

  const heroi = estado.combatentes.find((c) => c.lado === "jogador");
  const vilao = estado.combatentes.find((c) => c.lado === "inimigo");

  return (
    <section className="surge flex flex-col gap-8">
      {batalha.mortal && (
        <p className="painel border-sangue/60 px-5 py-3 text-center text-[0.85rem] text-sangue">
          Julgamento. Perder aqui é permanente.
        </p>
      )}

      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-8">
        {heroi && (
          <Retrato
            c={heroi}
            cor={cor}
            classe={classe}
            golpes={golpes.filter((g) => g.alvo === heroi.id)}
          />
        )}
        <span className="selo-nivel shrink-0 self-center sm:mt-10">
          <span>{estado.rodada}</span>
          <small>rodada</small>
        </span>
        {vilao && (
          <Retrato
            c={vilao}
            cor="var(--color-sangue)"
            classe={null}
            espelhado
            golpes={golpes.filter((g) => g.alvo === vilao.id)}
          />
        )}
      </div>

      <div className="painel h-56 overflow-y-auto p-5">
        <ul className="flex flex-col gap-1.5 text-[0.88rem] leading-relaxed">
          {registro.map((frase, i) => (
            <li
              key={i}
              className={
                frase.startsWith("—")
                  ? "rotulo mt-2"
                  : frase.includes("crítico")
                    ? "text-ouro-claro"
                    : "text-tinta-fraca"
              }
            >
              {frase}
            </li>
          ))}
          <div ref={fim} />
        </ul>
      </div>

      {erro && <p className="text-[0.85rem] text-sangue">{erro}</p>}

      {!estado.vencedor && (
        <div>
          <p className="rotulo mb-3">Sua vez</p>
          <ul className="flex flex-wrap gap-3">
            {estado.todas.map((h) => {
              const espera = estado.recargas[h.id] ?? 0;
              const pronta = estado.disponiveis.some((d) => d.id === h.id);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => agir(h.id)}
                    disabled={!pronta || ocupado}
                    title={h.descricao}
                    className="acao"
                    style={{ "--acento": cor } as React.CSSProperties}
                  >
                    <span className="acao-nome">{h.nome}</span>
                    {/* A espera aparece no botão apagado em vez de o botão
                        sumir: some, e a pessoa não entende o que perdeu. */}
                    <span className="acao-espera">
                      {espera > 0 ? `${espera} rodada${espera > 1 ? "s" : ""}` : "pronta"}
                    </span>
                    {/* Depois do texto no DOM de propósito: posicionado no
                        canto, mas lido por último por leitor de tela. */}
                    {espera > 0 && <span className="acao-contador">{espera}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
