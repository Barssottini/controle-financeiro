#!/usr/bin/env node
// Confere o relatorio mensal para o contador, extraindo o codigo real do index.html:
// so o mes pedido entra, a retirada do dono fica fora dos custos, as categorias
// saem somadas e em ordem, o cartao aparece a parte e o valor sai aberto mesmo
// com "ocultar valores" ligado.
//
// Rodar:  node verificar-relatorio.js

const fs = require('fs');
const path = require('path');

const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ RELATÓRIO PARA O CONTADOR ═══');
const j = t.indexOf('// ═══ FIM DO RELATÓRIO PARA O CONTADOR ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco RELATORIO PARA O CONTADOR no index.html'); process.exit(2); }

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const S = { settings: { showValues: false, regime: 'mei', nome: 'Ateliê <Sol>' }, transactions: [], ccItems: [] };
const F = new Function('S', 'CAT_RETIRADA', 'REGIMES', 'brlAberto', 'esc',
  t.slice(i, j) + '\nreturn {relatorioContador,htmlRelatorioContador};');
const C = F(S, 'Retiradas do dono', { mei: { rotulo: 'MEI' } }, brl,
  s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}

let n = 1;
const tx = (type, description, amount, date, category) => ({ id: n++, type, description, amount, date, category });
S.transactions = [
  tx('income', 'Pedido loja', 4200.1, '2026-11-03', 'Vendas'),
  tx('income', 'Consultoria', 2500, '2026-11-05', 'Serviços'),
  tx('income', 'Pedido atacado', 3100.2, '2026-11-08', 'Vendas'),
  tx('expense', 'Embalagens', 2300, '2026-11-04', 'Fornecedores'),
  tx('expense', 'Tarifa', 45.5, '2026-11-07', 'Taxas e tarifas'),
  tx('expense', 'Retirada do mês', 3000, '2026-11-09', 'Retiradas do dono'),
  tx('expense', 'Sem categoria', 10, '2026-11-02', ''),
  tx('income', 'Venda de outubro', 999, '2026-10-31', 'Vendas'),
  tx('expense', 'Custo de dezembro', 888, '2026-12-01', 'Fornecedores'),
];
S.ccItems = [{ id: 90, amount: 120, date: '2026-11-10' }, { id: 91, amount: 50, date: '2026-10-10' }];

const r = C.relatorioContador('2026-11');
checa('faturamento: so as entradas do mes', r.faturamento, 9800.3);
checa('custos: saidas do mes, sem a retirada do dono', r.custos, 2355.5);
checa('retiradas ficam a parte', r.retiradas, 3000);
checa('lucro = faturamento - custos', r.lucro, 7444.8);
checa('margem em porcentagem inteira', r.margem, 76);
checa('receitas por categoria, da maior para a menor', r.receitas, [{ cat: 'Vendas', total: 7300.3 }, { cat: 'Serviços', total: 2500 }]);
checa('despesas por categoria, sem a retirada', r.despesas, [{ cat: 'Fornecedores', total: 2300 }, { cat: 'Taxas e tarifas', total: 45.5 }, { cat: 'Sem categoria', total: 10 }]);
checa('lancamentos do mes em ordem de data', r.lancamentos.map(x => x.date), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-07', '2026-11-08', '2026-11-09']);
checa('cartao do mes aparece a parte', r.cartao, { n: 1, total: 120 });

const h = C.htmlRelatorioContador(r);
checa('valor aberto mesmo com "ocultar valores" ligado', h.includes(brl(9800.3)) && !h.includes('••'), true);
checa('nome escapado no cabecalho', h.includes('Ateliê &lt;Sol&gt;') && !h.includes('<Sol>'), true);
checa('regime e mes por extenso', h.includes('<span>MEI</span>') && h.includes('novembro de 2026'), true);
checa('nota do cartao', h.includes('Há 1 compra no cartão de crédito'), true);
checa('saida com sinal de menos na lista', h.includes('− ' + brl(2300)), true);

const vazio = C.relatorioContador('2025-01');
checa('mes sem lancamento: tudo zero, margem nula', [vazio.faturamento, vazio.custos, vazio.lucro, vazio.margem, vazio.lancamentos.length], [0, 0, 0, null, 0]);
checa('e a folha diz que nao ha lancamento', C.htmlRelatorioContador(vazio).includes('Nenhum lançamento no mês.'), true);

S.transactions = [tx('income', 'Venda', 1000, '2026-09-10', 'Vendas'), tx('expense', 'Fornecedor', 1500, '2026-09-11', 'Fornecedores')];
const preju = C.relatorioContador('2026-09');
checa('prejuizo: lucro negativo e rotulo certo', [preju.lucro, C.htmlRelatorioContador(preju).includes('<span>Prejuízo</span>')], [-500, true]);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
