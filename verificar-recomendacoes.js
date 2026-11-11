#!/usr/bin/env node
// Confere as recomendacoes do orcamento (calculadas no aparelho, sem IA),
// extraindo o codigo real do index.html: limite estourado, ritmo do mes com o
// valor por dia, quanto da renda sobra e onde cortar, categoria sem limite,
// limite com folga, criar limites do zero, e sem historico nao inventar nada.
//
// Rodar:  node verificar-recomendacoes.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ RECOMENDAÇÕES DO ORÇAMENTO ═══');
const j = t.indexOf('// ═══ FIM DAS RECOMENDAÇÕES DO ORÇAMENTO ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco RECOMENDAÇÕES DO ORÇAMENTO no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _isoDia\(d\)\{.*\}/, /function monthKeyOf\(d\)\{.*\}/, /function _diasEntre\(a,b\)\{[\s\S]*?\n\}/].map(real).join('\n');

const S = { budgets: [] };
let gastos = {}, rendas = {};
const sandbox = {
  S, CAT_RETIRADA: 'Retiradas do dono', fmtCur: v => 'R$' + v.toFixed(2),
  spentByCat: m => ({ ...(gastos[m] || {}) }),
  txVis: () => Object.entries(rendas).map(([m, v]) => ({ type: 'income', amount: v, date: m + '-05' })),
  mesDe: d => String(d).slice(0, 7),
  faixaDoMes: m => { const [a, b] = m.split('-').map(Number); return [m + '-01', m + '-' + String(new Date(a, b, 0).getDate()).padStart(2, '0')]; },
};
const nomes = Object.keys(sandbox);
const C = new Function(...nomes, aux + '\n' + t.slice(i, j) + '\nreturn {recomendacoesOrcamento,arredLimite};')(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const hoje = new Date(2026, 10, 10, 12);   // 10/11: um terco do mes passou, faltam 21 dias
const recos = () => C.recomendacoesOrcamento('2026-11', hoje);
const tipos = () => recos().itens.map(x => x.tipo);
const acoes = () => recos().itens.filter(x => x.acao).map(x => x.acao.lote);

checa('arredonda para cima: 10 ate 500, 50 ate 2000, 100 depois', [C.arredLimite(455), C.arredLimite(650), C.arredLimite(2010)], [460, 650, 2100]);

// sem historico e sem limite: nada a dizer
checa('sem historico: nenhuma recomendacao', [recos().meses, recos().itens], [0, []]);

// tres meses de historico
const mes = { 'Alimentação': 650, 'Lazer': 200, 'Transporte': 300, 'Outros': 30 };
gastos = { '2026-08': { ...mes, 'Alimentação': 600 }, '2026-09': mes, '2026-10': { ...mes, 'Alimentação': 700 } };
rendas = { '2026-08': 3000, '2026-09': 3000, '2026-10': 3000 };
checa('sem nenhum limite: um cartao para criar todos, da maior media para a menor', [tipos(), acoes()[0]],
  [['guarda', 'comecar'], [{ cat: 'Alimentação', limite: 650 }, { cat: 'Transporte', limite: 300 }, { cat: 'Lazer', limite: 200 }]]);

S.budgets = [{ category: 'Alimentação', limit: 500 }, { category: 'Lazer', limit: 600 }, { category: 'Contas', limit: 300 }];
gastos['2026-11'] = { 'Alimentação': 520, 'Lazer': 50, 'Contas': 200 };
const r = recos();
checa('ordem: estourou, ritmo, quanto guarda, sem limite, folga', r.itens.map(x => x.tipo), ['estourou', 'ritmo', 'guarda', 'sem-limite', 'folga']);
checa('estourou com media acima do limite: sugere a media', r.itens[0].acao.lote, [{ cat: 'Alimentação', limite: 650 }]);
checa('ritmo: 67% usado com o mes em 33%, e quanto gastar por dia', r.itens[1].texto.includes('67%') && r.itens[1].texto.includes('33%') && r.itens[1].texto.includes('R$4.76'), true);
checa('categoria pesada sem limite ganha sugestao', r.itens[3].acao.lote, [{ cat: 'Transporte', limite: 300 }]);
checa('limite com folga: baixar para media + 10%', r.itens[4].acao.lote, [{ cat: 'Lazer', limite: 220 }]);
checa('categoria pequena (media abaixo de R$ 50) nao vira sugestao', JSON.stringify(r.itens).includes('Outros não tem limite'), false);

// renda apertada: quanto cortar e onde
rendas = { '2026-08': 1200, '2026-09': 1200, '2026-10': 1200 };
const p = recos().itens.find(x => x.tipo === 'poupanca');
checa('guarda pouco: corte para chegar a 20% na categoria mais facil', [p.titulo, p.acao.lote], ['Você guarda 2% do que recebe', [{ cat: 'Alimentação', limite: 460 }]]);
rendas = { '2026-08': 1000, '2026-09': 1000, '2026-10': 1000 };
checa('gastou mais do que recebeu', recos().itens.find(x => x.tipo === 'poupanca').titulo, 'Você gastou mais do que recebeu');

// sem renda lancada: nao fala de poupanca
rendas = {};
checa('sem renda lancada: nada sobre quanto guarda', tipos().some(x => x === 'poupanca' || x === 'guarda'), false);

// no maximo 5 cartoes
checa('no maximo 5 recomendacoes', recos().itens.length <= 5, true);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
