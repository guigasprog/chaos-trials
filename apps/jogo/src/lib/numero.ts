/**
 * Como um número aparece na tela.
 *
 * Inteiro e com milhar separado. Por regex e não por `toLocaleString`, porque
 * o formato tem de ser o mesmo em qualquer navegador — e porque a ficha
 * chegou a mostrar "1641.6686547393138", que é o que acontece quando um
 * valor de ponto flutuante escapa direto para a tela.
 *
 * A causa daquela fração foi corrigida no domínio (`xpParaNivel` arredonda),
 * mas arredondar aqui também é barato e vale para tudo que venha do servidor
 * com casa decimal — dano, cura, sucata de ausência.
 */
export function n(v: number): string {
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
