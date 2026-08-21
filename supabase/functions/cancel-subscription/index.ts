import { createClient } from "jsr:@supabase/supabase-js@2";

// O token vem SO do ambiente. Ate 21/08/2026 havia um token de teste do Mercado
// Pago escrito aqui — terceira copia do mesmo literal, junto com create-subscription
// e mp-webhook. Removido nas tres.
const MP_TOKEN_CORRETO = Deno.env.get("MP_ACCESS_TOKEN");
const MP_TOKEN_TYPO = Deno.env.get("MP_ACESS_TOKEN");
const MP_TOKEN = MP_TOKEN_CORRETO ?? MP_TOKEN_TYPO ?? "";

if (!MP_TOKEN) {
  console.error("CANCEL_SUB: nenhum token definido (nem MP_ACCESS_TOKEN nem MP_ACESS_TOKEN). O cancelamento no Mercado Pago sera pulado.");
} else if (!MP_TOKEN_CORRETO) {
  console.warn("CANCEL_SUB: em uso o nome com erro de digitacao MP_ACESS_TOKEN. Renomeie o segredo para MP_ACCESS_TOKEN e remova o fallback.");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("subscriptions").select("mp_preapproval_id").eq("user_id", user.id).single();

    if (sub?.mp_preapproval_id && MP_TOKEN) {
      await fetch(`https://api.mercadopago.com/preapproval/${sub.mp_preapproval_id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
    }

    // NOTA (21/08/2026): aqui existe um defeito conhecido, deixado de proposito para
    // decisao. So o status e gravado; current_period_end nao. Em subAccess, 'canceled'
    // so mantem o acesso de cortesia enquanto current_period_end estiver no futuro —
    // entao quem cancela DURANTE o teste gratis, que nunca teve esse campo, perde o
    // acesso na hora, logo depois de ler "voce continua com acesso ate o fim do
    // periodo ja pago". A correcao seria preencher current_period_end com o que for
    // maior entre ele mesmo e trial_ends_at. Mexer em regra de cobranca sem aval
    // explicito seria pior que o bug.
    await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", user.id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
