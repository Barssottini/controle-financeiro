#!/usr/bin/env node
// Confere o "mes no dia do pagamento", extraindo o codigo real do index.html:
// a qual mes cada dia pertence, a faixa de cada mes e o rotulo. A checagem
// principal varre todos os dias de 2026 a 2028 para varios dias de pagamento:
// todo dia tem que cair dentro da faixa do mes a que pertence, e as faixas
// nao podem ter buraco nem sobreposicao.
//
// Rodar:  node verificar-mes-pagamento.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ MÊS NO DIA DO PAGAMENTO ═══');
const j = t.indexOf('function monthLabel(key){', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco do mes no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _isoDia\(d\)\{.*\}/, /function monthKeyOf\(d\)\{.*\}/, /function monthLabel\(key\)\{.*\}/].map(real).join('\n');
const S = { settings: {} };
const F = new Function('S', 'persistSettings', 'toast', aux + '\n' + t.slice(i, j) + '\nreturn {mesDe,faixaDoMes,faixaCurta,rotuloMes,cicloAtivo};');
const C = F(S, () => {}, () => {});

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const liga = dia => { S.settings = { mesNoPagamento: true, diaPagamento: dia }; };

S.settings = { diaPagamento: 5 };
checa('desligado: mes do calendario', [C.mesDe('2026-11-03'), C.faixaDoMes('2026-11')], ['2026-11', ['2026-11-01', '2026-11-30']]);
checa('desligado: rotulo sem faixa', C.faixaCurta('2026-11'), '');
S.settings = { mesNoPagamento: true };
checa('ligado sem dia de pagamento: continua o calendario', C.cicloAtivo(), 0);

liga(5);
checa('dia 3 conta no mes anterior', C.mesDe('2026-11-03'), '2026-10');
checa('dia 5 abre o mes', C.mesDe('2026-11-05'), '2026-11');
checa('virada de ano: 2 de janeiro conta em dezembro', C.mesDe('2027-01-02'), '2026-12');
checa('faixa de novembro: 5/11 a 4/12', C.faixaDoMes('2026-11'), ['2026-11-05', '2026-12-04']);
checa('rotulo com a faixa', C.rotuloMes('2026-11'), 'novembro de 2026 (5/11 a 4/12)');
liga(31);
checa('dia 31: novembro comeca no dia 30', C.faixaDoMes('2026-11'), ['2026-11-30', '2026-12-30']);
checa('dia 31: 30/12 ainda e novembro', C.mesDe('2026-12-30'), '2026-11');
checa('dia 31: fevereiro comeca no dia 28', C.faixaDoMes('2027-02'), ['2027-02-28', '2027-03-30']);
liga(1);
checa('dia 1: igual ao calendario', C.faixaDoMes('2026-11'), ['2026-11-01', '2026-11-30']);

// varredura: cada dia cai na faixa do seu mes; faixas seguidas sem buraco
for (const dia of [1, 5, 15, 28, 29, 30, 31]) {
  liga(dia);
  let erro = '', anterior = null;
  for (let d = new Date(2026, 0, 1); d < new Date(2029, 0, 1); d.setDate(d.getDate() + 1)) {
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const k = C.mesDe(iso), [de, ate] = C.faixaDoMes(k);
    if (iso < de || iso > ate) { erro = iso + ' em ' + k + ' (' + de + ' a ' + ate + ')'; break; }
    if (anterior && anterior !== k) {
      const [, ateAnt] = C.faixaDoMes(anterior), ontem = new Date(d); ontem.setDate(ontem.getDate() - 1);
      const isoOntem = ontem.getFullYear() + '-' + String(ontem.getMonth() + 1).padStart(2, '0') + '-' + String(ontem.getDate()).padStart(2, '0');
      if (ateAnt !== isoOntem || de !== iso) { erro = 'buraco entre ' + anterior + ' e ' + k; break; }
    }
    anterior = k;
  }
  checa('pagamento dia ' + dia + ': 3 anos sem dia fora do mes nem buraco', erro, '');
}

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
