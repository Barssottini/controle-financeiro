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
const avisos = [];
const sandbox = {
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
  t.slice(i, j) + '\nreturn {contas,contaPadraoId,contaDe,noConta,addConta,apagarConta,podeCriarConta};');
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

console.log('CONTAS — ' + (falhas ? falhas + ' FALHA(S)' : 'tudo bate'));
console.log(L.join('\n'));
process.exitCode = falhas ? 1 : 0;
