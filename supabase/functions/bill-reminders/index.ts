// APOSENTADA (2026-07-21). Com a criptografia client-side (E2E), o servidor nao le mais
// os dados do usuario (data.bills fica cifrado), entao nao ha como o servidor saber quais
// contas vencem. O lembrete de conta a pagar passou a ser SO no app (aviso no painel).
// Mantida como no-op para o caso do cron ainda disparar; pode ser removida quando o
// agendamento 'bill-reminders-daily' for apagado no painel do Supabase.
Deno.serve(() => new Response(JSON.stringify({ ok: true, retired: true }), {
  headers: { "Content-Type": "application/json" },
}));
