#!/usr/bin/env node
// Confere a checagem de modalidade na entrada (login Pessoal x Empresarial), extraindo o
// código real do index.html. Ela só pode barrar quando o servidor CONFIRMA o outro tipo:
// conta antiga sem perfil, falha de rede e o app de Windows passam.
//
// Rodar:  node verificar-modalidade.js

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ MODALIDADE NA ENTRADA ═══');
const j = t.indexOf('// ═══ FIM DA MODALIDADE NA ENTRADA ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco MODALIDADE NA ENTRADA no index.html'); process.exit(2); }

function cenario({ rota = '/', query = '', perfil = null, erro = false, lanca = false, windows = false }) {
  let saiu = false;
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, value: 'x', textContent: '', appendChild() {} });
  const dom = {};
  const document = { getElementById: id => (dom[id] ||= el()), createElement: () => el() };
  const sb = {
    from() { return { select() { return this; }, eq() { return this; },
      async maybeSingle() { if (lanca) throw new Error('offline'); return { data: perfil ? { account_type: perfil } : null, error: erro ? new Error('rede') : null }; } }; },
    auth: { async signOut() { saiu = true; } },
  };
  const location = { pathname: rota, search: query };
  const f = new Function('sb', 'location', 'document', 'IS_NORTHAPP',
    'let _nfPass,_nfPendingSignupPass,_nfUser,cloudReady;\n' + t.slice(i, j) + '\nreturn conferirModalidadeEntrada;')(sb, location, document, windows);
  return f({ user: { id: 'u1' } }).then(ok => ({ ok, saiu }));
}

(async () => {
  const casos = [
    ['conta pessoal no login pessoal entra', { perfil: 'pf' }, true],
    ['conta Empresarial no login Empresarial entra', { rota: '/empresarial', perfil: 'pj' }, true],
    ['?conta=empresarial conta como login Empresarial', { query: '?conta=empresarial', perfil: 'pj' }, true],
    ['conta Empresarial no login pessoal e barrada', { perfil: 'pj' }, false],
    ['conta pessoal no login Empresarial e barrada', { rota: '/empresarial/', perfil: 'pf' }, false],
    ['conta antiga sem perfil entra (o registro vem depois de abrir a cifra)', { rota: '/empresarial' }, true],
    ['erro do servidor preserva o acesso', { perfil: 'pj', erro: true }, true],
    ['falha de rede preserva o acesso', { lanca: true }, true],
    ['app de Windows: conta pessoal entra (quem decide e a data da trava)', { windows: true, perfil: 'pf' }, true],
    ['app de Windows: conta Empresarial entra', { windows: true, perfil: 'pj' }, true],
  ];
  for (const [rotulo, c, esperado] of casos) {
    const r = await cenario(c);
    assert.equal(r.ok, esperado, rotulo);
    assert.equal(r.saiu, !esperado, rotulo + ' (sessao encerrada so quando barra)');
    console.log('  ok    ' + rotulo);
  }
  console.log('\n  todos passaram');
})().catch(e => { console.error('  FALHOU  ' + e.message); process.exit(1); });
