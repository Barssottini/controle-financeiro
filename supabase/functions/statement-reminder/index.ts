import { createClient } from "jsr:@supabase/supabase-js@2";

// Roda 1x/mes (dia 1, 08:00 BRT) via pg_cron. Manda o lembrete de exportar o
// extrato SO para quem tem acesso ativo E nao desativou o lembrete. Dedup por
// email_prefs.last_sent (nao reenvia no mesmo mes). Link de descadastrar no rodape.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "North Finances <nao-responda@northfinances.com.br>";
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

function todayBRT(): { y: number; m: number } {
  const t = new Date(Date.now() - 3 * 3600 * 1000); // America/Sao_Paulo (UTC-3 fixo)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
}

function emailHtml(unsubUrl: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 0;font-family:'Segoe UI',system-ui,Arial,sans-serif"><tr><td align="center"><table width="460" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden"><tr><td style="height:3px;background:#c8903a"></td></tr><tr><td style="padding:36px 40px 8px;text-align:center"><div style="font-size:22px;font-weight:800;letter-spacing:-.5px;color:#faf9f7">North<span style="color:#c8903a">Finances</span></div></td></tr><tr><td style="padding:16px 40px 4px;text-align:center"><div style="font-size:19px;font-weight:700;color:#faf9f7;margin-bottom:8px">Começou o mês — hora de atualizar</div><div style="font-size:13px;line-height:1.7;color:#b5afa9">Acesse o app do seu banco, exporte o extrato em <b style="color:#faf9f7">OFX ou CSV</b> e importe no North Finances. Em poucos cliques suas transações do mês passado entram organizadas e categorizadas.</div></td></tr><tr><td style="padding:24px 40px 8px;text-align:center"><a href="https://app.northfinances.com.br/" style="display:inline-block;background:#c8903a;color:#0d0d0d;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px">Importar meu extrato</a></td></tr><tr><td style="padding:6px 40px 30px;text-align:center"><div style="font-size:12px;color:#6b6560;line-height:1.6">Nada se conecta ao seu banco — você exporta e importa só o que quiser.</div></td></tr><tr><td style="padding:0 40px 30px;text-align:center;border-top:1px solid #262626"><div style="font-size:11px;color:#6b6560;line-height:1.7;margin-top:16px">Você recebe este lembrete mensal porque tem uma conta ativa no North Finances.<br><a href="${unsubUrl}" style="color:#8a8378;text-decoration:underline">Não quero mais receber este lembrete</a> · ou desligue em Configurações → Notificações por e-mail.</div></td></tr></table></td></tr></table>`;
}

Deno.serve(async (_req) => {
  try {
    if (!RESEND_KEY) return json({ error: "no_resend_key" }, 500);
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { y, m } = todayBRT();
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const now = Date.now();

    const { data: subs, error } = await admin.from("subscriptions")
      .select("user_id,status,trial_ends_at,current_period_end");
    if (error) throw error;

    let sent = 0, skipped = 0;
    for (const s of subs ?? []) {
      const trialOk = s.status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now;
      const graceOk = s.status === "canceled" && s.current_period_end && new Date(s.current_period_end).getTime() > now;
      const active = s.status === "active" || trialOk || graceOk;
      if (!active) { skipped++; continue; }

      let { data: pref } = await admin.from("email_prefs")
        .select("monthly_statement,unsub_token,last_sent").eq("user_id", s.user_id).maybeSingle();
      if (!pref) {
        const ins = await admin.from("email_prefs").insert({ user_id: s.user_id })
          .select("monthly_statement,unsub_token,last_sent").single();
        pref = ins.data;
      }
      if (!pref || pref.monthly_statement === false) { skipped++; continue; }
      if (pref.last_sent === month) { skipped++; continue; } // ja enviado este mes

      const { data: u } = await admin.auth.admin.getUserById(s.user_id);
      const email = u?.user?.email;
      if (!email) { skipped++; continue; }

      const unsubUrl = `${SUPABASE_URL}/functions/v1/email-unsubscribe?t=${pref.unsub_token}`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [email],
          subject: "Lembrete: exporte seu extrato do mês",
          html: emailHtml(unsubUrl),
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      if (!r.ok) { console.error("RESEND_ERR", r.status, await r.text()); skipped++; continue; }
      await admin.from("email_prefs").update({ last_sent: month, updated_at: new Date().toISOString() })
        .eq("user_id", s.user_id);
      sent++;
    }
    return json({ ok: true, month, sent, skipped });
  } catch (e) {
    console.error("FN_ERROR", String(e));
    return json({ error: String(e) }, 500);
  }
});
