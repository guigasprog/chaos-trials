import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import {
  adicionarPersonagem,
  ajusteDeElo,
  ANUNCIOS_POR_CONTA,
  duelar,
  ESPERA_DO_MESMO_ALVO_MS,
  faixaDeNivel,
  podeDesafiar,
  premioDaArena,
  sementeDoDuelo,
  vidaAposDuelo,
  type Anuncio,
  ARVORE,
  contaDaVenda,
  criarAnuncio,
  DIZIMO_DO_MERCADO,
  marcarRetirado,
  marcarVendido,
  type Moeda,
  podeComprarAnuncio,
  precoValido,
  vitrine,
  bonusDoPersonagem,
  classePorIndice,
  comprarSlot,
  type Conta,
  creditarPremium,
  criarConta,
  criarPersonagem,
  custoDoRevive,
  debitarPremium,
  beberPocao,
  desequipar,
  desmanchar,
  podeBeberPocao,
  POCAO_CURA,
  precoDaPocao,
  type Encaixe,
  ENCAIXES,
  equipar,
  guardarItem,
  type Item,
  itemNaMochila,
  MOCHILA_MAXIMA,
  NOME_DO_ENCAIXE,
  normalizarConta,
  PERFIL,
  poderDoItem,
  precoDeDesmanche,
  propriedadesDe,
  sementeDe,
  sortearQueda,
  normalizarEmail,
  podeComprarSlot,
  precoDoProximoSlot,
  removerPersonagem,
  senhaAceitavel,
  slotsLivres,
  slotsTotais,
  SLOTS_GRATIS,
  SLOTS_MAXIMO,
  evoluirArvore,
  escolherSubclasse,
  ganharXp,
  habilidadesTotais,
  habilidadePorId as buscarHabilidade,
  habilidadePorId,
  habilidadesDisponiveis,
  morrer,
  nivelDaParede,
  normalizar,
  podeComprar,
  pontosDisponiveis,
  type Personagem,
  progredirOffline,
  prontoParaRenascer,
  RAIZES,
  ramoDe,
  renascer,
  reviver,
  subclassesDisponiveis,
  recuar,
  vidaAposVitoria,
  vidaMaximaDe,
  xpParaNivel,
} from "@chaos/dominio";
import type { Armazenamento } from "./armazenamento.ts";
import {
  Batalhas,
  ErroDeBatalha,
  premioDe,
  type TipoDeBatalha,
} from "./batalhas.ts";
import {
  conferirSenha,
  gastarTempoDeConferencia,
  guardarSenha,
} from "./senhas.ts";
import { Sessoes, tokenDoCabecalho } from "./sessoes.ts";
import {
  chaveDaConta,
  chaveDoAnuncio,
  chaveDoPersonagem,
  Filas,
} from "./filas.ts";

/**
 * A API.
 *
 * Uma regra atravessa tudo: **o cliente manda intenção, nunca estado.** Ele
 * não envia vida, dano, XP nem resultado — envia "quero lutar", "quero usar
 * `toxina`", "quero renascer". Quem decide é o domínio, aqui dentro. É isso
 * que torna trapaça impossível, e não criptografia.
 *
 * Toda rota de personagem exige sessão e confere que o personagem é DAQUELA
 * conta. Antes o id do personagem era a credencial: quem descobrisse o id
 * jogava com ele. Agora o id é só um endereço, e a credencial é o token.
 */

export interface Opcoes {
  armazenamento: Armazenamento;
  /** Injetável para o teste não depender do relógio da máquina. */
  agora?: () => number;
  /** Injetável para o teste inspecionar e reaproveitar sessões. */
  sessoes?: Sessoes;
  log?: boolean;
  /**
   * De onde o navegador pode chamar. Vazio libera tudo, que é o certo em
   * desenvolvimento e errado em produção.
   */
  origens?: readonly string[];
}

/** A conta como o cliente a vê. A senha nunca sai daqui, em forma nenhuma. */
function contaParaCliente(c: Conta) {
  return {
    id: c.id,
    email: c.email,
    premium: c.premium,
    slots: {
      total: slotsTotais(c),
      usados: c.personagens.length,
      livres: slotsLivres(c),
      gratis: SLOTS_GRATIS,
      comprados: c.slotsComprados,
      maximo: SLOTS_MAXIMO,
      precoDoProximo: precoDoProximoSlot(c),
      // Resolvido no servidor, como na árvore: botão apagado sem motivo não
      // leva a ação nenhuma.
      podeComprar: podeComprarSlot(c).pode,
      impedimento: podeComprarSlot(c).motivo ?? null,
    },
  };
}

/** O personagem como o cliente o vê: com o derivado já calculado. */
function paraCliente(p: Personagem) {
  const classe = classePorIndice(p.classe);
  const ramo = ramoDe(p.classe);
  return {
    id: p.id,
    nome: p.nome,
    classe: { indice: classe.indice, nome: classe.nome, ramo },
    nivel: p.nivel,
    xp: p.xp,
    xpDoNivel: Math.round(xpParaNivel(p.nivel)),
    camada: p.camada,
    estado: p.estado,
    vida: p.vida,
    vidaMaxima: vidaMaximaDe(p),
    sucata: p.sucata,
    mortes: p.mortes,
    parede: Math.ceil(nivelDaParede(p.camada)),
    elo: p.elo,
    duelos: p.duelos,
    podeRenascer: prontoParaRenascer(p),
    subclasses: subclassesDisponiveis(p).map((i) => {
      const c = classePorIndice(i);
      return { indice: c.indice, nome: c.nome };
    }),
    habilidades: habilidadesTotais(p).map((id) => {
      const h = buscarHabilidade(id);
      return { id: h.id, nome: h.nome, descricao: h.descricao, recarga: h.recarga };
    }),
    custoDoRevive: custoDoRevive(),
    /*
     * A poção, já resolvida pelo servidor: preço, quanto cura e o motivo
     * de não dar. Mesma regra da árvore e do slot — a tela mostra, não
     * recalcula, senão a regra diverge nos dois lados.
     */
    pocao: {
      preco: precoDaPocao(p),
      cura: Math.ceil(vidaMaximaDe(p) * POCAO_CURA),
      podeBeber: podeBeberPocao(p) === null,
      impedimento: podeBeberPocao(p),
    },
    arvore: arvoreParaCliente(p),
    equipado: Object.fromEntries(
      ENCAIXES.flatMap((e) => {
        const item = (p.equipado ?? {})[e];
        return item ? [[e, itemParaCliente(item)]] : [];
      }),
    ),
    // Ordenada por poder: a mochila só é legível de relance se a peça que
    // vale mais estiver por cima. Ordenar na tela duplicaria a regra.
    mochila: [...(p.mochila ?? [])]
      .sort((a, b) => poderDoItem(b) - poderDoItem(a))
      .map(itemParaCliente),
    mochilaMaxima: MOCHILA_MAXIMA,
  };
}

