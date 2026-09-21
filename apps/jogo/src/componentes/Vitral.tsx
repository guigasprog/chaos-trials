"use client";

import { useMemo, useState } from "react";
import { paletaDaClasse, vitralComoUrl, vitralDaClasse } from "@/lib/vitral";

/** A janela é em ogiva, então é retrato: mais alta que larga. */
export const PROPORCAO = 1.5;

/**
 * Onde a arte de uma classe mora, se houver.
 *
 * Basta soltar o arquivo com o índice da classe — `4.webp` para Melee,
 * `4411.webp` para Shadow Knight — que ele passa a valer. Não há registro para
 * atualizar nem código para mexer: o que manda é o arquivo existir.
 *
 * Sem arquivo, vale o vitral gerado. As duas coisas convivem de propósito: são
 * 45 classes, ilustrar todas de uma vez não acontece, e o jogo não pode
 * esperar por isso para ter cara.
 */
export function caminhoDaArte(classe: number): string {
  return `/classes/${classe}.webp`;
}

/**
 * A janela da classe.
 *
 * A arte desenhada fica por baixo, sempre, como fundo. A imagem entra por cima
 * quando existe, e some sozinha quando não existe — a queda é pelo `onError`
 * da própria imagem, e não por uma lista do que já foi ilustrado, porque lista
 * é a primeira coisa a ficar desatualizada.
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
  const [semArte, setSemArte] = useState(false);

  return (
    <div
      className="relative shrink-0 overflow-hidden transition-all duration-500"
      style={{
        width: largura,
        height: largura * PROPORCAO,
        // Acesa, a janela tem sol atrás. Apagada, é a mesma janela à noite —
        // o vidro continua lá, só não há luz para atravessá-lo.
        filter: aceso
          ? `drop-shadow(0 0 ${largura / 5}px ${paleta.brilho}66) saturate(1.1)`
          : "saturate(0.55) brightness(0.62)",
      }}
    >
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {!semArte && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={caminhoDaArte(classe)}
          alt=""
          aria-hidden="true"
          onError={() => setSemArte(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/**
 * A mesma arte como fundo de uma lâmina da faixa.
 *
 * Separado do componente acima porque ali a lâmina é o elemento clicável e não
 * pode virar contêiner: a imagem entra como camada dentro dela, com o vitral
 * gerado no `background` por baixo.
 */
export function ArteDaClasse({ classe }: { classe: number }) {
  const [semArte, setSemArte] = useState(false);
  if (semArte) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={caminhoDaArte(classe)}
      alt=""
      aria-hidden="true"
      onError={() => setSemArte(true)}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}

export { vitralComoUrl };
