#!/usr/bin/env node
// Confere as regras do recurso de CONTAS, extraindo o bloco real do index.html.
// O que importa aqui nao e a tela: e que ligar o recurso, ou apagar uma conta,
// nunca faca um lancamento sumir do saldo. Lancamento sem conta, ou apontando
// para conta apagada, tem que cair na primeira — essa e a migracao, e ela
// acontece na leitura, sem reescrever nada no blob cifrado.
//
// Rodar:  node verificar-contas.js

const fs = require('fs');
const path = require('path');

const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ CONTAS ═══');
const j = t.indexOf('// ═══ TRANSACTIONS ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco CONTAS no index.html'); process.exit(2); }

const S = { settings: {}, transactions: [], bills: [], ccItems: [], accounts: [] };
const avisos = [], paginas = [];
let pro = true;   // o teste liga e desliga o Pro para conferir os dois lados
const sandbox = {
  exigePro: () => { if (!pro) avisos.push('precisa do Pro'); return pro; },
  showPage: p => paginas.push(p),
  S,
  persistSettings: () => {}, persistContas: () => {},
  renderContaSwitch: () => {}, renderContasSettings: () => {},
  updateDashboard: () => {}, renderTxList: () => {}, renderChart: () => {},
  renderBillsPage: () => {}, renderCCPage: () => {}, renderBudgetPage: () => {},
  showAlert: m => avisos.push(m), toast: () => {},
  esc: s => String(s),
  document: { getElementById: () => null },
};
const nomes = Object.keys(sandbox);
const F = new Function(...nomes,
  t.slice(i, j) + '\nreturn {contas,contaPadraoId,contaDe,noConta,addConta,apagarConta,saldoDaConta,nomeDaConta,bancoDe,renderAccBar,novoBanco};');
