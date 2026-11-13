import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";
import { linhaDaAssinatura } from "./mapa.ts";
import { planoDaConta, type AccountPlan } from "../_shared/account-plan.ts";
import { mensagemAssinatura } from "../_shared/subscription-message.ts";
import { chaveStripeProducao } from "../_shared/stripe-live.ts";

// Recebe os avisos do Stripe e sincroniza public.subscriptions.
// O corpo do aviso nunca e fonte de verdade: a assinatura e relida na API do
// Stripe com a nossa chave. A assinatura do aviso (Stripe-Signature) e conferida
// antes disso; sem o segredo configurado responde 500, e o Stripe tenta de novo
// por ate 3 dias — nenhuma renovacao se perde por um deslize de configuracao.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const cripto = Stripe.createSubtleCryptoProvider();

async function boasVindas(email: string, plano: AccountPlan | null, valorCentavos: number | null) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  const { subject, html } = mensagemAssinatura(plano, valorCentavos);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "North Finances <nao-responda@northfinances.com.br>", to: [email], subject, html }),
  });
  if (!r.ok) console.error("BOAS_VINDAS_RESEND_ERRO", r.status, await r.text());
}

// deno-lint-ignore no-explicit-any
async function sincroniza(admin: any, subId: string, userIdDica?: string | null) {
  const sub = await stripe.subscriptions.retrieve(subId);
  if (!sub.livemode) throw new Error("test_subscription_rejected");
  const userId = sub.metadata?.user_id || userIdDica;
  if (!userId) { console.warn("STRIPE_WEBHOOK_SEM_USUARIO sub=" + sub.id); return; }
  const linha = linhaDaAssinatura(sub as never);
  if (!linha) { console.log("STRIPE_WEBHOOK_STATUS_IGNORADO status=" + sub.status + " user=" + userId); return; }

  const { data: antes, error: readError } = await admin.from("subscriptions")
    .select("status,stripe_subscription_id").eq("user_id", userId).maybeSingle();
  if (readError || !antes) throw new Error("subscription_read_failed");
  // aviso atrasado de uma assinatura antiga nao pode derrubar a atual
  if (antes?.stripe_subscription_id && antes.stripe_subscription_id !== sub.id && linha.status !== "active") return;

  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { error: saveError } = await admin.from("subscriptions").update({ ...linha, stripe_customer_id: customer, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (saveError) throw new Error("subscription_save_failed");

  if (linha.status === "active" && antes?.status !== "active") {
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user?.email) {
        const { data: profile } = await admin.from("account_profiles").select("account_type").eq("user_id", userId).maybeSingle();
        const plano = planoDaConta(profile?.account_type);
        const price = sub.items.data[0]?.price;
        const valor = price?.currency === "brl" && price.recurring?.interval === "month" && price.recurring.interval_count === 1
          ? price.unit_amount : null;
        await boasVindas(data.user.email, plano, valor);
      }
    } catch (e) { console.error("BOAS_VINDAS_ERRO", String(e)); }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET || !chaveStripeProducao(Deno.env.get("STRIPE_SECRET_KEY"))) {
    console.error("STRIPE_WEBHOOK: defina STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET");
    return new Response("not configured", { status: 500 });
  }
  const corpo = await req.text();
  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(corpo, req.headers.get("Stripe-Signature") ?? "", WEBHOOK_SECRET, undefined, cripto);
  } catch (_e) {
    console.warn("STRIPE_WEBHOOK_RECUSADO assinatura nao confere");
    return new Response("invalid signature", { status: 400 });
  }
  if (!evento.livemode) return new Response("test event rejected", { status: 400 });
  try {
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const o = evento.data.object as { id: string; subscription?: string | { id: string }; client_reference_id?: string };
    if (evento.type === "checkout.session.completed") {
      const sid = typeof o.subscription === "string" ? o.subscription : o.subscription?.id;
      if (sid) await sincroniza(admin, sid, o.client_reference_id);
    } else if (evento.type.startsWith("customer.subscription.")) {
      await sincroniza(admin, o.id);
    }
    return new Response("ok");
  } catch (e) {
    // 500 faz o Stripe reenviar: melhor repetir do que perder uma renovacao
    console.error("STRIPE_WEBHOOK_ERRO", evento.type, String(e));
    return new Response("erro", { status: 500 });
  }
});
