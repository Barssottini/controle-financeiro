#!/usr/bin/env node
// Confere as perguntas de "conhecer voce", extraindo o bloco real do index.html.
// O que importa: a conta do pagamento (dia 31 em mes curto, virada de ano, o que
// entrou e saiu desde o ultimo pagamento) e que responder de novo nunca duplica
// meta nem limite, nem mexe na meta de outro objetivo.
//
// Rodar:  node verificar-conhecer.js

const fs = require('fs');
const path = require('path');

const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ CONHECER VOCÊ ═══');
const j = t.indexOf('async function requestAccountDeletion', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco CONHECER VOCE no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const auxiliares = [/function _diaChave\(d\)\{.*\}/, /function monthKeyOf\(d\)\{.*\}/, /function newId\(\)\{[\s\S]*?\n\}/].map(real).join('\n');

const S = { settings: {}, transactions: [], ccItems: [], investments: [], goals: [], budgets: [], bills: [], recurring: [] };
let tipo = 'pf';
// DOM de mentira: guarda o que o codigo escreve e devolve os campos que a tela atual desenhou
const dom = {};
const el = () => ({ innerHTML: '', textContent: '', hidden: false, value: '', focus() {} });
['ck-passo', 'ck-pontos', 'ck-voltar', 'ck-pular', 'ck-seguir', 'dash-foco', 'dash-titulo', 'dash-oi', 'pf-sobre', 'pg-valor', 'pg-cats', 'pg-salvar', 'pg-passo1', 'pg-passo2', 'pg-chip', 'pg-linha'].forEach(id => { dom[id] = el(); });
dom['ck-corpo'] = {
  _h: '',
  get innerHTML() { return this._h; },
  set innerHTML(h) {
    this._h = h;
    ['ck-nome', 'ck-valor', 'ck-meta-nome'].forEach(id => delete dom[id]);
    for (const m of h.matchAll(/<input[^>]*id="(ck-[a-z-]+)"[^>]*?value="([^"]*)"/g)) dom[m[1]] = Object.assign(el(), { value: m[2] });
  },
};
const abertos = [];
const banco = { precisa: false, aberto: null, depois: null };
const sandbox = {
  S,
  esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtCur: v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v),
  calcGoalCDI: () => null, goalLinkedValue: () => 0,
  tipoConta: () => tipo, ehPro: () => true,
  persistSettings: () => {}, persistGoals: () => {}, persistBudgets: () => {},
  updateDashboard: () => {}, renderPerfil: () => {},
  openModal: id => abertos.push(id), closeModal: () => {}, showPage: () => {},
  // primeiro gasto
  persist: () => {}, contaPadraoId: () => 1, renderTxList: () => {}, populateMonthFilter: () => {}, toast: () => {},
  precisaEscolherBanco: () => banco.precisa, abrirEscolhaBanco: (modo, depois) => { banco.aberto = modo; banco.depois = depois; },
  subAccess: s => s || { reason: 'unknown' }, daysLeft: d => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 86400000)),
  _nfSub: null, CAT_ICONS: { 'Alimentação': '🍔' }, showConfirm: () => Promise.resolve(false), startSubscription: () => {}, fmtDate: d => new Date(d).toLocaleDateString('pt-BR'),
  document: { getElementById: id => dom[id] || null, addEventListener() {} },
};
const nomes = Object.keys(sandbox);
const F = new Function(...nomes, auxiliares + '\n' + t.slice(i, j) +
  '\nreturn {pgTecla,pgCat,salvarPrimeiroGasto,abrirPrimeiroGasto,proximoPassoEntrada,precisaPrimeiroGasto,setSub:s=>{_nfSub=s},cicloEfetivo,cicloPagamento,proximoMarco,gastoMedioMensal,renderFoco,renderSaudacao,abrirConhecer,ckSeguir,ckPular,ckObjetivo,ckDia,ckFaixa,_diaChave,monthKeyOf};');
