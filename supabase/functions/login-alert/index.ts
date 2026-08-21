import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function deviceLabel(ua: string): string {
  if (/NorthApp|Electron/i.test(ua)) return "Aplicativo North Finances (desktop)";
  if (/Android/i.test(ua)) return "Navegador (Android)";
  if (/iPhone|iPad/i.test(ua)) return "Navegador (iPhone/iPad)";
  if (/Windows/i.test(ua)) return "Navegador (Windows)";
  if (/Macintosh|Mac OS/i.test(ua)) return "Navegador (Mac)";
  if (/Linux/i.test(ua)) return "Navegador (Linux)";
  return "Dispositivo não identificado";
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user?.email) return json({ error: "unauthorized" }, 401);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "missing_resend_api_key" }, 500);

    let device = "";
    try {
      const body = await req.json();
      device = String(body?.device ?? "").slice(0, 300);
    } catch { /* body opcional */ }
    if (!device) device = req.headers.get("user-agent") ?? "";

    // NOTA (21/08/2026): o ip vem de um header e e interpolado cru no HTML abaixo.
    // Nao e vetor real — o destinatario e o proprio dono da conta, entao a unica
    // injecao possivel e no proprio e-mail de quem tentou. Ainda assim, escapar
    // seria o certo se este texto algum dia for para outro lugar.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "não identificado";
    const when = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo",
    }).format(new Date());

    // Link "Não fui eu" — token de uso único, expira em 48h; se falhar, o e-mail sai sem o botão
    let panicUrl = "";
    try {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error: insErr } = await admin.from("panic_tokens").insert({
        user_id: user.id,
        token_hash: await sha256hex(token),
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      });
      if (!insErr) panicUrl = `https://app.northfinances.com.br/#panic=${token}`;
    } catch { /* segue sem botão */ }

    const row = (label: string, value: string) =>
      `<tr><td style="padding:7px 0;font-size:13px;color:#6b6560;white-space:nowrap">${label}</td><td style="padding:7px 0 7px 18px;font-size:13px;color:#faf9f7;font-weight:600" align="right">${value}</td></tr>`;

    const panicText = panicUrl
      ? `<b style="color:#faf9f7">Não foi você?</b> Toque no botão vermelho abaixo: desconectamos todos os dispositivos e bloqueamos a senha atual na hora. Depois é só criar uma senha nova com o código de 6 dígitos que chega neste e-mail.`
      : `<b style="color:#faf9f7">Não reconhece este acesso?</b> Troque sua senha imediatamente e encerre a sessão em todos os dispositivos (Configurações → Dispositivos conectados).`;
    const panicBtn = panicUrl
      ? `<tr><td style="padding:6px 40px 4px;text-align:center"><a href="${panicUrl}" style="display:inline-block;background:#8f2b25;color:#faf9f7;font-size:13px;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:10px">🚨 Não fui eu — proteger minha conta</a><div style="font-size:11px;color:#6b6560;line-height:1.6;margin-top:8px">Link de uso único · expira em 48 horas</div></td></tr>`
      : "";

    const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 0;font-family:'Segoe UI',system-ui,Arial,sans-serif"><tr><td align="center"><table width="460" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden"><tr><td style="height:3px;background:#c8903a"></td></tr><tr><td style="padding:36px 40px 8px;text-align:center"><div style="font-size:22px;font-weight:800;letter-spacing:-.5px;color:#faf9f7">North<span style="color:#c8903a">Finances</span></div></td></tr><tr><td style="padding:16px 40px 8px;text-align:center"><div style="font-size:19px;font-weight:700;color:#faf9f7;margin-bottom:8px">🔐 Novo login na sua conta</div><div style="font-size:13px;line-height:1.6;color:#b5afa9">Detectamos um acesso à sua conta agora há pouco. Confira os detalhes:</div></td></tr><tr><td style="padding:14px 40px 6px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #262626;border-bottom:1px solid #262626">${row("Data e hora", when + " (Brasília)")}${row("Dispositivo", deviceLabel(device))}${row("Endereço IP", ip)}</table></td></tr><tr><td style="padding:18px 40px 10px;text-align:center"><div style="font-size:13px;line-height:1.7;color:#b5afa9"><b style="color:#faf9f7">Foi você?</b> Pode ignorar este e-mail.<br>${panicText}</div></td></tr>${panicBtn}<tr><td style="padding:16px 40px 30px;text-align:center"><a href="https://app.northfinances.com.br/" style="display:inline-block;background:#c8903a;color:#0d0d0d;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px">Abrir o North Finances</a></td></tr><tr><td style="padding:0 40px 32px;text-align:center;border-top:1px solid #262626"><div style="font-size:11px;color:#6b6560;line-height:1.6;margin-top:16px">E-mail automático de segurança · North Finances · Encontre seu norte financeiro</div></td></tr></table></td></tr></table>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "North Finances <nao-responda@northfinances.com.br>",
        to: [user.email],
        subject: "🔐 Novo login na sua conta North Finances",
        html,
      }),
    });
    if (!r.ok) return json({ error: "resend_failed", detail: await r.text() }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
