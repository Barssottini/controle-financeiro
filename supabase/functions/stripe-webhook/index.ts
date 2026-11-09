import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";
import { linhaDaAssinatura } from "./mapa.ts";

// Recebe os avisos do Stripe e sincroniza public.subscriptions.
// O corpo do aviso nunca e fonte de verdade: a assinatura e relida na API do
// Stripe com a nossa chave. A assinatura do aviso (Stripe-Signature) e conferida
// antes disso; sem o segredo configurado responde 500, e o Stripe tenta de novo
// por ate 3 dias — nenhuma renovacao se perde por um deslize de configuracao.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const cripto = Stripe.createSubtleCryptoProvider();

async function boasVindas(email: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 0;font-family:'Segoe UI',system-ui,Arial,sans-serif"><tr><td align="center"><table width="460" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden"><tr><td style="height:3px;background:#c8903a"></td></tr><tr><td style="padding:36px 40px 8px;text-align:center"><div style="font-size:22px;font-weight:800;letter-spacing:-.5px;color:#faf9f7">North <span style="color:#c8903a">Finances</span></div></td></tr><tr><td style="padding:16px 40px 4px;text-align:center"><div style="font-size:19px;font-weight:700;color:#faf9f7;margin-bottom:8px">Assinatura Pro confirmada</div><div style="font-size:13px;line-height:1.7;color:#b5afa9">Sua assinatura do North Finances Pro, de <b style="color:#faf9f7">R$ 19,90/mês</b>, está ativa. Sem fidelidade: cancele quando quiser em Configurações → Assinatura.</div></td></tr><tr><td style="padding:18px 40px 6px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #262626;border-bottom:1px solid #262626;padding:4px 0"><tr><td style="padding:12px 0;font-size:13px;color:#b5afa9;line-height:1.9">✓ Carteira de investimentos<br>✓ Contas a pagar e a receber<br>✓ Mais de uma conta, separada por banco<br>✓ Criptografia de ponta a ponta: só você lê seus dados</td></tr></table></td></tr><tr><td style="padding:22px 40px 8px;text-align:center"><a href="https://app.northfinances.com.br/" style="display:inline-block;background:#c8903a;color:#0d0d0d;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px">Abrir o North Finances</a></td></tr><tr><td style="padding:0 40px 32px;text-align:center;border-top:1px solid #262626"><div style="font-size:11px;color:#6b6560;line-height:1.6;margin-top:16px">Dúvidas? Responda este e-mail ou escreva para suporte@northfinances.com.br<br>North Finances</div></td></tr></table></td></tr></table>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "North Finances <nao-responda@northfinances.com.br>", to: [email], subject: "Assinatura Pro confirmada — North Finances", html }),
  });
  if (!r.ok) console.error("BOAS_VINDAS_RESEND_ERRO", r.status, await r.text());
}

// deno-lint-ignore no-explicit-any
async function sincroniza(admin: any, subId: string, userIdDica?: string | null) {
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = sub.metadata?.user_id || userIdDica;
  if (!userId) { console.warn("STRIPE_WEBHOOK_SEM_USUARIO sub=" + sub.id); return; }
  const linha = linhaDaAssinatura(sub as never);
  if (!linha) { console.log("STRIPE_WEBHOOK_STATUS_IGNORADO status=" + sub.status + " user=" + userId); return; }

  const { data: antes } = await admin.from("subscriptions")
    .select("status,stripe_subscription_id").eq("user_id", userId).maybeSingle();
  // aviso atrasado de uma assinatura antiga nao pode derrubar a atual
  if (antes?.stripe_subscription_id && antes.stripe_subscription_id !== sub.id && linha.status !== "active") return;

  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await admin.from("subscriptions").update({ ...linha, stripe_customer_id: customer, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (linha.status === "active" && antes?.status !== "active") {
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user?.email) await boasVindas(data.user.email);
    } catch (e) { console.error("BOAS_VINDAS_ERRO", String(e)); }
  }
}

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET || !Deno.env.get("STRIPE_SECRET_KEY")) {
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
