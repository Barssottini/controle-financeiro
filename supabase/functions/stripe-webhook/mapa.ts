// Traduz uma assinatura do Stripe para a linha de public.subscriptions que o app
// le (subAccess): 'active' libera o Pro, 'canceled' com current_period_end no
// futuro libera ate essa data, o resto e Free. Devolve null para estados que nao
// devem mudar o acesso de ninguem (incomplete: o pagamento ainda nao passou).
export type SubStripe = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  trial_end?: number | null;
  ended_at?: number | null;
  current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null }[] };
};
export type Linha = { status: string; current_period_end: string; stripe_subscription_id: string };

const iso = (s: number) => new Date(s * 1000).toISOString();

export function linhaDaAssinatura(sub: SubStripe, agora = Date.now()): Linha | null {
  // a partir da API 2025-03-31 o fim do periodo mora no item, nao na assinatura
  const fim = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  const base = { stripe_subscription_id: sub.id };
  switch (sub.status) {
    case "trialing":
    case "active": {
      // em teste pelo Stripe a pessoa ja assinou: e Pro, e a 1a cobranca e o fim do teste
      const ate = sub.status === "trialing" && sub.trial_end ? sub.trial_end : fim;
      if (!ate) return null;
      return { ...base, status: sub.cancel_at_period_end ? "canceled" : "active", current_period_end: iso(ate) };
    }
    case "past_due":
    case "unpaid":
      return { ...base, status: "past_due", current_period_end: iso(fim ?? agora / 1000) };
    case "canceled":
    case "incomplete_expired":
      return { ...base, status: "canceled", current_period_end: iso(sub.ended_at ?? agora / 1000) };
    default:
      return null;
  }
}
