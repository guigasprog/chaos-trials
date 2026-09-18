# Chaos Trials — Núcleo jogável

**Sub-projeto 1 de 7.** RPG por turnos com progressão infinita por prestígio,
permadeath e economia fechada.

---

## 1. Por que este documento existe

O pedido original abrange uns dez subsistemas. Spec único para tudo isso não
sobrevive ao contato com o código, então está decomposto assim:

| # | Sub-projeto | Depende de |
|---|---|---|
| **1** | **Núcleo jogável** — classes, progressão, combate, morte | — |
| 2 | Itens, loot e inventário | 1 |
| 3 | Economia fechada — sucata, moeda premium, loja, mercado | 1, 2 |
| 4 | PvP e matchmaking | 1, 2 |
| 5 | Identidade visual de vitral | 1 |
| 6 | Conta, sessão e criptografia | — |
| 7 | Filas e concorrência | quando houver carga |

Este documento cobre **só o 1**. Cada um dos outros terá spec própria.

## 2. O que já existe, e o que se aproveita

Seis repositórios foram lidos antes de qualquer decisão.

**Aproveitado:**

- `development-chaos-trials-server` — o `ClassEnum` é a peça central e vem
  junto. O índice **codifica a hierarquia**: `1` Wise → `11` Mage → `111`
  Archmage → `1111` Grandmaster. Pai, filhos e profundidade se derivam do
  próprio número, sem tabela de junção. 5 raízes, ~48 classes, 4 níveis.
- `QuestTerm` — as regras de jogo já escritas: stats, efeitos de status,
  habilidades com efeitos tipados, turnos, loot, loja. ~4.000 linhas de
  TypeScript que portam quase diretamente.

**Descartado:** `back` (1 commit, scaffold vazio), `chaos-trials` na forma
atual (superado pelo server de 2024), `front` (4 commits e 479 MB, com binário
grande commitado), `development-chaos-trials-client` (serve como referência
visual, não como base).

## 3. Decisões tomadas, e o porquê de cada uma

Estas foram decididas em conversa. Estão aqui porque uma spec sem os motivos
vira uma lista de ordens que ninguém sabe contestar depois.

**Economia fechada, sem saque.** A moeda premium é comprada com dinheiro real
e negociável entre jogadores dentro do jogo, mas nunca sai. Isso remove KYC,
AML e o enquadramento da estrutura "invista X para receber Y" como oferta de
valor mobiliário — que é exatamente o desenho pelo qual a CVM autuou vários
"criptogames". A segurança volta a ser proteger conta de jogador, não
custódia de dinheiro de terceiro.

**Progressão infinita por prestígio em camadas.** A árvore de classes tem 4
níveis, então é finita e não pode ser o motor. O motor é o renascimento: sobe
até um teto, renasce, ganha multiplicador permanente, escolhe outro ramo. As
48 classes viram conteúdo rejogável em vez de escolha única, e o PvP futuro
ganha brackets naturais.

**TypeScript ponta a ponta.** As ~4.000 linhas do QuestTerm portam direto, e o
domínio vive num pacote compartilhado — mesma definição no servidor que decide
e no cliente que mostra. Num jogo com modelo de domínio grande, domínio
duplicado é a maior fonte de bug. Custo aceito: portar `ClassEnum`, JWT e RSA
do Java.

**Simulação no servidor.** Existe compra com dinheiro real e vai existir
mercado entre jogadores; progressão calculada no cliente vira memória editada
em dez minutos, e sucata falsificada contamina a economia inteira. Isto é o
anti-cheat real — não a criptografia.

**Combate por turnos ativo; idle só offline.** Online se joga de verdade,
turno a turno. Offline rende em ritmo reduzido. Consequência assumida: **isto
é um RPG por turnos com recuperação offline, não um idle.** Progredir exige
presença.

**Permadeath com revive exclusivamente premium.** Decisão do produto, tomada
com as alternativas na mesa. Ver §8.

## 4. Arquitetura

```
chaos-trials/
  packages/
    dominio/          regras puras — sem I/O, sem rede, sem banco
  apps/
    servidor/         NestJS — autoridade, persistência, sessão de batalha
    jogo/             Next.js — apresentação
```

O `dominio` tem uma regra dura: **funções puras e determinísticas**. Recebe
estado, devolve estado novo. Não lê relógio, não sorteia sem semente, não toca
banco. Três coisas caem de graça:

- progressão offline é a mesma função rodada N vezes;
- teste roda sem subir banco;
- o cliente pode prever e animar com o mesmo código que o servidor usa para
  decidir, sem risco de divergir.

O servidor é a única autoridade. O cliente nunca envia estado — envia
**intenção** ("usar habilidade X em Y") e recebe o estado resultante.

## 5. Modelo de domínio

### 5.1 Classes

Porta fiel do `ClassEnum`, preservando o índice-hierarquia:

