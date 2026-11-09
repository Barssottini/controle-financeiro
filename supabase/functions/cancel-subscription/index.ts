// Aposentada em 09/11/2026: cancelar a assinatura do Pro passou para o portal do
// Stripe (stripe-portal). Continua publicada respondendo 410 para uma aba antiga do
// app receber um erro claro em vez de mexer na tabela subscriptions.
// O codigo do Mercado Pago esta no historico do git (antes do commit que trouxe isto).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ error: "mercado_pago_desativado" }), {
    status: 410,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
