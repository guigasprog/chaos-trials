# Combate em tempo real — Fase 1: a sala contra um chefe

**Fase 1 de 4 de um projeto maior, que por sua vez é separado do pedido de
paleta amarelo/escuro.** Os dois chegaram juntos numa mesma mensagem, mas não
têm relação técnica nenhuma — um troca o motor de combate, o outro troca
cor. Cada um decompõe e especifica à parte.

---

## 1. Por que este documento existe, e o que fica de fora

O pedido original era "combate tipo Arcane Lineage (Roblox) com interface
tipo Expedition 33". Isso é grande demais pra uma spec: exige transporte em
tempo real que o jogo não tem hoje nenhuma peça de (tudo aqui é HTTP
pedido→resposta), simulação espacial, e — se fosse PvP ao vivo de cara —
sincronizar dois jogadores online ao mesmo tempo.

Decompus em quatro fases, decidido em conversa:

| # | Fase | Depende de |
|---|---|---|
| **1** | **A sala funcionando sozinha — PvE contra um chefe controlado pelo servidor** | — |
| 2 | Pareamento PvP (dois jogadores ao vivo), na mesma sala | 1 |
| 3 | Habilidades completas da árvore, não só o golpe básico | 1 |
| 4 | Polimento — controles refinados, feedback visual, integração com elo | 1, 2, 3 |

Este documento cobre **só a 1**: PvE, um único jogador, contra um chefe que o
servidor controla. Nada de matchmaking, nada de sincronizar dois clientes —
esse é o problema mais difícil de todos, e a Fase 1 o adia de propósito.

**Também fica de fora, documentado como direção futura e não como decisão:**
um mapa no qual o conteúdo evolui com a distância percorrida, em vez das
ondas fixas descritas aqui. É a evolução natural desta fase, mas mapa
implica geração de conteúdo e progressão espacial persistente — escopo
próprio, spec própria, quando chegar a vez.

## 2. O que já existe, e o que muda

**Aproveitado sem reescrever:**

- `packages/dominio`: atributos, dano do golpe básico, vida máxima,
  dificuldade e vidas (`perderBatalha`, `VIDAS_POR_DIFICULDADE`), prêmio por
  dificuldade (`premioDe`). O chefe cobra vida como qualquer luta.
- O convênio "o cliente manda intenção, nunca estado" que rege toda a API
  HTTP de hoje — a sala de tempo real segue a mesma regra, só que a
  intenção chega por WebSocket em vez de corpo de requisição.

**Novo, específico desta fase:**

- Transporte WebSocket no servidor (`@fastify/websocket` — mesma família do
  Fastify já em uso, sem trocar de framework).
- Um loop de jogo por sala, com tick fixo.
- Um modelo espacial simplificado: raias + distância discreta (decidido
  abaixo, seção 4) — não movimento livre em plano contínuo.
- Uma IA de inimigo simples, com telégrafo (aviso antes do golpe).

## 3. Decisões tomadas, e o porquê de cada uma

**Servidor autoritativo, com tick loop — não o cliente simulando e
avisando o resultado.** Mesma razão de sempre neste projeto: existe economia
de verdade, e resultado calculado no cliente é resultado editável. A
diferença para o resto do jogo é só a cadência — em vez de "resolve um
pedido HTTP e responde", a sala mantém estado entre ticks e empurra
atualizações.

**Raias + distância discreta, não movimento livre em plano 2D contínuo.**
A alternativa fiel ao pedido original — coordenadas livres, canvas, joystick
virtual, colisão livre — foi considerada e descartada para esta fase. Dois
motivos, os dois já vividos neste projeto:

1. O jogo é mobile-first por necessidade medida, não preferência — a HUD já
   teve bug real de rolagem lateral por um pixel de sobra. Joystick virtual
   em tela de celular pequena costuma ficar ruim, e temos zero experiência
   nisso aqui.
2. A arte de cada classe é um retrato de vitral gerado, estático — não um
   sprite animado. Movê-lo livremente por um plano tende a parecer errado;
   deslocá-lo entre posições discretas (raia, distância) é uma transição
   que CSS resolve bem sem parecer quebrado.

Raias e distância ainda entregam o que faz tempo real valer a pena —
espaço e timing importam, escolher a ação certa no menu não basta mais —
sem herdar o problema de colisão livre nem o de controle por toque preciso.
Fica anotado: se a sensação em jogo real pedir movimento livre depois,
trocar o modelo espacial é uma decisão de Fase 4, não deste documento.

**O inimigo avisa antes de bater (telégrafo).** Sem aviso, "tempo real"
seria só "turno automático rápido demais pra reagir" — e a diferença entre
os dois é o ponto inteiro da fase. O telégrafo é o que torna esquivar uma
decisão de timing, e não um dado de porcentagem.

