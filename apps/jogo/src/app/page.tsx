"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type Batalha,
  ErroDaApi,
  esquecerId,
  guardarId,
  idGuardado,
  type Personagem,
  type Resultado,
} from "@/lib/api";
import { Arvore } from "@/componentes/Arvore";
import { Combate } from "@/componentes/Combate";
import { Criacao } from "@/componentes/Criacao";
import { Ficha } from "@/componentes/Ficha";

/**
 * O jogo.
 *
 * Três telas, e a que aparece depende só do estado: sem personagem, criação;
 * com batalha em curso, combate; no resto, a ficha. Nenhuma regra de jogo mora
 * aqui — quem decide é o servidor, e esta página pede e mostra.
 */
export default function Jogo() {
  const [p, setP] = useState<Personagem | null>(null);
  const [batalha, setBatalha] = useState<Batalha | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [naArvore, setNaArvore] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Retoma o personagem guardado. Um id que não existe mais no servidor é
  // esquecido em silêncio, senão a pessoa fica presa numa tela de erro.
  useEffect(() => {
    const id = idGuardado();
    if (!id) {
      setCarregando(false);
      return;
    }
    api
      .buscar(id)
      .then(setP)
      .catch((e: ErroDaApi) => {
        if (e.status === 404) esquecerId();
        else setErro(e.message);
      })
      .finally(() => setCarregando(false));
  }, []);

  const criado = useCallback((novo: Personagem) => {
    guardarId(novo.id);
    setP(novo);
  }, []);

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
    } catch {
      /* a ficha segue com o que tem; a próxima carga corrige */
    }
  }

  if (carregando) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="rotulo">abrindo as portas…</p>
      </main>
    );
  }

  if (!p) return <Criacao aoCriar={criado} />;

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
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
            aoAtualizar={setP}
            aoLutar={lutar}
            aoAbrirArvore={() => setNaArvore(true)}
            ocupado={ocupado}
          />
        </>
      )}
    </main>
  );
}
