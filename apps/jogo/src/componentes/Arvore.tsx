"use client";

import { useState } from "react";
import { api, ErroDaApi, type NoDaArvore, type Personagem } from "@/lib/api";
import { PALETAS } from "@/lib/vitral";

/**
 * A árvore de habilidade.
 *
 * Três tipos de nó, e cada um com marca própria porque a diferença entre eles
 * é a decisão que o jogador está tomando: número que sobe, habilidade nova
 * para usar, ou regra que muda para sempre.
 *
 * O servidor manda cada nó já com `podeComprar` e o motivo de estar fechado —
 * a tela não recalcula requisito nem ponto. Regra duplicada nos dois lados é
 * regra que diverge, e aqui divergir significa o botão prometer algo que o
 * servidor vai recusar.
 */

const MARCA: Record<string, { rotulo: string; sigla: string }> = {
  atributo: { rotulo: "Atributo", sigla: "ATR" },
  magia: { rotulo: "Magia", sigla: "MAG" },
  passiva: { rotulo: "Passiva", sigla: "PAS" },
};

/** Os bônus que valem mostrar, com o nome que o jogador entende. */
const NOME_DO_BONUS: [keyof BonusVisivel, string, (v: number) => string][] = [
  ["danoPercentual", "Dano", (v) => `+${Math.round(v * 100)}%`],
  ["vidaPercentual", "Vida", (v) => `+${Math.round(v * 100)}%`],
  ["criticoAdicional", "Crítico", (v) => `+${Math.round(v * 100)}%`],
  ["reducaoAdicional", "Redução", (v) => `+${Math.round(v * 100)}%`],
  ["roubodeVida", "Roubo de vida", (v) => `+${Math.round(v * 100)}%`],
  ["recargaReduzida", "Recarga", (v) => `−${v}`],
];

interface BonusVisivel {
  danoPercentual: number;
  vidaPercentual: number;
  criticoAdicional: number;
  reducaoAdicional: number;
  roubodeVida: number;
  recargaReduzida: number;
}

/**
 * As linhas que ligam cada nó ao requisito dele.
 *
 * Sem elas a tela é uma grade de cartões, não uma árvore: não dá para ver
 * qual caminho leva onde, e planejar uma build vira adivinhação.
 *
 * Num SVG esticado por cima da grade, com `preserveAspectRatio="none"` e
 * coordenadas em unidades de célula. Assim a linha acompanha o nó onde quer
 * que o `grid` o coloque, sem eu precisar medir pixel nenhum — que quebraria
 * na primeira mudança de largura.
 */
function Ligacoes({
  nos,
  colunas,
  linhas,
  acento,
}: {
  nos: NoDaArvore[];
  colunas: number;
  linhas: number;
  acento: string;
}) {
  const porId = new Map(nos.map((n) => [n.id, n]));

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${colunas} ${linhas}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {nos.flatMap((no) =>
        no.requer.map((idPai) => {
          const pai = porId.get(idPai);
          if (!pai) return null;
          // Acesa quando o requisito já foi comprado: a linha conta o que já
          // está aberto, e não só o que existe no papel.
          const aberta = pai.comprados > 0;
          return (
            <line
              key={`${no.id}-${idPai}`}
              x1={pai.coluna + 0.5}
              y1={pai.linha + 0.5}
              x2={no.coluna + 0.5}
              y2={no.linha + 0.5}
              stroke={aberta ? acento : "#3c3356"}
              strokeOpacity={aberta ? 0.85 : 0.7}
              /*
               * Em PIXEIS, não em unidades de célula.
               *
               * `non-scaling-stroke` diz que a espessura é medida na tela
               * final, e não no espaço do viewBox. Com 0,03 "unidade de
               * célula" escrito aqui, o navegador desenhava três centésimos
               * de pixel — as ligações existiam no DOM e não apareciam em
               * lugar nenhum, e a árvore parecia uma grade de cartões
               * soltos. Foi assim por uma versão inteira.
               */
              strokeWidth={aberta ? 3 : 2}
              vectorEffect="non-scaling-stroke"
            />
          );
        }),
      )}
    </svg>
  );
}

