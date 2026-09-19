/**
 * Roda os testes do pacote de onde for chamado.
 *
 * Existe porque o Node 20 não resolve isto sozinho: `--test` com glob depende
 * do shell expandir, e o cmd.exe do Windows não expande; e `--test` com
 * diretório descobre `.js`, nunca `.ts`. Enumerar aqui funciona igual nos dois
 * sistemas e não depende de como o npm chamou o script.
 *
 * Sai quando o Node passar a descobrir TypeScript por conta própria.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const PASTA = "testes";

const arquivos = readdirSync(PASTA)
  .filter((nome) => nome.endsWith(".test.ts"))
  .sort()
  .map((nome) => join(PASTA, nome));

if (arquivos.length === 0) {
  console.error(`nenhum teste em ${PASTA}/`);
  process.exit(1);
}

const resultado = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-reporter=spec", ...arquivos],
  { stdio: "inherit" },
);

process.exit(resultado.status ?? 1);
