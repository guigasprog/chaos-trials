import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import {
  adicionarPersonagem,
  ARVORE,
  bonusDoPersonagem,
  classePorIndice,
  comprarSlot,
  type Conta,
  creditarPremium,
  criarConta,
  criarPersonagem,
  custoDoRevive,
  debitarPremium,
  desequipar,
  desmanchar,
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

    const { pode, motivo } = podeComprarSlot(conta);
    if (!pode) return resposta.status(409).send({ erro: motivo });

    const atualizada = comprarSlot(conta);
    await armazenamento.contas.salvar(atualizada);
    return { conta: contaParaCliente(atualizada) };
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
    if (slotsLivres(conta) <= 0) {
      return resposta.status(409).send({
        erro: `sem slot livre: ${conta.personagens.length} de ${slotsTotais(conta)} ocupados`,
      });
    }

    const p = criarPersonagem({
      id: `p${novoSufixo()}`,
      nome,
      classeRaiz: corpo.classe,
      agora: agora(),
    });
    // A conta primeiro: se gravar o personagem e falhar ao ligá-lo à conta,
    // ele fica órfão no cofre e ninguém o alcança. Na ordem inversa, o pior
    // caso é um id na conta sem personagem — que `/eu` já ignora.
    await armazenamento.contas.salvar(adicionarPersonagem(conta, p.id));
    await armazenamento.personagens.salvar(p);
    return resposta.status(201).send(paraCliente(p));
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
    if (!conta.personagens.includes(id)) {
      return resposta.status(404).send({ erro: "personagem não encontrado" });
    }

    await armazenamento.contas.salvar(removerPersonagem(conta, id));
    await armazenamento.personagens.remover(id);
    return { ok: true };
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
      ausencia:
        relatorio.batalhas > 0
          ? {
              horas: Number(relatorio.horasCreditadas.toFixed(2)),
              batalhas: relatorio.batalhas,
              vitorias: relatorio.vitorias,
              xp: relatorio.xpGanho,
              sucata: relatorio.sucataGanha,
              morreu: relatorio.morreu,
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
    let resultado = null;
    if (sessao.batalha.vencedor) {
      const guardado = await armazenamento.personagens.buscar(sessao.personagemId);
      if (guardado) {
        resultado = await concluir(guardado, sessao);
      }
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
    let atualizado: Personagem = {
      ...ganho.personagem,
      sucata: ganho.personagem.sucata + premio.sucata,
      // A mesma recuperação que o offline aplica. Sem ela, uma vitória
      // apertada deixa a luta seguinte impossível — e com revive pago isso
      // seria cobrar por uma dificuldade que o desenho criou.
      vida: vidaAposVitoria(ganho.personagem),
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
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;
    if (!corpo?.no) return resposta.status(400).send({ erro: "diga qual nó" });

    const atualizado = evoluirArvore(carregado.personagem, corpo.no);
    await armazenamento.personagens.salvar(atualizado);
    return paraCliente(atualizado);
  });

  app.post("/personagens/:id/subclasse", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { classe?: number };
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha uma subclasse" });
    }

    const atualizado = escolherSubclasse(carregado.personagem, corpo.classe);
    await armazenamento.personagens.salvar(atualizado);
    return paraCliente(atualizado);
  });

  app.post("/personagens/:id/renascer", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { classe?: number };
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha a raiz da vida nova" });
    }

    const atualizado = renascer(carregado.personagem, corpo.classe);
    await armazenamento.personagens.salvar(atualizado);
    return paraCliente(atualizado);
  });

  // ── Itens ──────────────────────────────────────────────────────────────

  app.post("/personagens/:id/equipar", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { item?: string };
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;
    if (!corpo?.item) return resposta.status(400).send({ erro: "diga qual peça" });

    const atualizado = equipar(carregado.personagem, corpo.item);
    await armazenamento.personagens.salvar(atualizado);
    return paraCliente(atualizado);
  });

  app.post("/personagens/:id/desequipar", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { encaixe?: Encaixe };
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;
    if (!corpo?.encaixe || !ENCAIXES.includes(corpo.encaixe)) {
      return resposta.status(400).send({ erro: "diga qual encaixe" });
    }

    const atualizado = desequipar(carregado.personagem, corpo.encaixe);
    await armazenamento.personagens.salvar(atualizado);
    return paraCliente(atualizado);
  });

  /** Desmancha em sucata. Só o que está na mochila: o vestido sai primeiro. */
  app.post("/personagens/:id/desmanchar", async (pedido, resposta) => {
    const conta = await exigirConta(pedido, resposta);
    if (!conta) return;
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { item?: string };
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;
    if (!corpo?.item) return resposta.status(400).send({ erro: "diga qual peça" });
    if (!itemNaMochila(carregado.personagem, corpo.item)) {
      return resposta.status(404).send({ erro: "essa peça não está na mochila" });
    }

    const { personagem, sucata } = desmanchar(carregado.personagem, corpo.item);
    await armazenamento.personagens.salvar(personagem);
    return { ...paraCliente(personagem), rendeu: sucata };
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
    const carregado = await meuPersonagem(conta, id, resposta);
    if (!carregado) return;

    const { personagem, pagou } = reviver(carregado.personagem, conta.premium);
    await armazenamento.contas.salvar(debitarPremium(conta, pagou));
    await armazenamento.personagens.salvar(personagem);
    return { ...paraCliente(personagem), pagou };
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

    const atualizada = creditarPremium(conta, Math.floor(quantidade));
    await armazenamento.contas.salvar(atualizada);
    return { conta: contaParaCliente(atualizada) };
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
