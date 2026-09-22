import {
  type Atributos,
  chanceDeCritico,
  iniciativa,
  reducaoDeDano,
  somar,
  vidaMaxima,
} from "./atributos.ts";
import { chance, escolher, sortear, variar } from "./aleatorio.ts";
import type { Ramo } from "./classe.ts";
import {
  aplicar,
  atributosComEfeitos,
  danoPorRodada,
  type EfeitoAtivo,
  envelhecer,
  impedeAgir,
  remover,
} from "./efeitos.ts";
import {
  atributoDeDano,
  type Habilidade,
  habilidadePorId,
  type Operacao,
} from "./habilidades.ts";
import { type Bonus, SEM_BONUS } from "./arvore.ts";

/**
 * O motor de combate por turnos.
 *
 * Tudo aqui é função pura: recebe uma batalha, devolve outra. O servidor guarda
 * o resultado, o cliente anima os eventos, e a progressão offline roda as
 * mesmas funções em sequência. Nenhuma delas lê relógio ou sorteia sem semente.
 *
 * Quem decide é sempre o servidor. O cliente manda intenção — "usar `toxina`" —
 * e recebe o estado novo com o log do que aconteceu.
 */

export type Lado = "jogador" | "inimigo";

export interface Combatente {
  readonly id: string;
  readonly nome: string;
  readonly lado: Lado;
  readonly ramo: Ramo;
  readonly atributos: Atributos;
  readonly vida: number;
  readonly vidaMaxima: number;
  readonly efeitos: readonly EfeitoAtivo[];
  readonly habilidades: readonly string[];
  /** Rodadas restantes de espera, por habilidade. */
  readonly recargas: Readonly<Record<string, number>>;
  /**
   * O que a árvore de habilidade rende.
   *
   * Aqui dentro, e não aplicado nos atributos antes de montar o combatente,
   * porque passiva não é atributo: dano percentual, roubo de vida e recarga
   * reduzida não têm onde caber num número de força, e forçá-los ali
   * esconderia de onde vieram.
   */
  readonly bonus: Bonus;
}

export type Evento =
  | { readonly tipo: "inicio"; readonly ordem: readonly string[] }
  | { readonly tipo: "rodada"; readonly numero: number }
  | { readonly tipo: "usou"; readonly quem: string; readonly habilidade: string }
  | { readonly tipo: "impedido"; readonly quem: string; readonly motivo: string }
  /** Fuga bem-sucedida. Não nasce de `executarTurno` — quem decide se a fuga
      dá certo é o servidor, ANTES de gastar o turno; ver `batalhas.ts`. Este
      caso existe aqui só para o herói e o vilão falarem o mesmo vocabulário
      de evento na tela. */
  | { readonly tipo: "fugiu"; readonly quem: string }
  | {
      readonly tipo: "dano";
      readonly quem: string;
      readonly alvo: string;
      readonly valor: number;
      readonly critico: boolean;
      readonly fonte: string;
    }
  | { readonly tipo: "cura"; readonly alvo: string; readonly valor: number }
  | {
      readonly tipo: "efeito";
      readonly alvo: string;
      readonly efeito: string;
      readonly rodadas: number;
    }
  | { readonly tipo: "resistiu"; readonly alvo: string; readonly efeito: string }
  | { readonly tipo: "expirou"; readonly alvo: string; readonly efeito: string }
  | { readonly tipo: "limpou"; readonly alvo: string; readonly efeito: string }
  | { readonly tipo: "morreu"; readonly quem: string }
  | { readonly tipo: "fim"; readonly vencedor: Lado };

export interface Batalha {
  readonly combatentes: Readonly<Record<string, Combatente>>;
  /** Ids na ordem de agir, decidida pela iniciativa. */
  readonly ordem: readonly string[];
  /** Posição na `ordem` de quem age agora. */
  readonly vez: number;
  readonly rodada: number;
  readonly semente: number;
  /** Só o que aconteceu no último passo; o histórico é de quem chama. */
  readonly eventos: readonly Evento[];
  readonly vencedor: Lado | null;
}

/** Variação de dano, para dois golpes iguais não darem o mesmo número. */
const VARIACAO_DE_DANO = 0.12;
/** Quanto um crítico multiplica. */
const MULTIPLICADOR_CRITICO = 1.8;
/** Teto de rodadas — sem ele, dois tanques se encaram até o fim dos tempos. */
export const RODADAS_MAXIMAS = 200;