const C = F(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const ciclo = (dia, a, m, d) => { const c = C.cicloPagamento(dia, new Date(a, m - 1, d)); return [C._diaChave(c.ultimo), C._diaChave(c.proximo), c.faltam, c.hoje]; };

// 1. Datas do pagamento
checa('dia 5, hoje 10/11: ultimo 5/11, proximo 5/12, faltam 25', ciclo(5, 2026, 11, 10), ['2026-11-05', '2026-12-05', 25, false]);
checa('hoje e o dia do pagamento', ciclo(10, 2026, 11, 10), ['2026-11-10', '2026-12-10', 30, true]);
checa('dia 31 em novembro vira o dia 30', ciclo(31, 2026, 11, 10), ['2026-10-31', '2026-11-30', 20, false]);
checa('dia 30 em fevereiro vira o dia 28', ciclo(30, 2027, 2, 15), ['2027-01-30', '2027-02-28', 13, false]);
checa('dia 31 depois de fevereiro', ciclo(31, 2027, 3, 1), ['2027-02-28', '2027-03-31', 30, false]);
checa('virada de ano: ultimo em dezembro, proximo em janeiro', ciclo(20, 2026, 12, 25), ['2026-12-20', '2027-01-20', 26, false]);
checa('comeco de janeiro: ultimo ainda em dezembro', ciclo(5, 2027, 1, 3), ['2026-12-05', '2027-01-05', 2, false]);

// 2. Proximo marco do patrimonio
checa('R$ 11.973 → marco de R$ 25.000', C.proximoMarco(11973), 25000);
checa('sem patrimonio → R$ 1.000', C.proximoMarco(0), 1000);
checa('perto demais do marco pula para o seguinte', C.proximoMarco(4800), 10000);
checa('acima da lista: arredonda para cima em milhoes', C.proximoMarco(2e7), 3e7);

// 3. Gasto medio: so os 3 ultimos meses fechados, so despesas
const hoje = new Date();
const mes = k => C.monthKeyOf(new Date(hoje.getFullYear(), hoje.getMonth() + k, 1)) + '-10';
let id = 1;
S.transactions = [
  { id: id++, type: 'expense', amount: 999, date: mes(-4) },
  { id: id++, type: 'expense', amount: 3000, date: mes(-3) },
  { id: id++, type: 'expense', amount: 2000, date: mes(-2) },
  { id: id++, type: 'expense', amount: 1000, date: mes(-1) },
  { id: id++, type: 'income', amount: 9999, date: mes(-1) },
  { id: id++, type: 'expense', amount: 5000, date: mes(0) },
];
checa('media dos 3 meses fechados, sem o mes atual e sem receitas', C.gastoMedioMensal(), 2000);

// 4. Primeira vez, respondendo tudo
C.abrirConhecer();
checa('abrir ja conta como visto', S.settings.conhecerVisto, true);
checa('abriu a janela', abertos.pop(), 'conhecer-modal');
dom['ck-nome'].value = '  Ana   Paula ';
C.ckSeguir();
C.ckObjetivo('reserva');
checa('reserva sugerida = 6x o gasto medio', dom['ck-valor'].value, '12000');
C.ckSeguir();
C.ckDia(5); C.ckSeguir();
checa('ultima pergunta pede Concluir', dom['ck-seguir'].textContent, 'Concluir');
C.ckFaixa('4a7'); C.ckSeguir();
checa('nome limpo', S.settings.nome, 'Ana Paula');
checa('respostas salvas', [S.settings.objetivo, S.settings.diaPagamento, S.settings.faixaRenda], ['reserva', 5, '4a7']);
checa('meta da reserva criada', S.goals.map(g => [g.name, g.type, g.target, g.link]), [['Reserva de emergência', 'emergency', 12000, '']]);
checa('a meta vira o foco do painel', S.settings.metaFoco, S.goals[0].id);
checa('7 limites sugeridos no orcamento', S.budgets.length, 7);
checa('moradia = 25% de R$ 5.500, de 10 em 10', S.budgets.find(b => b.category === 'Moradia').limit, 1380);
checa('limites somam uns 80% da renda', Math.round(S.budgets.reduce((s, b) => s + b.limit, 0) / 100) * 100, 4400);
checa('ids dos limites nao se repetem', new Set(S.budgets.map(b => b.id)).size, 7);
checa('tela final lista a meta criada', dom['ck-corpo'].innerHTML.includes('Meta criada: Reserva de emergência'), true);
checa('botao final leva ao painel', dom['ck-seguir'].textContent, 'Ver meu painel');

// 5. Respondendo de novo: troca de objetivo e pula o resto
C.abrirConhecer();
C.ckSeguir();                       // nome fica
C.ckObjetivo('dividas');
checa('objetivo novo nao herda o valor da reserva', dom['ck-valor'].value, '');
dom['ck-valor'].value = '8000';
C.ckSeguir();
C.ckPular(); C.ckPular();           // pagamento e renda ficam como estavam
checa('nome continua', S.settings.nome, 'Ana Paula');
checa('meta nova para as dividas, a da reserva fica', S.goals.map(g => [g.name, g.target]), [['Reserva de emergência', 12000], ['Quitar as dívidas', 8000]]);
checa('foco passa para a meta nova', S.goals.find(g => g.id === S.settings.metaFoco).name, 'Quitar as dívidas');
checa('metas criadas na mesma rodada tem ids diferentes', S.goals[0].id !== S.goals[1].id, true);
checa('pular manteve pagamento e renda', [S.settings.diaPagamento, S.settings.faixaRenda], [5, '4a7']);
checa('limites nao duplicam', S.budgets.length, 7);

// 6. Painel: o que entrou e saiu desde o ultimo pagamento, ate hoje
const c = C.cicloPagamento(5);
const desde = C._diaChave(c.ultimo), antes = C._diaChave(new Date(c.ultimo.getFullYear(), c.ultimo.getMonth(), c.ultimo.getDate() - 1));
const amanha = C._diaChave(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1));
S.transactions = [
  { id: 90, type: 'income', amount: 3000, date: desde },
  { id: 91, type: 'expense', amount: 1000, date: desde },
  { id: 92, type: 'expense', amount: 700, date: antes },     // antes do pagamento: fora
  { id: 93, type: 'expense', amount: 500, date: amanha },    // agendado para amanha: fora
];
S.goals[1].current = 2000;
C.renderFoco();
const foco = dom['dash-foco'].innerHTML;
checa('painel mostra o que sobrou desde o pagamento', foco.includes(sandbox.fmtCur(2000)), true);
checa('e quanto da por dia ate o proximo', foco.includes(sandbox.fmtCur(2000 / c.faltam) + ' por dia'), true);
checa('e o progresso da meta em foco', foco.includes('Quitar as dívidas') && foco.includes('25%'), true);
checa('linha do foco aparece', dom['dash-foco'].hidden, false);
S.transactions.push({ id: 94, type: 'expense', amount: 4000, date: desde });
C.renderFoco();
checa('gasto maior que a entrada aparece em vermelho', dom['dash-foco'].innerHTML.includes('class="neg"') && dom['dash-foco'].innerHTML.includes(sandbox.fmtCur(2000)), true);
S.settings.diaPagamento = null; S.settings.metaFoco = null;
C.renderFoco();
checa('sem pagamento e sem meta, a linha some', dom['dash-foco'].hidden, true);

