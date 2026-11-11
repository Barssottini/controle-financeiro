#!/usr/bin/env node
// Confere datas que ja deram errado, extraindo o codigo real do index.html: a
// fatura do cartao conta no mes das compras (pelo dia do pagamento, ou pela escolha
// da pessoa), conta a pagar e compra no cartao nao entram nessa regra, o periodo do
// painel usa essa data, e a parcela de compra no dia 31 nao pula fevereiro.
//
// Rodar:  node verificar-datas.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ COMPETÊNCIA DA FATURA ═══');
const j = t.indexOf('// ═══ FIM DA COMPETÊNCIA DA FATURA ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco COMPETÊNCIA DA FATURA no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _isoDia\(d\)\{.*\}/, /function monthKeyOf\(d\)\{.*\}/, /function noPeriodo\(x,per\)\{[\s\S]*?\n\}/, /function ccParcelaMonth\(c,k\)\{.*\}/].map(real).join('\n');
const sandbox = {
  mesDe: d => String(d).slice(0, 7),
  faixaDoMes: m => { const [a, b] = m.split('-').map(Number); return [m + '-01', m + '-' + String(new Date(a, b, 0).getDate()).padStart(2, '0')]; },
};
const nomes = Object.keys(sandbox);
const C = new Function(...nomes, aux + '\n' + t.slice(i, j) + '\nreturn {ehPagamentoDeFatura,mesContabil,dataContabil,noPeriodo,ccParcelaMonth};')(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const fatura = (date, extra = {}) => Object.assign({ type: 'expense', category: 'Cartão de Crédito', description: 'Pagamento de fatura', amount: 2416.49, date }, extra);

// 1. Fatura: o mes das compras pelo dia do pagamento
checa('paga dia 6/11: compras de outubro', C.mesContabil(fatura('2026-11-06')), '2026-10');
checa('paga dia 15/11: ainda outubro (compras de 6/10 a 5/11)', C.mesContabil(fatura('2026-11-15')), '2026-10');
checa('paga dia 28/11: novembro (compras de 19/10 a 18/11)', C.mesContabil(fatura('2026-11-28')), '2026-11');
checa('virada de ano: paga 5/1 conta em dezembro', C.mesContabil(fatura('2027-01-05')), '2026-12');
checa('escolha da pessoa vale mais', C.mesContabil(fatura('2026-11-06', { competencia: '2026-11' })), '2026-11');

// 2. So pagamento de fatura entra na regra
checa('reconhece pagamento de fatura', ['Pagamento de fatura', 'PAGTO CARTAO CREDITO', 'Pgto cartão Nubank', 'Fatura Itaú'].map(d => C.ehPagamentoDeFatura(fatura('2026-11-06', { description: d }))), [true, true, true, true]);
checa('conta a pagar no cartao (Google One) fica no mes dela', C.mesContabil(fatura('2026-11-03', { description: 'Google One (conta)', billId: 7 })), '2026-11');
checa('outra categoria ou receita nao muda de mes', [C.mesContabil(fatura('2026-11-06', { category: 'Contas' })), C.mesContabil(fatura('2026-11-06', { type: 'income' }))], ['2026-11', '2026-11']);
checa('lancamento comum: o mes da data', C.mesContabil({ type: 'expense', category: 'Alimentação', description: 'Mercado', date: '2026-11-06' }), '2026-11');

// 3. Periodo do painel usa a data contabil
checa('fatura de outubro entra no ultimo dia de outubro', C.dataContabil(fatura('2026-11-06')), '2026-10-31');
const nov = { desde: '2026-11-01', ate: '2026-11-30' }, out = { desde: '2026-10-01', ate: '2026-10-31' };
checa('fora do painel de novembro, dentro do de outubro', [C.noPeriodo(fatura('2026-11-06'), nov), C.noPeriodo(fatura('2026-11-06'), out)], [false, true]);
checa('lancamento comum segue pela data', [C.noPeriodo({ type: 'expense', category: 'Lazer', description: 'Cinema', date: '2026-11-06' }, nov)], [true]);
checa('item do cartao (sem type) segue pela data', C.noPeriodo({ description: 'Notebook', date: '2026-11-06' }, nov), true);

// 4. Parcela de compra no dia 31
checa('compra em 31/1: parcelas em jan, fev, mar', [1, 2, 3].map(k => C.ccParcelaMonth({ date: '2026-01-31' }, k)), ['2026-01', '2026-02', '2026-03']);
checa('parcela 13 vira o ano', C.ccParcelaMonth({ date: '2026-12-15' }, 2), '2027-01');
checa('sem data: vazio', C.ccParcelaMonth({ date: '' }, 1), '');

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