export function criarCombatente(dados: {
  id: string;
  nome: string;
  lado: Lado;
  ramo: Ramo;
  atributos: Atributos;
  habilidades: readonly string[];
  vida?: number;
  bonus?: Bonus;
}): Combatente {
  const bonus = dados.bonus ?? SEM_BONUS;
  /*
   * Os atributos do bônus SOMAM aqui, e este é o único lugar onde isso
   * precisa acontecer: tudo adiante — dano, crítico, redução, iniciativa e
   * vida máxima — lê `combatente.atributos`.
   *
   * Ficaram sem somar por uma versão inteira. O efeito: os seis nós de
   * ATRIBUTO da árvore (Vocação, Couro Curtido, Mão Rápida, Fôlego, Coroa,
   * Raiz Funda) não faziam absolutamente nada — o jogador gastava ponto em
   * número que ninguém lia. Nenhum teste pegou porque todos conferiam o
   * OBJETO de bônus, e não o resultado da batalha.
   */
  const atributos = somar(dados.atributos, bonus.atributos);
  const maxima = Math.round(vidaMaxima(atributos) * (1 + bonus.vidaPercentual));
  return {
    id: dados.id,
    nome: dados.nome,
    lado: dados.lado,
    ramo: dados.ramo,
    atributos,
    vida: dados.vida ?? maxima,
    vidaMaxima: maxima,
    efeitos: [],
    habilidades: dados.habilidades,
    recargas: {},
    bonus,
  };
}

/**
 * Monta a batalha e decide a ordem.
 *
 * A iniciativa desempata pelo id, e não por sorteio: duas batalhas com a mesma
 * semente têm de sair idênticas, e ordem instável quebraria isso.
 */
export function iniciarBatalha(
  participantes: readonly Combatente[],
  semente: number,
): Batalha {
  const combatentes: Record<string, Combatente> = {};
  for (const c of participantes) combatentes[c.id] = c;

  const ordem = [...participantes]
    .sort((a, b) => {
      const diferenca = iniciativa(b.atributos) - iniciativa(a.atributos);
      return diferenca !== 0 ? diferenca : a.id.localeCompare(b.id);
    })
    .map((c) => c.id);

  return {
    combatentes,
    ordem,
    vez: 0,
    rodada: 1,
    semente,
    eventos: [{ tipo: "inicio", ordem }, { tipo: "rodada", numero: 1 }],
    vencedor: null,
  };
}

export function vivo(c: Combatente): boolean {
  return c.vida > 0;
}

export function quemAge(b: Batalha): Combatente | null {
  const id = b.ordem[b.vez];
  if (id === undefined) return null;
  return b.combatentes[id] ?? null;
}

/** As habilidades que quem age pode usar agora — fora de recarga. */
export function habilidadesDisponiveis(b: Batalha, id: string): Habilidade[] {
  const c = b.combatentes[id];
  if (!c) return [];
  return c.habilidades
    .filter((h) => (c.recargas[h] ?? 0) <= 0)
    .map(habilidadePorId);
}

/** Um oponente vivo e visível, ou null se não houver. */
function alvoDe(b: Batalha, quem: Combatente): Combatente | null {
  const candidatos = Object.values(b.combatentes).filter(
    (c) => c.lado !== quem.lado && vivo(c),
  );
  // Oculto só protege enquanto houver outro alvo — senão a batalha travaria.
  const visiveis = candidatos.filter(
    (c) => !c.efeitos.some((e) => e.tipo === "oculto"),
  );
  return (visiveis[0] ?? candidatos[0]) ?? null;
}

interface Passo {
  combatentes: Record<string, Combatente>;
  semente: number;
  eventos: Evento[];
}

