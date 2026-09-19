# Chaos Trials

RPG por turnos com progressão infinita por prestígio, permadeath e economia
fechada. Em construção.

## Rodar

Precisa de Node 20.11 ou mais novo.

```bash
npm install

npm run teste      # 141 testes: domínio e API
npm run tipos      # conferência de tipos
npm run simular    # relatório de balanceamento
npm run servidor   # sobe o jogo em http://localhost:3333
```

O **jogo roda**: dá para criar personagem, lutar turno a turno, subir de
nível, escolher subclasse, enfrentar julgamentos, morrer e ser revivido —
tudo pela API. Ainda **não há tela nem conta**: o cliente é o próximo passo, e
autenticação é o sub-projeto 6. Hoje o id do personagem é a credencial, o que
serve para jogar localmente e não para expor.

Um exemplo de partida inteira, por HTTP:

```bash
npm run servidor &

curl -s -X POST localhost:3333/personagens   -H 'Content-Type: application/json'   -d '{"nome":"Guigas","classe":4}'
# devolve o personagem, com o id

curl -s -X POST localhost:3333/personagens/SEU_ID/batalhas   -H 'Content-Type: application/json' -d '{"tipo":"comum"}'
# devolve a batalha, com o id e as habilidades disponíveis

curl -s -X POST localhost:3333/batalhas/BATALHA_ID/turnos   -H 'Content-Type: application/json' -d '{"habilidade":"golpe"}'
# repita até `resultado` vir preenchido
```

## Comum e julgamento

Perder uma batalha **comum** é recuar ferido. Perder um **julgamento** é morrer
de verdade — e é a única forma de morrer, porque é a única em que se escolheu
arriscar. O julgamento paga 6x.

Isso não era o desenho original: no começo qualquer derrota matava. Jogando
contra o servidor, o personagem morreu na terceira batalha, e a medição
mostrou por quê — com ~25% de derrota por luta, derrota significando morte dá
uma morte a cada 3 ou 4 batalhas. Com permadeath e revive pago em moeda
comprada, isso não é dificuldade; é extração. E ninguém tinha decidido
construir aquilo: emergiu de duas regras razoáveis se encontrando.

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