**Perder aqui consome uma vida do sistema de dificuldade existente, não um
contador à parte.** `VIDAS_POR_DIFICULDADE`, `perderBatalha`, vida guardada
— tudo isso já existe e já é testado. Inventar uma segunda régua de risco
só para este modo criaria duas fontes de verdade sobre "quantas vezes posso
perder" — exatamente o tipo de duplicação que este projeto evita em outro
lugar (é a mesma razão pela qual `sortearQueda` recebe a chance pronta em
vez de saber o que é dificuldade).

**A lógica de combate mora em `packages/dominio`, pura e determinística —
só a conexão em si é infraestrutura.** Resolver um ataque, avançar de onda,
decidir o golpe do inimigo: tudo isso são funções que recebem estado e
devolvem estado novo, testáveis com `node:test` sem WebSocket nenhum
rodando — o mesmo padrão que `batalha.ts` já segue para o combate por
turnos. O `apps/servidor` fica só com a fiação: abrir a conexão, rodar o
tick, chamar as funções puras, mandar o resultado.

## 4. O modelo espacial

Três raias (nomeadas por posição, ex. `esquerda` / `centro` / `direita` — a
arte decide o rótulo visual depois). Dentro de uma raia, distância em três
graus: `perto`, `médio`, `longe`.

O golpe básico só acerta se: **mesma raia** + **alvo em distância `perto`**
+ **alvo não está numa janela de esquiva naquele instante**. As três
condições são checadas no mesmo tick em que o golpe resolve — não há
"acertou, mas a esquiva chegou um tick depois" nem o oposto.

O telégrafo (seção 3) é só do inimigo. O golpe do jogador resolve no mesmo
tick em que é pedido, sem aviso prévio — não há razão para o jogador
esquivar do próprio ataque, e dar recuo ao golpe dele só tornaria a luta
mais lenta sem tornar nenhuma decisão mais interessante.

Ações do jogador, uma por tick:

- **Mudar de raia** (esquerda/direita)
- **Mudar de distância** (aproximar/afastar)
- **Atacar** (golpe básico — o único disponível nesta fase)
- **Esquivar** — abre uma janela curta de invencibilidade a golpes, com
  recarga própria (não dá pra esquivar em todo tick)

## 5. Ondas e o chefe

Três ondas de um inimigo comum (a "Sombra do Caos" que já existe, ou uma
variação — decisão de conteúdo, não deste documento), depois uma onda de
chefe. Vencer uma onda comum não cura: a vida atravessa dentro da sala,
mesma filosofia de "vida atravessa as batalhas" que já rege o resto do
jogo.

O chefe usa a mesma IA que o inimigo comum, com números maiores — nesta
fase, não há comportamento exclusivo de chefe (padrões de ataque novos,
fases da luta). Fica para quando houver medição de como a fase 1 básica se
sente jogando de verdade.

## 6. Onde aparece na tela, e o que acontece quando termina

Um botão novo na Ficha, ao lado de "Lutar" — mesma vizinhança, porque é a
mesma decisão ("vou arriscar uma vida agora?"), só que num modo diferente.
Sempre disponível, com aviso de risco antes de entrar — a mesma filosofia
de transparência que a Arena já usa ("as três perguntas antes de clicar").

Terminou (venceu ou perdeu a onda de chefe, ou perdeu numa onda comum no
meio do caminho): o servidor grava no personagem exatamente como qualquer
luta — `perderBatalha` na derrota, `premioDe` (escalado pela dificuldade)
na vitória. Sem sistema de recompensa paralelo.

**Desconexão.** Se o WebSocket cai — aba fechada, wifi caiu, o que for — um
tempo curto sem resposta do cliente (a decidir o número exato ao medir; um
chute inicial razoável é 15s) encerra a sala como derrota. Sem isso,
desconectar de propósito no meio de uma luta perdida viraria um jeito de
nunca pagar o risco — o oposto do que a dificuldade inteira existe para
garantir.

## 7. Testes

- `packages/dominio`: a resolução de um ataque (acerta/erra, dado raia +
  distância + esquiva), o avanço de onda, a decisão do inimigo — tudo puro,
  determinístico, testável como o resto do domínio já é.
- `apps/servidor`: a fiação da sala — abre conexão, aceita intenção, fecha
  por timeout — com um cliente WebSocket de teste. Escopo menor que os
  testes de domínio; é integração, não a lógica em si.
- Sem teste de UI automatizado nesta fase — o padrão já estabelecido neste
  projeto (Playwright manual, ponta a ponta) cobre a tela nova quando ela
  existir.

## 8. O que fica **EM ABERTO**

- O tick exato (proposto: 10/s — sem medição ainda de custo de servidor
  nem de sensação em jogo real).
- O tempo de timeout por desconexão (proposto: 15s).
- Se o inimigo comum das ondas 1-3 é a "Sombra do Caos" de sempre ou uma
  variação nova — decisão de conteúdo/arte, não deste documento.
- O mapa por distância (seção 1) — direção futura, não decisão.