function executarOperacao(
  passo: Passo,
  op: Operacao,
  quem: Combatente,
  alvoId: string,
  habilidade: Habilidade,
): void {
  const atacante = passo.combatentes[quem.id];
  const alvo = passo.combatentes[alvoId];
  if (!atacante || !alvo) return;

  const atributosAtacante = atributosComEfeitos(
    atacante.atributos,
    atacante.efeitos,
  );

  switch (op.tipo) {
    case "dano": {
      const base = atributosAtacante[atributoDeDano(atacante.ramo)] * op.escala;
      const comVariacao = variar(passo.semente, base, VARIACAO_DE_DANO);
      passo.semente = comVariacao.semente;

      const sorteioCritico = chance(
        passo.semente,
        // Teto mantido: a passiva soma à chance, mas crítico garantido
        // quebraria o mesmo que destreza infinita quebraria.
        Math.min(0.75, chanceDeCritico(atributosAtacante) + atacante.bonus.criticoAdicional),
      );
      passo.semente = sorteioCritico.semente;

      let valor = comVariacao.valor * (1 + atacante.bonus.danoPercentual);
      if (sorteioCritico.acertou) valor *= MULTIPLICADOR_CRITICO;

      if (!op.perfurante) {
        const defesa = atributosComEfeitos(alvo.atributos, alvo.efeitos);
        // Mesma curva de saturação de sempre, com a passiva somada e o teto
        // em 90%: passar disso deixaria o combate sem fim.
        const reducao = Math.min(
          0.9,
          reducaoDeDano(defesa) + alvo.bonus.reducaoAdicional,
        );
        valor *= 1 - reducao;
      }

      // Piso de 1: com redução alta, arredondar para baixo daria zero e a
      // batalha nunca terminaria.
      const final = Math.max(1, Math.round(valor));
      const vida = Math.max(0, alvo.vida - final);
      passo.combatentes[alvoId] = { ...alvo, vida };
      passo.eventos.push({
        tipo: "dano",
        quem: atacante.id,
        alvo: alvoId,
        valor: final,
        critico: sorteioCritico.acertou,
        fonte: habilidade.id,
      });
      if (vida === 0) passo.eventos.push({ tipo: "morreu", quem: alvoId });

      // Roubo de vida: parte do que se causou volta. Depois do dano, e sobre
      // o valor que de fato entrou — sobre o bruto, a passiva renderia mais
      // contra alvo blindado, que é o contrário do que deveria.
      if (atacante.bonus.roubodeVida > 0) {
        const cura = Math.round(final * atacante.bonus.roubodeVida);
        if (cura > 0) {
          const eu = passo.combatentes[atacante.id];
          if (eu && vivo(eu)) {
            const nova = Math.min(eu.vidaMaxima, eu.vida + cura);
            passo.combatentes[atacante.id] = { ...eu, vida: nova };
            if (nova > eu.vida) {
              passo.eventos.push({ tipo: "cura", alvo: eu.id, valor: nova - eu.vida });
            }
          }
        }
      }
      return;
    }

    case "cura": {
      const bruto = atributosAtacante.presenca * op.escala;
      const comVariacao = variar(passo.semente, bruto, VARIACAO_DE_DANO);
      passo.semente = comVariacao.semente;
      const valor = Math.max(1, Math.round(comVariacao.valor));
      const vida = Math.min(alvo.vidaMaxima, alvo.vida + valor);
      passo.combatentes[alvoId] = { ...alvo, vida };
      passo.eventos.push({ tipo: "cura", alvo: alvoId, valor: vida - alvo.vida });
      return;
    }

    case "efeito": {
      if (op.chance !== undefined) {
        const teste = chance(passo.semente, op.chance);
        passo.semente = teste.semente;
        if (!teste.acertou) {
          passo.eventos.push({ tipo: "resistiu", alvo: alvoId, efeito: op.efeito });
          return;
        }
      }

      const potencia =
        op.escala !== undefined
          ? Math.max(
              1,
              Math.round(
                atributosAtacante[atributoDeDano(atacante.ramo)] * op.escala,
              ),
            )
          : (op.potencia ?? 0);

      const novo: EfeitoAtivo = {
        tipo: op.efeito,
        rodadas: op.rodadas,
        potencia,
        origem: habilidade.id,
        ...(op.atributo ? { atributo: op.atributo } : {}),
      };

      passo.combatentes[alvoId] = {
        ...alvo,
        efeitos: aplicar(alvo.efeitos, novo),
      };
      passo.eventos.push({
        tipo: "efeito",
        alvo: alvoId,
        efeito: op.efeito,
        rodadas: op.rodadas,
      });
      return;
    }

    case "limpar": {
      if (!alvo.efeitos.some((e) => e.tipo === op.efeito)) return;
      passo.combatentes[alvoId] = {
        ...alvo,
        efeitos: remover(alvo.efeitos, op.efeito),
      };
      passo.eventos.push({ tipo: "limpou", alvo: alvoId, efeito: op.efeito });
      return;
    }
  }
}

