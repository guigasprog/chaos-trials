"use client";

import { useMemo } from "react";
import { paletaDaClasse, vitralDaClasse } from "@/lib/vitral";

/**
 * A rosácea da classe.
 *
 * O SVG vem de `lib/vitral` como string e entra por `dangerouslySetInnerHTML`
 * — o nome assusta e aqui não há risco: a string é gerada por código nosso a
 * partir de um número, sem nada vindo de usuário. A alternativa seria
 * reescrever o gerador inteiro em JSX, e aí ele deixaria de servir fora do
 * React.
 */
export function Vitral({
  classe,
  tamanho = 180,
  aceso = false,
}: {
  classe: number;
  tamanho?: number;
  aceso?: boolean;
}) {
  const svg = useMemo(() => vitralDaClasse(classe, tamanho), [classe, tamanho]);
  const paleta = paletaDaClasse(classe);

  return (
    <div
      className="relative shrink-0 rounded-full transition-all duration-500"
      style={{
        width: tamanho,
        height: tamanho,
        // Aceso, a peça ganha a luz atravessando de trás, como um vitral com
        // sol. Apagado, fica como pedra fria.
        boxShadow: aceso
          ? `0 0 ${tamanho / 3}px ${paleta.brilho}55, inset 0 0 ${tamanho / 8}px ${paleta.chumbo}`
          : `inset 0 0 ${tamanho / 10}px ${paleta.chumbo}`,
        filter: aceso ? "saturate(1.15)" : "saturate(0.72) brightness(0.8)",
      }}
    >
      <div
        className="overflow-hidden rounded-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
