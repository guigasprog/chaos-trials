"use client";

import { useMemo } from "react";
import { paletaDaClasse, vitralDaClasse } from "@/lib/vitral";

/** A janela é em ogiva, então é retrato: mais alta que larga. */
export const PROPORCAO = 1.5;

/**
 * A janela da classe.
 *
 * O SVG vem de `lib/vitral` como string e entra por `dangerouslySetInnerHTML`
 * — o nome assusta e aqui não há risco: a string é gerada por código nosso a
 * partir de um número, sem nada vindo de usuário. A alternativa seria
 * reescrever o gerador inteiro em JSX, e aí ele deixaria de servir fora do
 * React.
 */
export function Vitral({
  classe,
  largura = 140,
  aceso = false,
}: {
  classe: number;
  /** A altura sai daqui pela proporção da ogiva. */
  largura?: number;
  aceso?: boolean;
}) {
  const svg = useMemo(() => vitralDaClasse(classe, largura), [classe, largura]);
  const paleta = paletaDaClasse(classe);

  return (
    <div
      className="relative shrink-0 transition-all duration-500"
      style={{
        width: largura,
        height: largura * PROPORCAO,
        // Acesa, a janela tem sol atrás. Apagada, é a mesma janela à noite —
        // o vidro continua lá, só não há luz para atravessá-lo.
        filter: aceso
          ? `drop-shadow(0 0 ${largura / 5}px ${paleta.brilho}66) saturate(1.1)`
          : "saturate(0.55) brightness(0.62)",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
