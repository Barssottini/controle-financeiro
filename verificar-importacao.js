// Roda a regra de sinal que esta DENTRO do index.html, nao uma copia dela.
const fs = require('fs');
const t = fs.readFileSync('index.html', 'utf8');

const lSaida = /const saida=[^\n]*TRNTYPE[^\n]+/.exec(t);
const lType = /const type=\(amt<0\|\|saida\)[^\n]+/.exec(t);
if (!lSaida || !lType) { console.error('nao achei a regra no index.html'); process.exit(1); }

const regra = new Function('amt', 'get', lSaida[0] + '\n' + lType[0] + '\nreturn type;');
const g = (tt) => (tag) => (tag === 'TRNTYPE' ? tt : '');

const casos = [
  // [valor, TRNTYPE, esperado, o que e]
  [-36.50, 'DEBIT',  'expense', 'debito com sinal — o caso normal'],
  [ 36.50, 'DEBIT',  'expense', 'debito SEM sinal — o almoco do Pedro'],
  [ 36.50, 'debit',  'expense', 'TRNTYPE minusculo'],
  [1464.50,'CREDIT', 'income',  'recebimento'],
  [1464.50,'',       'income',  'sem TRNTYPE, valor positivo'],
  [-800.00,'',       'expense', 'sem TRNTYPE, valor negativo'],
  [-800.00,'CREDIT', 'expense', 'sinal negativo vence o CREDIT'],
  [ 55.00, 'FEE',    'expense', 'tarifa'],
  [ 20.00, 'ATM',    'expense', 'saque'],
  [ 90.00, 'XFER',   'income',  'XFER e ambiguo: cai no sinal'],
  [ 10.00, 'CREDITO','income',  'nao casa com CREDIT por prefixo'],
];

let falhas = 0;
for (const [amt, tt, esperado, o_que] of casos) {
  const got = regra(amt, g(tt));
  const ok = got === esperado;
  if (!ok) falhas++;
  console.log('  ' + (ok ? 'ok  ' : 'ERRO') + '  ' + String(amt).padStart(8) + '  ' +
    (tt || '(vazio)').padEnd(8) + ' -> ' + got.padEnd(7) + ' ' + o_que);
}
console.log('');
console.log(falhas ? '  ' + falhas + ' FALHA(S)' : '  ' + casos.length + ' casos, todos passaram');
process.exitCode = falhas ? 1 : 0;
