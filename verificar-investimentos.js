#!/usr/bin/env node
// Confere a conta da renda fixa, extraindo o codigo real do index.html: IR
// regressivo pelo prazo de cada aplicacao, IOF dos primeiros 29 dias, isento,
// resgate abatendo o imposto, rendimento do mes sem contar aporte como ganho,
// grupo da carteira, botao de provento so onde existe provento e a instituicao
// tirada do nome ("Caixinha Nubank").
//
// Rodar:  node verificar-investimentos.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ IMPOSTO E RENDIMENTO DA RENDA FIXA ═══');
const j = t.indexOf('// ═══ FIM DO IMPOSTO E RENDIMENTO ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco IMPOSTO E RENDIMENTO no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [
  /const CDI=.*;/, /function _pascoa\(ano\)\{[\s\S]*?\n\}/, /function _diaChave\(d\)\{.*\}/, /const _feriadosCache=\{\};/, /function _feriados\(ano\)\{[\s\S]*?\n\}/,
  /function bizDays\(start,end\)\{[\s\S]*?\n\}/, /function _isoDia\(d\)\{.*\}/, /function _diasEntre\(a,b\)\{[\s\S]*?\n\}/,
  /function invAportes\(inv\)\{.*?\}/, /function invProventos\(inv\)\{.*?\}/, /function calcYield\(inv,ate\)\{[\s\S]*?\n\}/,
  /const CRYPTO_IDS=.*;/, /const BANCOS=\[[\s\S]*?\n\];/, /function bancoDe\(nome\)\{[\s\S]*?\n\}/, /const LISTA_BANCOS=.*;/,
].map(real).join('\n');
const S = { settings: { cdi: 10 } };
const C = new Function('S', aux + '\n' + t.slice(i, j) + '\nreturn {aliquotaIR,aliquotaIOF,liquidoCDI,rendimentoMes,grupoInv,temProventos,instituicaoDe,calcYield};')(S);

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const c2 = v => Math.round(v * 100) / 100;
const hoje = new Date(2026, 10, 10, 12, 0);
const cdi = (principal, date, extra = {}) => Object.assign({ kind: 'cdi', name: 'Caixinha', principal, date, cdi: 100 }, extra);
const ganhos = inv => C.calcYield(inv, hoje).legs.map(l => l.valor - l.amount);

// 1. Tabelas
checa('IR: 22,5% ate 180 dias, 20% ate 360, 17,5% ate 720, 15% depois',
  [180, 181, 360, 361, 720, 721].map(C.aliquotaIR), [22.5, 20, 20, 17.5, 17.5, 15]);
checa('IOF: 96% no 1o dia, 66% no 10o, 3% no 29o, zero a partir do 30o',
  [1, 10, 29, 30, 400].map(C.aliquotaIOF), [96, 66, 3, 0, 0]);

// 2. Uma aplicacao antiga: so IR de 15%
const antiga = cdi(10000, '2024-10-01');
const la = C.liquidoCDI(antiga, hoje), ga = ganhos(antiga)[0];
checa('mais de 2 anos: IR de 15% do rendimento, sem IOF', [c2(la.ir), c2(la.iof), c2(la.liquido)], [c2(ga * .15), 0, c2(la.bruto - ga * .15)]);
checa('liquido fica entre o aplicado e o bruto', la.liquido > 10000 && la.liquido < la.bruto, true);

// 3. Aplicacao de 10 dias: IOF de 66% do rendimento, IR de 22,5% sobre o resto
const nova = cdi(10000, '2026-10-31');
const ln = C.liquidoCDI(nova, hoje), gn = ganhos(nova)[0];
checa('10 dias: IOF 66% e IR 22,5% do que sobra', [c2(ln.iof), c2(ln.ir)], [c2(gn * .66), c2(gn * .34 * .225)]);

// 4. Isento (LCI/LCA)
const lci = C.liquidoCDI(cdi(10000, '2026-10-31', { isento: true }), hoje);
checa('isento: liquido igual ao bruto', [lci.ir, lci.iof, lci.liquido === lci.bruto, lci.isento], [0, 0, true, true]);

// 5. Duas aplicacoes, cada uma com o seu prazo
const duas = cdi(10000, '2024-10-01', { aportes: [{ id: 1, date: '2026-09-01', amount: 5000 }] });
const ld = C.liquidoCDI(duas, hoje), gd = ganhos(duas);
checa('cada aporte paga pelo seu prazo (15% e 22,5%)', c2(ld.ir), c2(gd[0] * .15 + gd[1] * .225));

// 6. Resgate abate o imposto na proporcao do rendimento que sobrou
const resg = cdi(10000, '2024-10-01', { aportes: [{ id: 1, date: '2026-01-05', amount: -3000 }] });
const lr = C.liquidoCDI(resg, hoje), yr = C.calcYield(resg, hoje).yieldAmt;
checa('com resgate: IR de 15% sobre o rendimento que ficou', c2(lr.ir), c2(yr * .15));

// 7. Rendimento do mes
const reserva = cdi(8200, '2026-03-01');
const rm = C.rendimentoMes(reserva, hoje);
const inicio = new Date(2026, 10, 1);
checa('mes = rendimento ate hoje menos rendimento ate o dia 1',
  c2(rm), c2(C.calcYield(reserva, hoje).yieldAmt - C.calcYield(reserva, inicio).yieldAmt));
checa('mes e positivo e menor que o acumulado', rm > 0 && rm < C.calcYield(reserva, hoje).yieldAmt, true);
const comAporte = cdi(8200, '2026-03-01', { aportes: [{ id: 1, date: '2026-11-05', amount: 1000 }] });
const dif = C.rendimentoMes(comAporte, hoje) - rm;
checa('aporte do mes nao conta como ganho (so o que ele rendeu)', dif > 0 && dif < 5, true);
const doMes = cdi(5000, '2026-11-03');
checa('aplicacao feita neste mes: o mes e todo o rendimento dela', c2(C.rendimentoMes(doMes, hoje)), c2(C.calcYield(doMes, hoje).yieldAmt));
checa('data de corte antes do inicio: nada aplicado ainda', C.calcYield(doMes, inicio).current, 0);

// 8. Grupo, provento e instituicao
const ativo = (assetCat, ticker = '') => ({ kind: 'asset', name: ticker || assetCat, qty: 1, pm: 1, price: 1, assetCat, ticker });
checa('grupos da carteira',
  [cdi(1, '2026-01-01'), ativo('Renda Fixa'), ativo('FII'), ativo('Ação'), ativo('ETF'), ativo('Cripto'), ativo('Outro', 'BTC'), ativo('Outro')].map(C.grupoInv),
  ['rf', 'rf', 'rv', 'rv', 'rv', 'cr', 'cr', 'ou']);
checa('botao de provento: acao, FII e ETF sim; caixinha e cripto nao',
  [cdi(1, '2026-01-01'), ativo('FII'), ativo('Ação'), ativo('ETF'), ativo('Cripto')].map(C.temProventos), [false, true, true, true, false]);
checa('caixinha com provento ja registrado continua com o botao', C.temProventos(cdi(1, '2026-01-01', { proventos: [{ id: 1, date: '2026-10-01', amount: 5 }] })), true);
checa('instituicao: o campo vale; sem ele, sai do nome; sem banco no nome, vazio',
  [C.instituicaoDe({ name: 'BOVA11', instituicao: ' XP ' }), C.instituicaoDe({ name: 'Caixinha Nubank' }), C.instituicaoDe({ name: 'Reserva de emergência' }), C.instituicaoDe({ name: 'Dinheiro na carteira' })],
  ['XP', 'Nubank', '', '']);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
