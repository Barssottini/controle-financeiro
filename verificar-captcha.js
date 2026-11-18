#!/usr/bin/env node
// Confere a espera pela verificação do Cloudflare (Turnstile), extraindo o bloco real do
// index.html. No app de Windows o Cloudflare pede o clique na caixa "Confirme que é humano":
// aí a espera acaba na hora, com o pedido de marcar a caixa, e nada reinicia o desafio.
//
// Rodar:  node verificar-captcha.js
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ CAPTCHA (Cloudflare Turnstile) ═══');
const j = t.indexOf('// ═══ SENHA FORTE ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco CAPTCHA no index.html'); process.exit(2); }

function montar() {
  const opcoes = {}, resets = [];
  let resposta = '';
  const turnstile = {
    render(el, o) { Object.assign(opcoes, o); return 'w1'; },
    getResponse() { return resposta; },
    reset(w) { resets.push(w); },
  };
  const document = { getElementById: id => ({ id }), createElement: () => ({}), head: { appendChild() {} } };
  const window = {};
  const api = new Function('turnstile', 'document', 'window', 'setTimeout',
    t.slice(i, j) + '\nreturn {getCaptcha,resetCaptcha,captchaFalhou,CAPTCHA_WAIT_MSG,CAPTCHA_CAIXA_MSG};')(
    turnstile, document, window, (f) => f());   // sem espera real entre as tentativas
  return { api, opcoes, resets, responder: r => { resposta = r; } };
}

(async () => {
  let m = montar();
  assert.equal(await m.api.getCaptcha('captcha-login'), null, 'sem código: devolve null');
  assert.equal(m.api.captchaFalhou('captcha-login'), m.api.CAPTCHA_WAIT_MSG, 'sem pedido de clique: mensagem de aguardar');
  assert.deepEqual(m.resets, [], 'esperar sem código não reinicia o desafio');
  console.log('  ok    sem código e sem pedido de clique: pede para aguardar');

  m.opcoes['before-interactive-callback']();
  assert.equal(await m.api.getCaptcha('captcha-login'), null);
  assert.equal(m.api.captchaFalhou('captcha-login'), m.api.CAPTCHA_CAIXA_MSG, 'com pedido de clique: mensagem da caixa');
  console.log('  ok    Cloudflare pediu o clique: pede para marcar a caixa');

  m.opcoes['after-interactive-callback']();
  m.responder('tok-123');
  assert.equal(await m.api.getCaptcha('captcha-login'), 'tok-123', 'depois do clique: devolve o código');
  console.log('  ok    caixa marcada: o código sai');

  m.opcoes['before-interactive-callback']();
  m.api.resetCaptcha('captcha-login');
  assert.deepEqual(m.resets, ['w1']);
  assert.equal(m.api.captchaFalhou('captcha-login'), m.api.CAPTCHA_WAIT_MSG, 'reset limpa a marca do clique');
  console.log('  ok    reset depois de usar o código limpa o pedido de clique');
  console.log('\n  todos passaram');
})().catch(e => { console.error('  FALHOU  ' + e.message); process.exit(1); });
