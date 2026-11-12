// Exercita o handler real com Stripe/Supabase simulados; não cria cobrança nem e-mail.
// node supabase/checks/checkout-plan.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { planoDaConta, precoConfere } from '../functions/_shared/account-plan.ts';
import { mensagemAssinatura } from '../functions/_shared/subscription-message.ts';

const source = readFileSync(new URL('../functions/stripe-checkout/index.ts', import.meta.url), 'utf8')
  .replace(/^import .+;\r?\n/gm, '');
const handlerCode = stripTypeScriptTypes(source);
const price = (amount = 4990) => ({ active: true, currency: 'brl', unit_amount: amount, recurring: { interval: 'month', interval_count: 1 } });
async function run(options = {}) {
  const events = [], env = { STRIPE_SECRET_KEY: 'sk_live_fixture', SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture', STRIPE_PRICE_ID: 'price_pf', STRIPE_BUSINESS_PRICE_ID: 'price_pj', ...options.env };
  let handler;
  class Stripe {
    static createFetchHttpClient() { return {}; }
    prices = { retrieve: async id => { events.push(['price', id]); return options.price || price(id === 'price_pf' ? 1990 : 4990); } };
    customers = { create: async value => { events.push(['customer', value]); return { id: 'cus_fixture' }; } };
    subscriptions = { retrieve: async () => null };
    checkout = { sessions: { create: async value => { events.push(['checkout', value]); return { url: 'https://checkout.stripe.test/fixture' }; } } };
  }
  const createClient = () => ({
    auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: 'user_fixture', email: 'fixture@example.test' } } }) },
    from(table) {
      const builder = {
        select() { return this; }, eq() { return this; }, update() { return this; },
        async maybeSingle() {
          return table === 'account_profiles'
            ? { data: options.noProfile ? null : { account_type: options.type || 'pj' }, error: options.profileError || null }
            : { data: { status: 'free' }, error: null };
        },
      };
      return builder;
    },
  });
  new Function('Stripe', 'createClient', 'Deno', 'planoDaConta', 'precoConfere', handlerCode)(Stripe, createClient, {
    env: { get: name => env[name] }, serve: fn => { handler = fn; },
  }, planoDaConta, precoConfere);
  const method = options.method || 'POST';
  const response = await handler(new Request('https://example.test/checkout', {
    method, headers: { Origin: options.origin || 'https://preview.example.test', Authorization: 'Bearer fixture' },
    ...(method === 'POST' ? { body: JSON.stringify(options.body || {}) } : {}),
  }));
  return { status: response.status, body: await response.json(), events };
}
let checked = 0;
const expect = (actual, expected) => { assert.deepEqual(actual, expected); checked++; };
expect((await run({ method: 'GET' })).status, 405);
expect((await run({ env: { STRIPE_SECRET_KEY: '' } })).status, 503);
expect((await run({ origin: 'https://app.northfinances.com.br', env: { STRIPE_SECRET_KEY: 'sk_test_fixture' } })).status, 503);
expect((await run({ unauthorized: true })).status, 401);
expect((await run({ profileError: { code: 'PGRST205' } })).body.error, 'tipo_conta_indisponivel');
expect((await run({ noProfile: true })).status, 409);
expect((await run({ type: 'inventado' })).status, 409);
const missingPrice = await run({ env: { STRIPE_BUSINESS_PRICE_ID: '' } });
expect(missingPrice.status, 503);
expect(missingPrice.events.length, 0);
const pj = await run({ body: { account_type: 'pf', price: 'price_pf', amount: 1 } });
expect(pj.status, 200);
const pjSession = pj.events.find(event => event[0] === 'checkout')[1];
expect(pjSession.line_items, [{ price: 'price_pj', quantity: 1 }]);
expect(pjSession.subscription_data.metadata.account_type, 'pj');
const pf = await run({ type: 'pf', body: { account_type: 'pj' } });
expect(pf.events.find(event => event[0] === 'checkout')[1].line_items, [{ price: 'price_pf', quantity: 1 }]);
expect((await run({ price: price(1990) })).status, 503);
expect((await run({ price: { ...price(), currency: 'usd' } })).status, 503);
expect((await run({ price: { ...price(), recurring: { interval: 'year', interval_count: 1 } } })).status, 503);
expect((await run({ price: { ...price(), active: false } })).status, 503);
expect(planoDaConta(null), null);
const businessEmail = mensagemAssinatura(planoDaConta('pj'), 4990);
expect(businessEmail.subject, 'Assinatura confirmada — North Empresarial');
expect(/49,90/.test(businessEmail.html) && !/19,90/.test(businessEmail.html), true);
expect(mensagemAssinatura(planoDaConta('pf'), 1990).html.includes('19,90'), true);
expect(mensagemAssinatura(null, null).html.includes('/mês'), false);
console.log(`CHECKOUT — ${checked} verificações passaram; preço/tipo enviados pelo cliente são ignorados.`);
