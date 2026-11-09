// Confere a traducao assinatura do Stripe -> linha de subscriptions, usando o
// arquivo real do webhook. E ela que decide quem e Pro depois de pagar.
// Rodar:  node --experimental-strip-types verificar-stripe.mjs
import { linhaDaAssinatura } from './supabase/functions/stripe-webhook/mapa.ts';

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo + (ok ? '' : '\n        esperado: ' + JSON.stringify(esperado) + '\n        obtido:   ' + JSON.stringify(obtido)));
}
const T = 1798761600, iso = s => new Date(s * 1000).toISOString();   // 01/01/2027
const st = s => s && s.status;

checa('ativa: Pro ate o fim do periodo', linhaDaAssinatura({ id: 's', status: 'active', current_period_end: T }),
  { stripe_subscription_id: 's', status: 'active', current_period_end: iso(T) });
checa('fim do periodo no item (API nova) tambem vale', linhaDaAssinatura({ id: 's', status: 'active', items: { data: [{ current_period_end: T }] } }).current_period_end, iso(T));
checa('em teste pelo Stripe ja e Pro, cobranca no fim do teste',
  linhaDaAssinatura({ id: 's', status: 'trialing', trial_end: T, current_period_end: T - 100 }), { stripe_subscription_id: 's', status: 'active', current_period_end: iso(T) });
checa('cancelou: acesso ate o fim do que pagou', linhaDaAssinatura({ id: 's', status: 'active', cancel_at_period_end: true, current_period_end: T }),
  { stripe_subscription_id: 's', status: 'canceled', current_period_end: iso(T) });
checa('venceu cancelada: acaba quando terminou', linhaDaAssinatura({ id: 's', status: 'canceled', ended_at: T }).current_period_end, iso(T));
checa('cartao recusado na renovacao: past_due (sai do Pro)', st(linhaDaAssinatura({ id: 's', status: 'past_due', current_period_end: T })), 'past_due');
checa('pagamento inicial pendente nao muda nada', linhaDaAssinatura({ id: 's', status: 'incomplete' }), null);
checa('estado desconhecido nao muda nada', linhaDaAssinatura({ id: 's', status: 'paused' }), null);

console.log('STRIPE — ' + (falhas ? falhas + ' FALHA(S)' : 'tudo bate'));
console.log(L.join('\n'));
process.exitCode = falhas ? 1 : 0;
