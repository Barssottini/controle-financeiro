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
const avisos = [], paginas = [], modais = [];
let pro = true;   // o teste liga e desliga o Pro para conferir os dois lados
const sandbox = {
  exigePro: () => { if (!pro) avisos.push('precisa do Pro'); return pro; },
  showPage: p => paginas.push(p),
  openModal: id => modais.push(id), closeModal: () => {},
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
  t.slice(i, j) + '\nreturn {contas,contaPadraoId,contaDe,noConta,criarConta,apagarConta,saldoDaConta,nomeDaConta,bancoDe,renderAccBar,novoBanco,precisaEscolherBanco,abrirEscolhaBanco,escolherBanco,' +
  'LISTA_BANCOS,tipoDaConta,contaFora,saldoTotalContas};');
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
C.criarConta('Carteira');
checa('segunda conta criada', C.contas().length, 2);
const carteira = C.contas()[1].id;
S.transactions = [{ id: 1 }, { id: 2, conta: carteira }, { id: 3, conta: principal }];
S.settings.contaView = 'all';
checa('"todas" mostra os tres', visiveis(), [1, 2, 3]);
S.settings.contaView = carteira;
checa('filtro da carteira mostra so o dela', visiveis(), [2]);
S.settings.contaView = principal;
checa('filtro da principal inclui o lancamento antigo', visiveis(), [1, 3]);

// 5. O mesmo banco duas vezes ganha numero ("Itaú" e "Itaú 2"), com id proprio
// mesmo criado no mesmo milissegundo.
avisos.length = 0;
const dup = C.criarConta('carteira');
checa('mesmo banco de novo ganha numero', dup && dup.nome, 'carteira 2');
checa('e id diferente da primeira', dup && dup.id !== carteira, true);
C.apagarConta(dup.id);   // vazia: sai, e o teste segue com duas contas
checa('apagar a repetida nao leva a outra junto', C.contas().length, 2);

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
C.criarConta('Poupança');
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
checa('acento e sobrenome nao atrapalham: "Itaú Unibanco"', banco('Itaú Unibanco'), 'I');
checa('"Itaú Personnalité" tem logo proprio, nao o do Itaú', banco('Itaú Personnalité'), 'IP');
checa('vale, loja e corretora novos', ['VR', 'iFood Benefícios', 'C&A', 'Casas Bahia', 'Mercado Bitcoin', 'Banco BV', 'Méliuz'].map(banco), ['VR', 'iF', 'C&A', 'CB', 'MB', 'BV', 'm']);
checa('todo nome da lista de bancos tem logo', C.LISTA_BANCOS.filter(n => !C.bancoDe(n)), []);
checa('nenhum logo da lista fica sem arquivo', [...new Set(C.LISTA_BANCOS.map(n => C.bancoDe(n).logo))].filter(l => !fs.existsSync(path.join(__dirname, 'vendor', 'banks', l + '.svg'))), []);
checa('"Banco Inter" e o Inter', banco('Banco Inter'), 'In');
checa('"Banco do Brasil" e o BB', banco('Banco do Brasil'), 'BB');
checa('palavra inteira: "Interativa" nao vira Inter', banco('Interativa'), null);
checa('"Carteira" vira o icone de carteira', banco('Carteira'), 'carteira');
checa('nome sem banco conhecido fica sem marca', banco('Conta conjunta'), null);

// 13 e 14. Fora da tela de Transacoes o app e consolidado, e o "Conciliar Saldo"
// concilia a conta em exibicao. Regras extraidas do index.html real.
const fatia = (de, ate) => { const a = t.indexOf(de), b = t.indexOf(ate, a); if (a < 0 || b < 0) throw new Error('ancora: ' + de); return t.slice(a, b); };
const fonte = t.match(/function _isoDia\(d\)\{.*\}/)[0] + '\n' + fatia('function txVis(){', 'function ccVis(){') + fatia('function appBalance(){', '// ═══ AVISO DE TERMOS ═══');
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
const B = new Function('S', 'guessCategory', 'persistSettings', "let _tipoServidor='';\n" + fonteBolso + '\nreturn {tipoConta,noCtx,migrateData};')(S, d => d, () => {});
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
// no Free o "+" e o aviso do Pro ali mesmo; no Pro abre a lista de bancos
pro = false; avisos.length = 0; modais.length = 0;
C.novoBanco();
checa('no Free, "Adicionar banco" avisa do Pro e nao abre a lista', [avisos.length, modais.length], [1, 0]);
pro = true;
C.novoBanco();
checa('no Pro, "Adicionar banco" abre a lista de bancos', modais, ['banco-modal']);

