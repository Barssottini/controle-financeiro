// Exercita as funções reais de e-mail com Supabase, Stripe e Resend simulados; não envia nada.
// node supabase/checks/emails.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const codigo = nome => stripTypeScriptTypes(readFileSync(new URL(`../functions/${nome}/index.ts`, import.meta.url), 'utf8')
  .replace(/^import .+;\r?\n/gm, ''));
const env = { SUPABASE_URL: 'https://example.test', RESEND_API_KEY: 're_fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture', SUPABASE_ANON_KEY: 'fixture' };
function carregar(nome, deps) {
  let handler;
  const Deno = { env: { get: k => deps.env?.[k] ?? env[k] }, serve: f => { handler = f; } };
  const nomes = Object.keys(deps.globais);
  new Function('Deno', ...nomes, codigo(nome))(Deno, ...nomes.map(n => deps.globais[n]));
  return handler;
}
const resend = () => {
  const enviados = [];
  const fetch = async (_url, opts) => { enviados.push(JSON.parse(opts.body)); return { ok: true, text: async () => '' }; };
  return { enviados, fetch };
};

// ── Lembrete mensal: Free inclusive; fora quem desligou, quem pediu exclusão e e-mail não confirmado ──
const t = new Date(Date.now() - 3 * 3600 * 1000);
const mes = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
function lembrete({ delError = null } = {}) {
  const usuarios = [
    { id: 'free', email: 'free@example.test', email_confirmed_at: '2026-01-01' },              // sem preferência: recebe
    { id: 'desligou', email: 'desligou@example.test', email_confirmed_at: '2026-01-01' },
    { id: 'apagando', email: 'apagando@example.test', email_confirmed_at: '2026-01-01' },
    { id: 'nao-confirmou', email: 'nc@example.test', email_confirmed_at: null },
    { id: 'ja-recebeu', email: 'jr@example.test', email_confirmed_at: '2026-01-01' },
  ];
  const prefs = { desligou: { monthly_statement: false, unsub_token: 'a', last_sent: null }, 'ja-recebeu': { monthly_statement: true, unsub_token: 'b', last_sent: mes } };
  const atualizados = [];
  const admin = {
    auth: { admin: { listUsers: async () => ({ data: { users: usuarios }, error: null }) } },
    from(tabela) {
      if (tabela === 'account_deletion') return { select: async () => ({ data: delError ? null : [{ user_id: 'apagando' }], error: delError }) };
      let uid;
      return {
        select() { return this; }, eq(_c, v) { uid = v; return this; },
        async maybeSingle() { return { data: prefs[uid] ?? null }; },
        insert(row) { uid = row.user_id; return { select: () => ({ single: async () => ({ data: { monthly_statement: true, unsub_token: 'tok-' + uid, last_sent: null } }) }) }; },
        update() { return { eq: async (_c, v) => { atualizados.push(v); } }; },
      };
    },
  };
  const r = resend();
  const handler = carregar('statement-reminder', { globais: { createClient: () => admin, fetch: r.fetch } });
  return { handler, r, atualizados };
}
{
  const { handler, r, atualizados } = lembrete();
  const res = await (await handler(new Request('https://example.test/'))).json();
  assert.deepEqual(r.enviados.map(e => e.to[0]), ['free@example.test'], 'só a conta Free confirmada e sem restrição recebe');
  assert.equal(res.sent, 1); assert.equal(res.skipped, 4);
  assert.deepEqual(atualizados, ['free'], 'marca o mês só de quem recebeu');
  assert.ok(r.enviados[0].headers['List-Unsubscribe'].includes('tok-free'));
  console.log('  ok    lembrete mensal: Free recebe; desligado, em exclusão, não confirmado e já enviado ficam de fora');
}
{
  const { handler, r } = lembrete({ delError: new Error('offline') });
  assert.equal((await handler(new Request('https://example.test/'))).status, 500);
  assert.equal(r.enviados.length, 0, 'sem a lista de exclusões, ninguém recebe');
  console.log('  ok    lembrete mensal: sem conseguir ler as exclusões, não manda para ninguém');
}

// ── Pedido de exclusão: só fala em cobrança para quem tinha assinatura paga ──
async function exclusao(sub) {
  class Stripe {
    static createFetchHttpClient() { return {}; }
    subscriptions = { update: async () => ({ current_period_end: Math.floor(Date.now() / 1000) + 86400 }) };
  }
  const tabela = () => ({
    upsert: async () => ({}), select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: sub }; }, update() { return { eq: async () => ({}) }; },
  });
  const createClient = (_u, chave) => chave === 'fixture'
    ? { auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'u1@example.test' } } }) }, from: tabela }
    : { from: tabela };
  const r = resend();
  const handler = carregar('request-deletion', { env: { STRIPE_SECRET_KEY: 'sk_live_fixture' }, globais: { createClient, Stripe, fetch: r.fetch } });
  const res = await handler(new Request('https://example.test/', { method: 'POST', headers: { Authorization: 'Bearer x' } }));
  assert.equal(res.status, 200);
  assert.equal(r.enviados.length, 1);
  return r.enviados[0].html;
}
assert.ok(!(await exclusao({ stripe_subscription_id: null, current_period_end: null, trial_ends_at: null })).includes('assinatura'), 'conta Free: sem frase de cobrança');
assert.ok((await exclusao({ stripe_subscription_id: 'sub_1', current_period_end: null, trial_ends_at: null })).includes('Sua assinatura também foi cancelada'), 'assinante: avisa que a cobrança parou');
console.log('  ok    pedido de exclusão: a frase da cobrança só aparece para quem tinha assinatura paga');
console.log('\n  todos passaram');
