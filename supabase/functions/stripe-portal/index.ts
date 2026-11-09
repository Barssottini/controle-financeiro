import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";

// Portal do Stripe: cancelar (vale no fim do periodo pago), trocar cartao, faturas.
// O resultado volta para a tabela pelo stripe-webhook, nao por aqui.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.northfinances.com.br/";
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
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin.from("subscriptions")
      .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!row?.stripe_customer_id) return json({ error: "sem_assinatura_stripe" }, 404);

    const s = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: APP_URL });
    return json({ url: s.url });
  } catch (e) {
    console.error("STRIPE_PORTAL_ERRO", String(e));
    return json({ error: "erro_no_portal" }, 500);
  }
});