// 17. Primeira vez: a conta que o app criou sozinho (sem banco) pede o banco
// antes do lancamento ou da importacao. O banco nomeia ESSA conta — os
// lancamentos ficam nela — e a pergunta nao volta.
S.accounts = [{ id: 1, nome: 'Principal' }];
S.settings = {};
S.transactions = [{ id: 1, type: 'expense', amount: 10 }];
checa('conta sem banco pede o banco', C.precisaEscolherBanco(), true);
let seguiu = 0;
modais.length = 0;
C.abrirEscolhaBanco('primeiro', () => seguiu++);
checa('abre a lista', modais, ['banco-modal']);
C.escolherBanco(0);   // Nubank
checa('o banco nomeia a conta que ja existia', C.contas().map(c => [c.id, c.nome]), [[1, 'Nubank']]);
checa('o lancamento continua nela', C.contaDe(S.transactions[0]), 1);
checa('e a acao segue (a transacao ou a importacao)', seguiu, 1);
checa('nao pergunta de novo', C.precisaEscolherBanco(), false);
pro = false; modais.length = 0;
S.accounts = [{ id: 1, nome: 'Principal' }]; S.settings = {};
C.novoBanco();
checa('no Free, o primeiro banco nomeia a conta (nao e conta extra)', modais, ['banco-modal']);
pro = true;

// 18. Trocar o banco de uma conta, e o mesmo banco duas vezes.
S.accounts = [{ id: 1, nome: 'Nubank' }];
C.abrirEscolhaBanco('trocar', null, 1);
C.escolherBanco(1);   // Itaú
checa('trocar muda so o banco da conta', C.contas().map(c => [c.id, c.nome]), [[1, 'Itaú']]);
C.abrirEscolhaBanco('novo');
C.escolherBanco(1);   // Itaú de novo
checa('segundo Itaú vira "Itaú 2"', C.contas().map(c => c.nome), ['Itaú', 'Itaú 2']);
checa('e o icone continua o do Itaú', banco('Itaú 2'), 'I');
checa('bancos novos da lista tem icone', ['Banrisul', 'Will Bank', 'Banco Pan', 'Next'].map(banco), ['Br', 'W', 'Pan', 'Nx']);

// 13. Saldo inicial, tipo e "fora do saldo total"
S.accounts = [{ id: 1, nome: 'Nubank', saldoInicial: 1500 }, { id: 2, nome: 'VR' }, { id: 3, nome: 'Carteira' }, { id: 4, nome: 'Rico', fora: true }];
S.transactions = [{ id: 1, conta: 1, type: 'expense', amount: 200 }, { id: 2, conta: 2, type: 'income', amount: 800 }, { id: 3, conta: 2, type: 'expense', amount: 50 }, { id: 4, conta: 4, type: 'income', amount: 1000 }];
checa('saldo da conta soma o saldo inicial', [C.saldoDaConta(1), C.saldoDaConta(2)], [1300, 750]);
checa('tipo sai do grupo do banco quando nao foi escolhido', S.accounts.map(C.tipoDaConta), ['corrente', 'vale', 'carteira', 'investimento']);
checa('vale fica fora do total por padrao; a escolha da pessoa vale mais', S.accounts.map(C.contaFora), [false, true, false, true]);
checa('saldo total deixa de fora vale e o que foi marcado', C.saldoTotalContas(), 1300);
S.accounts[1].fora = false;
checa('vale marcado para entrar soma no total', C.saldoTotalContas(), 2050);

console.log('CONTAS — ' + (falhas ? falhas + ' FALHA(S)' : 'tudo bate'));
console.log(L.join('\n'));
process.exitCode = falhas ? 1 : 0;
