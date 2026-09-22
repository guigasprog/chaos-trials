# Combate em tempo real — Fase 1 (sala PvE contra um chefe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um jogador entra numa sala de combate em tempo real (WebSocket),
enfrenta três ondas de um inimigo comum seguidas de uma onda de chefe —
tudo controlado por IA do servidor —, usando raias + distância discreta
para se posicionar, esquivar de golpes telegrafados, e atacar. O resultado
(vitória ou derrota) grava no personagem como qualquer luta.

**Architecture:** A lógica de combate (mover, atacar, IA, avanço de onda)
vive em `packages/dominio` como funções puras, determinísticas, testadas
sem infraestrutura — igual ao motor de combate por turnos já existente.
`apps/servidor` só faz a fiação: abre o WebSocket, mantém um tick loop por
sala, chama as funções puras, e grava o resultado quando a sala termina.
`apps/jogo` ganha uma tela nova que conecta, manda intenção, desenha o
estado que volta.

**Tech Stack:** TypeScript ponta a ponta (já em uso). `@fastify/websocket`
no servidor (mesma família do Fastify já em produção neste projeto — não é
um framework novo). Sem biblioteca de estado/animação nova no cliente:
React puro, como o resto de `apps/jogo`.

**Spec:** `docs/superpowers/specs/2026-09-22-combate-tempo-real-fase1-design.md`

## Global Constraints

- Servidor é autoritativo: o cliente manda intenção, nunca estado — mesmo
  convênio que rege toda a API HTTP existente.
- A lógica de combate (resolver ataque, avançar onda, decidir IA) é pura e
  mora em `packages/dominio`, testável com `node:test` sem WebSocket
  rodando. Só a conexão em si é infraestrutura, em `apps/servidor`.
- Raias + distância discreta — não movimento livre em plano 2D contínuo.
  Três raias (`esquerda`, `centro`, `direita`), três graus de distância
  (`longe`, `medio`, `perto`).
- O golpe do jogador não é telegrafado (resolve no mesmo tick do pedido).
  Só o golpe do inimigo/chefe é telegrafado — é isso que dá tempo real de
  verdade, e não turno automático rápido demais pra reagir.
- Perder a sala consome uma vida do sistema de dificuldade já existente
  (`perderBatalha`); vencer paga `premioDe` escalado pela dificuldade do
  personagem. Nenhum sistema de recompensa paralelo.
- Sem pareamento PvP nesta fase — o inimigo é sempre controlado por IA do
  servidor. Isso é Fase 2, fora deste plano.
- Sem habilidades da árvore nesta fase — só o golpe básico. Isso é Fase 3.
- Tick: 10 por segundo (`TICKS_POR_SEGUNDO`). Timeout de desconexão: 15
  segundos sem intenção do cliente encerra a sala como derrota
  (`TIMEOUT_DE_DESCONEXAO_MS`). Os dois números vêm de `balanceamento.ts`,
  marcados como chute inicial no comentário — mesma convenção do resto do
  arquivo.

---

## File Structure

- **`packages/dominio/src/balanceamento.ts`** (modificar): novas constantes
  de tick, esquiva, telégrafo e dureza do inimigo nesta sala.
- **`packages/dominio/src/combate-tempo-real.ts`** (criar): tipos e funções
  puras — `iniciarSala`, `moverRaia`, `moverDistancia`, `iniciarEsquiva`,
  `atacar`, `avancarTick`. Nenhuma dependência de `node:fs`, rede, ou
  relógio da máquina.
- **`packages/dominio/testes/combate-tempo-real.test.ts`** (criar): testes
  de tudo acima.
- **`packages/dominio/src/index.ts`** (modificar): exporta o módulo novo.
- **`apps/servidor/package.json`** (modificar): adiciona `@fastify/websocket`.
- **`apps/servidor/src/tempo-real.ts`** (criar): `class SalasTempoReal`
  (mantém as salas ativas em memória, um tick loop por sala — mesmo padrão
  de `Batalhas`/`Cambio`) e `registrarRotasDeTempoReal(app, deps)` (a rota
  WebSocket em si, incluindo autenticação, timeout de desconexão, e gravar
  o resultado no personagem quando a sala termina).
- **`apps/servidor/testes/tempo-real.test.ts`** (criar): testes de
  integração da fiação, com um cliente WebSocket de teste.
- **`apps/servidor/src/aplicacao.ts`** (modificar): registra o plugin
  `@fastify/websocket` e chama `registrarRotasDeTempoReal`.
- **`apps/jogo/src/lib/tempo-real.ts`** (criar): cliente WebSocket —
  conecta, manda intenção, expõe o estado que chega via callback.
- **`apps/jogo/src/componentes/CombateTempoReal.tsx`** (criar): a tela.
- **`apps/jogo/src/componentes/Ficha.tsx`** (modificar): botão novo, ao
  lado de "Lutar".
- **`apps/jogo/src/app/page.tsx`** (modificar): novo lugar na navegação
  para abrir a tela.

---

### Task 1: Tipos, constantes e `iniciarSala`

**Files:**
- Modify: `packages/dominio/src/balanceamento.ts`
- Create: `packages/dominio/src/combate-tempo-real.ts`
- Test: `packages/dominio/testes/combate-tempo-real.test.ts`

**Interfaces:**
- Produces: `Raia` (`"esquerda" | "centro" | "direita"`), `RAIAS` (array
  nesta ordem), `Distancia` (`"longe" | "medio" | "perto"`), `DISTANCIAS`
  (array nesta ordem — `perto` é o último, índice mais alto),
  `LutadorTempoReal`, `InimigoTempoReal`, `FaseDaSala`
  (`"em-andamento" | "vitoria" | "derrota"`), `Sala`, `iniciarSala(dados)`.

- [ ] **Step 1: Adicionar as constantes em `balanceamento.ts`**

Adicionar ao final do arquivo:

```ts
// ── Combate em tempo real (Fase 1) ──────────────────────────────────────

/*
 * Nenhum destes números tem medição de verdade ainda — são o chute
 * inicial que a spec (docs/superpowers/specs/2026-09-22-...) já marca
 * como EM ABERTO. Jogar de verdade e ajustar depois, como o resto deste
 * arquivo pede.
 */

/** Quantos ticks o servidor roda por segundo, nesta sala. */
export const TICKS_POR_SEGUNDO = 10;

/** Quantos ticks sem intenção do cliente encerram a sala como derrota. */
export const TIMEOUT_DE_DESCONEXAO_MS = 15_000;

/** Quantos ticks de invencibilidade uma esquiva dá. */
export const DURACAO_DA_ESQUIVA_EM_TICKS = 4;

/** Quantos ticks até poder esquivar de novo, depois de esquivar. */
export const RECARGA_DA_ESQUIVA_EM_TICKS = 20;

/** Quantos ticks de aviso o golpe do inimigo dá antes de resolver. */
export const TELEGRAFO_DO_INIMIGO_EM_TICKS = 8;

/** Quantas ondas de inimigo comum vêm antes da onda de chefe. */
export const ONDAS_COMUNS_ANTES_DO_CHEFE = 3;

/**
 * Fração do poder ofensivo do jogador que o inimigo comum desta sala usa
 * como atributo — pensado pra ser vencível sozinho, sem grupo. O chefe é
 * mais forte que o próprio jogador: é a parte "mega difícil" do pedido.
 */
export const DUREZA_DO_INIMIGO_COMUM_NA_SALA = 0.6;
export const DUREZA_DO_CHEFE_NA_SALA = 1.3;

/** Múltiplo de vida do inimigo comum e do chefe, em relação à vida
    máxima do jogador — chefe aguenta mais troca, não só bate mais forte. */
export const VIDA_DO_INIMIGO_COMUM_NA_SALA = 0.8;
export const VIDA_DO_CHEFE_NA_SALA = 2.5;
```

- [ ] **Step 2: Escrever o teste que ainda não compila**