```ts
export interface Classe {
  indice: number;   // 1 | 11 | 111 | 1111
  nome: string;
  pai: number;      // 0 nas raízes
}

export function ramoDe(indice: number): number        // primeiro dígito
export function profundidadeDe(indice: number): number // nº de dígitos
export function filhosDe(indice: number): Classe[]
export function ancestraisDe(indice: number): Classe[]
```

`filhosDe` e `ancestraisDe` saem do próprio número — nenhuma tabela de
relacionamento no banco.

### 5.2 Atributos

O QuestTerm tem quatro (`hp`, `str`, `dex`, `int`). Falta identidade defensiva
para o ramo Tank, então são cinco, um por raiz:

| Atributo | Ramo | Efeito |
|---|---|---|
| `intelecto` | Wise (1) | dano mágico |
| `presenca` | Support (2) | potência de efeito e cura |
| `destreza` | Ranger (3) | precisão, iniciativa, chance de crítico |
| `forca` | Melee (4) | dano físico |
| `vigor` | Tank (5) | vida máxima e redução de dano |

### 5.3 Números grandes

O domínio traz um tipo próprio para os números que crescem:

```ts
export interface Grande { m: number; e: number }  // normalizado: 1 <= m < 10
export function grande(n: number): Grande
export function soma(a: Grande, b: Grande): Grande
export function produto(a: Grande, b: Grande): Grande
export function compara(a: Grande, b: Grande): number
export function texto(g: Grande): string          // "1,42 M" | "3,8e17"
```

**Quando isso passa a ser necessário, medido:** o multiplicador de prestígio
sozinho só ultrapassa `Number.MAX_SAFE_INTEGER` na camada 79. Mas o que
transborda é o *produto* — multiplicador × escala de nível × equipamento —, e
esse cruza o limite por volta da camada 40. Nenhum dos dois é "logo".

O motivo de construir cedo mesmo assim não é urgência, é custo de retrofit:
enfiar aritmética de precisão estendida num código que assumiu `number` em
todo lugar é uma mudança enorme e cheia de bug silencioso, do tipo que só
aparece na conta de um jogador veterano. É barato agora e caro depois.

`BigInt` é o reflexo óbvio e é a escolha errada: não tem parte fracionária e é
lento em multiplicação, que é a operação dominante num sistema de
multiplicadores.

## 6. Progressão

Três escalas aninhadas.

**Nível** — dentro de uma vida. XP por vitória; custo do nível `n` cresce
`1,18^n`. Teto de nível por camada, que é o gatilho do renascimento.

**Classe** — a árvore. A raiz é escolhida na criação. Cada subclasse abre num
nível fixo e é escolha permanente *daquela vida*.

**Camada de prestígio** — infinita. Renascer zera nível, classe e equipamento;
preserva o multiplicador acumulado:

```
poderDaCamada(n) = 1,6 ^ n
```

Camada 20 ≈ 12.000×; camada 50 ≈ 1,6e10. Os inimigos escalam junto, então o
jogo permanece desafiante — o que cresce é a escala, não a folga.

Balanceamento é tunável: as constantes moram num único módulo
(`dominio/src/balanceamento.ts`), nunca espalhadas pelo código.

## 7. Combate

WebSocket, uma sessão por batalha, servidor resolvendo.

```
cliente → servidor  { tipo: "acao", habilidade: string, alvo: string }
servidor → cliente  { tipo: "turno", eventos: Evento[], estado: EstadoBatalha }
```

`eventos` é um log ordenado (`dano`, `cura`, `efeitoAplicado`, `morte`) para o
cliente animar na sequência certa. `estado` é a verdade — o cliente reconcilia
com ele ao fim da animação.

Sem predição no cliente por enquanto. É otimização, e otimização antes de o
problema existir custa caro e esconde bug. A porta fica aberta: o cliente já
tem as mesmas funções.

## 8. Morte e permadeath

Morrer encerra a vida do personagem. Ele entra no estado `tumulo`: não luta,
não progride, não rende offline.

**A única saída é comprar o revive com moeda premium.** Não há caminho por
sucata. Decisão do produto, tomada com as alternativas apresentadas.

Duas regras que o desenho exige e que não estavam no pedido — decididas aqui,
e passíveis de veto:

1. **O túmulo prende o personagem, não a conta.** A conta pode criar um
   personagem novo, do zero, perdendo as camadas de prestígio do morto. Sem
   isso, quem não pode pagar perde o acesso ao produto inteiro, e o personagem
   antigo fica inalcançável para sempre. Com isso, o revive continua valendo
   muito — ele salva centenas de horas de camadas —, e a pressão de compra é
   sobre o investimento, não sobre o direito de jogar.

2. **O personagem no túmulo é preservado indefinidamente.** Nada é apagado por
   tempo. Comprar o revive três meses depois devolve o personagem intacto.

