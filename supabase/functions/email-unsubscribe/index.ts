import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Descadastro do lembrete mensal. O token (unsub_token) e a autenticacao:
// e um UUID aleatorio, unico por usuario, impossivel de adivinhar. Chamado
// direto pelo link no e-mail (GET do navegador) ou pelo one-click do Gmail (POST).
function page(title: string, msg: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — North Finances</title><style>body{margin:0;background:#0d0d0d;color:#faf9f7;font-family:'Segoe UI',system-ui,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{max-width:420px;text-align:center;background:#141414;border:1px solid #262626;border-radius:16px;padding:40px 32px}.top{height:3px;background:#c8903a;border-radius:3px;width:60px;margin:0 auto 22px}.b{font-size:20px;font-weight:800}.b span{color:#c8903a}h1{font-size:18px;margin:16px 0 10px;color:#faf9f7}p{color:#b5afa9;font-size:14px;line-height:1.65}a{display:inline-block;margin-top:22px;background:#c8903a;color:#0d0d0d;font-weight:700;text-decoration:none;padding:11px 24px;border-radius:10px}</style></head><body><div class="card"><div class="top"></div><div class="b">North<span> Finances</span></div><h1>${title}</h1><p>${msg}</p><a href="https://app.northfinances.com.br/">Abrir o North Finances</a></div></body></html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") || "";
  const html = (title: string, msg: string, status = 200) =>
    new Response(page(title, msg), { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  const expired = () => req.method === "POST"
    ? new Response("ok")
    : html("Link expirado", "Este link não é mais válido. Se quiser, ajuste os lembretes por e-mail nas Configurações do app.");
  try {
    if (!UUID_RE.test(token)) return expired();
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.from("email_prefs")
      .update({ monthly_statement: false, updated_at: new Date().toISOString() })
      .eq("unsub_token", token)
      .select("user_id");
    if (error) throw error;
    if (req.method === "POST") return new Response("ok"); // Gmail one-click
    if (!data || data.length === 0) return expired();
    return html("Pronto, você foi descadastrado", "Você não vai mais receber o lembrete mensal de exportar o extrato. Pode reativar quando quiser em Configurações → Notificações por e-mail.");
  } catch (e) {
    console.error("UNSUB_ERROR", String(e));
    if (req.method === "POST") return new Response("ok");
    return html("Ops", "Não conseguimos concluir agora. Você pode desligar o lembrete direto nas Configurações do app.", 500);
  }
});
