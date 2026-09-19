import { caminhoPadrao, emArquivo } from "./armazenamento.ts";
import { criarAplicacao } from "./aplicacao.ts";

/** Sobe o servidor. `CHAOS_PORTA` e `CHAOS_DADOS` ajustam porta e arquivo. */
const porta = Number(process.env.CHAOS_PORTA ?? 3333);
const app = criarAplicacao({
  armazenamento: emArquivo(caminhoPadrao()),
  log: true,
});

// `0.0.0.0` e não o padrão: dentro de contêiner, escutar só em localhost faz o
// servidor parecer morto de fora.
await app.listen({ port: porta, host: "0.0.0.0" });
