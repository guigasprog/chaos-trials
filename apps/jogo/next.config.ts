import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const config: NextConfig = {
  turbopack: { root: raiz },
  // O domínio é publicado como TypeScript cru — é código nosso, no mesmo
  // repositório, e um passo de build por pacote compartilhado só atrasaria.
  transpilePackages: ["@chaos/dominio"],
};

export default config;