// 6b. Salario adiantado (fim de semana, feriado): e a data que o extrato importado traz
const ef = (a, m, d) => { const c = C.cicloEfetivo(5, new Date(a, m - 1, d)); return [c.inicio, C._diaChave(c.proximo), c.faltam]; };
const guarda = S.transactions;
S.transactions = [{ id: 200, type: 'income', amount: 6200, date: '2026-11-03' }, { id: 201, type: 'expense', amount: 100, date: '2026-11-04' }];
checa('salario na sexta antes do dia 5 abre o ciclo nele', ef(2026, 11, 10), ['2026-11-03', '2026-12-05', 25]);
S.transactions = [{ id: 202, type: 'income', amount: 6200, date: '2026-11-05' }];
checa('salario no dia: o ciclo comeca no dia', ef(2026, 11, 10), ['2026-11-05', '2026-12-05', 25]);
S.transactions = [{ id: 203, type: 'income', amount: 6200, date: '2026-11-03' }, { id: 204, type: 'income', amount: 6200, date: '2026-12-03' }];
checa('salario de dezembro caiu antes do dia: ja e o ciclo novo', ef(2026, 12, 3), ['2026-12-03', '2027-01-05', 33]);
S.transactions = [{ id: 205, type: 'income', amount: 6200, date: '2026-11-03' }, { id: 206, type: 'income', amount: 50, date: '2026-12-03' }];
checa('um Pix pequeno na vespera nao vira o pagamento', ef(2026, 12, 3), ['2026-11-03', '2026-12-05', 2]);
S.transactions = guarda;

