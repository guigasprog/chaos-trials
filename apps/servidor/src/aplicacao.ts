import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import {
  ARVORE,
  bonusDoPersonagem,
  classePorIndice,
  criarPersonagem,
  custoDoRevive,
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

/**
 * A API.
 *
 * Uma regra atravessa tudo: **o cliente manda intenção, nunca estado.** Ele
 * não envia vida, dano, XP nem resultado — envia "quero lutar", "quero usar
 * `toxina`", "quero renascer". Quem decide é o domínio, aqui dentro. É isso
 * que torna trapaça impossível, e não criptografia.
 *
 * Autenticação de verdade é o sub-projeto 6. Nesta fatia o id do personagem é
 * a credencial, o que é suficiente para jogar localmente e **não** é seguro
 * para expor — está marcado abaixo onde isso precisa mudar.
 */

export interface Opcoes {
  armazenamento: Armazenamento;
  /** Injetável para o teste não depender do relógio da máquina. */
  agora?: () => number;
  log?: boolean;
  /**
   * De onde o navegador pode chamar. Vazio libera tudo, que é o certo em
   * desenvolvimento e errado em produção.
   */
  origens?: readonly string[];
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
    premium: p.premium,
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
    const bruto = await armazenamento.buscar(id);
    if (!bruto) return null;
    // Campo novo em dado já gravado chega indefinido; morre aqui, na porta.
    const guardado = normalizar(bruto);

    const relatorio = progredirOffline(guardado, agora());
    if (relatorio.batalhas > 0 || relatorio.personagem.visto !== guardado.visto) {
      await armazenamento.salvar(relatorio.personagem);
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

  app.get("/saude", async () => ({
    ok: true,
    batalhasAtivas: batalhas.ativas,
  }));

  /** As cinco raízes, para a tela de criação. */
  app.get("/classes", async () => ({
    raizes: RAIZES.map((c) => ({ indice: c.indice, nome: c.nome })),
  }));

  app.post("/personagens", async (pedido, resposta) => {
    const corpo = pedido.body as { nome?: string; classe?: number };
    const nome = (corpo?.nome ?? "").trim();
    if (nome.length < 2 || nome.length > 24) {
      return resposta.status(400).send({ erro: "o nome precisa ter de 2 a 24 letras" });
    }
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha uma classe" });
    }

    const id = `p${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    const p = criarPersonagem({
      id,
      nome,
      classeRaiz: corpo.classe,
      agora: agora(),
    });
    await armazenamento.salvar(p);
    return resposta.status(201).send(paraCliente(p));
  });

  app.get("/personagens/:id", async (pedido, resposta) => {
    const { id } = pedido.params as { id: string };
    const carregado = await carregar(id);
    if (!carregado) return resposta.status(404).send({ erro: "personagem não encontrado" });

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
    const { id } = pedido.params as { id: string };
    const carregado = await carregar(id);
    if (!carregado) return resposta.status(404).send({ erro: "personagem não encontrado" });

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
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { habilidade?: string };
    if (!corpo?.habilidade) {
      return resposta.status(400).send({ erro: "diga qual habilidade" });
    }

    const { sessao, eventos } = batalhas.agir(id, corpo.habilidade);

    // Terminou: é aqui que o resultado vira progresso gravado. Antes disso,
    // nada do que aconteceu na batalha toca o personagem.
    let resultado = null;
    if (sessao.batalha.vencedor) {
      const guardado = await armazenamento.buscar(sessao.personagemId);
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
      await armazenamento.salvar(depois);
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
    const atualizado: Personagem = {
      ...ganho.personagem,
      sucata: ganho.personagem.sucata + premio.sucata,
      // A mesma recuperação que o offline aplica. Sem ela, uma vitória
      // apertada deixa a luta seguinte impossível — e com revive pago isso
      // seria cobrar por uma dificuldade que o desenho criou.
      vida: vidaAposVitoria(ganho.personagem),
    };
    await armazenamento.salvar(atualizado);

    return {
      venceu: true,
      xp: premio.xp,
      sucata: premio.sucata,
      niveisSubidos: ganho.niveisSubidos,
      morreu: false,
      recuou: false,
      personagem: paraCliente(atualizado),
    };
  }

  app.post("/personagens/:id/arvore", async (pedido, resposta) => {
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { no?: string };
    const carregado = await carregar(id);
    if (!carregado) return resposta.status(404).send({ erro: "personagem não encontrado" });
    if (!corpo?.no) return resposta.status(400).send({ erro: "diga qual nó" });

    const atualizado = evoluirArvore(carregado.personagem, corpo.no);
    await armazenamento.salvar(atualizado);
    return paraCliente(atualizado);
  });

  app.post("/personagens/:id/subclasse", async (pedido, resposta) => {
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { classe?: number };
    const carregado = await carregar(id);
    if (!carregado) return resposta.status(404).send({ erro: "personagem não encontrado" });
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha uma subclasse" });
    }

    const atualizado = escolherSubclasse(carregado.personagem, corpo.classe);
    await armazenamento.salvar(atualizado);
    return paraCliente(atualizado);
  });

  app.post("/personagens/:id/renascer", async (pedido, resposta) => {
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { classe?: number };
    const carregado = await carregar(id);
    if (!carregado) return resposta.status(404).send({ erro: "personagem não encontrado" });
    if (typeof corpo?.classe !== "number") {
      return resposta.status(400).send({ erro: "escolha a raiz da vida nova" });
    }

    const atualizado = renascer(carregado.personagem, corpo.classe);
    await armazenamento.salvar(atualizado);
    return paraCliente(atualizado);
  });

  app.post("/personagens/:id/reviver", async (pedido, resposta) => {
    const { id } = pedido.params as { id: string };
    const carregado = await carregar(id);
    if (!carregado) return resposta.status(404).send({ erro: "personagem não encontrado" });

    const { personagem, pagou } = reviver(carregado.personagem);
    await armazenamento.salvar(personagem);
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
  app.post("/personagens/:id/creditar", async (pedido, resposta) => {
    if (process.env.CHAOS_PERMITIR_CREDITO !== "sim") {
      return resposta.status(403).send({
        erro: "crédito direto desabilitado; use o fluxo de pagamento",
      });
    }
    const { id } = pedido.params as { id: string };
    const corpo = pedido.body as { quantidade?: number };
    const quantidade = Number(corpo?.quantidade ?? 0);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return resposta.status(400).send({ erro: "quantidade inválida" });
    }

    const guardado = await armazenamento.buscar(id);
    if (!guardado) return resposta.status(404).send({ erro: "personagem não encontrado" });

    const atualizado = { ...guardado, premium: guardado.premium + Math.floor(quantidade) };
    await armazenamento.salvar(atualizado);
    return paraCliente(atualizado);
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