/**
 * Começo do turno: veneno e queimadura cobram, e as recargas andam.
 *
 * O que NÃO acontece aqui é envelhecer os efeitos — isso é o fim do turno, em
 * `finalizarTurno`. A ordem importa e custou um bug: descontando a duração
 * antes de checar impedimento, um atordoamento de uma rodada expirava sempre
 * antes de valer, e a habilidade não fazia absolutamente nada.
 */
function iniciarTurno(passo: Passo, id: string): void {
  const c = passo.combatentes[id];
  if (!c || !vivo(c)) return;

  const { ignoraArmadura, mitigavel } = danoPorRodada(c.efeitos);
  if (ignoraArmadura > 0 || mitigavel > 0) {
    const defesa = atributosComEfeitos(c.atributos, c.efeitos);
    const total = Math.round(
      ignoraArmadura + mitigavel * (1 - reducaoDeDano(defesa)),
    );
    if (total > 0) {
      const vida = Math.max(0, c.vida - total);
      passo.combatentes[id] = { ...passo.combatentes[id]!, vida };
      passo.eventos.push({
        tipo: "dano",
        quem: id,
        alvo: id,
        valor: total,
        critico: false,
        fonte: "efeito",
      });
      if (vida === 0) passo.eventos.push({ tipo: "morreu", quem: id });
    }
  }

  const atual = passo.combatentes[id];
  if (!atual) return;

  const recargas: Record<string, number> = {};
  for (const [h, r] of Object.entries(atual.recargas)) {
    if (r > 1) recargas[h] = r - 1;
  }

  passo.combatentes[id] = { ...atual, recargas };
}

/**
 * Fim do turno: as durações descontam e o que acabou sai.
 *
 * Depois de agir, e não antes — é isto que faz um efeito de uma rodada durar
 * exatamente o turno seguinte de quem o recebeu.
 */
function finalizarTurno(passo: Passo, id: string): void {
  const c = passo.combatentes[id];
  if (!c) return;

  const { efeitos, expirados } = envelhecer(c.efeitos);
  for (const e of expirados) {
    passo.eventos.push({ tipo: "expirou", alvo: id, efeito: e.tipo });
  }
  passo.combatentes[id] = { ...c, efeitos };
}

function decidirVencedor(
  combatentes: Readonly<Record<string, Combatente>>,
): Lado | null {
  const vivos = Object.values(combatentes).filter(vivo);
  const jogador = vivos.some((c) => c.lado === "jogador");
  const inimigo = vivos.some((c) => c.lado === "inimigo");
  if (jogador && !inimigo) return "jogador";
  if (inimigo && !jogador) return "inimigo";
  return null;
}

/** Avança para o próximo vivo, virando a rodada quando a lista der a volta. */
function avancarVez(
  b: Batalha,
  combatentes: Readonly<Record<string, Combatente>>,
  eventos: Evento[],
): { vez: number; rodada: number } {
  let vez = b.vez;
  let rodada = b.rodada;

  for (let i = 0; i < b.ordem.length + 1; i++) {
    vez += 1;
    if (vez >= b.ordem.length) {
      vez = 0;
      rodada += 1;
      eventos.push({ tipo: "rodada", numero: rodada });
    }
    const id = b.ordem[vez];
    if (id !== undefined && combatentes[id] && vivo(combatentes[id]!)) break;
  }

  return { vez, rodada };
}

/**
 * Executa o turno de quem está na vez.
 *
 * `habilidadeId` ausente faz o combatente escolher sozinho — é o caminho do
 * inimigo e o da progressão offline.
 */
/**
 * `habilidadeId`: omitido escolhe sozinho entre o que está disponível (o
 * inimigo, sempre; o herói, num julgamento fora do servidor). `null` é
 * diferente: um passe DE PROPÓSITO, sem escolher nada — usado quando fugir
 * falha e o turno é perdido, mas o combate segue (efeitos de início/fim de
 * turno continuam rodando normalmente).
 */