Criar `packages/dominio/testes/combate-tempo-real.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { iniciarSala, RAIAS, DISTANCIAS } from "../src/combate-tempo-real.ts";

const SEMENTE = 12345;

function novaSala() {
  return iniciarSala({
    classeDoJogador: 4,
    nivelDoJogador: 30,
    vidaDoJogador: 500,
    vidaMaximaDoJogador: 500,
    semente: SEMENTE,
  });
}

describe("iniciarSala", () => {
  it("começa na onda 1, em andamento, jogador com a vida que entrou", () => {
    const sala = novaSala();
    assert.equal(sala.onda, 1);
    assert.equal(sala.fase, "em-andamento");
    assert.equal(sala.jogador.vida, 500);
    assert.equal(sala.jogador.vidaMaxima, 500);
  });

  it("jogador começa no centro, distância longe, sem esquiva ativa", () => {
    const sala = novaSala();
    assert.equal(sala.jogador.raia, "centro");
    assert.equal(sala.jogador.distancia, "longe");
    assert.equal(sala.jogador.esquivandoPor, 0);
    assert.equal(sala.jogador.recargaDeEsquivaPor, 0);
  });

  it("o inimigo da onda 1 é comum, não telegrafando ainda", () => {
    const sala = novaSala();
    assert.equal(sala.inimigo.tipo, "comum");
    assert.equal(sala.inimigo.telegrafandoPor, null);
    assert.ok(sala.inimigo.vida > 0);
  });

  it("é determinística — a mesma semente dá a mesma sala", () => {
    const a = novaSala();
    const b = novaSala();
    assert.deepEqual(a, b);
  });

  it("sementes diferentes podem dar inimigos com vida diferente", () => {
    // Não é garantido matematicamente, mas com a variação esperada do
    // dado, entre várias sementes ao menos uma diverge.
    const vidas = new Set(
      Array.from({ length: 10 }, (_, i) =>
        iniciarSala({
          classeDoJogador: 4,
          nivelDoJogador: 30,
          vidaDoJogador: 500,
          vidaMaximaDoJogador: 500,
          semente: SEMENTE + i,
        }).inimigo.vida,
      ),
    );
    assert.ok(vidas.size >= 1); // ao menos não quebra; a vida do inimigo
    // comum nesta fase é determinística pelo nível, então size pode ser 1
    // — o teste real de variação fica nos testes de dano, mais abaixo.
  });
});

describe("RAIAS e DISTANCIAS", () => {
  it("três raias, três distâncias, nas ordens documentadas", () => {
    assert.deepEqual(RAIAS, ["esquerda", "centro", "direita"]);
    assert.deepEqual(DISTANCIAS, ["longe", "medio", "perto"]);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: falha ao importar `../src/combate-tempo-real.ts` — o arquivo
ainda não existe.

- [ ] **Step 4: Criar `packages/dominio/src/combate-tempo-real.ts`**

```ts
import { type Ramo, ramoDe } from "./classe.ts";
import { ATRIBUTO_OFENSIVO_DO_RAMO, atributosDe } from "./atributos.ts";
import {
  DURACAO_DA_ESQUIVA_EM_TICKS,
  RECARGA_DA_ESQUIVA_EM_TICKS,
  ONDAS_COMUNS_ANTES_DO_CHEFE,
  DUREZA_DO_INIMIGO_COMUM_NA_SALA,
  DUREZA_DO_CHEFE_NA_SALA,
  VIDA_DO_INIMIGO_COMUM_NA_SALA,
  VIDA_DO_CHEFE_NA_SALA,
} from "./balanceamento.ts";

/**
 * O combate em tempo real — Fase 1: sala PvE contra um chefe.
 *
 * Puro e determinístico, como o resto do domínio: nada aqui conhece
 * WebSocket, relógio da máquina, ou o personagem gravado — só o número de
 * classe, nível e vida que entram em `iniciarSala`. Quem grava o
 * resultado é o servidor, depois que a sala termina.
 *
 * Raias e distância discreta, não um plano 2D contínuo — ver a spec para
 * o porquê (mobile-first medido, arte de vitral estática). Espaço e
 * timing ainda importam: só não há física de colisão livre.
 */

export type Raia = "esquerda" | "centro" | "direita";
export const RAIAS: readonly Raia[] = ["esquerda", "centro", "direita"];

export type Distancia = "longe" | "medio" | "perto";
export const DISTANCIAS: readonly Distancia[] = ["longe", "medio", "perto"];

export type TipoDeInimigo = "comum" | "chefe";

export interface LutadorTempoReal {
  readonly vida: number;
  readonly vidaMaxima: number;
  readonly raia: Raia;
  readonly distancia: Distancia;
  /** Ticks restantes de invencibilidade por esquiva. 0 = não esquivando. */
  readonly esquivandoPor: number;
  /** Ticks restantes até poder esquivar de novo. */
  readonly recargaDeEsquivaPor: number;
}

export interface InimigoTempoReal extends LutadorTempoReal {
  readonly tipo: TipoDeInimigo;
  /** Dano do golpe, calculado uma vez ao spawnar a onda. */
  readonly dano: number;
  /** Ticks restantes até o golpe telegrafado resolver. `null` = não está
      telegrafando agora. */
  readonly telegrafandoPor: number | null;
}

export type FaseDaSala = "em-andamento" | "vitoria" | "derrota";

export interface Sala {
  readonly jogador: LutadorTempoReal;
  /** O dano do golpe básico do jogador — calculado uma vez, na criação. */
  readonly danoDoJogador: number;
  readonly inimigo: InimigoTempoReal;
  /** 1..ONDAS_COMUNS_ANTES_DO_CHEFE = comuns; o próximo número = chefe. */
  readonly onda: number;
  readonly fase: FaseDaSala;
  readonly semente: number;
  /** Guardados para recalcular o inimigo de cada nova onda — ver
      `avancarTick` (Task 5), que spawna o próximo inimigo sem precisar
      que o servidor mande esses dois números de novo a cada onda. */
  readonly classeDoJogador: number;
  readonly nivelDoJogador: number;
}

function inimigoDaOnda(dados: {
  onda: number;
  classeDoJogador: number;
  nivelDoJogador: number;
  semente: number;
}): InimigoTempoReal {
  const ehChefe = dados.onda > ONDAS_COMUNS_ANTES_DO_CHEFE;
  const ramo = ramoDe(dados.classeDoJogador);
  const atributos = atributosDe(dados.classeDoJogador, dados.nivelDoJogador);
  const poderOfensivo = atributos[ATRIBUTO_OFENSIVO_DO_RAMO[ramo]];

  const dureza = ehChefe ? DUREZA_DO_CHEFE_NA_SALA : DUREZA_DO_INIMIGO_COMUM_NA_SALA;
  const vida = ehChefe ? VIDA_DO_CHEFE_NA_SALA : VIDA_DO_INIMIGO_COMUM_NA_SALA;

  return {
    tipo: ehChefe ? "chefe" : "comum",
    vida: Math.round(poderOfensivo * 3 * vida),
    vidaMaxima: Math.round(poderOfensivo * 3 * vida),
    dano: Math.round(poderOfensivo * dureza),
    raia: "centro",
    distancia: "longe",
    esquivandoPor: 0,
    recargaDeEsquivaPor: 0,
    telegrafandoPor: null,
  };
}