// 7. Saudacao
C.renderSaudacao();
checa('com nome, o titulo do painel cumprimenta', /^(Bom dia|Boa tarde|Boa noite), Ana$/.test(dom['dash-titulo'].textContent), true);
checa('e a saudacao do celular aparece', dom['dash-oi'].hidden, false);
S.settings.nome = '';
C.renderSaudacao();
checa('sem nome, volta a ser Dashboard', [dom['dash-titulo'].textContent, dom['dash-oi'].hidden], ['Dashboard', true]);

// 8. Conta de empresa: 3 perguntas e nada de orcamento
tipo = 'pj'; S.budgets = [];
C.abrirConhecer();
C.ckSeguir(); C.ckPular();
checa('empresa: a terceira ja e a ultima', dom['ck-seguir'].textContent, 'Concluir');
C.ckSeguir();
checa('empresa: nenhum limite criado', S.budgets.length, 0);

// 9. Primeiro gasto na entrada
tipo = 'pf'; S.transactions = []; S.settings = { accountType: 'pf', manualSeen: false }; abertos.length = 0;
banco.precisa = true;
C.proximoPassoEntrada();
checa('conta nova sem banco: a entrada pede o banco primeiro', banco.aberto, 'primeiro');
banco.precisa = false; banco.depois();
checa('escolhido o banco, abre o primeiro gasto', abertos.pop(), 'pg-modal');
checa('abrir ja conta como visto', S.settings.primeiroGastoVisto, true);
checa('sem valor, salvar fica desligado', dom['pg-salvar'].disabled, true);
['3', '6', '5', '0'].forEach(C.pgTecla);
checa('digita em centavos: 3, 6, 5, 0 vira R$ 36,50', dom['pg-valor'].textContent.replace(/\s/g, ' '), 'R$ 36,50');
C.pgTecla('apagar'); C.pgTecla('0');
checa('apagar tira o ultimo digito', dom['pg-valor'].textContent.replace(/\s/g, ' '), 'R$ 36,50');
['9', '9', '9', '9', '9', '9', '9', '9'].forEach(C.pgTecla);
checa('no maximo 9 digitos', dom['pg-valor'].textContent.replace(/\D/g, '').length, 9);
for (let k = 0; k < 9; k++) C.pgTecla('apagar');
['0', '0', '4', '2'].forEach(C.pgTecla);
checa('zeros a esquerda nao contam', dom['pg-valor'].textContent.replace(/\s/g, ' '), 'R$ 0,42');
C.pgTecla('apagar'); C.pgTecla('apagar'); ['3', '6', '5', '0'].forEach(C.pgTecla);
C.pgCat('Transporte');
const fim = new Date(Date.now() + 6 * 86400000);
C.setSub({ reason: 'trialing', end: fim.getTime() });
C.salvarPrimeiroGasto();
checa('grava o lancamento como despesa de hoje', S.transactions.map(x => [x.type, x.amount, x.category, x.conta]), [['expense', 36.5, 'Transporte', 1]]);
checa('em teste gratis, mostra a linha do tempo', [dom['pg-passo1'].hidden, dom['pg-passo2'].hidden], [true, false]);
checa('o selo diz o que foi registrado', dom['pg-chip'].textContent.includes('Transporte registrado'), true);
checa('a linha do tempo tem a data do fim do teste', dom['pg-linha'].innerHTML.includes(fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })), true);
checa('com lancamento, a entrada nao pede de novo o primeiro gasto', C.precisaPrimeiroGasto(), false);
C.proximoPassoEntrada();
checa('e segue para as boas-vindas', abertos.pop(), 'welcome-modal');

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
