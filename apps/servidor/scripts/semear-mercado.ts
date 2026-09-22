/**
 * Semeia o mercado local com anúncios de verdade — sucata, premium e os
 * dois — pra ter o que comprar/testar sem precisar de um grind de horas.
 *
 * Escrito direto no cofre em arquivo, sem passar pela API: o vendedor é
 * uma conta de demonstração, e os itens nunca precisam estar na mochila
 * de ninguém pra virar anúncio — só existir.
 *
 * Rodar com o servidor DESLIGADO (ele lê os arquivos na subida e
 * sobrescreveria isso na primeira escrita concorrente):
 *
 *   npx tsx apps/servidor/scripts/semear-mercado.ts
 */
import {
  criarAnuncio,
  criarConta,
  criarPersonagem,
  adicionarPersonagem,
  gerarItem,
  precoSugerido,
  RAIZES,
  ramoDe,
  type Moeda,
  type Raridade,
} from "@chaos/dominio";
import { emArquivo, pastaPadrao } from "../src/armazenamento.ts";
import { guardarSenha } from "../src/senhas.ts";

const agora = Date.now();
const armazenamento = emArquivo(pastaPadrao());

const conta = criarConta({
  id: "loja",
  email: "loja@chaos-trials.local",
  senha: await guardarSenha("nao-se-loga-com-esta-conta-mesmo"),
  agora,
});

const vendedor = criarPersonagem({
  id: "vendedor-loja",
  nome: "O Sacristão",
  classeRaiz: 1,
  agora,
});

await armazenamento.contas.salvar(adicionarPersonagem(conta, vendedor.id));
await armazenamento.personagens.salvar(vendedor);

/**
 * Cada linha: nível do item (define a potência), raiz (define paleta e
 * atributo principal) e moeda. Espalhado pelas cinco raízes e pelas
 * cinco raridades pra vitrine não sair repetitiva, e misturando sucata
 * e premium como pedido — inclusive um item caro em premium que, uma
 * vez comprado, pode ser desmanchado por sucata: é o único caminho de
 * premium virar sucata, e sem nenhum anúncio em premium esse caminho
 * não existe.
 */
const LOTE: { nivel: number; raiz: number; raridade: Raridade; moeda: Moeda }[] = [
  { nivel: 5, raiz: 1, raridade: "bruto", moeda: "sucata" },
  { nivel: 8, raiz: 2, raridade: "lapidado", moeda: "sucata" },
  { nivel: 12, raiz: 3, raridade: "lapidado", moeda: "sucata" },
  { nivel: 15, raiz: 4, raridade: "vitral", moeda: "sucata" },
  { nivel: 20, raiz: 5, raridade: "vitral", moeda: "sucata" },
  { nivel: 25, raiz: 1, raridade: "relicario", moeda: "premium" },
  { nivel: 30, raiz: 3, raridade: "relicario", moeda: "premium" },
  { nivel: 40, raiz: 4, raridade: "sagrado", moeda: "premium" },
];

let semente = 12345;
for (const [i, linha] of LOTE.entries()) {
  const item = gerarItem({
    nivel: linha.nivel,
    ramo: ramoDe(linha.raiz),
    semente: semente++,
    id: `item-loja-${i}`,
    raridade: linha.raridade,
  });
  const preco = precoSugerido(item, linha.moeda);
  const anuncio = criarAnuncio({
    id: `anuncio-loja-${i}`,
    vendedor: conta.id,
    vendedorNome: vendedor.nome,
    personagem: vendedor.id,
    item,
    preco,
    moeda: linha.moeda,
    agora,
  });
  await armazenamento.anuncios.salvar(anuncio);
  console.log(
    `${item.nome} (${linha.raridade}, raiz ${linha.raiz}) — ${preco} ${linha.moeda}`,
  );
}

console.log(`\n${LOTE.length} anúncios semeados na prateleira de O Sacristão.`);