const C = F(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const visiveis = () => S.transactions.filter(C.noConta).map(x => x.id);

// 1. Conta zero: o app nunca fica sem conta nenhuma.
S.accounts = [];
checa('sem contas, cria a Principal sozinho', C.contas().length, 1);

// 2. Migracao: lancamento antigo (sem campo conta) cai na primeira.
const principal = C.contaPadraoId();
checa('lancamento sem conta cai na primeira', C.contaDe({ id: 1 }), principal);
checa('conta inexistente tambem cai na primeira', C.contaDe({ id: 2, conta: 999999 }), principal);

// 3. Com uma conta so, o filtro e invisivel: tudo aparece.
S.transactions = [{ id: 1 }, { id: 2, conta: 999999 }];
S.settings.contaView = 'all';
checa('com uma conta, todo lancamento aparece', visiveis(), [1, 2]);

// 4. Duas contas: o filtro passa a valer, e "todas" mostra tudo.
avisos.length = 0;
sandbox.document.getElementById = id => (id === 'conta-nova' ? { value: 'Carteira' } : null);
C.addConta();
checa('segunda conta criada', C.contas().length, 2);
const carteira = C.contas()[1].id;
S.transactions = [{ id: 1 }, { id: 2, conta: carteira }, { id: 3, conta: principal }];
S.settings.contaView = 'all';
checa('"todas" mostra os tres', visiveis(), [1, 2, 3]);
S.settings.contaView = carteira;
checa('filtro da carteira mostra so o dela', visiveis(), [2]);
S.settings.contaView = principal;
checa('filtro da principal inclui o lancamento antigo', visiveis(), [1, 3]);

// 5. Nome repetido e recusado.
avisos.length = 0;
sandbox.document.getElementById = id => (id === 'conta-nova' ? { value: 'carteira' } : null);
C.addConta();
checa('nome repetido e recusado', C.contas().length, 2);
checa('e avisa por que', avisos.length, 1);

// 6. Apagar conta COM lancamento e recusado — esta e a regra que protege o saldo.
avisos.length = 0;
C.apagarConta(carteira);
checa('conta com lancamento nao e apagada', C.contas().length, 2);
checa('avisa quantos lancamentos travaram', /1 lançamento/.test(avisos[0] || ''), true);

// 7. Apagar conta vazia funciona, e o que sobra continua visivel.
avisos.length = 0;
S.transactions = [{ id: 1 }, { id: 3, conta: principal }];
S.settings.contaView = carteira;
C.apagarConta(carteira);
checa('conta vazia e apagada', C.contas().length, 1);
checa('o filtro volta para "todas"', S.settings.contaView, 'all');
checa('nenhum lancamento sumiu', visiveis(), [1, 3]);

// 8. Nunca sobra zero conta.
avisos.length = 0;
C.apagarConta(C.contaPadraoId());
checa('a ultima conta nao pode ser apagada', C.contas().length, 1);

// 9. No Free, criar conta e barrado — mas o que ja existe NAO some.
S.accounts = [{ id: 1, nome: 'Principal' }, { id: 2, nome: 'Carteira' }];
S.transactions = [{ id: 1 }, { id: 2, conta: 2 }];
pro = false;
avisos.length = 0;
sandbox.document.getElementById = id => (id === 'conta-nova' ? { value: 'Poupança' } : null);
C.addConta();
checa('no Free nao cria conta nova', C.contas().length, 2);
checa('e avisa que precisa do Pro', avisos.length, 1);
S.settings.contaView = 'all';
checa('no Free as contas que ja existiam continuam', C.contas().map(c => c.nome), ['Principal', 'Carteira']);
checa('no Free nenhum lancamento e escondido', visiveis(), [1, 2]);
S.settings.contaView = 2;
checa('no Free o filtro da conta extra ainda funciona', visiveis(), [2]);
pro = true;

// 10. Saldo por conta: o extrato do banco fecha contra a conta dele, nao contra
// a soma de tudo. Sem recorte de periodo nem de bolso.
S.accounts = [{ id: 1, nome: 'Nubank' }, { id: 2, nome: 'Itaú' }];
S.transactions = [
  { id: 1, type: 'income', amount: 1000 },                  // sem conta -> Nubank
  { id: 2, type: 'expense', amount: 250, conta: 1 },
  { id: 3, type: 'income', amount: 70, conta: 2, ctx: 'pj' },
];
checa('saldo do Nubank ignora o Itaú', C.saldoDaConta(1), 750);
checa('saldo do Itaú ignora o Nubank', C.saldoDaConta(2), 70);
checa('nome da conta', C.nomeDaConta(2), 'Itaú');

// 11. Duplicata na importacao e DENTRO da conta. A regra e extraida do
// confirmImport real: copiar a condicao para ca faria o teste passar enquanto o
// app engole lancamento legitimo.
const mDup = /S\.transactions\.some\((x=>contaDe\(x\)===contaLote&&[^\n]*?)\)\)\{dup\+\+/.exec(t);
if (!mDup) { falhas++; L.push('  FALHOU  nao achei a regra de duplicata no confirmImport'); }
else {
  const ehDup = new Function('S', 'contaDe', 'contaLote', 't', 'return S.transactions.some(' + mDup[1] + ');');
  const jaTem = { description: 'Uber', amount: 50, date: '2026-11-01', conta: 1 };
  S.transactions = [jaTem];
  const novo = { description: 'Uber', amount: 50, date: '2026-11-01' };
  checa('mesmo lançamento na MESMA conta é duplicata', ehDup(S, C.contaDe, 1, novo), true);
  checa('mesmo lançamento em OUTRA conta não é duplicata', ehDup(S, C.contaDe, 2, novo), false);
}

// 12. Banco reconhecido pelo nome da conta (o icone sai disso).
const banco = nome => { const b = C.bancoDe(nome); return b ? (b.carteira ? 'carteira' : b.t) : null; };
checa('"Nubank" vira o icone do Nubank', banco('Nubank'), 'Nu');
checa('acento e sobrenome nao atrapalham: "Itaú Personnalité"', banco('Itaú Personnalité'), 'I');
checa('"Banco Inter" e o Inter', banco('Banco Inter'), 'In');
checa('"Banco do Brasil" e o BB', banco('Banco do Brasil'), 'BB');
checa('palavra inteira: "Interativa" nao vira Inter', banco('Interativa'), null);
checa('"Carteira" vira o icone de carteira', banco('Carteira'), 'carteira');
checa('nome sem banco conhecido fica sem marca', banco('Conta conjunta'), null);

// 13 e 14. Fora da tela de Transacoes o app e consolidado, e o "Conciliar Saldo"
// concilia a conta em exibicao. Regras extraidas do index.html real.
const fatia = (de, ate) => { const a = t.indexOf(de), b = t.indexOf(ate, a); if (a < 0 || b < 0) throw new Error('ancora: ' + de); return t.slice(a, b); };
const fonte = fatia('function txVis(){', 'function ccVis(){') + fatia('function appBalance(){', '// ═══ AVISO DE TERMOS ═══');
let saldoReal = 0;
const R = new Function('S', 'noCtx', 'noConta', 'newId', 'persist', 'closeModal', 'openModal', 'updateDashboard', 'renderTxList', 'populateMonthFilter', 'showAlert', 'fmtCur', 'document',
  fonte + '\nreturn {txVis,appBalance,doReconcile};')(
  S, () => true, C.noConta, () => 999, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, m => avisos.push(m), v => 'R$ ' + v,
  { getElementById: id => (id === 'rec-real-balance' ? { value: String(saldoReal) } : { value: '' }) });
S.accounts = [{ id: 1, nome: 'Nubank' }, { id: 2, nome: 'Itaú' }];
S.transactions = [
  { id: 1, type: 'income', amount: 1000, date: '2026-11-01', conta: 1 },
  { id: 2, type: 'income', amount: 500, date: '2026-11-01', conta: 2 },
];
S.settings.contaView = 2;
checa('vendo o Itau, o resto do app continua consolidado', R.txVis().length, 2);
checa('vendo o Itau, Conciliar Saldo compara o saldo do Itau', R.appBalance(), 500);
saldoReal = 600;
R.doReconcile();
const ajuste = S.transactions[S.transactions.length - 1];
checa('o ajuste da conciliacao cai no Itau, nao na conta principal', ajuste.conta, 2);
checa('e acerta a diferenca', [ajuste.type, ajuste.amount], ['income', 100]);
checa('Nubank fica intocado', C.saldoDaConta(1), 1000);

// 15. O modo "pessoal e empresa na mesma conta" saiu em 2026-11. Quem usava nao
// pode ficar com lancamento escondido atras de um filtro que nao existe mais.
const fonteBolso = fatia('function tipoConta(){', '// As categorias JA USADAS')
  + fatia('function ctxDe(x){', 'function txVis(){') + fatia('function migrateData(){', '// ═══ SETTINGS ═══');
const B = new Function('S', 'guessCategory', 'persistSettings', fonteBolso + '\nreturn {tipoConta,noCtx,migrateData};')(S, d => d, () => {});
S.settings = { empresarial: true, ctxView: 'pj', accountType: 'both' };
S.transactions = [
  { id: 1, type: 'expense', amount: 10, ctx: 'pj', category: 'Outros', description: 'Contador' },
  { id: 2, type: 'expense', amount: 5, category: 'Outros', description: 'Padaria' },
];
S.ccItems = []; S.recurring = [];
checa('antes: o filtro "Empresa" escondia o lancamento pessoal', S.transactions.filter(B.noCtx).map(x => x.id), [1]);
B.migrateData();
checa('quem usava o modo tem ele desligado', [S.settings.empresarial, S.settings.ctxView], [false, 'all']);
checa('e volta a ver todos os lancamentos', S.transactions.filter(B.noCtx).map(x => x.id), [1, 2]);
checa('o bolso gravado no lancamento nao e apagado', S.transactions[0].ctx, 'pj');
checa('"as duas coisas" vira pessoal nas categorias', B.tipoConta(), 'pf');
S.settings.accountType = 'pj';
checa('empresa continua empresa', B.tipoConta(), 'pj');

// 16. A barra de bancos aparece mesmo com uma conta so — sem ela ninguem descobre
// que da para separar por banco. "Ver todas" so quando ha o que juntar.
const barra = { style: { display: 'none' }, innerHTML: '' };
sandbox.document.getElementById = id => (id === 'tx-acc-bar' ? barra : null);
S.accounts = [{ id: 1, nome: 'Principal' }];
S.settings.contaView = 'all';
C.renderAccBar();
checa('com uma conta, a barra aparece', barra.style.display, '');
checa('com uma conta: o banco e o "Adicionar banco", sem "Ver todas"',
  ['Principal', 'Adicionar banco', 'Ver todas'].map(s => barra.innerHTML.includes(s)), [true, true, false]);
S.accounts.push({ id: 2, nome: 'Itaú' });
C.renderAccBar();
checa('com duas contas: "Ver todas" e o "Adicionar banco"',
  ['Ver todas', 'Adicionar banco'].map(s => barra.innerHTML.includes(s)), [true, true]);
// no Free o "+" e o aviso do Pro ali mesmo; no Pro leva ao campo de conta nova
pro = false; avisos.length = 0; paginas.length = 0;
C.novoBanco();
checa('no Free, "Adicionar banco" avisa do Pro e nao sai da tela', [avisos.length, paginas.length], [1, 0]);
pro = true;
C.novoBanco();
checa('no Pro, "Adicionar banco" leva as Configuracoes', paginas, ['settings']);

console.log('CONTAS — ' + (falhas ? falhas + ' FALHA(S)' : 'tudo bate'));
console.log(L.join('\n'));
process.exitCode = falhas ? 1 : 0;
