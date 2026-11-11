#!/usr/bin/env node
// Confere o lancamento que uma conta a pagar gera, extraindo o codigo real do
// index.html: data do vencimento (dia 31 em mes curto), lancamento antigo ligado
// pelo nome com a categoria atual e o vencimento mais perto, nome e categoria
// acompanhando a conta, e desfazer apagando so o lancamento daquele mes.
//
// Rodar:  node verificar-contas-pagar.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ LANÇAMENTOS DAS CONTAS ═══');
const j = t.indexOf('// ═══ FIM DOS LANÇAMENTOS DAS CONTAS ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco LANÇAMENTOS DAS CONTAS no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _isoDia\(d\)\{.*\}/, /function monthKeyOf\(d\)\{.*\}/].map(real).join('\n');
const S = { bills: [], transactions: [] };
const C = new Function('S', aux + '\n' + t.slice(i, j) + '\nreturn {vencimentoNoMes,ligarLancamentosDasContas,sincronizarLancamentosDaConta,apagarLancamentoDaConta};')(S);

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}

checa('vencimento no mes; dia 31 vira o ultimo dia', [C.vencimentoNoMes({ day: 5 }, '2026-11'), C.vencimentoNoMes({ day: 31 }, '2026-02'), C.vencimentoNoMes({ day: 31 }, '2026-12')], ['2026-11-05', '2026-02-28', '2026-12-31']);

// o caso do Pedro: contas criadas como "Outros", trocadas para "Contas", pagas em 11/11
S.bills = [{ id: 1, name: 'Vercel', day: 5, category: 'Contas' }, { id: 2, name: 'Anthropic | Claude', day: 15, category: 'Contas' }, { id: 3, name: 'Aluguel', day: 30, category: 'Moradia' }, { id: 4, name: 'Cliente X', day: 10, category: 'Salário', kind: 'receive' }];
S.transactions = [
  { id: 10, type: 'expense', description: 'Vercel (conta)', amount: 120, date: '2026-11-11', category: 'Outros' },
  { id: 11, type: 'expense', description: 'Anthropic | Claude (conta)', amount: 120, date: '2026-11-11', category: 'Outros' },
  { id: 12, type: 'expense', description: 'Aluguel (conta)', amount: 1500, date: '2026-11-02', category: 'Moradia' },   // vence 30/10, paga atrasada
  { id: 13, type: 'income', description: 'Cliente X (recebimento)', amount: 900, date: '2026-11-09', category: 'Outros' },
  { id: 14, type: 'expense', description: 'Vercel', amount: 120, date: '2026-10-20', category: 'Outros' },             // lancamento a mao, sem o sufixo
];
checa('ligar os antigos muda alguma coisa', C.ligarLancamentosDasContas(), true);
const v = id => { const x = S.transactions.find(t => t.id === id); return [x.billId, x.billMes, x.category, x.date]; };
checa('ganha o vinculo, a categoria atual e o vencimento do mes', v(10), [1, '2026-11', 'Contas', '2026-11-05']);
checa('vencimento ainda por vir no mes tambem vale', v(11), [2, '2026-11', 'Contas', '2026-11-15']);
checa('paga atrasada no comeco do mes: vencimento do mes anterior', v(12), [3, '2026-11', 'Moradia', '2026-10-30']);
checa('recebimento casa pelo sufixo de recebimento', v(13), [4, '2026-11', 'Salário', '2026-11-10']);
checa('lancamento feito a mao nao e tocado', v(14), [undefined, undefined, 'Outros', '2026-10-20']);
checa('rodar de novo nao muda nada', C.ligarLancamentosDasContas(), false);

S.bills[0].category = 'Assinaturas'; S.bills[0].name = 'Vercel Pro';
checa('nome e categoria acompanham a conta', [C.sincronizarLancamentosDaConta(S.bills[0]), S.transactions[0].description, S.transactions[0].category, S.transactions[0].amount], [1, 'Vercel Pro (conta)', 'Assinaturas', 120]);

S.transactions.push({ id: 15, type: 'expense', description: 'Vercel Pro (conta)', amount: 120, date: '2026-10-05', category: 'Assinaturas', billId: 1, billMes: '2026-10' });
checa('desfazer apaga so o lancamento daquele mes', [C.apagarLancamentoDaConta(S.bills[0], '2026-11'), S.transactions.filter(t => t.billId === 1).map(t => t.billMes)], [true, ['2026-10']]);
checa('desfazer sem lancamento nao apaga nada', [C.apagarLancamentoDaConta(S.bills[0], '2026-11'), S.transactions.length], [false, 5]);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
