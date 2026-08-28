import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_TOKEN_CORRETO = Deno.env.get("MP_ACCESS_TOKEN");
const MP_TOKEN_TYPO = Deno.env.get("MP_ACESS_TOKEN");
const MP_TOKEN = MP_TOKEN_CORRETO ?? MP_TOKEN_TYPO ?? "";
if (!MP_TOKEN) console.error("MP_WEBHOOK: nenhum token definido.");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";

// ── VERIFICACAO DE ASSINATURA — ATIVA desde 28/08/2026 ──
//
// O MP assina as notificacoes com HMAC-SHA256 no cabecalho x-signature, no
// formato "ts=...,v1=...". A documentacao publica nao traz o template do
// manifesto assinado, entao ele foi determinado por observacao: a funcao passou
// por uma fase que so media, testando candidatos e registrando qual batia.
//
// Resultado, contra notificacoes reais de 28/08/2026:
//     id:<data.id em minusculas>;request-id:<x-request-id>;ts:<ts>;
// Confirmado nos DOIS canais que chegam aqui — o webhook configurado no painel
// e o notification_url que create-subscription manda em cada preapproval. Os
// dois assinam igual, o que nao era obvio.
//
// O que fazia o HMAC nunca bater ate entao nao era o template: era o segredo.
// O painel tem chaves separadas para teste e producao, e a de teste estava
// gravada em MP_WEBHOOK_SECRET enquanto o MP_ACCESS_TOKEN era de producao.
//
// Agora divergencia e motivo para RECUSAR. Duas notas sobre o desenho:
//
// - Segredo ausente NAO barra. Isso e erro de configuracao, nao trafego
//   suspeito, e barrar transformaria um deslize de deploy em renovacoes
//   perdidas em silencio — alguem pagando e perdendo acesso. Registra alto e
//   segue.
// - O corpo da notificacao nunca foi fonte de verdade: o status vem de uma
//   consulta NOSSA a API do MP (syncPreapproval). Por isso mesmo uma chamada
//   forjada nao conseguiria inventar um "active". A assinatura fecha a porta
//   antes disso, mas nao era a unica tranca.

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

// O template confirmado. A comparacao e em tempo constante (ver igual).
async function confere(id: string, requestId: string, ts: string, v1: string): Promise<boolean> {
  const manifesto = `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return igual(await hmacHex(WEBHOOK_SECRET, manifesto), v1.toLowerCase());
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

    const cabecalho = req.headers.get("x-signature") ?? "";
    const requestId = req.headers.get("x-request-id") ?? "";
    if (!WEBHOOK_SECRET) {
      console.error("MP_WEBHOOK_SEM_SEGREDO — defina MP_WEBHOOK_SECRET (chave de PRODUCAO do painel). topic=" + topic);
    } else {
      const partes = parseSignature(cabecalho);
      const ok = partes ? await confere(id, requestId, partes.ts, partes.v1) : false;
      if (!ok) {
        console.warn("MP_WEBHOOK_RECUSADO topic=" + topic + " request_id=" + (requestId || "(ausente)") +
          (cabecalho ? (partes ? " — assinatura nao confere" : " — cabecalho ilegivel") : " — sem x-signature"));
        return new Response("invalid signature", { status: 401 });
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