export function executarTurno(b: Batalha, habilidadeId?: string | null): Batalha {
  if (b.vencedor) return b;

  const atuante = quemAge(b);
  if (!atuante) return b;

  const passo: Passo = {
    combatentes: { ...b.combatentes },
    semente: b.semente,
    eventos: [],
  };

  iniciarTurno(passo, atuante.id);

  const depoisDosEfeitos = passo.combatentes[atuante.id];
  const morreuDeEfeito = !depoisDosEfeitos || !vivo(depoisDosEfeitos);

  if (!morreuDeEfeito && impedeAgir(depoisDosEfeitos.efeitos)) {
    passo.eventos.push({
      tipo: "impedido",
      quem: atuante.id,
      motivo: "atordoamento",
    });
  } else if (!morreuDeEfeito && habilidadeId === null) {
    passo.eventos.push({
      tipo: "impedido",
      quem: atuante.id,
      motivo: "fugiu",
    });
  } else if (!morreuDeEfeito) {
    const disponiveis = habilidadesDisponiveis(
      { ...b, combatentes: passo.combatentes },
      atuante.id,
    );

    let escolhida: Habilidade | null = null;
    if (habilidadeId !== undefined) {
      const pedida = disponiveis.find((h) => h.id === habilidadeId);
      if (!pedida) {
        throw new Error(
          `habilidade indisponível para ${atuante.id}: ${habilidadeId}`,
        );
      }
      escolhida = pedida;
    } else if (disponiveis.length > 0) {
      const sorteio = escolher(passo.semente, disponiveis);
      passo.semente = sorteio.semente;
      escolhida = sorteio.item;
    }

    if (escolhida) {
      const alvo =
        escolhida.alvo === "proprio"
          ? depoisDosEfeitos
          : alvoDe({ ...b, combatentes: passo.combatentes }, depoisDosEfeitos);

      if (alvo) {
        passo.eventos.push({
          tipo: "usou",
          quem: atuante.id,
          habilidade: escolhida.id,
        });
        for (const op of escolhida.operacoes) {
          executarOperacao(passo, op, depoisDosEfeitos, alvo.id, escolhida);
        }
        if (escolhida.recarga > 0) {
          const atual = passo.combatentes[atuante.id];
          if (atual) {
            // Piso de 1 rodada: sem ele, recarga suficiente zeraria a espera e
            // a habilidade mais forte viraria o ataque básico.
            const espera = Math.max(1, escolhida.recarga - atual.bonus.recargaReduzida);
            passo.combatentes[atuante.id] = {
              ...atual,
              recargas: { ...atual.recargas, [escolhida.id]: espera + 1 },
            };
          }
        }
      }
    }
  }

  finalizarTurno(passo, atuante.id);

  const vencedor = decidirVencedor(passo.combatentes);
  if (vencedor) {
    passo.eventos.push({ tipo: "fim", vencedor });
    return {
      ...b,
      combatentes: passo.combatentes,
      semente: passo.semente,
      eventos: passo.eventos,
      vencedor,
    };
  }

  const { vez, rodada } = avancarVez(b, passo.combatentes, passo.eventos);

  // Empate por exaustão: sem teto, dois tanques com muita redução ficariam
  // trocando dano mínimo para sempre. Quem não matou, não venceu.
  if (rodada > RODADAS_MAXIMAS) {
    passo.eventos.push({ tipo: "fim", vencedor: "inimigo" });
    return {
      ...b,
      combatentes: passo.combatentes,
      semente: passo.semente,
      eventos: passo.eventos,
      vencedor: "inimigo",
    };
  }

  return {
    ...b,
    combatentes: passo.combatentes,
    semente: passo.semente,
    eventos: passo.eventos,
    vez,
    rodada,
  };
}

/**
 * Roda a batalha inteira sozinha.
 *
 * É o que a progressão offline usa, e o que a simulação de balanceamento lê
 * para medir a taxa de vitória de verdade em vez de estimá-la por fórmula.
 */
export function resolverBatalha(
  b: Batalha,
): { batalha: Batalha; eventos: Evento[] } {
  let atual = b;
  const tudo: Evento[] = [...b.eventos];

  while (!atual.vencedor) {
    const antes = atual;
    atual = executarTurno(atual);
    tudo.push(...atual.eventos);
    // Trava de segurança: se um turno não mudar nada, parar é melhor do que
    // girar para sempre.
    if (atual === antes) break;
  }

  return { batalha: atual, eventos: tudo };
}