/**
 * O item como a tela precisa dele.
 *
 * As propriedades vêm já formatadas e a cor da raridade vem junto: são
 * regra de domínio, e recalculá-las no cliente é a mesma duplicação que o
 * impedimento da árvore evita.
 */
function itemParaCliente(item: Item) {
  return {
    id: item.id,
    nome: item.nome,
    encaixe: item.encaixe,
    encaixeNome: NOME_DO_ENCAIXE[item.encaixe],
    raridade: item.raridade,
    raridadeNome: PERFIL[item.raridade].nome,
    cor: PERFIL[item.raridade].cor,
    nivel: item.nivel,
    poder: poderDoItem(item),
    desmanchePor: precoDeDesmanche(item),
    propriedades: propriedadesDe(item),
  };
}

/**
 * A árvore como a tela precisa dela.
 *
 * O servidor manda o motivo de cada nó estar fechado, já resolvido. Deixar a
 * tela recalcular requisito e ponto seria duplicar regra nos dois lados — e
 * quando duplicada, ela diverge.
 */
function arvoreParaCliente(p: Personagem) {
  const gastos = p.gastos ?? {};
  return {
    pontos: pontosDisponiveis(p),
    nos: ARVORE.map((no) => {
      const impede = podeComprar(no.id, p.nivel, gastos);
      return {
        id: no.id,
        nome: no.nome,
        descricao: no.descricao,
        tipo: no.tipo,
        custo: no.custo,
        graus: no.graus,
        comprados: gastos[no.id] ?? 0,
        requer: no.requer,
        coluna: no.coluna,
        linha: no.linha,
        podeComprar: impede === null,
        impedimento: impede ? { motivo: impede.motivo, detalhe: impede.detalhe } : null,
      };
    }),
    bonus: bonusDoPersonagem(p),
  };
}

