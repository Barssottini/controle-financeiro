#!/usr/bin/env node
// Confere a leitura de extrato em CSV, extraindo o codigo real do index.html.
// O separador e um so por arquivo: com ponto e virgula, a virgula e do valor.
// Antes, a linha era cortada nas duas e "350,00" entrava como R$ 0,00.
//
// Rodar:  node verificar-csv.js

const fs = require('fs');
const path = require('path');

const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const codigo = [
  /function parseCSV\(text\)\{[\s\S]*?\n\}/, /function splitCSV\(line,sep\)\{[\s\S]*?\n\}/,
  /function normalizeDate\(raw\)\{[\s\S]*?\n\}/, /function parseValor\(s\)\{[\s\S]*?\n\}/,
].map(real).join('\n');
const C = new Function('knownCats', 'cleanDesc', 'categoriaAprendida', 'PIX_IN_RE', 'guessCategory',
  codigo + '\nreturn {parseCSV};')(() => [], s => s, () => '', /^pix recebido/, () => 'Outros');

let falhas = 0;
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { console.log('        esperado: ' + JSON.stringify(esperado)); console.log('        obtido:   ' + JSON.stringify(obtido)); }
}
const resumo = txt => C.parseCSV(txt).map(r => [r.date, r.description, r.type, r.amount]);

checa('ponto e virgula com virgula decimal (formato brasileiro)',
  resumo('Data;Descrição;Valor\n10/11/2026;Venda no balcão;350,00\n11/11/2026;Fornecedor;-120,50\n12/11/2026;Aluguel;-1.234,56\n'),
  [['2026-11-10', 'Venda no balcão', 'income', 350], ['2026-11-11', 'Fornecedor', 'expense', 120.5], ['2026-11-12', 'Aluguel', 'expense', 1234.56]]);
checa('virgula com ponto decimal (Nubank)',
  resumo('date,title,amount\n2026-11-10,Padaria,-35.50\n2026-11-11,Pix recebido,200.00\n'),
  [['2026-11-10', 'Padaria', 'expense', 35.5], ['2026-11-11', 'Pix recebido', 'income', 200]]);
checa('virgula com valor entre aspas',
  resumo('Data,Descrição,Valor\n10/11/2026,Mercado,"-1.234,56"\n'),
  [['2026-11-10', 'Mercado', 'expense', 1234.56]]);
checa('ponto e virgula com descricao que tem virgula',
  resumo('Data;Descrição;Valor\n10/11/2026;Loja, filial centro;-80,00\n'),
  [['2026-11-10', 'Loja, filial centro', 'expense', 80]]);
checa('cabecalho sem separador reconhecivel: decide pela primeira linha de dados',
  resumo('Extrato\n10/11/2026;Venda;350,00\n'),
  [['2026-11-10', 'Venda', 'income', 350]]);

console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
