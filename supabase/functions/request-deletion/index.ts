import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? Deno.env.get("MP_ACESS_TOKEN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ms = (v?: string | null): number => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
};

async function sendEmail(email: string) {
  if (!RESEND_KEY) return;
  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 0;font-family:'Segoe UI',system-ui,Arial,sans-serif"><tr><td align="center"><table width="460" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden"><tr><td style="height:3px;background:#c8903a"></td></tr><tr><td style="padding:36px 40px 8px;text-align:center"><div style="font-size:22px;font-weight:800;letter-spacing:-.5px;color:#faf9f7">North<span style="color:#c8903a">Finances</span></div></td></tr><tr><td style="padding:16px 40px 4px;text-align:center"><div style="font-size:19px;font-weight:700;color:#faf9f7;margin-bottom:8px">Você pediu para excluir sua conta</div><div style="font-size:13px;line-height:1.7;color:#b5afa9">Recebemos um pedido de exclusão da sua conta North Finances. Seus dados serão apagados <b style="color:#faf9f7">definitivamente em 15 dias</b> e sua assinatura já foi cancelada — você não será mais cobrado.</div></td></tr><tr><td style="padding:18px 40px 6px;text-align:center"><div style="font-size:13px;line-height:1.7;color:#b5afa9"><b style="color:#faf9f7">Não foi você?</b> Entre no app e clique em <b style="color:#faf9f7">“Quero reativar minha conta”</b> — isso cancela a exclusão na hora e mantém tudo intacto.</div></td></tr><tr><td style="padding:22px 40px 30px;text-align:center"><a href="https://app.northfinances.com.br/" style="display:inline-block;background:#c8903a;color:#0d0d0d;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px">Entrar e reativar</a></td></tr><tr><td style="padding:0 40px 32px;text-align:center;border-top:1px solid #262626"><div style="font-size:11px;color:#6b6560;line-height:1.6;margin-top:16px">Se você realmente quer excluir, não precisa fazer nada — a conta será apagada automaticamente após 15 dias.<br>North Finances · Encontre seu norte financeiro</div></td></tr></table></td></tr></table>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "North Finances <nao-responda@northfinances.com.br>", to: [email], subject: "Você pediu para excluir sua conta North Finances", html }),
  }).catch(() => {});
}

// Cancela a cobranca recorrente no Mercado Pago (melhor esforco) e marca a assinatura
// como cancelada — preservando o acesso ate o fim do que ja foi pago.
//
// QUEM PAGOU O MES, USA O MES (24/08/2026). Mesma politica da cancel-subscription.
// Aqui ela importa por causa da reativacao: quem pede exclusao e depois clica em
// "Quero reativar minha conta" voltaria com status 'canceled' e, sem
// current_period_end, cairia direto no paywall mesmo tendo pago o mes.
// deno-lint-ignore no-explicit-any
async function cancelBilling(admin: any, uid: string) {
  try {
    const { data: sub } = await admin.from("subscriptions")
      .select("mp_preapproval_id,current_period_end,trial_ends_at")
      .eq("user_id", uid).maybeSingle();

    let mpNextPayment: string | null = null;
    if (sub?.mp_preapproval_id && MP_TOKEN) {
      try {
        const r = await fetch(`https://api.mercadopago.com/preapproval/${sub.mp_preapproval_id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        const pa = await r.json().catch(() => null);
        if (pa && typeof pa.next_payment_date === "string") mpNextPayment = pa.next_payment_date;
      } catch (_e) { /* melhor esforco */ }
    }

    const maior = Math.max(ms(sub?.current_period_end), ms(mpNextPayment), ms(sub?.trial_ends_at));
    const patch: Record<string, unknown> = { status: "canceled" };
    if (maior > Date.now()) patch.current_period_end = new Date(maior).toISOString();

    await admin.from("subscriptions").update(patch).eq("user_id", uid);
  } catch (e) { console.error("CANCEL_BILLING_FAIL", uid, String(e)); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("account_deletion").upsert({ user_id: user.id, requested_at: new Date().toISOString() });
    await cancelBilling(admin, user.id);
    if (user.email) { try { await sendEmail(user.email); } catch (_e) { /* email best-effort */ } }
    return json({ ok: true });
  } catch (e) {
    console.error("REQ_DELETION_ERROR", String(e));
    return json({ error: String(e) }, 500);
  }
});