export function criarAplicacao(opcoes: Opcoes): FastifyInstance {
  const app = Fastify({ logger: opcoes.log ?? false });
  const { armazenamento } = opcoes;
  const agora = opcoes.agora ?? (() => Date.now());
  const batalhas = new Batalhas();
  const sessoes = opcoes.sessoes ?? new Sessoes();
  /*
   * Serializa o ciclo ler → decidir → gravar por personagem, conta e
   * anúncio.
   *
   * O cofre já serializava a GRAVAÇÃO, e isso não bastava: duas compras
   * simultâneas do mesmo anúncio leram "aberto" antes de qualquer uma
   * gravar, e as duas seguiram. Medido: as duas responderam 200, a peça
   * acabou em duas mochilas e o vendedor recebeu duas vezes.
   */
  const filas = new Filas();

  /** Sufixo de id: aleatório mais tempo, para não colidir nem ordenar mal. */
  const novoSufixo = () =>
    `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

  /*
   * CORS.
   *
   * O cliente roda numa porta e a API em outra, então toda chamada do
   * navegador é de origem cruzada — e sem estes cabeçalhos o navegador
   * simplesmente recusa, sem nunca chegar ao servidor.
   *
   * Passou despercebido por 20 testes de API porque `app.inject` e `curl` não
   * aplicam a política de origem: só o navegador aplica. Apareceu no primeiro
   * clique de verdade.
   */
  void app.register(cors, {
    origin: opcoes.origens && opcoes.origens.length > 0 ? [...opcoes.origens] : true,
  });

  /**
   * Carrega o personagem e aplica o que aconteceu enquanto ele esteve fora.
   *
   * Em todo acesso, e não numa rota própria: se dependesse de o cliente pedir,
   * um cliente que não pedisse jogaria com o estado errado, e a hora de
   * "quando a ausência foi creditada" viraria negociável.
   */
  async function carregar(id: string) {
    const bruto = await armazenamento.personagens.buscar(id);
    if (!bruto) return null;
    // Campo novo em dado já gravado chega indefinido; morre aqui, na porta.
    const guardado = normalizar(bruto);

    const relatorio = progredirOffline(guardado, agora());
    if (relatorio.batalhas > 0 || relatorio.personagem.visto !== guardado.visto) {
      await armazenamento.personagens.salvar(relatorio.personagem);
    }
    return { personagem: relatorio.personagem, relatorio };
  }

  app.setErrorHandler((erro, _pedido, resposta) => {
    if (erro instanceof ErroDeBatalha) {
      return resposta.status(erro.status).send({ erro: erro.message });
    }
    // Erro do domínio é sempre pedido inválido: ele só lança quando a regra
    // proíbe, e isso é culpa de quem pediu, não do servidor.
    if (erro instanceof Error && !("statusCode" in erro)) {
      return resposta.status(400).send({ erro: erro.message });
    }
    return resposta.send(erro);
  });

  // ── Sessão ─────────────────────────────────────────────────────────────

  /**
   * Quem está pedindo, ou `null`.
   *
   * Devolve a conta já normalizada. Não responde erro: quem chama decide se
   * a rota exige sessão ou só se comporta diferente com ela.
   */
  async function quemPede(pedido: FastifyRequest): Promise<Conta | null> {
    const contaId = sessoes.dono(
      tokenDoCabecalho(pedido.headers as Record<string, unknown>),
      agora(),
    );
    if (!contaId) return null;
    const bruta = await armazenamento.contas.buscar(contaId);
    return bruta ? normalizarConta(bruta) : null;
  }

  /**
   * A conta, ou 401 já respondido.
   *
   * O padrão `if (!conta) return` em cada rota é feio e é de propósito: um
   * gancho global que protegesse "tudo menos uma lista" erra por omissão na
   * hora em que alguém adiciona uma rota e esquece da lista. Aqui, esquecer
   * é visível na própria rota.
   */
  async function exigirConta(
    pedido: FastifyRequest,
    resposta: FastifyReply,
  ): Promise<Conta | null> {
    const conta = await quemPede(pedido);
    if (!conta) {
      void resposta.status(401).send({ erro: "entre para continuar" });
      return null;
    }
    return conta;
  }

  /**
   * Carrega um personagem CONFERINDO que ele é desta conta.
   *
   * 404 e não 403 quando não é: responder "existe, mas não é seu" conta a
   * quem chuta ids quais existem. Para quem não é dono, o personagem
   * simplesmente não existe.
   */
  async function meuPersonagem(
    conta: Conta,
    id: string,
    resposta: FastifyReply,
  ) {
    if (!conta.personagens.includes(id)) {
      void resposta.status(404).send({ erro: "personagem não encontrado" });
      return null;
    }
    const carregado = await carregar(id);
    if (!carregado) {
      void resposta.status(404).send({ erro: "personagem não encontrado" });
      return null;
    }
    return carregado;
  }

  app.get("/saude", async () => ({
    ok: true,
    batalhasAtivas: batalhas.ativas,
    sessoesAtivas: sessoes.ativas,
    /** Chaves com fila em andamento. Se subir e não cair, algo travou. */
    filasOcupadas: filas.ocupadas,
  }));

  /**
   * Cadastro.
   *
   * O e-mail é o identificador, e a colisão é conferida na lista de contas.
   * Com banco de verdade isso vira índice único — a checagem aqui é
   * suscetível a corrida entre dois cadastros simultâneos do mesmo e-mail, e
   * está anotado para não passar despercebido na migração.
   */
  app.post("/contas", async (pedido, resposta) => {
    const corpo = pedido.body as { email?: string; senha?: string };
    const email = normalizarEmail(corpo?.email ?? "");
    const senha = corpo?.senha ?? "";

    if (!senhaAceitavel(senha)) {
      return resposta
        .status(400)
        .send({ erro: "a senha precisa ter de 8 a 200 caracteres" });
    }

    const existentes = await armazenamento.contas.listar();
    if (existentes.some((c) => c.email === email)) {
      return resposta.status(409).send({ erro: "este e-mail já tem conta" });
    }

    const conta = criarConta({
      id: `c${novoSufixo()}`,
      email,
      senha: await guardarSenha(senha),
      agora: agora(),
    });
    await armazenamento.contas.salvar(conta);

    const token = sessoes.abrir(conta.id, agora());
    return resposta.status(201).send({ token, conta: contaParaCliente(conta) });
  });

  /**
   * Entrar.
   *
   * A resposta é a mesma para e-mail inexistente e senha errada, e o caminho
   * do e-mail inexistente gasta o mesmo tempo de propósito: sem isso dá para
   * enumerar quem tem conta cronometrando respostas.
   */
  app.post("/sessoes", async (pedido, resposta) => {
    const corpo = pedido.body as { email?: string; senha?: string };
    const email = normalizarEmail(corpo?.email ?? "");
    const senha = corpo?.senha ?? "";
    const recusa = { erro: "e-mail ou senha não conferem" };

    const contas = await armazenamento.contas.listar();
    const achada = contas.find((c) => c.email === email);
    if (!achada) {
      await gastarTempoDeConferencia();
      return resposta.status(401).send(recusa);
    }

    const { confere, precisaAtualizar } = await conferirSenha(senha, achada.senha);
    if (!confere) return resposta.status(401).send(recusa);

    // Hash antigo é reescrito com o custo de hoje, na entrada em que ele
    // acabou de ser conferido — o único momento em que a senha está na mão.
    const conta = normalizarConta({
      ...achada,
      visto: agora(),
      senha: precisaAtualizar ? await guardarSenha(senha) : achada.senha,
    });
    await armazenamento.contas.salvar(conta);

    const token = sessoes.abrir(conta.id, agora());
    return { token, conta: contaParaCliente(conta) };
  });

  app.delete("/sessoes", async (pedido) => {
    sessoes.fechar(tokenDoCabecalho(pedido.headers as Record<string, unknown>));
    return { ok: true };
  });

  /** Eu, e meus personagens. É a tela de slots inteira numa chamada. */
  app.get("/eu", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;

    const personagens = [];
    for (const id of conta.personagens) {
      const carregado = await carregar(id);
      // Id órfão na lista da conta: o personagem sumiu do cofre e a conta
      // ficou apontando para o nada. Some da resposta em vez de virar um
      // cartão quebrado na tela.
      if (carregado) personagens.push(paraCliente(carregado.personagem));
    }

    return { conta: contaParaCliente(conta), personagens };
  });

  app.post("/eu/slots", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;

    return filas.executar(chaveDaConta(conta.id), async () => {
      const atual = normalizarConta(
        (await armazenamento.contas.buscar(conta.id)) as Conta,
      );
      const { pode, motivo } = podeComprarSlot(atual);
      if (!pode) return resposta.status(409).send({ erro: motivo });

      const atualizada = comprarSlot(atual);
      await armazenamento.contas.salvar(atualizada);
      return { conta: contaParaCliente(atualizada) };
    });
  });

  /** As cinco raízes, para a tela de criação. */
  app.get("/classes", async () => ({
    raizes: RAIZES.map((c) => ({ indice: c.indice, nome: c.nome })),
  }));

  app.post("/personagens", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;

    const corpo = pedido.body as { nome?: string; classe?: number };
    const nome = (corpo?.nome ?? "").trim();
    if (nome.length < 2 || nome.length > 24) {
      return resposta.status(400).send({ erro: "o nome precisa ter de 2 a 24 letras" });
    }
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha uma classe" });
    }
    return filas.executar(chaveDaConta(conta.id), async () => {
      // Relido sob a trava: duas criações simultâneas veriam o mesmo
      // "um slot livre" e as duas passariam.
      const atual = normalizarConta(
        (await armazenamento.contas.buscar(conta.id)) as Conta,
      );
      if (slotsLivres(atual) <= 0) {
        return resposta.status(409).send({
          erro: `sem slot livre: ${atual.personagens.length} de ${slotsTotais(atual)} ocupados`,
        });
      }

      const p = criarPersonagem({
        id: `p${novoSufixo()}`,
        nome,
        classeRaiz: corpo.classe!,
        agora: agora(),
      });
      // A conta primeiro: se gravar o personagem e falhar ao ligá-lo à
      // conta, ele fica órfão no cofre e ninguém o alcança. Na ordem
      // inversa, o pior caso é um id na conta sem personagem — que `/eu`
      // já ignora.
      await armazenamento.contas.salvar(adicionarPersonagem(atual, p.id));
      await armazenamento.personagens.salvar(p);
      return resposta.status(201).send(paraCliente(p));
    });
  });

  /**
   * Apagar libera o slot.
   *
   * É a saída de quem não pode pagar o revive: sem ela, dois túmulos nos
   * dois slots gratuitos encerrariam o jogo. O custo já é alto — vão junto
   * todas as camadas.
   */
  app.delete("/personagens/:id", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    return filas.executarEm(
      [chaveDaConta(conta.id), chaveDoPersonagem(id)],
      async () => {
        const atual = normalizarConta(
          (await armazenamento.contas.buscar(conta.id)) as Conta,
        );
        if (!atual.personagens.includes(id)) {
          return resposta.status(404).send({ erro: "personagem não encontrado" });
        }
        await armazenamento.contas.salvar(removerPersonagem(atual, id));
        await armazenamento.personagens.remover(id);
        return { ok: true };
      },
    );
  });

  app.get("/personagens/:id", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;

    const { personagem, relatorio } = carregado;
    return {
      ...paraCliente(personagem),
      /*
       * O relatório aparece se houve batalha OU se houve descanso.
       *
       * Só com `batalhas > 0` o caso mais importante do descanso ficava
       * mudo: quem volta ferido não luta nada, passa o tempo todo se
       * curando, e a tela não contava nada — "deixei AFK para curar"
       * entregava a cura e nenhuma notícia dela.
       */
      ausencia:
        relatorio.batalhas > 0 || relatorio.vidaRecuperada > 0
          ? {
              horas: Number(relatorio.horasCreditadas.toFixed(2)),
              batalhas: relatorio.batalhas,
              vitorias: relatorio.vitorias,
              xp: relatorio.xpGanho,
              sucata: relatorio.sucataGanha,
              morreu: relatorio.morreu,
              horasDescansando: relatorio.horasDescansando,
              vidaRecuperada: relatorio.vidaRecuperada,
            }
          : null,
    };
  });

  app.post("/personagens/:id/batalhas", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;

    const { personagem } = carregado;
    if (personagem.estado === "tumulo") {
      return resposta.status(409).send({ erro: "este personagem está no túmulo" });
    }
    if (personagem.vida <= 0) {
      return resposta.status(409).send({ erro: "sem vida para lutar" });
    }

    const corpo = pedido.body as { tipo?: TipoDeBatalha } | undefined;
    const tipo: TipoDeBatalha =
      corpo?.tipo === "julgamento" ? "julgamento" : "comum";

    const sessao = batalhas.iniciar(personagem, agora(), tipo);
    return resposta.status(201).send({
      id: sessao.id,
      tipo,
      // Dito na resposta, e não só no comentário: a tela precisa avisar antes
      // que esta é a luta em que se morre de verdade.
      mortal: tipo === "julgamento",
      estado: estadoDaBatalha(sessao),
      // A abertura do inimigo entra aqui: quando ele é mais ágil, já agiu
      // antes de o jogador poder fazer qualquer coisa, e a tela precisa
      // mostrar isso em vez de a vida aparecer menor sem explicação.
      eventos: [...sessao.batalha.eventos, ...sessao.aberturaDoInimigo],
      // Pode ter acabado antes do primeiro turno do jogador.
      resultado: sessao.batalha.vencedor
        ? await concluir(personagem, sessao)
        : null,
    });
  });

  app.post("/batalhas/:id/turnos", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { habilidade?: string };
    if (!corpo?.habilidade) {
      return resposta.status(400).send({ erro: "diga qual habilidade" });
    }

    // A batalha também tem dono. Sem esta conferência, quem adivinhasse o id
    // — que é `b1`, `b2`, `b3` — jogaria o turno de outra pessoa.
    const emAndamento = batalhas.buscar(id);
    if (!emAndamento || !conta.personagens.includes(emAndamento.personagemId)) {
      return resposta.status(404).send({ erro: "batalha não encontrada" });
    }

    const { sessao, eventos } = batalhas.agir(id, corpo.habilidade);

    // Terminou: é aqui que o resultado vira progresso gravado. Antes disso,
    // nada do que aconteceu na batalha toca o personagem.
    //
    // A trava é só desta parte: o turno em si mora na memória e é dono
    // único da sessão, mas gravar o resultado é ler-decidir-gravar sobre o
    // personagem — e uma compra no mercado pode estar fazendo o mesmo.
    let resultado = null;
    if (sessao.batalha.vencedor) {
      resultado = await filas.executar(
        chaveDoPersonagem(sessao.personagemId),
        async () => {
          const guardado = await armazenamento.personagens.buscar(
            sessao.personagemId,
          );
          return guardado ? await concluir(guardado, sessao) : null;
        },
      );
      batalhas.encerrar(id);
    }

    return { estado: estadoDaBatalha(sessao), eventos, resultado };
  });

  async function concluir(guardado: Personagem, sessao: ReturnType<Batalhas["iniciar"]>) {
    const venceu = sessao.batalha.vencedor === "jogador";

    if (!venceu) {
      // A distinção central: só o julgamento mata, porque só nele a pessoa
      // escolheu arriscar. Perder uma batalha comum é recuar ferido.
      //
      // Medido antes de decidir: com ~25% de derrota por luta, derrota
      // significando morte dava uma morte a cada 3 ou 4 batalhas — e com
      // permadeath e revive pago em moeda comprada, isso não é dificuldade,
      // é extração.
      const depois =
        sessao.tipo === "julgamento"
          ? morrer({ ...guardado, vida: 0 })
          : recuar(guardado);
      await armazenamento.personagens.salvar(depois);
      return {
        venceu: false,
        xp: 0,
        sucata: 0,
        niveisSubidos: 0,
        morreu: sessao.tipo === "julgamento",
        recuou: sessao.tipo !== "julgamento",
        personagem: paraCliente(depois),
      };
    }

    const premio = premioDe(sessao.nivelInicial, sessao.tipo);
    const ganho = ganharXp(guardado, premio.xp);
    /*
     * A vida com que o herói SAIU da luta.
     *
     * `guardado` é o personagem de ANTES da batalha; usar a vida dele
     * aqui faria vencer não custar nada, e a vida deixaria de atravessar
     * as batalhas — que é o ponto inteiro. Subir de nível cura, e nesse
     * caso `ganharXp` já devolveu a barra cheia.
     */
    const sobrou = sessao.batalha.combatentes.heroi?.vida ?? guardado.vida;
    let atualizado: Personagem = {
      ...ganho.personagem,
      sucata: ganho.personagem.sucata + premio.sucata,
      vida:
        ganho.niveisSubidos > 0
          ? ganho.personagem.vida
          : vidaAposVitoria(ganho.personagem, sobrou),
    };

    /*
     * A queda.
     *
     * A semente sai do id da batalha e do personagem, e não do relógio:
     * o servidor precisa poder recalcular a mesma batalha e chegar na
     * mesma peça para auditar uma reclamação sem acreditar em ninguém.
     */
    const caiu = sortearQueda({
      nivel: sessao.nivelInicial,
      ramo: ramoDe(atualizado.classe),
      semente: sementeDe(`${sessao.personagemId}:${sessao.id}:queda`),
      id: `it${novoSufixo()}`,
      mortal: sessao.tipo === "julgamento",
    });

    let queda = null;
    let sucataDaQueda = 0;
    if (caiu) {
      if ((atualizado.mochila ?? []).length < MOCHILA_MAXIMA) {
        atualizado = guardarItem(atualizado, caiu);
        queda = itemParaCliente(caiu);
      } else {
        // Mochila cheia vira sucata em vez de recusar a peça: recusar
        // pararia o laço de jogo para mandar arrumar gaveta.
        sucataDaQueda = precoDeDesmanche(caiu);
        atualizado = { ...atualizado, sucata: atualizado.sucata + sucataDaQueda };
        queda = { ...itemParaCliente(caiu), viroSucata: sucataDaQueda };
      }
    }

    await armazenamento.personagens.salvar(atualizado);

    return {
      venceu: true,
      xp: premio.xp,
      sucata: premio.sucata + sucataDaQueda,
      niveisSubidos: ganho.niveisSubidos,
      morreu: false,
      recuou: false,
      queda,
      personagem: paraCliente(atualizado),
    };
  }

  app.post("/personagens/:id/arvore", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { no?: string };
    if (!corpo?.no) return resposta.status(400).send({ erro: "diga qual nó" });

    return filas.executar(chaveDoPersonagem(id), async () => {
      const carregado = await meuPersonagem(conta, id, resposta);
      if (!carregado) return;
      const atualizado = evoluirArvore(carregado.personagem, corpo.no!);
      await armazenamento.personagens.salvar(atualizado);
      return paraCliente(atualizado);
    });
  });

  app.post("/personagens/:id/subclasse", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { classe?: number };
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha uma subclasse" });
    }

    return filas.executar(chaveDoPersonagem(id), async () => {
      const carregado = await meuPersonagem(conta, id, resposta);
      if (!carregado) return;
      const atualizado = escolherSubclasse(carregado.personagem, corpo.classe!);
      await armazenamento.personagens.salvar(atualizado);
      return paraCliente(atualizado);
    });
  });

  app.post("/personagens/:id/renascer", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { classe?: number };
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha a raiz da vida nova" });
    }

    return filas.executar(chaveDoPersonagem(id), async () => {
      const carregado = await meuPersonagem(conta, id, resposta);
      if (!carregado) return;
      const atualizado = renascer(carregado.personagem, corpo.classe!);
      await armazenamento.personagens.salvar(atualizado);
      return paraCliente(atualizado);
    });
  });

  // ── Arena (PvP assíncrono) ─────────────────────────────────────────────

  /**
   * Quem dá para desafiar agora.
   *
   * Só personagens de OUTRAS contas, vivos e dentro da faixa de nível.
   * Ordenados por proximidade de elo, porque dentro da faixa de nível é
   * o elo que separa um duelo interessante de uma execução.
   */
  app.get("/arena", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { personagem } = pedido.query as { personagem?: string };
    if (!personagem) {
      return resposta.status(400).send({ erro: "diga qual personagem" });
    }

    const carregado = await meuPersonagem(conta, personagem, resposta);
    if (!carregado) return;
    const eu = carregado.personagem;

    const faixa = faixaDeNivel(eu.nivel);
    const todos = await armazenamento.personagens.listar();
    const alvos = todos
      .map(normalizar)
      .filter((p) => !conta.personagens.includes(p.id))
      .filter((p) => p.estado === "vivo")
      .filter((p) => p.nivel >= faixa.minimo && p.nivel <= faixa.maximo)
      .sort((a, b) => Math.abs(a.elo - eu.elo) - Math.abs(b.elo - eu.elo))
      .slice(0, 12)
      .map(defensorParaCliente);

    const impede = podeDesafiar(eu);
    return {
      eu: { elo: eu.elo, duelos: eu.duelos, nivel: eu.nivel },
      faixa,
      podeDesafiar: impede === null,
      impedimento: impede,
      esperaEntreDuelos: ESPERA_DO_MESMO_ALVO_MS,
      alvos,
    };
  });

  /**
   * Duelar.
   *
   * O defensor NÃO perde nada material — nem sucata, nem item, nem vida,
   * nem nível. Ele não estava lá e não escolheu lutar; ser atacado
   * dormindo e acordar mais pobre é o tipo de coisa que faz alguém parar
   * de jogar. O que muda para ele é o elo, que é reputação e não
   * patrimônio.
   */
  app.post("/arena/:alvo", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { alvo } = pedido.params as { alvo: string };
    const corpo = pedido.body as { personagem?: string };
    if (!corpo?.personagem) {
      return resposta.status(400).send({ erro: "diga qual personagem desafia" });
    }
    if (conta.personagens.includes(alvo)) {
      // Duelar contra si mesmo seria mover elo entre os próprios
      // personagens — e o elo é soma zero justamente para isso não valer.
      return resposta.status(400).send({ erro: "esse personagem é seu" });
    }

    return filas.executarEm(
      [chaveDoPersonagem(corpo.personagem), chaveDoPersonagem(alvo)],
      async () => {
        const carregado = await meuPersonagem(conta, corpo.personagem!, resposta);
        if (!carregado) return;
        const eu = carregado.personagem;

        const bruto = await armazenamento.personagens.buscar(alvo);
        if (!bruto) return resposta.status(404).send({ erro: "alvo não encontrado" });
        const defensor = normalizar(bruto);
        if (defensor.estado === "tumulo") {
          return resposta.status(409).send({ erro: "esse alvo está no túmulo" });
        }

        const impede = podeDesafiar(eu);
        if (impede) return resposta.status(409).send({ erro: impede });

        const faixa = faixaDeNivel(eu.nivel);
        if (defensor.nivel < faixa.minimo || defensor.nivel > faixa.maximo) {
          return resposta.status(409).send({
            erro: `fora da faixa: seu nível abre de ${faixa.minimo} a ${faixa.maximo}`,
          });
        }

        const duelo = duelar(
          eu,
          defensor,
          sementeDoDuelo(eu.id, defensor.id, agora()),
        );
        const venci = duelo.vencedor === "desafiante";
        const elos = ajusteDeElo(eu.elo, defensor.elo, venci);
        const premio = venci ? premioDaArena(eu.nivel) : 0;

        await armazenamento.personagens.salvar({
          ...eu,
          elo: elos.desafiante,
          // Duelar cansa: é o custo, e é em tempo, não em patrimônio.
          vida: vidaAposDuelo(eu),
          sucata: eu.sucata + premio,
          duelos: {
            ...eu.duelos,
            vitorias: eu.duelos.vitorias + (venci ? 1 : 0),
            derrotas: eu.duelos.derrotas + (venci ? 0 : 1),
          },
        });

        // Do defensor muda SÓ o elo e a contagem de defesas.
        await armazenamento.personagens.salvar({
          ...defensor,
          elo: elos.defensor,
          duelos: {
            ...defensor.duelos,
            defesas: defensor.duelos.defesas + (venci ? 0 : 1),
          },
        });

        const atualizado = await carregar(eu.id);
        return {
          venci,
          rodadas: duelo.rodadas,
          eventos: duelo.eventos,
          premio,
          elo: { antes: eu.elo, depois: elos.desafiante },
          defensor: defensorParaCliente(defensor),
          personagem: atualizado ? paraCliente(atualizado.personagem) : null,
        };
      },
    );
  });

  /** O defensor como a tela o vê. Nada de mochila nem de sucata dele. */
  function defensorParaCliente(p: Personagem) {
    const classe = classePorIndice(p.classe);
    return {
      id: p.id,
      nome: p.nome,
      nivel: p.nivel,
      camada: p.camada,
      elo: p.elo,
      classe: { indice: classe.indice, nome: classe.nome, ramo: ramoDe(p.classe) },
      vidaMaxima: vidaMaximaDe(p),
      defesas: p.duelos.defesas,
    };
  }

  // ── Mercado ────────────────────────────────────────────────────────────

  /**
   * A vitrine. Aberta a quem tem sessão, e só.
   *
   * Sem sessão seria uma lista pública do acervo de todo mundo, o que não
   * faz mal por si — mas faz o mercado virar um raspador fácil de preço
   * para bot, e o jogo não ganha nada com isso.
   */
  app.get("/mercado", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;

    const consulta = pedido.query as {
      moeda?: Moeda;
      encaixe?: string;
      raridade?: string;
    };
    const todos = await armazenamento.anuncios.listar();
    const abertos = vitrine(todos, {
      ...(consulta.moeda ? { moeda: consulta.moeda } : {}),
      ...(consulta.encaixe ? { encaixe: consulta.encaixe } : {}),
      ...(consulta.raridade ? { raridade: consulta.raridade } : {}),
    });

    return {
      dizimo: DIZIMO_DO_MERCADO,
      anuncios: abertos.map((a) => anuncioParaCliente(a, conta.id)),
      /** Os meus, inclusive os já vendidos — é o extrato do vendedor. */
      meus: todos
        .filter((a) => a.vendedor === conta.id)
        .sort((a, b) => b.criadoEm - a.criadoEm)
        .slice(0, 40)
        .map((a) => anuncioParaCliente(a, conta.id)),
    };
  });

  /**
   * Anunciar. A peça SAI da mochila agora.
   *
   * Em custódia, e não marcada como "à venda" dentro da mochila: enquanto
   * estivesse lá, daria para anunciar, vestir, desmanchar e ainda receber
   * pela venda.
   */
  app.post("/mercado", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;

    const corpo = pedido.body as {
      personagem?: string;
      item?: string;
      preco?: number;
      moeda?: Moeda;
    };
    if (!corpo?.personagem || !corpo?.item) {
      return resposta.status(400).send({ erro: "diga qual personagem e qual peça" });
    }
    const impedePreco = precoValido(Number(corpo.preco), corpo.moeda ?? "sucata");
    if (impedePreco) return resposta.status(400).send({ erro: impedePreco.detalhe });

    return filas.executarEm(
      [chaveDoPersonagem(corpo.personagem), chaveDaConta(conta.id)],
      () => anunciarDentroDaTrava(conta, corpo as AnuncioPedido, resposta),
    );
  });

  interface AnuncioPedido {
    personagem: string;
    item: string;
    preco: number;
    moeda?: Moeda;
  }

  /** O corpo do anúncio, já com exclusividade sobre a mochila. */
  async function anunciarDentroDaTrava(
    conta: Conta,
    corpo: AnuncioPedido,
    resposta: FastifyReply,
  ) {
    const carregado = await meuPersonagem(conta, corpo.personagem, resposta);
    if (!carregado) return;

    const abertos = (await armazenamento.anuncios.listar()).filter(
      (a) => a.vendedor === conta.id && a.estado === "aberto",
    );
    if (abertos.length >= ANUNCIOS_POR_CONTA) {
      return resposta.status(409).send({
        erro: `no máximo ${ANUNCIOS_POR_CONTA} anúncios abertos por conta`,
      });
    }

    const item = itemNaMochila(carregado.personagem, corpo.item);
    if (!item) {
      return resposta.status(404).send({ erro: "essa peça não está na mochila" });
    }

    const anuncio = criarAnuncio({
      id: `an${novoSufixo()}`,
      vendedor: conta.id,
      vendedorNome: carregado.personagem.nome,
      personagem: carregado.personagem.id,
      item,
      preco: Number(corpo.preco),
      moeda: corpo.moeda ?? "sucata",
      agora: agora(),
    });

    const semAPeca: Personagem = {
      ...carregado.personagem,
      mochila: carregado.personagem.mochila.filter((i) => i.id !== item.id),
    };
    // O anúncio primeiro: falhar depois de tirar da mochila apagaria a
    // peça. Nesta ordem, o pior caso é um anúncio de peça que ainda está
    // na mochila — e a compra confere a custódia, não a mochila.
    await armazenamento.anuncios.salvar(anuncio);
    await armazenamento.personagens.salvar(semAPeca);

    return resposta.status(201).send({
      anuncio: anuncioParaCliente(anuncio, conta.id),
      personagem: paraCliente(semAPeca),
    });
  }

  /** Retirar. A peça volta para a mochila de quem anunciou. */
  app.delete("/mercado/:id", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };

    const espiado = await armazenamento.anuncios.buscar(id);
    // 404 para o anúncio de outra pessoa, como no personagem: "existe, mas
    // não é seu" conta a quem chuta ids quais existem.
    if (!espiado || espiado.vendedor !== conta.id) {
      return resposta.status(404).send({ erro: "anúncio não encontrado" });
    }

    return filas.executarEm(
      [chaveDoAnuncio(id), chaveDoPersonagem(espiado.personagem)],
      async () => {
        // Relido sob a trava: entre a espiada e agora, alguém pode ter
        // comprado.
        const anuncio = await armazenamento.anuncios.buscar(id);
        if (!anuncio || anuncio.vendedor !== conta.id) {
          return resposta.status(404).send({ erro: "anúncio não encontrado" });
        }
        if (anuncio.estado !== "aberto") {
          return resposta.status(409).send({ erro: "este anúncio já foi fechado" });
        }

        const dono = await carregar(anuncio.personagem);
        if (!dono) {
          return resposta.status(409).send({
            erro: "o personagem que anunciou não existe mais",
          });
        }
        if (dono.personagem.mochila.length >= MOCHILA_MAXIMA) {
          return resposta.status(409).send({
            erro: "a mochila está cheia — abra espaço antes de retirar",
          });
        }

        const devolvido = guardarItem(dono.personagem, anuncio.item);
        await armazenamento.personagens.salvar(devolvido);
        await armazenamento.anuncios.salvar(marcarRetirado(anuncio, agora()));
        return { ok: true, personagem: paraCliente(devolvido) };
      },
    );
  });

  /**
   * Comprar.
   *
   * Sucata sai do PERSONAGEM que compra; premium sai da CONTA. É a mesma
   * divisão do resto do jogo, e é o que impede mover sucata entre
   * personagens fingindo uma venda.
   */
  app.post("/mercado/:id/comprar", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { personagem?: string };
    if (!corpo?.personagem) {
      return resposta.status(400).send({ erro: "diga qual personagem recebe" });
    }

    const espiado = await armazenamento.anuncios.buscar(id);
    if (!espiado) return resposta.status(404).send({ erro: "anúncio não encontrado" });

    /*
     * Cinco travas, e nenhuma é excesso: o anúncio, os dois personagens e
     * as duas contas. Medido sem elas: duas compras simultâneas do mesmo
     * anúncio responderam 200 as duas, a peça acabou em duas mochilas e o
     * vendedor recebeu duas vezes. O teste sequencial passava.
     *
     * Travar só o anúncio não bastaria: a mochila do comprador também é
     * mexida por uma batalha terminando ao mesmo tempo.
     */
    return filas.executarEm(
      [
        chaveDoAnuncio(id),
        chaveDoPersonagem(corpo.personagem),
        chaveDoPersonagem(espiado.personagem),
        chaveDaConta(conta.id),
        chaveDaConta(espiado.vendedor),
      ],
      () => comprarDentroDaTrava(id, conta.id, corpo.personagem!, resposta),
    );
  });

  /**
   * O corpo da compra, já com exclusividade garantida.
   *
   * Tudo é relido aqui dentro: o que foi lido antes da trava pode ter
   * mudado enquanto ela era esperada, e agir sobre leitura velha é
   * exatamente o defeito que a trava existe para impedir.
   */
  async function comprarDentroDaTrava(
    id: string,
    contaId: string,
    personagemId: string,
    resposta: FastifyReply,
  ) {
    const conta = normalizarConta(
      (await armazenamento.contas.buscar(contaId)) as Conta,
    );
    const anuncio = await armazenamento.anuncios.buscar(id);
    if (!anuncio) return resposta.status(404).send({ erro: "anúncio não encontrado" });

    const carregado = await meuPersonagem(conta, personagemId, resposta);
    if (!carregado) return;
    const comprador = carregado.personagem;

    const saldo = anuncio.moeda === "premium" ? conta.premium : comprador.sucata;
    const impede = podeComprarAnuncio(anuncio, { conta: conta.id, saldo });
    if (impede) {
      return resposta.status(impede.motivo === "estado" ? 409 : 400).send({
        erro: impede.detalhe,
      });
    }
    if (comprador.mochila.length >= MOCHILA_MAXIMA) {
      return resposta.status(409).send({
        erro: "a mochila está cheia — abra espaço antes de comprar",
      });
    }

    const vendedorConta = await armazenamento.contas.buscar(anuncio.vendedor);
    if (!vendedorConta) {
      return resposta.status(409).send({ erro: "o vendedor não existe mais" });
    }

    const { dizimo, aoVendedor } = contaDaVenda(anuncio.preco);

    /*
     * A ordem importa, e o pior caso de cada passo foi escolhido.
     *
     * Não há transação: são quatro escritas em cofres separados. Fecho o
     * anúncio PRIMEIRO, porque fechar duas vezes é impossível — se algo
     * falhar depois, ninguém compra de novo o mesmo anúncio, e o estrago
     * é reparável por quem olhar o extrato. Na ordem inversa, uma falha
     * no meio deixaria o anúncio aberto com a peça já entregue.
     */
    await armazenamento.anuncios.salvar(marcarVendido(anuncio, conta.id, agora()));

    if (anuncio.moeda === "premium") {
      await armazenamento.contas.salvar(debitarPremium(conta, anuncio.preco));
      if (aoVendedor > 0) {
        await armazenamento.contas.salvar(
          creditarPremium(
            // Relê a conta do vendedor: se vendedor e comprador forem a
            // mesma conta a compra já teria sido recusada, mas reler é o
            // hábito que evita escrever por cima de uma versão velha.
            (await armazenamento.contas.buscar(anuncio.vendedor)) ?? vendedorConta,
            aoVendedor,
          ),
        );
      }
    } else {
      const vendedorPersonagem = await armazenamento.personagens.buscar(
        anuncio.personagem,
      );
      if (vendedorPersonagem) {
        await armazenamento.personagens.salvar({
          ...vendedorPersonagem,
          sucata: vendedorPersonagem.sucata + aoVendedor,
        });
      }
      // Personagem do vendedor apagado: a sucata simplesmente não é paga.
      // O dízimo já garantia que parte sumiria; aqui some o resto, e
      // nenhuma moeda é criada — que é a regra que não pode quebrar.
    }

    const comAPeca = guardarItem(
      {
        ...comprador,
        sucata:
          anuncio.moeda === "sucata"
            ? comprador.sucata - anuncio.preco
            : comprador.sucata,
      },
      anuncio.item,
    );
    await armazenamento.personagens.salvar(comAPeca);

    return {
      comprou: itemParaCliente(anuncio.item),
      pagou: anuncio.preco,
      moeda: anuncio.moeda,
      dizimo,
      personagem: paraCliente(comAPeca),
    };
  }

  function anuncioParaCliente(a: Anuncio, quemVe: string) {
    const { dizimo, aoVendedor } = contaDaVenda(a.preco);
    return {
      id: a.id,
      item: itemParaCliente(a.item),
      preco: a.preco,
      moeda: a.moeda,
      estado: a.estado,
      vendedorNome: a.vendedorNome,
      meu: a.vendedor === quemVe,
      criadoEm: a.criadoEm,
      // O vendedor precisa ver o que sobra ANTES de anunciar; descobrir o
      // dízimo depois da venda é a forma mais rápida de perder confiança.
      dizimo,
      aoVendedor,
    };
  }

  // ── Itens ──────────────────────────────────────────────────────────────

  app.post("/personagens/:id/equipar", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { item?: string };
    if (!corpo?.item) return resposta.status(400).send({ erro: "diga qual peça" });

    return filas.executar(chaveDoPersonagem(id), async () => {
      const carregado = await meuPersonagem(conta, id, resposta);
      if (!carregado) return;
      const atualizado = equipar(carregado.personagem, corpo.item!);
      await armazenamento.personagens.salvar(atualizado);
      return paraCliente(atualizado);
    });
  });

  app.post("/personagens/:id/desequipar", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { encaixe?: Encaixe };
    if (!corpo?.encaixe || !ENCAIXES.includes(corpo.encaixe)) {
      return resposta.status(400).send({ erro: "diga qual encaixe" });
    }

    return filas.executar(chaveDoPersonagem(id), async () => {
      const carregado = await meuPersonagem(conta, id, resposta);
      if (!carregado) return;
      const atualizado = desequipar(carregado.personagem, corpo.encaixe!);
      await armazenamento.personagens.salvar(atualizado);
      return paraCliente(atualizado);
    });
  });

  /** Desmancha em sucata. Só o que está na mochila: o vestido sai primeiro. */
  app.post("/personagens/:id/desmanchar", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { item?: string };
    if (!corpo?.item) return resposta.status(400).send({ erro: "diga qual peça" });

    return filas.executar(chaveDoPersonagem(id), async () => {
      const carregado = await meuPersonagem(conta, id, resposta);
      if (!carregado) return;
      if (!itemNaMochila(carregado.personagem, corpo.item!)) {
        return resposta.status(404).send({ erro: "essa peça não está na mochila" });
      }
      const { personagem, sucata } = desmanchar(carregado.personagem, corpo.item!);
      await armazenamento.personagens.salvar(personagem);
      return { ...paraCliente(personagem), rendeu: sucata };
    });
  });

  /**
   * Beber uma poção.
   *
   * O descanso não tem rota: ele acontece sozinho em `carregar`, junto
   * com a progressão offline. Um botão "descansar" seria um botão que
   * pede para o jogador esperar olhando a tela.
   */
  app.post("/personagens/:id/pocao", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };

    return filas.executar(chaveDoPersonagem(id), async () => {
      const carregado = await meuPersonagem(conta, id, resposta);
      if (!carregado) return;

      const impede = podeBeberPocao(carregado.personagem);
      if (impede) return resposta.status(409).send({ erro: impede });

      const { personagem, curou, pagou } = beberPocao(carregado.personagem);
      await armazenamento.personagens.salvar(personagem);
      return { ...paraCliente(personagem), curou, pagou };
    });
  });

  /**
   * Sair do túmulo. Quem paga é a CONTA.
   *
   * Moeda comprada com dinheiro de verdade não vive no personagem: ela
   * sobrevive à morte dele, senão o jogo venderia algo que ele mesmo
   * destrói. E é o que torna o revive possível — o personagem no túmulo não
   * tem nada.
   */
  app.post("/personagens/:id/reviver", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    // Duas travas: o revive cobra da conta e cura o personagem. Sem a da
    // conta, dois revives simultâneos de personagens diferentes pagariam
    // um preço só.
    return filas.executarEm(
      [chaveDoPersonagem(id), chaveDaConta(conta.id)],
      async () => {
        const atual = normalizarConta(
          (await armazenamento.contas.buscar(conta.id)) as Conta,
        );
        const carregado = await meuPersonagem(atual, id, resposta);
        if (!carregado) return;

        const { personagem, pagou } = reviver(carregado.personagem, atual.premium);
        await armazenamento.contas.salvar(debitarPremium(atual, pagou));
        await armazenamento.personagens.salvar(personagem);
        return { ...paraCliente(personagem), pagou };
      },
    );
  });

  /**
   * Crédito de moeda premium.
   *
   * ATENÇÃO: isto existe para a fatia jogável ser testável de ponta a ponta,
   * e é um buraco escancarado — qualquer um credita a si mesmo. Antes de
   * qualquer exposição pública, tem de virar recibo assinado de provedor de
   * pagamento, idempotente por id de transação. Está no sub-projeto 3.
   */
  app.post("/eu/creditar", async (pedido, resposta) => {
    if (process.env.CHAOS_PERMITIR_CREDITO !== "sim") {
      return resposta.status(403).send({
        erro: "crédito direto desabilitado; use o fluxo de pagamento",
      });
    }
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;

    const quantidade = Number((pedido.body as { quantidade?: number })?.quantidade ?? 0);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return resposta.status(400).send({ erro: "quantidade inválida" });
    }

    return filas.executar(chaveDaConta(conta.id), async () => {
      const atual = normalizarConta(
        (await armazenamento.contas.buscar(conta.id)) as Conta,
      );
      const atualizada = creditarPremium(atual, Math.floor(quantidade));
      await armazenamento.contas.salvar(atualizada);
      return { conta: contaParaCliente(atualizada) };
    });
  });

  function estadoDaBatalha(sessao: ReturnType<Batalhas["iniciar"]>) {
    const b = sessao.batalha;
    return {
      rodada: b.rodada,
      vez: b.ordem[b.vez] ?? null,
      vencedor: b.vencedor,
      combatentes: Object.values(b.combatentes).map((c) => ({
        id: c.id,
        nome: c.nome,
        lado: c.lado,
        vida: c.vida,
        vidaMaxima: c.vidaMaxima,
        efeitos: c.efeitos.map((e) => ({ tipo: e.tipo, rodadas: e.rodadas })),
      })),
      disponiveis: b.vencedor
        ? []
        : habilidadesDisponiveis(b, "heroi").map((h) => ({
            id: h.id,
            nome: h.nome,
            descricao: h.descricao,
          })),
      // Tudo que o herói tem, com a espera restante — o cliente precisa
      // mostrar o botão apagado, não sumir com ele.
      recargas: Object.fromEntries(
        (b.combatentes.heroi?.habilidades ?? []).map((h) => [
          h,
          b.combatentes.heroi?.recargas[h] ?? 0,
        ]),
      ),
      todas: (b.combatentes.heroi?.habilidades ?? []).map((h) => {
        const info = habilidadePorId(h);
        return { id: info.id, nome: info.nome, descricao: info.descricao };
      }),
    };
  }

  return app;
}
