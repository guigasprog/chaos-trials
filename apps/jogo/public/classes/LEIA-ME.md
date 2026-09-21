# Arte das classes

Solte aqui a imagem de uma classe com o **índice dela** no nome, em `.webp`:

```
public/classes/1.webp      Wise
public/classes/2.webp      Support
public/classes/3.webp      Ranger
public/classes/4.webp      Melee
public/classes/5.webp      Tank
public/classes/11.webp     Mage
public/classes/4411.webp   Shadow Knight
```

Pronto. Não há registro para atualizar nem código para mexer — o que manda é o
arquivo existir. Sem arquivo, vale o vitral gerado por procedimento, e as duas
coisas convivem de propósito: são 45 classes, ilustrar todas de uma vez não
acontece, e o jogo não pode esperar por isso para ter cara.

Os índices saem de `packages/dominio/src/classe.ts`.

## O formato

- **Proporção 2:3** (retrato), porque a moldura é uma ogiva. Fora disso a
  imagem é cortada pelo centro.
- **1000 × 1500 basta.** A janela maior na tela tem 440 px de altura; o dobro
  cobre telas de alta densidade e o resto é peso à toa.
- **`.webp`**, que pesa menos da metade de um PNG no mesmo resultado.
- **Fundo escuro nas bordas.** A lâmina tem corte diagonal e a imagem é
  recortada por ele; borda clara denuncia o corte.

## Sobre a origem

Imagem de terceiro — Pinterest, banco de imagem, resultado de busca — não
serve. Este jogo vai ter compra com dinheiro real, e arte alheia em produto
monetizado é risco concreto, não teórico.

Serve: o que você gerar (Midjourney, DALL·E, Stable Diffusion), o que você
encomendar, ou fotografia de vitral histórico cujo direito já expirou —
lembrando que a **fotografia** de uma obra em domínio público costuma ter
direito próprio, do fotógrafo.
