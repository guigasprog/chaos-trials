# Chaos Trials

RPG por turnos com progressão infinita por prestígio, permadeath e economia
fechada. Em construção.

## Rodar

Precisa de Node 20.11 ou mais novo.

```bash
npm install

npm run teste      # os testes do domínio
npm run tipos      # conferência de tipos
npm run simular    # relatório de balanceamento
```

Ainda **não há servidor, banco nem tela** — não existe conta para logar. O que
existe é `packages/dominio`: as regras do jogo como funções puras, sem I/O.
`npm run simular` é a forma de ver números de verdade hoje.

## Onde está o quê

| Caminho | O que é |
|---|---|
| `packages/dominio` | Regras do jogo. Puro, determinístico, testável sem infraestrutura. |
| `docs/superpowers/specs` | O desenho e o porquê de cada decisão. |
| `back/`, `front/` | Versões de 2024, mantidas só como referência. Serão removidas. |

## Sobre o balanceamento

Os números em `packages/dominio/src/balanceamento.ts` ajustam a sensação do
jogo, e estão todos num arquivo só de propósito. Antes de mudar qualquer um
deles, rode `npm run simular` e leia a curva — foi assim que dois defeitos
estruturais apareceram antes de custar caro.

O relatório também marca o que está **EM ABERTO**: a vantagem de prestígio
ainda não tem para onde ir, e isso é decisão de produto.
