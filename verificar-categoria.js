#!/usr/bin/env node
// Confere a categoria que aprende pela loja, extraindo o codigo real do index.html:
// descricoes diferentes da mesma loja dao a mesma chave, a correcao da pessoa vale
// mais que o historico, "Outros" nao e aprendido do historico, e as outras compras
// da mesma loja aparecem para corrigir junto.
//
// Rodar:  node verificar-categoria.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ CATEGORIA APRENDIDA ═══');
const j = t.indexOf('// ═══ FIM DA CATEGORIA APRENDIDA ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco CATEGORIA APRENDIDA no index.html'); process.exit(2); }
const S = { transactions: [], settings: {} };
const C = new Function('S', t.slice(i, j) + '\nreturn {chaveLoja,mapaLojas,categoriaAprendida,lembrarCategoria,outrasDaLoja};')(S);

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}

// 1. A mesma loja escrita de varios jeitos
checa('mesma loja com sufixo, prefixo do banco e numero', ['SUP CASTANHA LTDA', 'Compra no débito - SUP CASTANHA', 'SUP CASTANHA 0412', 'Sup. Castanha'].map(C.chaveLoja), ['sup castanha', 'sup castanha', 'sup castanha', 'sup castanha']);
checa('Pix para pessoa: o nome, sem CPF, banco nem agencia', C.chaveLoja('Transferência enviada pelo Pix - Walter Carriço Vieira - •••.375.758-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 1234-5'), 'walter carrico');
checa('Pix recebido de', C.chaveLoja('Pix recebido de MARIA SOUZA'), 'maria souza');
checa('processador de pagamento na frente sai', [C.chaveLoja('PAG*JoseDaSilva Lanches'), C.chaveLoja('MP *PADARIA CENTRAL')], ['josedasilva lanches', 'padaria central']);
checa('lojas diferentes nao se misturam', [C.chaveLoja('UBER *TRIP'), C.chaveLoja('UBER *EATS'), C.chaveLoja('Supermercado Extra'), C.chaveLoja('Supermercado Pão de Açúcar')], ['uber trip', 'uber eats', 'supermercado extra', 'supermercado pao']);
checa('conta a pagar: o "(conta)" do app sai', C.chaveLoja('Aluguel (conta)'), 'aluguel');
checa('descricao sem letras: sem chave, sem aprendizado', [C.chaveLoja('123456'), C.chaveLoja(''), C.chaveLoja(null)], ['', '', '']);

// 2. Historico: a categoria mais usada, sem "Outros"
S.transactions = [
  { id: 1, description: 'SUP CASTANHA LTDA', category: 'Outros' },
  { id: 2, description: 'SUP CASTANHA LTDA', category: 'Outros' },
  { id: 3, description: 'Compra no débito - SUP CASTANHA', category: 'Alimentação' },
  { id: 4, description: 'POSTO SHELL', category: 'Transporte' },
  { id: 5, description: 'Posto Shell 22', category: 'Lazer' },
  { id: 6, description: 'POSTO SHELL', category: 'Transporte' },
];
checa('"Outros" nao conta: uma Alimentacao vence dois Outros', C.categoriaAprendida('SUP CASTANHA 0099'), 'Alimentação');
checa('a mais usada vence', C.categoriaAprendida('Compra no crédito - Posto Shell'), 'Transporte');
checa('loja nunca vista: nada', C.categoriaAprendida('Farmácia Popular'), '');

// 3. A correcao da pessoa vira regra e vale mais que o historico
checa('lembrar devolve a chave', C.lembrarCategoria('POSTO SHELL', 'Lazer'), 'posto shell');
checa('regra vale mais que o historico', C.categoriaAprendida('Posto Shell 99'), 'Lazer');
checa('o mapa montado uma vez serve para varias linhas', C.categoriaAprendida('SUP CASTANHA', C.mapaLojas()), 'Alimentação');

// 4. Outras compras da mesma loja para corrigir junto
checa('outras da loja com categoria diferente, menos a propria', C.outrasDaLoja('SUP CASTANHA LTDA', 'Alimentação', 1).map(x => x.id), [2]);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
