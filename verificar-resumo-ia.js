#!/usr/bin/env node
// Confere o resumo que sai do aparelho na recomendacao por IA, extraindo o codigo
// real do index.html: so totais por categoria, renda media, limites, objetivo e dia
// do mes; nenhuma descricao, loja, banco ou conta; retiradas do dono de fora.
//
// Rodar:  node verificar-resumo-ia.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ RESUMO PARA A IA ═══');
const j = t.indexOf('// ═══ FIM DO RESUMO PARA A IA ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco RESUMO PARA A IA no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _isoDia\(d\)\{.*\}/, /function monthKeyOf\(d\)\{.*\}/, /function _diasEntre\(a,b\)\{[\s\S]*?\n\}/, /const OBJETIVOS=\{[\s\S]*?\n\};/].map(real).join('\n');

const S = { budgets: [], settings: {} };
const TX = [
  { type: 'expense', description: 'SUP CASTANHA LTDA', amount: 650, date: '2026-10-08', category: 'Alimentação', conta: 1 },
  { type: 'expense', description: 'Pix enviado Maria Souza', amount: 300, date: '2026-10-09', category: 'Transporte', conta: 2 },
  { type: 'expense', description: 'Pró-labore', amount: 2000, date: '2026-10-10', category: 'Retiradas do dono', conta: 1 },
  { type: 'income', description: 'Salário ACME', amount: 3000, date: '2026-10-05', category: 'Salário', conta: 1 },
  { type: 'expense', description: 'iFood *Restaurante', amount: 120, date: '2026-11-04', category: 'Alimentação', conta: 1 },
];
const porMes = m => { const o = {}; TX.filter(x => x.type === 'expense' && x.date.slice(0, 7) === m).forEach(x => { o[x.category] = (o[x.category] || 0) + x.amount; }); return o; };
const sandbox = {
  S, CAT_RETIRADA: 'Retiradas do dono', spentByCat: porMes, txVis: () => TX, mesDe: d => String(d).slice(0, 7),
  monthLabel: m => 'novembro de 2026',
  faixaDoMes: m => { const [a, b] = m.split('-').map(Number); return [m + '-01', m + '-' + String(new Date(a, b, 0).getDate()).padStart(2, '0')]; },
};
const nomes = Object.keys(sandbox);
const C = new Function(...nomes, aux + '\n' + t.slice(i, j) + '\nreturn {resumoParaIA};')(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const hoje = new Date(2026, 10, 11, 12);
S.budgets = [{ category: 'Alimentação', limit: 500 }, { category: 'Lazer', limit: 150 }];
S.settings.objetivo = 'reserva';
const r = C.resumoParaIA('2026-11', hoje);

checa('campos do resumo, e nada alem deles', Object.keys(r), ['mes', 'dia', 'dias_no_mes', 'meses_de_historico', 'renda_media', 'objetivo', 'categorias']);
checa('dia do mes, historico e renda media', [r.dia, r.dias_no_mes, r.meses_de_historico, r.renda_media, r.objetivo], [11, 30, 1, 3000, 'Montar minha reserva']);
checa('categorias com media, mes atual e limite; limite sem gasto tambem vai', r.categorias, [
  { nome: 'Alimentação', media: 650, gasto_mes: 120, limite: 500 },
  { nome: 'Transporte', media: 300, gasto_mes: 0, limite: null },
  { nome: 'Lazer', media: 0, gasto_mes: 0, limite: 150 },
]);
const texto = JSON.stringify(r);
checa('nenhuma descricao, loja, pessoa ou conta sai do aparelho', ['CASTANHA', 'Maria', 'iFood', 'ACME', 'Pró-labore', 'conta'].filter(s => texto.includes(s)), []);
checa('retiradas do dono ficam de fora', texto.includes('Retiradas'), false);

S.settings.objetivo = undefined;
TX.splice(3, 1);   // sem renda lancada
const r2 = C.resumoParaIA('2026-11', hoje);
checa('sem renda e sem objetivo: null, nao zero', [r2.renda_media, r2.objetivo], [null, null]);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
