"use client";

import { useState } from "react";
import { api, type Entrada as Sessao, ErroDaApi } from "@/lib/api";

/**
 * A porta.
 *
 * Um formulário só, com um interruptor entre entrar e criar conta. Duas
 * telas separadas para dois campos iguais é ida e volta por nada — e quem
 * erra o lado descobre com um erro, não com uma navegação.
 *
 * O botão diz o que vai acontecer ("Entrar" / "Criar conta") em vez de
 * "Enviar": num formulário de duas funções, o verbo do botão é a única
 * coisa que confirma em qual das duas se está.
 */
export function Entrada({ aoEntrar }: { aoEntrar: (s: Sessao) => void }) {
  const [novo, setNovo] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      aoEntrar(
        novo
          ? await api.cadastrar(email, senha)
          : await api.entrar(email, senha),
      );
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "não deu para entrar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="surge w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="rotulo">Chaos Trials</p>
          <h1 className="titulo mt-2 text-5xl leading-tight">
            {novo ? "Uma vida nova" : "De volta à nave"}
          </h1>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-tinta-fraca">
            {novo
              ? "A conta guarda suas moedas compradas e seus slots. Os personagens morrem; ela não."
              : "Seus personagens estão onde você os deixou — inclusive os que estão no túmulo."}
          </p>
        </header>

        <form onSubmit={enviar} className="painel flex flex-col gap-5 p-6">
          <label className="flex flex-col gap-2">
            <span className="rotulo">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="campo"
              placeholder="voce@exemplo.com"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="rotulo">Senha</span>
            <input
              type="password"
              required
              /* `new-password` no cadastro faz o gerenciador oferecer uma
                 senha forte; `current-password` na entrada faz ele preencher
                 a que já existe. Trocar os dois quebra os dois. */
              autoComplete={novo ? "new-password" : "current-password"}
              minLength={novo ? 8 : undefined}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="campo"
              placeholder={novo ? "pelo menos 8 caracteres" : "sua senha"}
            />
            {novo && (
              <span className="text-[0.75rem] text-tinta-fraca">
                Só o tamanho importa. Uma frase comprida vale mais que
                &ldquo;Senha1!&rdquo;.
              </span>
            )}
          </label>

          {erro && <p className="text-[0.85rem] text-sangue">{erro}</p>}

          <button
            type="submit"
            disabled={ocupado}
            className="botao botao-grande justify-center"
          >
            {ocupado ? "um momento…" : novo ? "Criar conta" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-[0.85rem] text-tinta-fraca">
          {novo ? "Já tem conta?" : "Primeira vez?"}{" "}
          <button
            type="button"
            onClick={() => {
              setNovo(!novo);
              setErro(null);
            }}
            className="underline decoration-ouro/50 underline-offset-4 hover:text-ouro-claro"
          >
            {novo ? "entrar" : "criar uma conta"}
          </button>
        </p>
      </div>
    </main>
  );
}