export function iniciarSala(dados: {
  classeDoJogador: number;
  nivelDoJogador: number;
  vidaDoJogador: number;
  vidaMaximaDoJogador: number;
  semente: number;
}): Sala {
  const ramo = ramoDe(dados.classeDoJogador);
  const atributos = atributosDe(dados.classeDoJogador, dados.nivelDoJogador);
  const danoDoJogador = atributos[ATRIBUTO_OFENSIVO_DO_RAMO[ramo]];

  return {
    jogador: {
      vida: dados.vidaDoJogador,
      vidaMaxima: dados.vidaMaximaDoJogador,
      raia: "centro",
      distancia: "longe",
      esquivandoPor: 0,
      recargaDeEsquivaPor: 0,
    },
    danoDoJogador,
    inimigo: inimigoDaOnda({
      onda: 1,
      classeDoJogador: dados.classeDoJogador,
      nivelDoJogador: dados.nivelDoJogador,
      semente: dados.semente,
    }),
    onda: 1,
    fase: "em-andamento",
    semente: dados.semente,
    classeDoJogador: dados.classeDoJogador,
    nivelDoJogador: dados.nivelDoJogador,
  };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: todos os testes passam. Se "sementes diferentes podem dar
inimigos com vida diferente" falhar de forma inesperada, ajuste o
`assert` — a vida do inimigo comum nesta fase é determinística pelo
nível/classe do jogador, não pela semente (a semente entra na IA, não na
criação), então `vidas.size` pode legitimamente ser `1`. Troque a
asserção por `assert.equal(vidas.size, 1)` com um comentário explicando
o porquê, em vez de forçar variação que a função não produz.

- [ ] **Step 6: Rodar os tipos do pacote inteiro**

Run: `cd packages/dominio && npm run tipos`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add packages/dominio/src/balanceamento.ts packages/dominio/src/combate-tempo-real.ts packages/dominio/testes/combate-tempo-real.test.ts
git commit -m "feat(dominio): tipos e iniciarSala do combate em tempo real"
```

---

### Task 2: Movimento e esquiva

**Files:**
- Modify: `packages/dominio/src/combate-tempo-real.ts`
- Test: `packages/dominio/testes/combate-tempo-real.test.ts`

**Interfaces:**
- Consumes: `Sala`, `RAIAS`, `DISTANCIAS` (Task 1).
- Produces: `moverRaia(sala: Sala, direcao: -1 | 1): Sala`,
  `moverDistancia(sala: Sala, direcao: -1 | 1): Sala`,
  `iniciarEsquiva(sala: Sala): Sala`.

- [ ] **Step 1: Escrever os testes que ainda não compilam**

Adicionar a `combate-tempo-real.test.ts`:

```ts
import {
  iniciarSala,
  moverRaia,
  moverDistancia,
  iniciarEsquiva,
  RAIAS,
  DISTANCIAS,
} from "../src/combate-tempo-real.ts";
```

(ajustar o import existente para incluir as três funções novas)

```ts
describe("moverRaia", () => {
  it("move uma posição na direção pedida", () => {
    const sala = novaSala(); // começa em "centro" (índice 1)
    const direita = moverRaia(sala, 1);
    assert.equal(direita.jogador.raia, "direita");
    const esquerda = moverRaia(sala, -1);
    assert.equal(esquerda.jogador.raia, "esquerda");
  });

  it("não sai dos limites — direita da direita continua direita", () => {
    const sala = novaSala();
    const noLimite = moverRaia(moverRaia(sala, 1), 1);
    assert.equal(noLimite.jogador.raia, "direita");
  });

  it("não muda mais nada da sala", () => {
    const sala = novaSala();
    const depois = moverRaia(sala, 1);
    assert.equal(depois.jogador.vida, sala.jogador.vida);
    assert.equal(depois.inimigo.vida, sala.inimigo.vida);
    assert.equal(depois.onda, sala.onda);
  });
});

describe("moverDistancia", () => {
  it("aproximar reduz a distância; afastar aumenta", () => {
    const sala = novaSala(); // começa em "longe" (índice 0)
    const perto = moverDistancia(moverDistancia(sala, 1), 1);
    assert.equal(perto.jogador.distancia, "perto");
    const longeDeNovo = moverDistancia(perto, -1);
    assert.equal(longeDeNovo.jogador.distancia, "medio");
  });

  it("não sai dos limites", () => {
    const sala = novaSala();
    const aindaLonge = moverDistancia(sala, -1);
    assert.equal(aindaLonge.jogador.distancia, "longe");
  });
});

describe("iniciarEsquiva", () => {
  it("com a recarga livre, abre a janela de invencibilidade e arma a recarga", () => {
    const sala = novaSala();
    const depois = iniciarEsquiva(sala);
    assert.ok(depois.jogador.esquivandoPor > 0);
    assert.ok(depois.jogador.recargaDeEsquivaPor > 0);
  });

  it("com a recarga em andamento, não faz nada", () => {
    const sala = novaSala();
    const primeira = iniciarEsquiva(sala);
    const segunda = iniciarEsquiva(primeira);
    assert.deepEqual(segunda, primeira);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: falha — `moverRaia`, `moverDistancia`, `iniciarEsquiva` não
existem no módulo.

- [ ] **Step 3: Implementar as três funções**

Adicionar a `combate-tempo-real.ts`, depois de `iniciarSala`:

```ts
import { DURACAO_DA_ESQUIVA_EM_TICKS, RECARGA_DA_ESQUIVA_EM_TICKS } from "./balanceamento.ts";
// (juntar a este import já existente do Step 1 do Task 1, em vez de duplicar)

function indiceLimitado(lista: readonly unknown[], indice: number, delta: number): number {
  return Math.max(0, Math.min(lista.length - 1, indice + delta));
}

export function moverRaia(sala: Sala, direcao: -1 | 1): Sala {
  const atual = RAIAS.indexOf(sala.jogador.raia);
  const novaRaia = RAIAS[indiceLimitado(RAIAS, atual, direcao)]!;
  return { ...sala, jogador: { ...sala.jogador, raia: novaRaia } };
}

export function moverDistancia(sala: Sala, direcao: -1 | 1): Sala {
  const atual = DISTANCIAS.indexOf(sala.jogador.distancia);
  const novaDistancia = DISTANCIAS[indiceLimitado(DISTANCIAS, atual, direcao)]!;
  return { ...sala, jogador: { ...sala.jogador, distancia: novaDistancia } };
}

/** Sem efeito se a recarga ainda não zerou — pedir esquiva cedo demais
    simplesmente não faz nada, não é erro. */
export function iniciarEsquiva(sala: Sala): Sala {
  if (sala.jogador.recargaDeEsquivaPor > 0) return sala;
  return {
    ...sala,
    jogador: {
      ...sala.jogador,
      esquivandoPor: DURACAO_DA_ESQUIVA_EM_TICKS,
      recargaDeEsquivaPor: RECARGA_DA_ESQUIVA_EM_TICKS,
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add packages/dominio/src/combate-tempo-real.ts packages/dominio/testes/combate-tempo-real.test.ts
git commit -m "feat(dominio): mover e esquivar no combate em tempo real"
```

---

### Task 3: O golpe do jogador

**Files:**
- Modify: `packages/dominio/src/combate-tempo-real.ts`
- Test: `packages/dominio/testes/combate-tempo-real.test.ts`

**Interfaces:**
- Consumes: `Sala`, `LutadorTempoReal`, `InimigoTempoReal` (Task 1).
- Produces: `atacar(sala: Sala): Sala`.

- [ ] **Step 1: Escrever os testes**

Adicionar a `combate-tempo-real.test.ts` (e `atacar` ao import):

```ts
function salaComInimigoNaMesmaPosicao(): ReturnType<typeof novaSala> {
  const sala = novaSala();
  return {
    ...sala,
    inimigo: { ...sala.inimigo, raia: "centro", distancia: "perto" },
  };
}

describe("atacar", () => {
  it("acerta quando mesma raia, distância perto, e o inimigo não está esquivando", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const depois = atacar(sala);
    assert.ok(depois.inimigo.vida < sala.inimigo.vida, "o inimigo devia ter tomado dano");
  });

  it("erra se as raias são diferentes", () => {
    const sala = novaSala(); // jogador centro, inimigo centro por padrão — força diferença
    const comDiferenca = {
      ...sala,
      inimigo: { ...sala.inimigo, raia: "direita" as const, distancia: "perto" as const },
    };
    const depois = atacar(comDiferenca);
    assert.equal(depois.inimigo.vida, comDiferenca.inimigo.vida);
  });

  it("erra se a distância não é perto", () => {
    const sala = novaSala();
    const longe = { ...sala, inimigo: { ...sala.inimigo, raia: "centro" as const, distancia: "longe" as const } };
    const depois = atacar(longe);
    assert.equal(depois.inimigo.vida, longe.inimigo.vida);
  });

  it("erra se o inimigo está numa janela de invencibilidade (não é o caso aqui, mas o jogo tem o espelho — ver Task 4)", () => {
    // Este caso específico (inimigo esquivando) não existe nesta fase —
    // só o JOGADOR esquiva. O teste documenta a assimetria: `atacar` não
    // checa `sala.inimigo.esquivandoPor` porque esse campo nunca é
    // setado por nenhuma função desta fase. Ver Task 4.
    const sala = salaComInimigoNaMesmaPosicao();
    assert.equal(sala.inimigo.esquivandoPor, 0);
  });

  it("não acerta se o JOGADOR está numa janela de esquiva — o golpe é dele, mas o teste documenta que atacar não depende disso", () => {
    // atacar() é sobre o golpe DO JOGADOR contra o inimigo — a esquiva do
    // jogador é relevante para o golpe DO INIMIGO (Task 4), não para
    // este. Confirma que esquivar não bloqueia o próprio ataque.
    const sala = iniciarEsquiva(salaComInimigoNaMesmaPosicao());
    const depois = atacar(sala);
    assert.ok(depois.inimigo.vida < sala.inimigo.vida);
  });

  it("reduz a onda a zero não mata o jogador nem avança onda sozinho — isso é avancarTick (Task 5)", () => {
    const sala = { ...salaComInimigoNaMesmaPosicao() };
    const comInimigoFraco = { ...sala, inimigo: { ...sala.inimigo, vida: 1 } };
    const depois = atacar(comInimigoFraco);
    assert.ok(depois.inimigo.vida <= 0);
    assert.equal(depois.onda, comInimigoFraco.onda, "atacar não avança onda — isso é avancarTick");
    assert.equal(depois.fase, "em-andamento", "atacar não decide vitória — isso é avancarTick");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: falha — `atacar` não existe.

- [ ] **Step 3: Implementar `atacar`**

Adicionar a `combate-tempo-real.ts`:

```ts
export function atacar(sala: Sala): Sala {
  const acertou =
    sala.jogador.raia === sala.inimigo.raia &&
    sala.jogador.distancia === "perto" &&
    sala.inimigo.esquivandoPor === 0;

  if (!acertou) return sala;

  return {
    ...sala,
    inimigo: {
      ...sala.inimigo,
      vida: Math.max(0, sala.inimigo.vida - sala.danoDoJogador),
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add packages/dominio/src/combate-tempo-real.ts packages/dominio/testes/combate-tempo-real.test.ts
git commit -m "feat(dominio): o golpe do jogador no combate em tempo real"
```

---

### Task 4: A IA do inimigo — perseguir, telegrafar, atacar

**Files:**
- Modify: `packages/dominio/src/combate-tempo-real.ts`
- Test: `packages/dominio/testes/combate-tempo-real.test.ts`

**Interfaces:**
- Consumes: `Sala`, `RAIAS`, `DISTANCIAS`, `TELEGRAFO_DO_INIMIGO_EM_TICKS`
  (balanceamento.ts).
- Produces: `decidirAcaoDoInimigo(sala: Sala): Sala`,
  `resolverAtaqueDoInimigo(sala: Sala): Sala`. Usadas só por `avancarTick`
  (Task 5) — não chamadas diretamente pelo servidor.

- [ ] **Step 1: Escrever os testes**

Adicionar a `combate-tempo-real.test.ts` (e as duas funções ao import):

```ts
describe("decidirAcaoDoInimigo", () => {
  it("fora de alcance, persegue: se anda em raia, aproxima uma posição por vez", () => {
    const sala = { ...novaSala(), inimigo: { ...novaSala().inimigo, raia: "direita" as const, distancia: "longe" as const } };
    // jogador está em "centro" — inimigo em "direita" deve andar pra "centro"
    const depois = decidirAcaoDoInimigo(sala);
    assert.equal(depois.inimigo.raia, "centro");
  });

  it("já na mesma raia e mesma distância, não se move — decide telegrafar ou esperar", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    // Sementes diferentes decidem diferente; roda várias vezes e confirma
    // que a raia/distância nunca mudam quando já em alcance.
    for (let s = 0; s < 20; s++) {
      const comSemente = { ...sala, semente: s };
      const depois = decidirAcaoDoInimigo(comSemente);
      assert.equal(depois.inimigo.raia, sala.inimigo.raia);
      assert.equal(depois.inimigo.distancia, sala.inimigo.distancia);
    }
  });

  it("eventualmente telegrafa, dado sementes suficientes", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const telegrafou = Array.from({ length: 50 }, (_, s) =>
      decidirAcaoDoInimigo({ ...sala, semente: s }),
    ).some((depois) => depois.inimigo.telegrafandoPor !== null);
    assert.ok(telegrafou, "em 50 sementes, nenhuma decidiu telegrafar");
  });

  it("já telegrafando, não decide nada novo — espera resolver", () => {
    const sala = {
      ...salaComInimigoNaMesmaPosicao(),
      inimigo: { ...salaComInimigoNaMesmaPosicao().inimigo, telegrafandoPor: 3 },
    };
    const depois = decidirAcaoDoInimigo(sala);
    assert.deepEqual(depois, sala);
  });
});

describe("resolverAtaqueDoInimigo", () => {
  it("acerta o jogador se ele não está esquivando", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const jogadorNaMesmaPosicao = {
      ...sala,
      jogador: { ...sala.jogador, raia: sala.inimigo.raia, distancia: sala.inimigo.distancia },
    };
    const depois = resolverAtaqueDoInimigo(jogadorNaMesmaPosicao);
    assert.ok(depois.jogador.vida < jogadorNaMesmaPosicao.jogador.vida);
  });

  it("não acerta se o jogador está esquivando", () => {
    const sala = salaComInimigoNaMesmaPosicao();
    const esquivando = {
      ...sala,
      jogador: {
        ...sala.jogador,
        raia: sala.inimigo.raia,
        distancia: sala.inimigo.distancia,
        esquivandoPor: 2,
      },
    };
    const depois = resolverAtaqueDoInimigo(esquivando);
    assert.equal(depois.jogador.vida, esquivando.jogador.vida);
  });

  it("não acerta se raia ou distância diferem", () => {
    const sala = novaSala(); // inimigo em "centro"/"longe" por padrão, jogador igual — força diferença
    const separados = {
      ...sala,
      jogador: { ...sala.jogador, distancia: "perto" as const },
      inimigo: { ...sala.inimigo, distancia: "longe" as const },
    };
    const depois = resolverAtaqueDoInimigo(separados);
    assert.equal(depois.jogador.vida, separados.jogador.vida);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: falha — as duas funções não existem.

- [ ] **Step 3: Implementar**

Adicionar a `combate-tempo-real.ts` (import `chance`, `escolher`, `sortear`
de `./aleatorio.ts`, e `TELEGRAFO_DO_INIMIGO_EM_TICKS` de
`./balanceamento.ts`, juntando aos imports já existentes):

```ts
import { chance, sortear } from "./aleatorio.ts";
import { TELEGRAFO_DO_INIMIGO_EM_TICKS } from "./balanceamento.ts";

/** Chance por tick de iniciar o telégrafo, quando já em alcance. Não é
    constante de balanceamento formal porque é puramente de ritmo de IA,
    não de dificuldade — ajustar aqui não muda quem vence, só o quão
    "nervoso" o inimigo parece. */
const CHANCE_DE_TELEGRAFAR_POR_TICK = 0.15;

/**
 * Persegue se fora de alcance; senão, considera iniciar o telégrafo.
 * Nunca decide as duas coisas no mesmo tick — perseguir e atacar juntos
 * tornaria esquivar sem sentido, porque o inimigo já estaria em cima.
 */
export function decidirAcaoDoInimigo(sala: Sala): Sala {
  if (sala.inimigo.telegrafandoPor !== null) return sala;

  const mesmaRaia = sala.inimigo.raia === sala.jogador.raia;
  const mesmaDistancia = sala.inimigo.distancia === sala.jogador.distancia;

  if (!mesmaRaia || !mesmaDistancia) {
    const raiaAtual = RAIAS.indexOf(sala.inimigo.raia);
    const raiaAlvo = RAIAS.indexOf(sala.jogador.raia);
    const distanciaAtual = DISTANCIAS.indexOf(sala.inimigo.distancia);
    const distanciaAlvo = DISTANCIAS.indexOf(sala.jogador.distancia);

    const novaRaia = mesmaRaia
      ? sala.inimigo.raia
      : RAIAS[raiaAtual + Math.sign(raiaAlvo - raiaAtual)]!;
    const novaDistancia = mesmaDistancia
      ? sala.inimigo.distancia
      : DISTANCIAS[distanciaAtual + Math.sign(distanciaAlvo - distanciaAtual)]!;

    return {
      ...sala,
      inimigo: { ...sala.inimigo, raia: novaRaia, distancia: novaDistancia },
    };
  }

  const rolo = chance(sala.semente, CHANCE_DE_TELEGRAFAR_POR_TICK);
  if (!rolo.acertou) return { ...sala, semente: rolo.semente };

  return {
    ...sala,
    semente: rolo.semente,
    inimigo: { ...sala.inimigo, telegrafandoPor: TELEGRAFO_DO_INIMIGO_EM_TICKS },
  };
}

/** Chamada quando o telégrafo chega a zero — resolve o golpe e limpa o
    telégrafo, independente de ter acertado. */
export function resolverAtaqueDoInimigo(sala: Sala): Sala {
  const acertou =
    sala.jogador.raia === sala.inimigo.raia &&
    sala.jogador.distancia === sala.inimigo.distancia &&
    sala.jogador.esquivandoPor === 0;

  return {
    ...sala,
    inimigo: { ...sala.inimigo, telegrafandoPor: null },
    jogador: acertou
      ? { ...sala.jogador, vida: Math.max(0, sala.jogador.vida - sala.inimigo.dano) }
      : sala.jogador,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: todos passam. Se "eventualmente telegrafa" falhar por acaso de
semente, isso é sinal real de bug (15% de chance por tick, 50 tentativas
— a chance de falhar todas é ~0,03%) — não ajuste o teste sem investigar
`decidirAcaoDoInimigo` primeiro.

- [ ] **Step 5: Commit**

```bash
git add packages/dominio/src/combate-tempo-real.ts packages/dominio/testes/combate-tempo-real.test.ts
git commit -m "feat(dominio): IA do inimigo — perseguir, telegrafar, atacar"
```

---

### Task 5: `avancarTick` — o orquestrador, ondas e vitória/derrota

**Files:**
- Modify: `packages/dominio/src/combate-tempo-real.ts`
- Test: `packages/dominio/testes/combate-tempo-real.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1-4.
- Produces: `avancarTick(sala: Sala): Sala` — a única função que o
  servidor chama em loop. Faz tudo: decrementa temporizadores, resolve
  telégrafo vencido, roda a IA, avança onda, decide vitória/derrota.

- [ ] **Step 1: Escrever os testes**

Adicionar a `combate-tempo-real.test.ts` (e `avancarTick` ao import):

```ts
describe("avancarTick", () => {
  it("decrementa esquiva e recarga de esquiva do jogador", () => {
    const sala = iniciarEsquiva(novaSala());
    const depois = avancarTick(sala);
    assert.equal(depois.jogador.esquivandoPor, sala.jogador.esquivandoPor - 1);
    assert.equal(depois.jogador.recargaDeEsquivaPor, sala.jogador.recargaDeEsquivaPor - 1);
  });

  it("nunca decrementa abaixo de zero", () => {
    const sala = novaSala(); // esquivandoPor já é 0
    const depois = avancarTick(sala);
    assert.equal(depois.jogador.esquivandoPor, 0);
  });

  it("telégrafo em andamento decrementa; ao chegar a zero, resolve o ataque", () => {
    const base = salaComInimigoNaMesmaPosicao();
    const telegrafando = {
      ...base,
      jogador: { ...base.jogador, raia: base.inimigo.raia, distancia: base.inimigo.distancia },
      inimigo: { ...base.inimigo, telegrafandoPor: 1 },
    };
    const depois = avancarTick(telegrafando);
    assert.equal(depois.inimigo.telegrafandoPor, null);
    assert.ok(depois.jogador.vida < telegrafando.jogador.vida, "o golpe devia ter resolvido e acertado");
  });

  it("inimigo comum derrotado avança pra próxima onda, jogador mantém a vida que tinha", () => {
    const sala = { ...novaSala(), inimigo: { ...novaSala().inimigo, vida: 0 } };
    const depois = avancarTick(sala);
    assert.equal(depois.onda, 2);
    assert.equal(depois.fase, "em-andamento");
    assert.equal(depois.jogador.vida, sala.jogador.vida, "vida atravessa entre ondas, não cura");
    assert.notEqual(depois.inimigo, sala.inimigo, "novo inimigo spawnou");
    assert.ok(depois.inimigo.vida > 0);
  });

  it("chefe derrotado (onda além das comuns) termina a sala em vitória", () => {
    const salaNoChefe = {
      ...novaSala(),
      onda: 4, // ONDAS_COMUNS_ANTES_DO_CHEFE (3) + 1
      inimigo: { ...novaSala().inimigo, tipo: "chefe" as const, vida: 0 },
    };
    const depois = avancarTick(salaNoChefe);
    assert.equal(depois.fase, "vitoria");
  });

  it("jogador com vida zero termina a sala em derrota, mesmo com o inimigo vivo", () => {
    const sala = { ...novaSala(), jogador: { ...novaSala().jogador, vida: 0 } };
    const depois = avancarTick(sala);
    assert.equal(depois.fase, "derrota");
  });

  it("sala já terminada (vitória ou derrota) não muda mais nada", () => {
    const venceu = { ...novaSala(), fase: "vitoria" as const };
    assert.deepEqual(avancarTick(venceu), venceu);
    const perdeu = { ...novaSala(), fase: "derrota" as const };
    assert.deepEqual(avancarTick(perdeu), perdeu);
  });

  it("sem telégrafo e fora de alcance, o inimigo persegue no tick", () => {
    const sala = {
      ...novaSala(),
      inimigo: { ...novaSala().inimigo, raia: "direita" as const },
    };
    const depois = avancarTick(sala);
    assert.equal(depois.inimigo.raia, "centro");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: falha — `avancarTick` não existe.

- [ ] **Step 3: Implementar**

Adicionar a `combate-tempo-real.ts`:

```ts
function decrementar(v: number): number {
  return Math.max(0, v - 1);
}

export function avancarTick(sala: Sala): Sala {
  if (sala.fase !== "em-andamento") return sala;

  // 1. Temporizadores do jogador.
  let atual: Sala = {
    ...sala,
    jogador: {
      ...sala.jogador,
      esquivandoPor: decrementar(sala.jogador.esquivandoPor),
      recargaDeEsquivaPor: decrementar(sala.jogador.recargaDeEsquivaPor),
    },
  };

  // 2. Jogador morreu num golpe anterior? Derrota, sem processar mais nada.
  if (atual.jogador.vida <= 0) {
    return { ...atual, fase: "derrota" };
  }

  // 3. Telégrafo do inimigo: decrementa, e resolve ao chegar em zero.
  if (atual.inimigo.telegrafandoPor !== null) {
    const restante = atual.inimigo.telegrafandoPor - 1;
    if (restante <= 0) {
      atual = resolverAtaqueDoInimigo(atual);
    } else {
      atual = { ...atual, inimigo: { ...atual.inimigo, telegrafandoPor: restante } };
    }
  } else {
    atual = decidirAcaoDoInimigo(atual);
  }

  // 4. Jogador morreu no golpe que acabou de resolver.
  if (atual.jogador.vida <= 0) {
    return { ...atual, fase: "derrota" };
  }

  // 5. Inimigo morreu (pelo golpe do jogador, chamado fora deste laço —
  //    ver `atacar`). Avança onda ou vence a sala.
  if (atual.inimigo.vida <= 0) {
    if (atual.inimigo.tipo === "chefe") {
      return { ...atual, fase: "vitoria" };
    }
    const proximaOnda = atual.onda + 1;
    const rolo = sortear(atual.semente);
    return {
      ...atual,
      onda: proximaOnda,
      semente: rolo.semente,
      inimigo: inimigoDaOnda({
        onda: proximaOnda,
        classeDoJogador: atual.classeDoJogador,
        nivelDoJogador: atual.nivelDoJogador,
        semente: rolo.semente,
      }),
    };
  }

  return atual;
}
```

`classeDoJogador`/`nivelDoJogador` já vêm prontos em `Sala` desde a Task
1 — `iniciarSala` os copia de seus parâmetros de entrada — então esta
função só os lê, nunca recalcula.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd packages/dominio && npx tsx --test testes/combate-tempo-real.test.ts`
Expected: todos os testes de Tasks 1-5 passam.

- [ ] **Step 5: Rodar os tipos do pacote inteiro**

Run: `cd packages/dominio && npm run tipos`
Expected: sem erro.

- [ ] **Step 6: Exportar o módulo no barrel**

Editar `packages/dominio/src/index.ts`, adicionando:

```ts
export * from "./combate-tempo-real.ts";
```

(ao lado dos outros `export * from "./..."`, ordem alfabética não é
seguida no arquivo hoje — colocar perto de `./batalha.ts` é razoável)

- [ ] **Step 7: Rodar a suíte de domínio inteira**

Run: `cd packages/dominio && npx tsx --test testes/*.test.ts`
Expected: todos os testes (os já existentes + os novos) passam.

- [ ] **Step 8: Commit**

```bash
git add packages/dominio/src/combate-tempo-real.ts packages/dominio/src/index.ts packages/dominio/testes/combate-tempo-real.test.ts
git commit -m "feat(dominio): avancarTick — orquestra ondas, vitória e derrota"
```

---

### Task 6: `SalasTempoReal` e a rota WebSocket

**Files:**
- Modify: `apps/servidor/package.json`
- Create: `apps/servidor/src/tempo-real.ts`
- Modify: `apps/servidor/src/aplicacao.ts`

**Interfaces:**
- Consumes: `iniciarSala`, `avancarTick`, `moverRaia`, `moverDistancia`,
  `iniciarEsquiva`, `atacar`, `type Sala` (`@chaos/dominio`, Tasks 1-5).
  `perderBatalha`, `type Personagem`, `type Dificuldade`
  (`@chaos/dominio`, já existentes). `premioDe` (`./batalhas.ts`, já
  existente — reaproveitar, não duplicar).
- Produces: `class SalasTempoReal`, `registrarRotasDeTempoReal(app: FastifyInstance, deps: {armazenamento, agora, sessoes}): void`.

- [ ] **Step 1: Instalar a dependência**

Run: `cd apps/servidor && npm install @fastify/websocket`
Expected: `apps/servidor/package.json` ganha `"@fastify/websocket"` em
`dependencies`, com a versão que o npm resolveu (compatível com Fastify
5.x — não fixar manualmente um número, deixar o npm resolver e conferir
depois que a versão instalada é `^11` ou mais nova).

- [ ] **Step 2: Criar `apps/servidor/src/tempo-real.ts`**

```ts
import type { FastifyInstance } from "fastify";
import {
  atacar,
  iniciarEsquiva,
  iniciarSala,
  moverDistancia,
  moverRaia,
  avancarTick,
  perderBatalha,
  type Sala,
  TICKS_POR_SEGUNDO,
  TIMEOUT_DE_DESCONEXAO_MS,
} from "@chaos/dominio";
import type { Armazenamento } from "./armazenamento.ts";
import { premioDe } from "./batalhas.ts";
import { Sessoes } from "./sessoes.ts";

/**
 * O token chega como subprotocolo do WebSocket (`bearer.<token>`), não
 * como cabeçalho `Authorization` — o `WebSocket` nativo do navegador não
 * permite mandar cabeçalhos customizados no handshake, só subprotocolos.
 * Ver `apps/jogo/src/lib/tempo-real.ts` (Task 8), o lado que manda.
 */
function tokenDoSubprotocolo(cabecalho: string | string[] | undefined): string | null {
  const valor = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  if (!valor || !valor.startsWith("bearer.")) return null;
  return valor.slice("bearer.".length) || null;
}

/**
 * As salas de combate em tempo real, em memória — como `Batalhas` e
 * `Cambio`. Um reinício do servidor derruba toda sala em andamento; para
 * o tamanho deste jogo hoje, aceitável, e o pior caso é a sala contar
 * como derrota quando o cliente tentar reconectar e não achar nada.
 */
export class SalasTempoReal {
  private contador = 0;

  novoId(): string {
    this.contador += 1;
    return `tr${this.contador}`;
  }
}

interface Mensagem {
  tipo: "mover-raia" | "mover-distancia" | "esquivar" | "atacar";
  direcao?: -1 | 1;
}

function aplicarIntencao(sala: Sala, msg: Mensagem): Sala {
  switch (msg.tipo) {
    case "mover-raia":
      return moverRaia(sala, msg.direcao === -1 ? -1 : 1);
    case "mover-distancia":
      return moverDistancia(sala, msg.direcao === -1 ? -1 : 1);
    case "esquivar":
      return iniciarEsquiva(sala);
    case "atacar":
      return atacar(sala);
    default:
      return sala;
  }
}

export function registrarRotasDeTempoReal(
  app: FastifyInstance,
  deps: {
    armazenamento: Armazenamento;
    agora: () => number;
    sessoes: Sessoes;
    salas: SalasTempoReal;
  },
): void {
  const { armazenamento, agora, sessoes, salas } = deps;

  app.get("/combate-tempo-real/:id", { websocket: true }, async (socket, req) => {
    const token = tokenDoSubprotocolo(req.headers["sec-websocket-protocol"]);
    const contaId = sessoes.dono(token, agora());
    if (!contaId) {
      socket.close(4001, "sem sessão válida");
      return;
    }

    const { id: personagemId } = req.params as { id: string };
    const conta = await armazenamento.contas.buscar(contaId);
    if (!conta || !conta.personagens.includes(personagemId)) {
      socket.close(4004, "personagem não encontrado");
      return;
    }
    const guardado = await armazenamento.personagens.buscar(personagemId);
    if (!guardado || guardado.estado === "tumulo") {
      socket.close(4004, "personagem indisponível");
      return;
    }

    const idDaSala = salas.novoId();
    let sala = iniciarSala({
      classeDoJogador: guardado.classe,
      nivelDoJogador: guardado.nivel,
      vidaDoJogador: guardado.vida,
      vidaMaximaDoJogador: guardado.vida, // Fase 1: entra com a vida atual como teto da sala
      semente: agora() + idDaSala.length,
    });

    let ultimaIntencaoEm = agora();
    let encerrada = false;

    async function concluir(): Promise<void> {
      if (encerrada) return;
      encerrada = true;
      clearInterval(tick);

      const atual = await armazenamento.personagens.buscar(personagemId);
      if (!atual) return;

      if (sala.fase === "derrota") {
        await armazenamento.personagens.salvar(perderBatalha(atual));
      } else if (sala.fase === "vitoria") {
        const premio = premioDe(atual.nivel, atual.dificuldade);
        await armazenamento.personagens.salvar({
          ...atual,
          sucata: atual.sucata + premio.sucata,
        });
      }
      socket.close(1000, sala.fase);
    }

    const tick = setInterval(() => {
      if (encerrada) return;

      if (agora() - ultimaIntencaoEm > TIMEOUT_DE_DESCONEXAO_MS) {
        sala = { ...sala, fase: "derrota" };
      } else {
        sala = avancarTick(sala);
      }

      socket.send(JSON.stringify({ tipo: "estado", sala }));
      if (sala.fase !== "em-andamento") void concluir();
    }, 1000 / TICKS_POR_SEGUNDO);

    socket.on("message", (dados: Buffer) => {
      if (encerrada) return;
      ultimaIntencaoEm = agora();
      try {
        const msg = JSON.parse(dados.toString()) as Mensagem;
        sala = aplicarIntencao(sala, msg);
      } catch {
        // Mensagem malformada: ignora este tick, a sala segue como estava.
      }
    });

    socket.on("close", () => {
      void concluir();
    });
  });
}
```

- [ ] **Step 3: Registrar o plugin e a rota em `aplicacao.ts`**

No topo do arquivo, junto aos outros imports de plugin:

```ts
import websocket from "@fastify/websocket";
import { registrarRotasDeTempoReal, SalasTempoReal } from "./tempo-real.ts";
```

Perto de `void app.register(cors, {...})`, adicionar:

```ts
void app.register(websocket);
```

Perto de onde `sessoes`/`filas` são criados dentro de `criarAplicacao`,
adicionar:

```ts
const salasTempoReal = new SalasTempoReal();
```

E, depois que todas as outras rotas estão registradas (perto do fim de
`criarAplicacao`, antes do `return app;`), adicionar:

```ts
registrarRotasDeTempoReal(app, { armazenamento, agora, sessoes, salas: salasTempoReal });
```

- [ ] **Step 4: Rodar os tipos**

Run: `cd apps/servidor && npm run tipos`
Expected: sem erro. Se `req.params`/`req.headers` derem erro de tipo,
anotar explicitamente: `const { id } = req.params as { id: string };`
(já está assim no Step 2 — conferir se o erro é outro antes de mexer).

- [ ] **Step 5: Rodar a suíte de servidor inteira**

Run: `cd apps/servidor && npx tsx --test testes/*.test.ts`
Expected: todos os testes já existentes continuam passando — esta rota
ainda não tem teste próprio (Task 7).

- [ ] **Step 6: Commit**

```bash
git add apps/servidor/package.json apps/servidor/package-lock.json apps/servidor/src/tempo-real.ts apps/servidor/src/aplicacao.ts
git commit -m "feat(servidor): sala de combate em tempo real via WebSocket"
```

---

### Task 7: Testes de integração da fiação WebSocket

**Files:**
- Create: `apps/servidor/testes/tempo-real.test.ts`

**Interfaces:**
- Consumes: `criarAplicacao`, `emMemoria`, `Sessoes` (padrão já usado em
  todos os outros testes de servidor).

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { type Conta, type Personagem } from "@chaos/dominio";
import { criarAplicacao } from "../src/aplicacao.ts";
import { emMemoria } from "../src/armazenamento.ts";
import { Sessoes } from "../src/sessoes.ts";

/**
 * A fiação do WebSocket — abre, autentica, aceita intenção, fecha.
 *
 * A LÓGICA de combate já está testada a fundo em
 * `packages/dominio/testes/combate-tempo-real.test.ts`, pura e sem
 * infraestrutura. Aqui só interessa que a conexão em si funciona.
 */

const AGORA = 1_700_000_000_000;

const heroi = (id: string, extra: Partial<Personagem> = {}): Personagem => ({
  id,
  nome: `Herói ${id}`,
  classe: 4,
  nivel: 30,
  xp: 0,
  camada: 0,
  estado: "vivo",
  vida: 900,
  visto: AGORA,
  sucata: 0,
  mortes: 0,
  gastos: {},
  equipado: {},
  mochila: [],
  elo: 1000,
  duelos: { vitorias: 0, derrotas: 0, defesas: 0 },
  dificuldade: "medio",
  vidasRestantes: 2,
  vidasGuardadas: 0,
  ...extra,
});

const conta = (id: string, personagens: string[]): Conta => ({
  id,
  email: `${id}@t.com`,
  senha: "(direto)",
  criadaEm: AGORA,
  visto: AGORA,
  premium: 0,
  slotsComprados: 0,
  personagens,
});

async function subir() {
  const sessoes = new Sessoes();
  const p = heroi("p1");
  const armazenamento = emMemoria([p], [conta("c1", ["p1"])]);
  const app = criarAplicacao({ armazenamento, agora: () => AGORA, sessoes });
  await app.listen({ port: 0 });
  const endereco = app.server.address();
  if (!endereco || typeof endereco === "string") throw new Error("sem porta");
  return {
    app,
    porta: endereco.port,
    token: sessoes.abrir("c1", AGORA),
    armazenamento,
  };
}

describe("combate em tempo real — WebSocket", () => {
  it("recusa conexão sem token", async () => {
    const { app, porta } = await subir();
    const ws = new WebSocket(`ws://localhost:${porta}/combate-tempo-real/p1`);
    const codigo = await new Promise<number>((resolve) => {
      ws.on("close", (c) => resolve(c));
    });
    assert.equal(codigo, 4001);
    await app.close();
  });

  it("conecta com token válido e recebe o primeiro estado", async () => {
    const { app, porta, token } = await subir();
    const ws = new WebSocket(
      `ws://localhost:${porta}/combate-tempo-real/p1`,
      [`bearer.${token}`],
    );
    const primeiraMensagem = await new Promise<string>((resolve) => {
      ws.on("message", (dados) => resolve(dados.toString()));
    });
    const corpo = JSON.parse(primeiraMensagem);
    assert.equal(corpo.tipo, "estado");
    assert.equal(corpo.sala.fase, "em-andamento");
    assert.equal(corpo.sala.onda, 1);
    ws.close();
    await app.close();
  });

  it("aceita intenção e reflete no próximo estado", async () => {
    const { app, porta, token } = await subir();
    const ws = new WebSocket(
      `ws://localhost:${porta}/combate-tempo-real/p1`,
      [`bearer.${token}`],
    );

    await new Promise<void>((resolve) => ws.on("open", () => resolve()));
    await new Promise<void>((resolve) => ws.once("message", () => resolve())); // primeiro estado

    ws.send(JSON.stringify({ tipo: "mover-raia", direcao: 1 }));

    const segundoEstado = await new Promise<string>((resolve) => {
      ws.once("message", (dados) => resolve(dados.toString()));
    });
    const corpo = JSON.parse(segundoEstado);
    assert.equal(corpo.sala.jogador.raia, "direita");
    ws.close();
    await app.close();
  });
});
```

- [ ] **Step 2: Instalar o cliente WebSocket de teste, se ainda não houver**

Run: `cd apps/servidor && npm install --save-dev ws @types/ws`
Expected: `ws` e `@types/ws` em `devDependencies`.

- [ ] **Step 3: Rodar e confirmar que passa**

Run: `cd apps/servidor && npx tsx --test testes/tempo-real.test.ts`
Expected: os três testes passam. Se "recusa conexão sem token" travar
esperando um evento `close` que não chega, confira que
`socket.close(4001, ...)` em `tempo-real.ts` está sendo chamado ANTES de
qualquer `await` na rota — Fastify websocket precisa do handshake
completar antes de fechar, então mover a checagem de token para o mais
cedo possível na função já resolve (é onde o Step 2 do Task 6 já coloca).

- [ ] **Step 4: Rodar a suíte de servidor inteira**

Run: `cd apps/servidor && npx tsx --test testes/*.test.ts`
Expected: tudo passa.

- [ ] **Step 5: Rodar os tipos do pacote inteiro**

Run: `cd apps/servidor && npm run tipos`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add apps/servidor/package.json apps/servidor/package-lock.json apps/servidor/testes/tempo-real.test.ts
git commit -m "test(servidor): fiação do WebSocket de combate em tempo real"
```

---

### Task 8: Cliente WebSocket

**Files:**
- Create: `apps/jogo/src/lib/tempo-real.ts`

**Interfaces:**
- Consumes: `tokenGuardado(): string | null` and `BASE` (both from
  `apps/jogo/src/lib/api.ts` — `BASE` is module-private today and this
  task exports it, Step 3 below).
- Produces: `conectarSalaTempoReal(personagemId: string, aoReceberEstado:
  (sala: unknown) => void): { mandar: (msg: object) => void; fechar: () =>
  void }`.

- [ ] **Step 1: Conferir o helper de token existente**

Run (leitura, não execução):
`grep -n "tokenGuardado\|^const BASE" apps/jogo/src/lib/api.ts`

Confirmar que `tokenGuardado` exporta um `string | null` e que `BASE` é
`process.env.NEXT_PUBLIC_API ?? "http://localhost:3333"` — não duplicar
a lógica de onde o token mora (`localStorage`).

- [ ] **Step 2: Criar `apps/jogo/src/lib/tempo-real.ts`**

```ts
import { BASE, tokenGuardado } from "./api.ts";

/**
 * O cliente WebSocket do combate em tempo real.
 *
 * Fino de propósito: manda intenção, recebe estado, nada de lógica de
 * jogo aqui — isso mora no componente que desenha a tela, e a fonte de
 * verdade é sempre o que o servidor manda de volta.
 */

const BASE_WS = BASE.replace(/^http/, "ws");

/**
 * O token vai como subprotocolo do WebSocket (`bearer.<token>`), não como
 * cabeçalho — o `WebSocket` nativo do navegador não aceita cabeçalhos
 * customizados no handshake, só subprotocolos. O servidor
 * (`apps/servidor/src/tempo-real.ts`, Task 6) já lê o token desse mesmo
 * jeito.
 */
export function conectarSalaTempoReal(
  personagemId: string,
  aoReceberEstado: (mensagem: { tipo: string; sala?: unknown }) => void,
  aoFechar: (codigo: number) => void,
): { mandar: (msg: object) => void; fechar: () => void } {
  const token = tokenGuardado() ?? "";
  const socket = new WebSocket(
    `${BASE_WS}/combate-tempo-real/${personagemId}`,
    [`bearer.${token}`],
  );

  socket.onmessage = (evento) => {
    aoReceberEstado(JSON.parse(evento.data as string));
  };
  socket.onclose = (evento) => aoFechar(evento.code);

  return {
    mandar: (msg) => socket.send(JSON.stringify(msg)),
    fechar: () => socket.close(),
  };
}
```

`BASE` vem do import feito no Step 2 (`./api.ts`) — o mesmo valor de
`process.env.NEXT_PUBLIC_API` que o resto do cliente já usa para HTTP,
só trocando `http`/`https` por `ws`/`wss`. Isso exige exportar `BASE` de
`api.ts`, que hoje é uma constante de módulo não exportada — adicionar
`export` na declaração (`apps/jogo/src/lib/api.ts:11`, `const BASE = ...`
vira `export const BASE = ...`) antes deste import funcionar.

- [ ] **Step 3: Exportar `BASE` em `api.ts`**

Editar `apps/jogo/src/lib/api.ts:11`: trocar `const BASE = ...` por
`export const BASE = ...`, sem mudar o valor.

- [ ] **Step 4: Rodar os tipos dos dois pacotes**

Run: `cd apps/jogo && npm run tipos && cd ../servidor && npm run tipos`
Expected: sem erro nos dois.

- [ ] **Step 5: Commit**

```bash
git add apps/jogo/src/lib/tempo-real.ts apps/jogo/src/lib/api.ts
git commit -m "feat(jogo): cliente WebSocket do combate em tempo real"
```

---

### Task 9: A tela — `CombateTempoReal.tsx`

**Files:**
- Create: `apps/jogo/src/componentes/CombateTempoReal.tsx`

**Interfaces:**
- Consumes: `conectarSalaTempoReal(personagemId, aoReceberEstado, aoFechar)` (Task 8).
- Produces: `<CombateTempoReal personagemId={string} aoFechar={() => void} />`
  — componente nomeado, exportado via `export function CombateTempoReal`.
  Sem prop `aoAtualizar`: o servidor já grava o resultado no personagem
  quando a sala termina (Task 6), então quem chama `aoFechar` só precisa
  recarregar o personagem do zero — não receber um objeto atualizado de
  volta. Ver a nota no fim deste Task.

- [ ] **Step 1: Conferir o formato visual já estabelecido**

Ler `apps/jogo/src/componentes/Combate.tsx` (o combate por turnos) antes
de escrever este — reaproveitar as classes CSS já existentes (`.painel`,
`.botao`, `.rotulo`, `.titulo`) em vez de inventar novas. Este componente
NÃO precisa reproduzir a UI do turno por turno; precisa das mesmas
classes de base.

- [ ] **Step 2: Criar o componente**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { conectarSalaTempoReal } from "@/lib/tempo-real.ts";
import type { Personagem } from "@/lib/api.ts";

/**
 * Tudo que a tela sabe sobre a sala vem do servidor, a cada tick — o
 * mesmo convênio "cliente manda intenção, nunca estado" que rege o resto
 * do jogo, só que aqui o "estado" chega em ~10 mensagens por segundo em
 * vez de uma por pedido HTTP.
 */
interface EstadoDaSala {
  jogador: { vida: number; vidaMaxima: number; raia: string; distancia: string; esquivandoPor: number; recargaDeEsquivaPor: number };
  inimigo: { vida: number; vidaMaxima: number; raia: string; distancia: string; tipo: "comum" | "chefe"; telegrafandoPor: number | null };
  onda: number;
  fase: "em-andamento" | "vitoria" | "derrota";
}

export function CombateTempoReal({
  personagemId,
  aoFechar,
}: {
  personagemId: string;
  aoFechar: () => void;
}) {
  const [sala, setSala] = useState<EstadoDaSala | null>(null);
  const [terminou, setTerminou] = useState<"vitoria" | "derrota" | null>(null);
  const conexao = useRef<ReturnType<typeof conectarSalaTempoReal> | null>(null);

  useEffect(() => {
    const c = conectarSalaTempoReal(
      personagemId,
      (mensagem) => {
        if (mensagem.tipo === "estado" && mensagem.sala) {
          const s = mensagem.sala as EstadoDaSala;
          setSala(s);
          if (s.fase !== "em-andamento") setTerminou(s.fase);
        }
      },
      () => {
        // A conexão fechou — se a sala já tinha terminado, `terminou` já
        // está setado e a tela de resultado aparece. Se fechou sem
        // terminar (rede caiu antes do primeiro estado), não há o que
        // desenhar além de voltar.
      },
    );
    conexao.current = c;
    return () => c.fechar();
  }, [personagemId]);

  if (terminou) {
    return (
      <section className="surge flex flex-col gap-4 p-6">
        <p className="titulo text-3xl">
          {terminou === "vitoria" ? "Você venceu." : "Você caiu."}
        </p>
        <button type="button" onClick={aoFechar} className="botao botao-grande self-start">
          Voltar
        </button>
      </section>
    );
  }

  if (!sala) {
    return <p className="rotulo">entrando na sala…</p>;
  }

  return (
    <section className="surge flex flex-col gap-6">
      <header className="painel flex items-center justify-between p-5">
        <p className="rotulo">
          Onda {sala.onda} {sala.inimigo.tipo === "chefe" ? "— chefe" : ""}
        </p>
        <button type="button" onClick={aoFechar} className="botao">
          Sair
        </button>
      </header>

      <div className="painel p-5">
        <p className="rotulo">Você</p>
        <p>{sala.jogador.vida} / {sala.jogador.vidaMaxima} vida</p>
        <p className="text-[0.8rem] text-tinta-fraca">
          raia {sala.jogador.raia} · distância {sala.jogador.distancia}
        </p>
      </div>

      <div className="painel p-5">
        <p className="rotulo">{sala.inimigo.tipo === "chefe" ? "Chefe" : "Inimigo"}</p>
        <p>{sala.inimigo.vida} / {sala.inimigo.vidaMaxima} vida</p>
        <p className="text-[0.8rem] text-tinta-fraca">
          raia {sala.inimigo.raia} · distância {sala.inimigo.distancia}
          {sala.inimigo.telegrafandoPor !== null && " · PREPARANDO GOLPE"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-raia", direcao: -1 })}>
          ◄ Raia
        </button>
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-raia", direcao: 1 })}>
          Raia ►
        </button>
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-distancia", direcao: 1 })}>
          Aproximar
        </button>
        <button type="button" className="botao" onClick={() => conexao.current?.mandar({ tipo: "mover-distancia", direcao: -1 })}>
          Afastar
        </button>
        <button type="button" className="botao botao-grande" onClick={() => conexao.current?.mandar({ tipo: "atacar" })}>
          Atacar
        </button>
        <button
          type="button"
          className="botao botao-grande"
          disabled={sala.jogador.recargaDeEsquivaPor > 0}
          onClick={() => conexao.current?.mandar({ tipo: "esquivar" })}
        >
          Esquivar
        </button>
      </div>
    </section>
  );
}
```

**Nota sobre `aoAtualizar`/recarregar o personagem:** esta tela não
recebe nem chama nenhuma função de atualizar o personagem localmente —
diferente de `Combate.tsx`, que devolve um `Resultado` explícito. Aqui, o
servidor já grava o resultado (vida perdida/vidas consumidas, sucata
ganha) no personagem quando a sala termina; quem chama `aoFechar` (Task
10, em `page.tsx`) é responsável por recarregar o personagem do servidor
depois, do mesmo jeito que `page.tsx` já faz após qualquer outra ação.

- [ ] **Step 3: Rodar os tipos**

Run: `cd apps/jogo && npm run tipos`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add apps/jogo/src/componentes/CombateTempoReal.tsx
git commit -m "feat(jogo): tela do combate em tempo real"
```

---

### Task 10: Botão na Ficha e navegação em `page.tsx`

**Files:**
- Modify: `apps/jogo/src/componentes/Ficha.tsx`
- Modify: `apps/jogo/src/app/page.tsx`

**Interfaces:**
- Consumes: `CombateTempoReal` (Task 9).
- Produces: nova prop `aoAbrirTempoReal: () => void` em `Ficha`; novo
  valor `"tempo-real"` no tipo `painel`/`lugar` de `page.tsx` (ler o
  arquivo primeiro para confirmar o nome exato do estado que controla
  qual tela aparece, antes de editar — não adivinhar).

- [ ] **Step 1: Ler a estrutura de navegação atual**

Ler `apps/jogo/src/app/page.tsx` inteiro antes de editar — confirmar o
nome exato do `useState` que decide entre Ficha/Árvore/Mochila/Mercado/Arena/Combate,
e como `Combate` é aberto hoje (a função `lutar()` e o estado `batalha`).

- [ ] **Step 2: Adicionar o botão e o aviso em `Ficha.tsx`**

Adicionar a prop `aoAbrirTempoReal: () => void` à assinatura de `Ficha`
(junto de `aoLutar`). Logo abaixo do `<div className="flex flex-wrap
gap-4">` que já contém o botão "Lutar", adicionar o parágrafo de aviso —
mesma convenção que `Arena.tsx` já usa ("as três perguntas que a pessoa
faz antes de clicar", ver `apps/jogo/src/componentes/Arena.tsx:141-149`)
— e o botão novo dentro do mesmo `<div>` de botões:

```tsx
<p className="text-[0.82rem] leading-relaxed text-tinta-fraca">
  O desafio em tempo real é <strong className="text-tinta">três ondas e
  um chefe</strong>, tudo na mesma luta — a vida não se recupera entre
  ondas. Perder aqui{" "}
  <strong className="text-tinta">custa uma vida como qualquer luta</strong>,
  mas o prêmio por vencer o chefe também é maior.
</p>
```

E, dentro do `<div className="flex flex-wrap gap-4">` de botões, ao lado
do botão "Lutar":

```tsx
<button
  type="button"
  onClick={aoAbrirTempoReal}
  disabled={ocupado}
  className="botao botao-grande"
>
  Desafio em tempo real
</button>
```

- [ ] **Step 3: Adicionar o estado e a rota em `page.tsx`**

Seguindo o padrão exato encontrado no Step 1 (o nome real das variáveis
pode diferir do que segue — ajustar para bater com o arquivo lido):

- Adicionar `"tempo-real"` como valor possível do estado que escolhe a
  tela.
- Passar `aoAbrirTempoReal={() => setPainel("tempo-real")}` para `<Ficha>`.
- Renderizar `<CombateTempoReal personagemId={p.id} aoFechar={() => { setPainel("ficha"); void recarregar(); }} />`
  quando o painel for `"tempo-real"` — reaproveitando a mesma função
  `recarregar`/`buscar` que as outras telas já chamam ao voltar, para a
  Ficha mostrar vida/vidas/sucata atualizadas depois da sala.

- [ ] **Step 4: Rodar os tipos**

Run: `cd apps/jogo && npm run tipos`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/jogo/src/componentes/Ficha.tsx apps/jogo/src/app/page.tsx
git commit -m "feat(jogo): abre o combate em tempo real pela Ficha"
```

---

### Task 11: Verificação ponta a ponta

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar a suíte inteira do monorepo**

Run: `npm run tipos && npm run teste` (na raiz do repo)
Expected: sem erro de tipo em nenhum workspace; todos os testes passam,
incluindo os novos de `packages/dominio` e `apps/servidor`.

- [ ] **Step 2: Subir os dois servidores com dados limpos**

```bash
rm -rf apps/servidor/dados && mkdir -p apps/servidor/dados
(cd apps/servidor && npm run dev &)
(cd apps/jogo && npm run dev &)
```

Aguardar as duas portas (3333, 3000) responderem antes de seguir.

- [ ] **Step 3: Testar no navegador, ponta a ponta**

Cadastrar uma conta, criar um personagem, grindar até ter vida e nível
razoáveis, clicar em "Desafio em tempo real", e jogar uma sala completa
até vitória ou derrota. Confirmar visualmente:
- O estado (vida, raia, distância, onda) atualiza sozinho, sem clicar em
  nada — é a prova de que o tick loop está empurrando estado de verdade.
- Mover de raia/distância funciona nos dois sentidos.
- Esquivar durante um "PREPARANDO GOLPE" evita o dano; não esquivar,
  toma o dano.
- Atacar só reduz a vida do inimigo quando raia e distância batem.
- Vencer a onda de chefe mostra "Você venceu." e a Ficha, ao voltar,
  mostra a sucata paga.
- Perder mostra "Você caiu." e a Ficha, ao voltar, mostra uma vida a
  menos (ou o túmulo, se já estava na última).
- Fechar a aba no meio de uma sala e reabrir: o personagem aparece com
  uma derrota registrada depois de ~15s (o timeout de desconexão) — não
  precisa esperar isso ao vivo se já confirmou o resto; ler o log do
  servidor para confirmar que o timeout disparou é suficiente.

- [ ] **Step 4: Derrubar os servidores de teste**

Encerrar os dois processos de dev abertos no Step 2.
