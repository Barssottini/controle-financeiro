#!/usr/bin/env node
// Confere a conferencia da fatura do cartao, extraindo o codigo real do index.html:
// casamento por valor cheio ou da parcela, tolerancia de 3 dias, valor diferente
// quando so o nome bate, pagamentos e estornos de fora nos dois sinais de banco,
// e o que esta no app mas nao na fatura.
//
// Rodar:  node verificar-fatura.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ CONFERIR FATURA ═══');
const j = t.indexOf('// ═══ FIM DO CONFERIR FATURA ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco CONFERIR FATURA no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _diasEntre\(a,b\)\{[\s\S]*?\n\}/, /function ccParcelas\(c\)\{.*?\}/, /function ccValorParcela\(c\)\{.*?\}/].map(real).join('\n');
const C = new Function(aux + '\n' + t.slice(i, j) + '\nreturn {conferirFatura,palavraChave};')();

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const linha = (description, amount, date, type = 'expense') => ({ description, amount, date, type, category: 'Outros' });
const item = (id, description, amount, date, parcelas = 1) => ({ id, description, amount, date, parcelas });

const itens = [
  item(1, 'Mercado Extra', 156.2, '2026-11-03'),
  item(2, 'Notebook Dell', 4800, '2026-09-10', 10),     // parcela de 480
  item(3, 'iFood', 54.9, '2026-11-08'),                  // valor diferente na fatura
  item(4, 'Posto Shell', 210, '2026-11-12'),             // nao esta na fatura
  item(5, 'Cinema', 58, '2026-10-01'),                   // fora do periodo da fatura
];
const fatura = [
  linha('MERCADO EXTRA', 156.2, '2026-11-05'),           // 2 dias depois: bate
  linha('NOTEBOOK DELL 3/10', 480, '2026-09-10'),        // parcela: bate
  linha('IFOOD *RESTAURANTE', 59.9, '2026-11-08'),       // mesmo nome, outro valor
  linha('Uber trip', 23.5, '2026-11-10'),                // falta no app
  linha('Pagamento recebido', 3200, '2026-11-02', 'income'),
  linha('Estorno Loja X', 40, '2026-11-09', 'income'),
  linha('Mercado Extra', 156.2, '2026-11-20'),           // 15 dias depois: nao casa com o item 1 (ja usado) -> falta
];
const r = C.conferirFatura(fatura, itens);
checa('bate pelo valor com ate 3 dias de diferenca', r.ok.some(x => x.c.id === 1), true);
checa('parcela casa com o item parcelado', r.ok.some(x => x.c.id === 2), true);
checa('mesmo nome e outro valor: valor diferente', r.diverge.map(x => [x.c.id, x.r.amount]), [[3, 59.9]]);
checa('o que nao esta no app: falta', r.falta.map(x => x.description), ['Uber trip', 'Mercado Extra']);
checa('um item do app casa uma vez so', r.ok.filter(x => x.c.id === 1).length, 1);
checa('pagamento e estorno ficam de fora', r.ignorados, 2);
checa('no app e nao na fatura, dentro do periodo dela', r.sobra.map(x => x.id), [4]);

// banco que manda compras positivas e pagamentos negativos (o sinal ao contrario)
const invertida = [
  linha('MERCADO EXTRA', 156.2, '2026-11-03', 'income'),
  linha('Uber trip', 23.5, '2026-11-10', 'income'),
  linha('Pagamento da fatura', 3200, '2026-11-02', 'expense'),
];
const r2 = C.conferirFatura(invertida, itens);
checa('sinal invertido: as compras sao a maioria e valem', [r2.ok.length, r2.falta.map(x => x.description), r2.ignorados], [1, ['Uber trip'], 1]);
checa('palavra-chave ignora acento e caixa', [C.palavraChave('Açaí do Zé'), C.palavraChave('ACAI DO ZE')], ['acai', 'acai']);
checa('fatura vazia nao quebra', C.conferirFatura([], itens).sobra.length, 0);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
