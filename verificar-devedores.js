#!/usr/bin/env node
// Confere o "Quem me deve", extraindo o bloco real do index.html: validacao,
// quitacao (inclusive desfazer), edicao sem perder id nem data de criacao, e a
// tela agrupada por pessoa com o total em aberto e o atraso.
//
// Rodar:  node verificar-devedores.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ QUEM ME DEVE ═══');
const j = t.indexOf('// ═══ FIM DO QUEM ME DEVE ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco QUEM ME DEVE no index.html'); process.exit(2); }
const iso = t.match(/function _isoDia\(d\)\{.*\}/)[0];

const S = { devedores: [] };
const dom = {};
['dev-titulo', 'dev-pessoa', 'dev-desc', 'dev-valor', 'dev-recebido', 'dev-data', 'dev-pessoas', 'dev-lista', 'dev-resumo'].forEach(id => { dom[id] = { value: '', innerHTML: '', textContent: '' }; });
const avisos = [], desfazer = [];
const sandbox = {
  S,
  esc: s => String(s == null ? '' : s),
  fmtCur: v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v),
  emptyHTML: m => '<div class="empty">' + m + '</div>',
  document: { getElementById: id => dom[id] || null },
  showAlert: m => avisos.push(m), toast: () => {}, toastUndo: (m, fn) => desfazer.push([m, fn]),
  persistDevedores: () => {}, openModal: () => {}, closeModal: () => {}, updateDashboard: () => {},
  delFromArray: (arr, id, persist, render) => { arr.splice(arr.findIndex(x => x.id === id), 1); render(); },
};
const nomes = Object.keys(sandbox);
const C = new Function(...nomes, iso + '\n' + t.slice(i, j) + '\nreturn {abrirDevedor,salvarDevedor,receberTudo,apagarDevedor,renderDevedores,devAberto,_isoDia};')(...nomes.map(n => sandbox[n]));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const preenche = (pessoa, desc, valor, recebido, data) => Object.assign(dom, {}) && ['dev-pessoa', 'dev-desc', 'dev-valor', 'dev-recebido', 'dev-data'].forEach((k, n) => { dom[k].value = [pessoa, desc, valor, recebido, data][n]; });
const hoje = C._isoDia(new Date()), ontem = C._isoDia(new Date(Date.now() - 86400000)), amanha = C._isoDia(new Date(Date.now() + 86400000));

// 1. Validacao
C.abrirDevedor(); preenche('', 'emprestimo', '50', '0', '');
C.salvarDevedor();
checa('sem pessoa: avisa e nao grava', [avisos.pop(), S.devedores.length], ['Diga quem te deve.', 0]);
preenche('João', 'emprestimo', '0', '0', ''); C.salvarDevedor();
checa('sem valor: avisa', avisos.pop(), 'Informe quanto a pessoa te deve.');
preenche('João', 'emprestimo', '50', '80', ''); C.salvarDevedor();
checa('recebido maior que o valor: avisa', avisos.pop(), 'O que já foi recebido precisa ficar entre zero e o valor total.');

// 2. Registrar
preenche('  João   Silva ', 'Empréstimo', '50', '0', ontem); C.salvarDevedor();
checa('grava com o nome limpo e em aberto', S.devedores.map(d => [d.pessoa, d.valor, d.recebido, d.quitado]), [['João Silva', 50, 0, '']]);
C.abrirDevedor(); preenche('joão silva', 'Metade do jantar', '80,5'.replace(',', '.'), '20', amanha); C.salvarDevedor();
C.abrirDevedor(); preenche('Ana', 'Venda da bicicleta', '300', '300', ''); C.salvarDevedor();
checa('recebido igual ao valor: ja nasce quitado, com a data de hoje', S.devedores[2].quitado, hoje);

// 3. Tela: por pessoa, sem diferenca de maiuscula, com total e atraso
const tela = dom['dev-lista'].innerHTML;
checa('a mesma pessoa com letras diferentes vira um grupo so', (tela.match(/class="panel dev-pessoa"/g) || []).length, 1);
checa('total em aberto do grupo: 50 + 60,50', tela.includes(sandbox.fmtCur(110.5)), true);
checa('o combinado de ontem aparece atrasado', tela.includes('atrasado'), true);
checa('o parcial mostra quanto ja recebeu', tela.includes('já recebeu ' + sandbox.fmtCur(20)), true);
checa('quitados ficam recolhidos no fim', tela.includes('Quitados (1)'), true);
checa('resumo com o total e o atraso', [dom['dev-resumo'].innerHTML.includes(sandbox.fmtCur(110.5)), dom['dev-resumo'].innerHTML.includes('1 combinado atrasado')], [true, true]);

// 4. Recebi tudo, e desfazer
const joao = S.devedores[0];
C.receberTudo(joao.id);
checa('recebi tudo: quita com a data de hoje', [joao.recebido, joao.quitado], [50, hoje]);
checa('o aviso diz quanto entrou', desfazer[desfazer.length - 1][0], 'João Silva pagou ' + sandbox.fmtCur(50));
desfazer.pop()[1]();
checa('desfazer volta a ficar em aberto', [joao.recebido, joao.quitado, C.devAberto(joao)], [0, '', 50]);

// 5. Editar mantem id e criacao
const id0 = joao.id, criado0 = joao.criado;
C.abrirDevedor(id0);
checa('editar abre com os dados', [dom['dev-pessoa'].value, dom['dev-valor'].value], ['João Silva', 50]);
dom['dev-recebido'].value = '25'; C.salvarDevedor();
const editado = S.devedores.find(d => d.id === id0);
checa('editar mantem o id, a criacao e muda o recebido', [editado.id, editado.criado, editado.recebido, S.devedores.length], [id0, criado0, 25, 3]);

// 6. Apagar
C.apagarDevedor(S.devedores[2].id);
checa('apagar tira o registro e redesenha', [S.devedores.length, dom['dev-lista'].innerHTML.includes('Quitados')], [2, false]);
S.devedores.length = 0; C.renderDevedores();
checa('sem ninguem: mensagem de vazio e sem resumo', [dom['dev-lista'].innerHTML.includes('Ninguém te deve'), dom['dev-resumo'].innerHTML], [true, '']);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