export function Arvore({
  p,
  aoAtualizar,
  aoFechar,
}: {
  p: Personagem;
  aoAtualizar: (p: Personagem) => void;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);
  /** O nó tocado/clicado por último — abre o detalhe, não compra na hora.
      Antes um clique só já gastava o ponto, e a única explicação do nó era
      o `title` do navegador: invisível no toque, e em desktop só depois de
      segurar o mouse parado. */
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const paleta = PALETAS[p.classe.ramo];

  async function comprar(no: NoDaArvore) {
    setComprando(no.id);
    setErro(null);
    try {
      aoAtualizar(await api.evoluirArvore(p.id, no.id));
      setSelecionadoId(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu para comprar");
    } finally {
      setComprando(null);
    }
  }

  const colunas = Math.max(...p.arvore.nos.map((n) => n.coluna)) + 1;
  const linhas = Math.max(...p.arvore.nos.map((n) => n.linha)) + 1;
  const bonus = p.arvore.bonus as unknown as BonusVisivel;
  const ativos = NOME_DO_BONUS.filter(([chave]) => (bonus[chave] ?? 0) > 0);
  const selecionado = p.arvore.nos.find((n) => n.id === selecionadoId) ?? null;

  return (
    <section className="surge flex flex-col gap-6">
      <header className="painel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="rotulo">Árvore de habilidade</p>
          <p className="titulo mt-1 text-3xl">
            <span style={{ color: paleta.brilho }}>{p.arvore.pontos}</span> ponto
            {p.arvore.pontos === 1 ? "" : "s"} para gastar
          </p>
          <p className="mt-1 text-[0.82rem] text-tinta-fraca">
            Um por nível. A árvore inteira custa mais do que uma vida dá.
          </p>
        </div>
        <button type="button" onClick={aoFechar} className="botao">
          Voltar
        </button>
      </header>

      {ativos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {ativos.map(([chave, nome, formatar]) => (
            <li key={chave} className="ficha-bonus">
              <span className="rotulo">{nome}</span>
              <strong className="text-lg" style={{ color: paleta.brilho }}>
                {formatar(bonus[chave])}
              </strong>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="painel p-4 text-[0.88rem] text-sangue">{erro}</p>}

      {selecionado && (
        <div className="painel surge flex flex-col gap-3 p-5" style={{ borderColor: paleta.brilho }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="rotulo">{MARCA[selecionado.tipo]?.rotulo}</p>
              <p className="titulo text-2xl">{selecionado.nome}</p>
            </div>
            <span className="text-[0.82rem] text-tinta-fraca">
              {selecionado.comprados} / {selecionado.graus} graus
            </span>
          </div>

          <p className="text-[0.9rem] leading-relaxed text-tinta-fraca">
            {selecionado.descricao}
          </p>

          {selecionado.impedimento ? (
            <p className="text-[0.85rem] text-sangue">
              {selecionado.impedimento.detalhe}
            </p>
          ) : (
            <p className="text-[0.85rem] text-tinta-fraca">
              Custa {selecionado.custo} ponto{selecionado.custo > 1 ? "s" : ""}.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!selecionado.podeComprar || comprando !== null}
              onClick={() => comprar(selecionado)}
              className="botao botao-grande"
            >
              {comprando === selecionado.id ? "comprando…" : "Confirmar compra"}
            </button>
            <button
              type="button"
              onClick={() => setSelecionadoId(null)}
              className="botao"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <div
        className="relative"
        style={{ "--colunas": colunas, "--linhas": linhas } as React.CSSProperties}
      >
        <Ligacoes nos={p.arvore.nos} colunas={colunas} linhas={linhas} acento={paleta.brilho} />

      <div
        className="grade-arvore"
        style={
          {
            "--colunas": colunas,
            "--linhas": linhas,
            "--acento": paleta.brilho,
          } as React.CSSProperties
        }
      >
        {p.arvore.nos.map((no) => {
          const cheio = no.comprados >= no.graus;
          const comecado = no.comprados > 0;

          return (
            <button
              key={no.id}
              type="button"
              onClick={() => setSelecionadoId(no.id === selecionadoId ? null : no.id)}
              title={no.descricao}
              /* `no-pode` é o convite: com ponto no bolso e requisito
                 cumprido, o nó sai do cinza sozinho. Sem isso, oito pontos
                 para gastar ficavam diante de uma grade inteira apagada, e
                 nada dizia por onde começar. Todo nó é clicável agora — o
                 clique só abre o detalhe acima; quem decide comprar é o
                 botão "Confirmar compra" de lá. */
              className={`no-arvore no-${no.tipo} ${
                no.podeComprar ? "no-pode" : ""
              } ${comecado ? "no-aceso" : ""} ${cheio ? "no-cheio" : ""} ${
                no.id === selecionadoId ? "no-selecionado" : ""
              }`}
              style={{ gridColumn: no.coluna + 1, gridRow: no.linha + 1 }}
            >
              <span className="no-sigla">{MARCA[no.tipo]?.sigla}</span>
              <span className="no-nome">{no.nome}</span>
              <span className="no-graus">
                {no.comprados} / {no.graus}
              </span>
              <span className="no-custo">
                {cheio ? "máximo" : `${no.custo} ponto${no.custo > 1 ? "s" : ""}`}
              </span>
            </button>
          );
        })}
      </div>
      </div>

      <p className="text-[0.8rem] leading-relaxed text-tinta-fraca">
        <strong className="text-tinta">ATR</strong> sobe um número.{" "}
        <strong className="text-tinta">MAG</strong> dá uma habilidade nova para
        usar no turno. <strong className="text-tinta">PAS</strong> muda uma
        regra para sempre — não aparece na barra de ações e é o que mais muda a
        sensação de jogar.
      </p>
    </section>
  );
}
