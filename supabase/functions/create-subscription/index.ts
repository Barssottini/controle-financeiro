import { createClient } from "jsr:@supabase/supabase-js@2";

// O token vem SO do ambiente. Ate 21/08/2026 havia um token de teste do Mercado
// Pago escrito aqui como ultimo recurso — credencial no fonte, e o repositorio do
// app e publico. Removido, igual ao mp-webhook.
//
// A cadeia com o nome errado (MP_ACESS_TOKEN, sem o C) fica por enquanto: nao da
// para saber daqui qual dos dois esta definido, e remover sem conferir quebraria
// a assinatura. O aviso abaixo aparece nos logs e resolve a duvida sozinho.
const MP_TOKEN_CORRETO = Deno.env.get("MP_ACCESS_TOKEN");
const MP_TOKEN_TYPO = Deno.env.get("MP_ACESS_TOKEN");
const MP_TOKEN = MP_TOKEN_CORRETO ?? MP_TOKEN_TYPO ?? "";

if (!MP_TOKEN) {
  console.error("CREATE_SUB: nenhum token definido (nem MP_ACCESS_TOKEN nem MP_ACESS_TOKEN). Nenhuma assinatura sera criada.");
} else if (!MP_TOKEN_CORRETO) {
  console.warn("CREATE_SUB: em uso o nome com erro de digitacao MP_ACESS_TOKEN. Renomeie o segredo para MP_ACCESS_TOKEN e remova o fallback.");
}

// Corrigido em 21/08/2026: o fallback apontava para barssottini.github.io, dominio
// anterior ao app.northfinances.com.br. E a URL de retorno do checkout.
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.northfinances.com.br/";
const PRICE = Number(Deno.env.get("MP_PRICE") ?? "9.90");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const IS_PROD = MP_TOKEN.startsWith("APP_USR-");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// O Mercado Pago, na resposta sincrona de autorizacao via card_token_id, pode devolver
// next_payment_date igual (ou muito perto) do instante atual em vez da proxima data de
// cobranca real. So confiamos no valor se ele estiver claramente no futuro; senao,
// calculamos 1 mes a partir de agora (mesma frequencia usada no auto_recurring).
function computePeriodEnd(nextPaymentDate?: string | null): string {
  const now = Date.now();
  if (nextPaymentDate) {
    const t = new Date(nextPaymentDate).getTime();
    if (!isNaN(t) && t > now + 60 * 60 * 1000) return new Date(t).toISOString();
  }
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

async function sendWelcomeEmail(email: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  // Texto alinhado com o do mp-webhook em 21/08/2026. Esta copia ainda prometia
  // "contas a pagar com lembrete por e-mail" — recurso aposentado em 21/07/2026,
  // e que o manual de marca lista como claim proibido.
  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 0;font-family:'Segoe UI',system-ui,Arial,sans-serif"><tr><td align="center"><table width="460" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden"><tr><td style="height:3px;background:#c8903a"></td></tr><tr><td style="padding:36px 40px 8px;text-align:center"><div style="font-size:22px;font-weight:800;letter-spacing:-.5px;color:#faf9f7">North<span style="color:#c8903a">Finances</span></div></td></tr><tr><td style="padding:16px 40px 4px;text-align:center"><div style="font-size:19px;font-weight:700;color:#faf9f7;margin-bottom:8px">🎉 Assinatura confirmada!</div><div style="font-size:13px;line-height:1.7;color:#b5afa9">Bem-vindo ao North Finances. Sua assinatura de <b style="color:#faf9f7">R$ 9,90/mês</b> está ativa — sem fidelidade, cancele quando quiser nas Configurações.</div></td></tr><tr><td style="padding:18px 40px 6px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #262626;border-bottom:1px solid #262626;padding:4px 0"><tr><td style="padding:12px 0;font-size:13px;color:#b5afa9;line-height:1.9">✓ Transações e dashboard ilimitados<br>✓ Carteira de investimentos completa<br>✓ Metas, reserva e orçamento por categoria<br>✓ Contas a pagar com aviso no painel<br>✓ Criptografia de ponta a ponta — só você lê seus dados<br>✓ Conta na nuvem + app de desktop</td></tr></table></td></tr><tr><td style="padding:22px 40px 8px;text-align:center"><a href="https://app.northfinances.com.br/" style="display:inline-block;background:#c8903a;color:#0d0d0d;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px">Abrir o North Finances</a></td></tr><tr><td style="padding:0 40px 26px;text-align:center"><a href="https://app.northfinances.com.br/manual.html" style="color:#c8903a;font-size:12.5px;text-decoration:underline">Ver o manual completo de cada menu</a></td></tr><tr><td style="padding:0 40px 32px;text-align:center;border-top:1px solid #262626"><div style="font-size:11px;color:#6b6560;line-height:1.6;margin-top:16px">Dúvidas? É só responder este e-mail ou escrever para suporte@northfinances.com.br<br>North Finances · Encontre seu norte financeiro</div></td></tr></table></td></tr></table>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "North Finances <nao-responda@northfinances.com.br>",
      to: [email],
      subject: "🎉 Assinatura confirmada — bem-vindo ao North Finances",
      html,
    }),
  });
  if (!r.ok) console.error("WELCOME_EMAIL_RESEND_ERROR", r.status, await r.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
    const cardTokenId = typeof reqBody?.card_token_id === "string" && reqBody.card_token_id ? reqBody.card_token_id : null;

    const body: Record<string, unknown> = {
      reason: "North Finances — Assinatura mensal",
      external_reference: user.id,
      payer_email: user.email,
      back_url: APP_URL,
      notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: PRICE,
        currency_id: "BRL",
      },
    };
    if (cardTokenId) {
      body.card_token_id = cardTokenId;
      body.status = "authorized";
    } else {
      body.status = "pending";
    }

    const mpResp = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await mpResp.json();
    if (!mpResp.ok) {
      // Loga o id do usuario, nunca o e-mail. Log de erro de pagamento nao e lugar
      // de PII num produto que promete que nem nos lemos os dados do cliente.
      console.error("MP_ERROR", mpResp.status, "prod=", IS_PROD, "card=", !!cardTokenId, "user=", user.id, "resp=", JSON.stringify(data));
      return json({ error: cardTokenId ? "mp_rejected" : "mp_error", detail: data }, 400);
    }

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (cardTokenId) {
      if (data.status === "authorized") {
        const { data: prevRow } = await admin.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle();
        const wasActive = prevRow?.status === "active";
        await admin.from("subscriptions").update({
          status: "active",
          mp_preapproval_id: data.id,
          current_period_end: computePeriodEnd(data.next_payment_date),
        }).eq("user_id", user.id);
        if (!wasActive) {
          try { await sendWelcomeEmail(user.email!); } catch (e) { console.error("WELCOME_EMAIL_ERROR", String(e)); }
        }
        return json({ ok: true, status: data.status });
      }
      await admin.from("subscriptions").update({ mp_preapproval_id: data.id }).eq("user_id", user.id);
      console.error("MP_NOT_AUTHORIZED", "status=", data.status, "user=", user.id);
      return json({ error: "mp_not_authorized", status: data.status }, 400);
    }

    await admin.from("subscriptions").update({ mp_preapproval_id: data.id }).eq("user_id", user.id);
    return json({ init_point: data.init_point });
  } catch (e) {
    console.error("FN_ERROR", String(e));
    return json({ error: String(e) }, 500);
  }
});