Consequência para a economia: o revive é o maior sorvedouro de moeda premium
do jogo, e portanto o principal formador de preço no mercado entre jogadores
(sub-projeto 3). Isto precisa entrar no balanceamento daquela spec.

## 9. Progressão offline

Na reconexão o servidor calcula o tempo decorrido e roda N ciclos de combate
automático em ritmo reduzido, com as mesmas funções puras e RNG semeado —
determinístico e auditável.

**Teto de 8 horas acumuláveis.** Sem teto vira computação ilimitada por
jogador e, pior, trivializa o jogo para quem sumiu um mês.

Personagem no túmulo não rende nada.

## 10. Vitral

Cada uma das ~48 classes recebe uma rosácea de vitral **gerada por
procedimento**, em SVG, semeada pelo próprio índice da classe:

- **paleta pelo ramo raiz** — Wise azul/violeta, Support dourado, Ranger
  verde, Melee rubro, Tank aço;
- **complexidade pela profundidade** — Grandmaster (nível 4) ganha mais
  vidraças e renda de chumbo mais fina que Mage (nível 2);
- **determinístico** — a mesma classe dá sempre o mesmo vitral.

SVG e não imagem rasterizada porque vitral **é** geometria: chumbo e vidro
colorido é exatamente o que SVG expressa nativamente. Escala em qualquer
resolução, pesa quilobytes, e 48 peças únicas saem sem 48 ilustrações à mão.

Detalhamento fica no sub-projeto 5. Aqui entra só o gerador base e a paleta
por ramo, o suficiente para a tela de escolha de classe.

## 11. Segurança

O `development-chaos-trials-server` já tem RSA, e ela tem um defeito de base
que **não** deve ser portado: o servidor guarda a chave privada do usuário
(`RSAKey.privateKey` no banco, lida por `RSAUtil.decrypt`). Isso anula o
propósito da criptografia assimétrica — vazando o banco, vaza tudo junto. E
RSA sobre payload é lento e limitado a ~245 bytes por bloco em 2048 bits.

O que de fato protege um jogo web:

- **TLS** faz a cifragem de transporte. RSA por cima não acrescenta nada
  contra atacante de rede.
- **Argon2id** nas senhas.
- **JWT curto com refresh rotativo**, e revogação por família de token.
- **Rate limiting** por conta e por IP.
- **Autoridade no servidor** — o anti-cheat real.
- **Recibo de compra assinado e idempotente**, para pagamento não duplicar nem
  sumir.

Detalhamento no sub-projeto 6.

## 12. O que NÃO entra nesta fatia

Dito explicitamente para o plano não inchar: nada de PvP, mercado entre
jogadores, loja, integração de pagamento, chat, guildas, ranking, ou filas e
workers. Combate por turnos custa quase nada de CPU por jogador; fila passa a
valer quando houver tempestade de reconexão recalculando offline, e isso é o
sub-projeto 7.

## 13. Testes

O `dominio` é puro, então é testável sem infraestrutura, e é onde fica a maior
parte da cobertura:

- `Grande` — soma, produto e comparação contra referência em `number` dentro
  da faixa segura, e propriedades (comutatividade, normalização) acima dela;
- hierarquia de classes — pais, filhos e profundidade dos ~48 índices;
- resolução de turno — casos tabelados de dano, efeito e morte;
- determinismo — mesma semente e mesmo estado inicial produzem a mesma
  sequência de eventos, que é o que sustenta a progressão offline;
- progressão — o teto de 8 horas, e o túmulo não rendendo nada.

No servidor, testes de integração cobrem o ciclo de batalha por WebSocket e o
recálculo offline na reconexão.

## 14. Fatia mínima entregável

Criar conta → escolher uma das 5 classes raiz → combate por turnos contra
inimigos escalados → subir de nível e desbloquear subclasse → sair e voltar
com progresso offline aplicado → morrer e cair no túmulo → renascer uma vez e
ver o multiplicador valer → vitral gerado para cada classe na tela de escolha.

Isso fecha como jogo que abre e se joga.

## 15. Riscos conhecidos

- **Balanceamento é o risco dominante.** Progressão infinita é fácil de
  escrever e difícil de tornar interessante. Mitigação: constantes num módulo
  só, e um script que simula 100 camadas e reporta a curva antes de qualquer
  ajuste ir para produção.
- **Revive só premium** concentra a monetização num ponto de frustração. É
  decisão tomada; o risco é reputacional e de conversão, não técnico. Se algum
  dia for para app da Apple ou Google, progresso bloqueado atrás de pagamento
  esbarra nas regras de loja delas — na web aberta, não há esse limite.
- **O teto de 8 horas offline** vai desagradar quem joga pouco. É ajustável,
  mas mexer nele depois de haver economia é inflacionário.
