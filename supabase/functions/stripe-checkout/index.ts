import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";
import { planoDaConta, precoConfere } from "../_shared/account-plan.ts";
import { chaveStripeProducao } from "../_shared/stripe-live.ts";

// Abre o pagamento do Pro na pagina hospedada do Stripe e devolve a URL. O app so
// redireciona: nenhum script de terceiro roda dentro do app criptografado.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.northfinances.com.br/";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// O Stripe recusa trial_end a menos de 48h no Checkout.
const MIN_TRIAL_MS = 48 * 60 * 60 * 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!chaveStripeProducao(Deno.env.get("STRIPE_SECRET_KEY"))) {
      console.error("STRIPE_CHECKOUT: STRIPE_SECRET_KEY nao definida");
      return json({ error: "pagamento_nao_configurado" }, 503);
    }
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile, error: profileError } = await admin.from("account_profiles")
      .select("account_type").eq("user_id", user.id).maybeSingle();
    if (profileError) return json({ error: "tipo_conta_indisponivel" }, 503);
    const plano = planoDaConta(profile?.account_type);
    if (!plano) return json({ error: "tipo_conta_nao_registrado" }, 409);
    const { data: row, error: rowError } = await admin.from("subscriptions")
      .select("status,trial_ends_at,current_period_end,stripe_customer_id,stripe_subscription_id,mp_preapproval_id")
      .eq("user_id", user.id).maybeSingle();
    if (rowError || !row) return json({ error: "assinatura_indisponivel" }, 503);
    if (row.status === "active" && !row.stripe_subscription_id && !row.mp_preapproval_id
      && (!row.current_period_end || Date.parse(row.current_period_end) > Date.now())) {
      return json({ error: "pro_concedido" }, 409);
    }

    // Ja tem assinatura viva (inclusive cancelada que ainda nao venceu)? Abrir outro
    // checkout cobraria duas vezes. O portal resolve: renovar, trocar cartao, cancelar.
    if (row?.stripe_customer_id && row?.stripe_subscription_id) {
      const atual = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      if (atual && ["active", "trialing", "past_due"].includes(atual.status)) {
        const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: APP_URL });
        return json({ url: portal.url });
      }
    }

    const priceId = Deno.env.get(plano.priceEnv);
    if (!priceId) return json({ error: "pagamento_nao_configurado" }, 503);
    const price = await stripe.prices.retrieve(priceId);
    if (!price.livemode || !precoConfere(plano, price)) {
      console.error("STRIPE_CHECKOUT_PRECO_INCOMPATIVEL tipo=" + plano.accountType);
      return json({ error: "pagamento_nao_configurado" }, 503);
    }

    let customer = row?.stripe_customer_id ?? null;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id, account_type: plano.accountType } }, { idempotencyKey: "north-customer-" + user.id });
      customer = c.id;
      const { error: saveError } = await admin.from("subscriptions").update({ stripe_customer_id: customer }).eq("user_id", user.id);
      if (saveError) throw saveError;
    }

    // Quem assina durante a semana gratis so e cobrado quando ela acaba.
    const fimTeste = row?.status === "trialing" && row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
    const subscription_data: Stripe.Checkout.SessionCreateParams.SubscriptionData = { metadata: { user_id: user.id, account_type: plano.accountType } };
    if (fimTeste - Date.now() > MIN_TRIAL_MS) subscription_data.trial_end = Math.floor(fimTeste / 1000);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data,
      locale: "pt-BR",
      success_url: APP_URL + "?assinatura=ok",
      cancel_url: APP_URL,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("STRIPE_CHECKOUT_ERRO", String(e));
    return json({ error: "erro_no_checkout" }, 500);
  }
});
