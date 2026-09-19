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
import { PALETAS } from "@/lib/vitral";
import { Vitral } from "./Vitral";

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
  switch (evento.tipo) {
    case "rodada":
      return `— rodada ${evento.numero} —`;
    case "usou":
      return `${quem(evento.quem)} usa ${evento.habilidade}`;
    case "dano":
      return evento.fonte === "efeito"
        ? `${quem(evento.alvo)} sofre ${evento.valor} do que carrega`
        : `${quem(evento.alvo)} leva ${evento.valor}${evento.critico ? " — crítico!" : ""}`;
    case "cura":
      return `${quem(evento.alvo)} recupera ${evento.valor}`;
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
}: {
  c: Combatente;
  cor: string;
  classe: number | null;
  espelhado?: boolean;
}) {
  const fracao = Math.max(0, c.vida / c.vidaMaxima);
  const caido = c.vida <= 0;

  return (
    <div
      className={`flex flex-1 flex-col gap-3 ${espelhado ? "items-end text-right" : "items-start"}`}
    >
      <div
        className="transition-all duration-500"
        style={{
          opacity: caido ? 0.2 : 0.35 + fracao * 0.65,
          filter: caido ? "grayscale(1)" : `saturate(${0.5 + fracao * 0.8})`,
        }}
      >
        {classe !== null ? (
          <Vitral classe={classe} tamanho={104} aceso={fracao > 0.35} />
        ) : (
          <SeloDaSombra intensidade={fracao} />
        )}
      </div>

      <div className="w-full">
        <div
          className={`mb-2 flex items-baseline gap-3 ${espelhado ? "flex-row-reverse" : ""}`}
        >
          <span className="titulo text-2xl leading-none">{c.nome}</span>
          <span className="rotulo">
            {c.vida} / {c.vidaMaxima}
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
              <li key={`${e.tipo}${i}`} className="rotulo text-ouro">
                {NOME_DO_EFEITO[e.tipo] ?? e.tipo} · {e.rodadas}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** O inimigo não tem classe, então não tem vitral: tem um selo que se apaga. */
function SeloDaSombra({ intensidade }: { intensidade: number }) {
  return (
    <svg viewBox="0 0 104 104" width={104} height={104} aria-hidden="true">
      <defs>
        <radialGradient id="sombra" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c8372b" stopOpacity={0.5 * intensidade} />
          <stop offset="70%" stopColor="#3d0c0a" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#0a0810" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="52" cy="52" r="48" fill="url(#sombra)" />
      {/* Estilhaços, como um vitral quebrado: o oposto exato do herói. */}
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const r1 = 16 + (i % 3) * 8;
        const r2 = 40 + (i % 4) * 4;
        return (
          <path
            key={i}
            d={`M 52 52 L ${52 + Math.cos(a) * r1} ${52 + Math.sin(a) * r1} L ${52 + Math.cos(a + 0.42) * r2} ${52 + Math.sin(a + 0.42) * r2} Z`}
            fill="#7d1a16"
            fillOpacity={0.3 + (i % 3) * 0.16}
            stroke="#240b08"
            strokeWidth="1.6"
          />
        );
      })}
      <circle cx="52" cy="52" r="48" fill="none" stroke="#240b08" strokeWidth="4" />
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
        {heroi && <Retrato c={heroi} cor={cor} classe={classe} />}
        <span className="rotulo shrink-0 self-center sm:pt-12">
          rodada {estado.rodada}
        </span>
        {vilao && (
          <Retrato c={vilao} cor="var(--color-sangue)" classe={null} espelhado />
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
                    className="botao"
                  >
                    {h.nome}
                    {/* A espera aparece no botão apagado em vez de o botão
                        sumir: some, e a pessoa não entende o que perdeu. */}
                    {espera > 0 && <span className="ml-2 text-tinta-fraca">{espera}</span>}
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
