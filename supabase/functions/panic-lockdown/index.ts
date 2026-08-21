import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    let token = "";
    try {
      const body = await req.json();
      token = String(body?.token ?? "");
    } catch { /* sem body */ }
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "invalid_token" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const hash = await sha256hex(token);
    const { data: row, error: selErr } = await admin
      .from("panic_tokens")
      .select("id,user_id,expires_at,used_at")
      .eq("token_hash", hash)
      .maybeSingle();
    if (selErr) return json({ error: "lookup_failed" }, 500);
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      return json({ error: "invalid_token" }, 400);
    }

    // 1) Bloqueia a senha atual (aleatória — só o fluxo "Esqueci minha senha" recupera)
    const scramble = crypto.randomUUID() + crypto.randomUUID() + "!A9";
    const { error: upErr } = await admin.auth.admin.updateUserById(row.user_id, { password: scramble });
    if (upErr) return json({ error: "password_reset_failed" }, 500);

    // 2) Derruba todas as sessões e refresh tokens (logout global server-side)
    const { error: rpcErr } = await admin.rpc("revoke_user_sessions", { uid: row.user_id });
    if (rpcErr) return json({ error: "session_revoke_failed" }, 500);

    // 3) Invalida este e quaisquer outros links pendentes do mesmo usuário
    await admin.from("panic_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", row.user_id)
      .is("used_at", null);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
