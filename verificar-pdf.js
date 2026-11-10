#!/usr/bin/env node
// Confere a leitura de extrato e fatura em PDF, extraindo o codigo real do
// index.html: como os pedacos de texto viram linhas e como cada linha vira (ou
// nao) um lancamento — datas em varios formatos, sinal do valor, saldo de fora,
// data de cabecalho valendo para as linhas de baixo, virada de ano.
//
// Rodar:  node verificar-pdf.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ EXTRATO EM PDF ═══');
const j = t.indexOf('// ═══ FIM DO EXTRATO EM PDF ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco EXTRATO EM PDF no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _isoDia\(d\)\{.*\}/, /const PIX_IN_RE=.*;/, /function parseValor\(s\)\{[\s\S]*?\n\}/].map(real).join('\n');
const sandbox = { knownCats: () => ({}), cleanDesc: s => s.trim(), guessCategory: () => 'Outros', document: {}, showPromptCode: () => {}, showAlert: () => {} };
const nomes = Object.keys(sandbox);
const C = new Function(...nomes, aux + '\n' + t.slice(i, j) + '\nreturn {linhasDosItens,transacoesDoTexto,anoDoTexto};')(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const hoje = new Date(2026, 10, 10);
const ler = (linhas, ano = 2026) => C.transacoesDoTexto(linhas, ano, hoje).map(r => [r.date, r.type, r.amount, r.description]);

// 1. Pedacos de texto viram linhas pela altura, na ordem da esquerda para a direita
const it = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
checa('mesma altura vira uma linha, ordenada da esquerda para a direita', C.linhasDosItens([
  it('-27,40', 400, 700.4), it('05/11/2026', 40, 700), it('UBER DO BRASIL', 120, 699.2), it('Saldo', 40, 720), it(' ', 90, 680),
]), ['Saldo', '05/11/2026 UBER DO BRASIL -27,40']);

// 2. Extrato de conta: data completa, sinal, saldo do dia ao lado
checa('debito com sinal e o saldo do dia ao lado: vale o primeiro valor', ler(['05/11/2026 PAGAMENTO BOLETO ENERGIA -189,90 3.310,10']), [['2026-11-05', 'expense', 189.9, 'PAGAMENTO BOLETO ENERGIA']]);
checa('credito sem sinal mas "recebido": entrada', ler(['05/11/2026 PIX RECEBIDO JOAO SILVA 2.500,00 3.500,00']), [['2026-11-05', 'income', 2500, 'PIX RECEBIDO JOAO SILVA']]);
checa('"C" no fim: entrada; "D" no fim: saida', ler(['06/11/2026 SALARIO EMPRESA X 6.200,00 C', '07/11 MERCADO 156,20 D']), [['2026-11-06', 'income', 6200, 'SALARIO EMPRESA X'], ['2026-11-07', 'expense', 156.2, 'MERCADO']]);
checa('valor com R$ e sinal antes ou depois do R$', ler(['08/11 Padaria -R$ 12,00', '08/11 Farmacia R$ -64,90']), [['2026-11-08', 'expense', 12, 'Padaria'], ['2026-11-08', 'expense', 64.9, 'Farmacia']]);
checa('linha de saldo e de total ficam de fora', ler(['SALDO ANTERIOR 1.000,00', '05/11 Saldo do dia 2.000,00', 'Total de saidas 500,00']), []);

// 3. Fatura: "05 NOV", cabecalho de data, parcela no meio da linha
checa('fatura com "05 NOV"', ler(['05 NOV Uber *Trip R$ 23,50']), [['2026-11-05', 'expense', 23.5, 'Uber *Trip']]);
checa('cabecalho com dia da semana vale para as linhas de baixo', ler(['Terça, 10 de novembro de 2026', 'Compra no debito Padaria -R$ 12,00', 'Transferencia recebida Ana R$ 100,00']),
  [['2026-11-10', 'expense', 12, 'Compra no debito Padaria'], ['2026-11-10', 'income', 100, 'Transferencia recebida Ana']]);
checa('parcela 3/10 no meio da linha nao vira data', ler(['05/11 NOTEBOOK DELL 3/10 480,00']), [['2026-11-05', 'expense', 480, 'NOTEBOOK DELL 3/10']]);
checa('linha sem data e sem cabecalho antes: fica de fora', ler(['Compra qualquer 50,00']), []);
checa('ano de dois digitos', ler(['05/11/26 Mercado 10,00']), [['2026-11-05', 'expense', 10, 'Mercado']]);

// 4. Ano: o que mais aparece no texto; dezembro num extrato que fecha em janeiro
checa('ano do texto: o que mais aparece', C.anoDoTexto(['Extrato 2027', 'Periodo 2026', 'Gerado em 2026']), 2026);
checa('dezembro sem ano num extrato de janeiro vai para o ano anterior', C.transacoesDoTexto(['28/12 Mercado 50,00', '03/01 Uber 20,00'], 2027, new Date(2027, 0, 5)).map(r => r.date), ['2026-12-28', '2027-01-03']);
checa('data impossivel nao vira lancamento', ler(['45/13 Coisa 10,00']), []);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
