import { createClient } from "jsr:@supabase/supabase-js@2";

// Roda 1x/dia (cron). Apaga DEFINITIVAMENTE as contas cujo pedido de exclusao tem mais
// de 15 dias: remove os dados (cifrados) de todas as tabelas e entao o usuario do Auth.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

// ATENCAO: esta lista precisa acompanhar o schema. Tabela nova com user_id que nao
// entre aqui deixa dado de conta excluida para tras — o que e problema de LGPD, nao
// so de arrumacao. Conferir contra o schema ao criar tabela.
const TABLES = ["user_data", "subscriptions", "active_sessions", "email_prefs", "panic_tokens", "bill_reminders_sent", "account_deletion"];

Deno.serve(async () => {
  try {
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cutoff = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
    const { data: rows, error } = await admin.from("account_deletion").select("user_id").lte("requested_at", cutoff);
    if (error) throw error;
    let deleted = 0;
    for (const r of rows ?? []) {
      const uid = (r as { user_id: string }).user_id;
      // remove dados de todas as tabelas publicas (cifrados ou nao) antes de apagar o usuario
      for (const t of TABLES) {
        try { await admin.from(t).delete().eq("user_id", uid); } catch (_e) { /* segue */ }
      }
      try { await admin.auth.admin.deleteUser(uid); deleted++; } catch (e) { console.error("DELETE_USER_FAIL", uid, String(e)); }
    }
    return json({ ok: true, deleted });
  } catch (e) {
    console.error("PURGE_ERROR", String(e));
    return json({ error: String(e) }, 500);
  }
});
