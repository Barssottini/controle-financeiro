import { createClient } from "jsr:@supabase/supabase-js@2";

// O token vem SO do ambiente. Ate 21/08/2026 havia um token de teste do Mercado
// Pago escrito aqui como ultimo recurso — credencial no fonte, num repositorio
// que e publico. Removido.
//
// A cadeia de fallback com o nome errado (MP_ACESS_TOKEN, sem o C) fica por
// enquanto, de proposito: nao da para saber daqui qual dos dois esta definido, e
// remover o errado sem conferir quebraria a sincronizacao. Os avisos abaixo
// resolvem isso — o proximo disparo do webhook diz nos logs qual nome respondeu.
const MP_TOKEN_CORRETO = Deno.env.get("MP_ACCESS_TOKEN");
const MP_TOKEN_TYPO = Deno.env.get("MP_ACESS_TOKEN");
const MP_TOKEN = MP_TOKEN_CORRETO ?? MP_TOKEN_TYPO ?? "";

if (!MP_TOKEN) {
  console.error("MP_WEBHOOK: nenhum token definido (nem MP_ACCESS_TOKEN nem MP_ACESS_TOKEN). Nenhuma assinatura sera sincronizada.");
} else if (!MP_TOKEN_CORRETO) {
  console.warn("MP_WEBHOOK: em uso o nome com erro de digitacao MP_ACESS_TOKEN. Renomeie o segredo para MP_ACCESS_TOKEN e remova o fallback desta funcao.");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// PENDENTE: este endpoint nao verifica a assinatura do webhook do Mercado Pago.
// Qualquer um pode chama-lo e forcar re-sincronizacoes (e disparar e-mails de
// boas-vindas). O conteudo nao e forjavel — a funcao consulta o MP antes de
// gravar —, entao ninguem se autopromove a pagante; mas e vetor de abuso e
// queima cota de API. Fechar validando o header x-signature do MP.

function mapStatus(mp: string): string {
  switch (mp) {
    case "authorized": return "active";
    case "paused": return "past_due";
    case "cancelled": return "canceled";
    default: return "trialing";
  }
}

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

const mpGet = (path: string) =>
  fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` } }).then((r) => r.json());

// deno-lint-ignore no-explicit-any
async function syncPreapproval(preapprovalId: string, admin: any) {
  const pa = await mpGet(`/preapproval/${preapprovalId}`);
  const userId = pa?.external_reference;
  if (!userId) return;
  const newStatus = mapStatus(pa.status);

  const { data: prevRow } = await admin.from("subscriptions").select("status").eq("user_id", userId).maybeSingle();
  const wasActive = prevRow?.status === "active";

  await admin.from("subscriptions").update({
    status: newStatus,
    mp_preapproval_id: pa.id,
    current_period_end: computePeriodEnd(pa.next_payment_date),
  }).eq("user_id", userId);

  if (newStatus === "active" && !wasActive) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (email) await sendWelcomeEmail(email);
    } catch (e) { console.error("WELCOME_EMAIL_ERROR", String(e)); }
  }
}

Deno.serve(async (req) => {
  try {
    if (!MP_TOKEN) return new Response("ok");

    const url = new URL(req.url);
    let topic = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
    let id = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as any));
      topic = topic || body.type || body.topic || "";
      id = id || body?.data?.id || body?.id || "";
    }
    if (!id) return new Response("ok");

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (topic.includes("preapproval")) {
      await syncPreapproval(id, admin);
    } else if (topic.includes("payment")) {
      const ap = await mpGet(`/authorized_payments/${id}`);
      if (ap?.preapproval_id) await syncPreapproval(ap.preapproval_id, admin);
    }
    return new Response("ok");
  } catch (_e) {
    return new Response("ok");
  }
});
