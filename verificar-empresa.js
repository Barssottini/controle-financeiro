#!/usr/bin/env node
// Confere a experiencia de empresa (conta CNPJ), extraindo o codigo real do index.html:
// vencimento do DAS (dia 20, ou o proximo dia util), DAS pago, teto do MEI,
// retiradas do dono contra o lucro, as perguntas de empresa e a troca do tipo
// da conta, que so vale enquanto nao ha lancamento.
//
// Rodar:  node verificar-empresa.js

const fs = require('fs');
const path = require('path');

const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ CONHECER VOCÊ ═══');
const j = t.indexOf('async function requestAccountDeletion', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco CONHECER/EMPRESA no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const auxiliares = [
  /function _diaChave\(d\)\{.*\}/, /function monthKeyOf\(d\)\{.*\}/, /function newId\(\)\{[\s\S]*?\n\}/,
  /function _pascoa\(ano\)\{[\s\S]*?\n\}/, /const _feriadosCache=\{\};/, /function _feriados\(ano\)\{[\s\S]*?\n\}/,
  /function escolherTipo\(tp\)\{[\s\S]*?\n\}/,
].map(real).join('\n');

const S = { settings: {}, transactions: [], ccItems: [], investments: [], goals: [], budgets: [], bills: [], recurring: [] };
let tipo = 'pj';
const dom = {};
const el = () => ({ innerHTML: '', textContent: '', hidden: false, value: '', focus() {} });
['ck-passo', 'ck-pontos', 'ck-voltar', 'ck-pular', 'ck-seguir', 'dash-foco', 'dash-titulo', 'dash-oi', 'pf-sobre'].forEach(id => { dom[id] = el(); });
dom['ck-corpo'] = {
  _h: '', get innerHTML() { return this._h; },
  set innerHTML(h) { this._h = h; ['ck-nome', 'ck-valor', 'ck-meta-nome'].forEach(id => delete dom[id]); for (const m of h.matchAll(/<input[^>]*id="(ck-[a-z-]+)"[^>]*?value="([^"]*)"/g)) dom[m[1]] = Object.assign(el(), { value: m[2] }); },
};
const fechados = [], avisos = [];
const sandbox = {
  S,
  esc: s => String(s == null ? '' : s),
  fmtCur: v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v),
  calcGoalCDI: () => null, goalLinkedValue: () => 0,
  tipoConta: () => tipo, ehPro: () => true,
  persistSettings: () => {}, persistGoals: () => {}, persistBudgets: () => {},
  updateDashboard: () => {}, renderPerfil: () => {}, renderCatSelects: () => {}, renderSettings: () => {}, renderBillsPage: () => {},
  toast: m => avisos.push(m),
  openModal: () => {}, closeModal: id => fechados.push(id), showPage: () => {},
  document: { getElementById: id => dom[id] || null },
};
const nomes = Object.keys(sandbox);
const F = new Function(...nomes, auxiliares + '\n' + t.slice(i, j) +
  '\nreturn {vencimentoDAS,linhaDAS,linhaTeto,linhaRetiradas,renderFoco,abrirConhecer,ckSeguir,ckPular,ckRegime,ckObjetivo,escolherTipo,temLancamentos,_diaChave,TETO_MEI};');
const C = F(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const brl = v => sandbox.fmtCur(v);
const dia = (a, m, d) => new Date(a, m - 1, d);

// 1. Vencimento do DAS
checa('20/11/2026 e feriado numa sexta: vence segunda, 23/11', C._diaChave(C.vencimentoDAS(2026, 10)), '2026-11-23');
checa('20/12/2026 e domingo: vence 21/12', C._diaChave(C.vencimentoDAS(2026, 11)), '2026-12-21');
checa('20/01/2027 e quarta: vence no dia', C._diaChave(C.vencimentoDAS(2027, 0)), '2027-01-20');

// 2. Linha do DAS
S.transactions = [];
checa('antes do vencimento: conta os dias ate o dia util', C.linhaDAS(dia(2026, 11, 10)).titulo, 'Faltam 13 dias para o DAS');
checa('perto do vencimento fica em alerta', C.linhaDAS(dia(2026, 11, 21)).subCls, 'alerta');
checa('no dia do vencimento', C.linhaDAS(dia(2026, 11, 23)).titulo, 'O DAS vence hoje');
const venceu = C.linhaDAS(dia(2026, 11, 24));
checa('depois do vencimento, sem pagamento: vermelho', [venceu.titulo, venceu.cls], ['O DAS de novembro venceu', 'neg']);
S.transactions = [{ id: 1, type: 'expense', amount: 81.9, date: '2026-11-18', category: 'Impostos', description: 'Pagamento' }];
const pago = C.linhaDAS(dia(2026, 11, 24));
checa('lancado em Impostos no mes: pago, com o proximo vencimento', [pago.titulo, pago.cls, pago.sub], ['DAS de novembro pago', 'ok', 'O próximo vence em 21/12.']);
S.transactions = [{ id: 2, type: 'expense', amount: 81.9, date: '2026-11-18', category: 'Outros', description: 'PGTO DAS SIMPLES NACIONAL' }];
checa('com DAS na descricao do extrato tambem conta como pago', C.linhaDAS(dia(2026, 11, 24)).cls, 'ok');
S.transactions = [{ id: 3, type: 'expense', amount: 50, date: '2026-11-18', category: 'Outros', description: 'Dasa exames' }];
checa('"Dasa" nao e DAS', C.linhaDAS(dia(2026, 11, 24)).cls, 'neg');

// 3. Teto do MEI
const comFaturamento = v => { S.transactions = [{ id: 10, type: 'income', amount: v, date: '2026-03-10' }, { id: 11, type: 'income', amount: 99999, date: '2025-12-30' }]; };
comFaturamento(10000);
checa('longe do teto: so informa', C.linhaTeto(dia(2026, 11, 10)).titulo, 'Teto do MEI');
comFaturamento(70000);
const perto = C.linhaTeto(dia(2026, 11, 10));
checa('80% ou mais: perto do teto, em alerta', [perto.titulo, perto.subCls, perto.barra.cls], ['Perto do teto do MEI', 'alerta', 'alerta']);
checa('mostra quanto falta para o limite', perto.sub.includes('Faltam ' + brl(C.TETO_MEI - 70000)), true);
comFaturamento(85000);
const passou = C.linhaTeto(dia(2026, 11, 10));
checa('acima do teto: vermelho, barra cheia', [passou.titulo, passou.cls, passou.barra.pct], ['Passou do teto do MEI', 'neg', 100]);
checa('so conta o ano corrente', C.linhaTeto(dia(2026, 11, 10)).sub.startsWith(brl(85000)), true);

// 4. Retiradas do dono contra o lucro
const r1 = C.linhaRetiradas({ lucro: 4000, retir: 2500 });
checa('retirou menos que o lucro: mostra quanto ainda da', [r1.cls, r1.sub.includes('Ainda dá para retirar ' + brl(1500))], [undefined, true]);
const r2 = C.linhaRetiradas({ lucro: 4000, retir: 5000 });
checa('retirou mais que o lucro: vermelho, com a diferenca', [r2.titulo, r2.cls, r2.sub.includes(brl(1000) + ' a mais')], ['Retiradas passaram do lucro', 'neg', true]);
const r3 = C.linhaRetiradas({ lucro: -100, retir: 300 });
checa('sem lucro e com retirada: vermelho', [r3.cls, r3.sub.includes(brl(300))], ['neg', true]);

// 5. Painel da empresa: linhas que aparecem
S.transactions = []; S.settings = {};
C.renderFoco({ lucro: 0, retir: 0 });
checa('sem regime: pede o regime, com botao direto na pergunta', dom['dash-foco'].innerHTML.includes("abrirConhecer('regime')"), true);
S.settings.regime = 'mei';
C.renderFoco({ lucro: 4000, retir: 1000 });
const foco = dom['dash-foco'].innerHTML;
checa('MEI: DAS, teto e retiradas no painel', [foco.includes('DAS'), foco.includes('Teto do MEI'), foco.includes('Retiradas do dono')], [true, true, true]);
S.settings.regime = 'simples';
C.renderFoco({ lucro: 0, retir: 0 });
checa('Simples: DAS sim, teto do MEI nao, e sem retirada nao ha linha de retirada', [dom['dash-foco'].innerHTML.includes('DAS'), dom['dash-foco'].innerHTML.includes('Teto do MEI'), dom['dash-foco'].innerHTML.includes('Retiradas')], [true, false, false]);
tipo = 'pf'; S.settings.regime = 'mei';
C.renderFoco(null);
checa('conta pessoal nao ve nada de empresa', dom['dash-foco'].innerHTML.includes('DAS'), false);
tipo = 'pj';

// 6. Perguntas de empresa
const mes = k => { const h = new Date(); return C._diaChave(new Date(h.getFullYear(), h.getMonth() + k, 10)); };
S.settings = {}; S.goals = []; S.budgets = [];
S.transactions = [
  { id: 20, type: 'expense', amount: 3000, date: mes(-1), category: 'Fornecedores' },
  { id: 21, type: 'expense', amount: 9000, date: mes(-1), category: 'Retiradas do dono' },
];
C.abrirConhecer();
checa('empresa: a primeira pergunta e o nome', dom['ck-corpo'].innerHTML.includes('Como quer ser chamado?'), true);
C.ckSeguir();
checa('a segunda e o regime', dom['ck-corpo'].innerHTML.includes('regime da sua empresa'), true);
C.ckRegime('mei'); C.ckSeguir();
checa('a terceira e o objetivo, com cara de empresa', dom['ck-corpo'].innerHTML.includes('Ter reserva de caixa'), true);
C.ckObjetivo('reserva');
checa('reserva sugerida: 3 meses de custo, sem contar a retirada do dono', dom['ck-valor'].value, '9000');
C.ckSeguir();
checa('regime salvo', S.settings.regime, 'mei');
checa('meta da empresa criada', S.goals.map(g => [g.name, g.target]), [['Reserva de caixa', 9000]]);
checa('tela final conta do DAS e do teto', dom['ck-corpo'].innerHTML.includes('Lembrete do DAS e teto do MEI'), true);
checa('empresa nao ganha limites de orcamento pessoal', S.budgets.length, 0);
C.abrirConhecer('regime');
checa('abrir direto no regime', dom['ck-corpo'].innerHTML.includes('regime da sua empresa'), true);

// 7. Tipo da conta: troca so sem lancamento
S.settings = { accountType: 'pf' }; S.transactions = []; S.ccItems = [];
C.escolherTipo('pj');
checa('sem lancamento: troca de pessoal para empresa', S.settings.accountType, 'pj');
S.transactions = [{ id: 30, type: 'income', amount: 10, date: '2026-11-01' }];
C.escolherTipo('pf');
checa('com lancamento: o tipo fica', S.settings.accountType, 'pj');
checa('e a janela fecha sem trocar', fechados[fechados.length - 1], 'tipo-modal');
S.settings = {};
C.escolherTipo('pf');
checa('conta sem tipo escolhe normalmente, mesmo com lancamento', S.settings.accountType, 'pf');

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
