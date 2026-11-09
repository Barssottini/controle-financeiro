import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";

// Abre o pagamento do Pro na pagina hospedada do Stripe e devolve a URL. O app so
// redireciona: nenhum script de terceiro roda dentro do app criptografado.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
// shortcut: o padrao e o preco de TESTE; ao ligar a conta real, defina STRIPE_PRICE_ID com o preco live.
const PRICE = Deno.env.get("STRIPE_PRICE_ID") ?? "price_1UZqefRpYGSIMBWBlC6XG7fo";
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
  try {
    if (!Deno.env.get("STRIPE_SECRET_KEY")) {
      console.error("STRIPE_CHECKOUT: STRIPE_SECRET_KEY nao definida");
      return json({ error: "pagamento_nao_configurado" }, 503);
    }
    // shortcut: com chave de TESTE, o endereco de producao nao abre pagamento (cartao de
    // teste daria Pro de graca e cartao real seria recusado); a previa segue testavel. Some
    // sozinho quando a chave real (sk_live_) entrar. O Origin vem do navegador: trava o uso
    // comum, nao um pedido montado a mao — ao ir ao ar, zerar as assinaturas de teste.
    if ((Deno.env.get("STRIPE_SECRET_KEY") ?? "").startsWith("sk_test_") && req.headers.get("Origin") === "https://app.northfinances.com.br") {
      return json({ error: "pagamento_nao_configurado" }, 503);
    }
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin.from("subscriptions")
      .select("status,trial_ends_at,stripe_customer_id,stripe_subscription_id")
      .eq("user_id", user.id).maybeSingle();

    // Ja tem assinatura viva (inclusive cancelada que ainda nao venceu)? Abrir outro
    // checkout cobraria duas vezes. O portal resolve: renovar, trocar cartao, cancelar.
    if (row?.stripe_customer_id && row?.stripe_subscription_id) {
      const atual = await stripe.subscriptions.retrieve(row.stripe_subscription_id).catch(() => null);
      if (atual && ["active", "trialing", "past_due"].includes(atual.status)) {
        const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: APP_URL });
        return json({ url: portal.url });
      }
    }

    let customer = row?.stripe_customer_id ?? null;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customer = c.id;
      await admin.from("subscriptions").update({ stripe_customer_id: customer }).eq("user_id", user.id);
    }

    // Quem assina durante a semana gratis so e cobrado quando ela acaba.
    const fimTeste = row?.status === "trialing" && row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
    const subscription_data: Stripe.Checkout.SessionCreateParams.SubscriptionData = { metadata: { user_id: user.id } };
    if (fimTeste - Date.now() > MIN_TRIAL_MS) subscription_data.trial_end = Math.floor(fimTeste / 1000);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: PRICE, quantity: 1 }],
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
