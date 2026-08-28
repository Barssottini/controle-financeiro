import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_TOKEN_CORRETO = Deno.env.get("MP_ACCESS_TOKEN");
const MP_TOKEN_TYPO = Deno.env.get("MP_ACESS_TOKEN");
const MP_TOKEN = MP_TOKEN_CORRETO ?? MP_TOKEN_TYPO ?? "";
if (!MP_TOKEN) console.error("MP_WEBHOOK: nenhum token definido.");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";

// ── VERIFICACAO DE ASSINATURA — FASE DE OBSERVACAO ──
//
// Esta funcao NAO REJEITA NADA por enquanto, e isso e deliberado.
//
// O MP assina as notificacoes com HMAC-SHA256 e manda no cabecalho x-signature,
// no formato "ts=...,v1=...". Mas a documentacao publica NAO traz o template do
// manifesto assinado. O formato usado aqui
//     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// e o mais citado, e nao esta confirmado em fonte oficial.
//
// Isso importa muito: se o template estiver errado, o HMAC nunca bate. Uma
// versao que rejeitasse por divergencia recusaria RENOVACOES LEGITIMAS, e o
// efeito seria alguem pagando sem acesso — o oposto do que a protecao serve.
// Divergencia aqui e evidencia ambigua: pode ser ataque, pode ser eu ter errado
// o manifesto. Rejeitar com base em ambiguidade e pior que nao rejeitar.
//
// (A v17 rejeitava. Foi corrigida no mesmo dia, antes de ver trafego real.)
//
// Entao a fase 1 so mede. O log dira:
//   ASSINATURA_OK          -> o template esta certo. So depois de ver isto e que
//                             faz sentido passar a rejeitar.
//   ASSINATURA_DIVERGENTE  -> ou template errado, ou chamada forjada. Enquanto
//                             nao houver um OK, a leitura mais provavel e a
//                             primeira, e por isso a notificacao segue processada.
//   SEM_ASSINATURA         -> o notification_url nao e assinado; a protecao
//                             precisa ser outra (token secreto na propria URL).
//
// A fase 2 — barrar de verdade — entra quando o log responder, e nao antes.

function parseSignature(header: string): { ts: string; v1: string } | null {
  const out: Record<string, string> = {};
  for (const parte of header.split(",")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    out[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  return out.ts && out.v1 ? { ts: out.ts, v1: out.v1 } : null;
}

async function hmacHex(chave: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Testa alguns templates plausiveis de uma vez. Se algum bater, o log diz QUAL —
// e ai paramos de adivinhar: e so fixar esse e passar a rejeitar o resto.
async function conferir(id: string, requestId: string, ts: string, v1: string) {
  const candidatos: Record<string, string> = {
    "padrao": `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`,
    "id-original": `id:${id};request-id:${requestId};ts:${ts};`,
    "sem-request-id": `id:${id.toLowerCase()};ts:${ts};`,
  };
  for (const [nome, manifesto] of Object.entries(candidatos)) {
    if (igual(await hmacHex(WEBHOOK_SECRET, manifesto), v1.toLowerCase())) return nome;
  }
  return null;
}

function mapStatus(mp: string): string | null {
  switch (mp) {
    case "authorized": return "active";
    case "paused": return "past_due";
    case "cancelled": return "canceled";
    // "pending" — e qualquer status que o MP venha a criar — caia aqui. Antes
    // viravam "trialing", que LIBERA acesso: um preapproval nao pago concedia uso
    // do app, e ainda sobrescrevia um "canceled" ou "active" que estava correto.
    // Foi assim que uma conta cancelada voltou sozinha para "trialing" em
    // 28/08/2026. O que nao entendemos nao muda o acesso de ninguem.
    default: return null;
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
  if (!newStatus) {
    console.log("MP_WEBHOOK_STATUS_IGNORADO status=" + pa.status + " user=" + userId);
    return;
  }

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

    // ── fase de observacao: mede e registra, nunca barra ──
    const cabecalho = req.headers.get("x-signature") ?? "";
    const requestId = req.headers.get("x-request-id") ?? "";
    if (!WEBHOOK_SECRET) {
      console.warn("MP_WEBHOOK_SEM_SEGREDO topic=" + topic);
    } else if (!cabecalho) {
      console.warn("MP_WEBHOOK_SEM_ASSINATURA topic=" + topic + " request_id=" + (requestId || "(ausente)"));
    } else {
      const partes = parseSignature(cabecalho);
      if (!partes) {
        console.warn("MP_WEBHOOK_ASSINATURA_ILEGIVEL topic=" + topic + " header=" + cabecalho.slice(0, 60));
      } else {
        const qual = await conferir(id, requestId, partes.ts, partes.v1);
        if (qual) console.log("MP_WEBHOOK_ASSINATURA_OK template=" + qual + " topic=" + topic);
        else console.warn("MP_WEBHOOK_ASSINATURA_DIVERGENTE topic=" + topic + " request_id=" + requestId + " — nenhum template bateu; a notificacao SEGUIU processada de proposito");
      }
    }

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
