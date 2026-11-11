#!/usr/bin/env node
// Confere o "Personalizar início", extraindo o codigo real do index.html: ordem
// salva com bloco desconhecido ou bloco novo, subir e descer nos limites,
// esconder e mostrar, e voltar ao padrao.
//
// Rodar:  node verificar-inicio.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ PERSONALIZAR INÍCIO ═══');
const j = t.indexOf('// ═══ MÓDULOS OPCIONAIS ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco PERSONALIZAR INÍCIO no index.html'); process.exit(2); }
const S = { settings: {} };
let gravou = 0;
const C = new Function('S', 'persistSettings', 'document', 'toast', 'showPage',
  t.slice(i, j) + '\nreturn {ordemInicio,ocultosInicio,moverBloco,alternarBloco,restaurarInicio};')(
  S, () => { gravou++; }, { getElementById: () => null }, () => {}, () => {});

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const PADRAO = ['foco', 'contas', 'grafico', 'categorias', 'recentes'];
checa('sem nada salvo: ordem padrao, nada escondido', [C.ordemInicio(), C.ocultosInicio()], [PADRAO, []]);
S.settings.inicio = { ordem: ['recentes', 'sumiu', 'grafico'], ocultos: [] };
checa('bloco que nao existe sai; bloco que faltava entra no fim', C.ordemInicio(), ['recentes', 'grafico', 'foco', 'contas', 'categorias']);
C.moverBloco('grafico', -1);
checa('subir troca com o de cima e grava', [C.ordemInicio().slice(0, 2), gravou], [['grafico', 'recentes'], 1]);
C.moverBloco('grafico', -1);
checa('o primeiro nao sobe mais', [C.ordemInicio()[0], gravou], ['grafico', 1]);
C.alternarBloco('foco');
checa('esconder', C.ocultosInicio(), ['foco']);
C.alternarBloco('foco');
checa('mostrar de novo', C.ocultosInicio(), []);
C.restaurarInicio();
checa('restaurar volta ao padrao', [C.ordemInicio(), S.settings.inicio], [PADRAO, undefined]);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
