// Aposentada em 09/11/2026: o pagamento do Pro passou para o Stripe (stripe-checkout).
// Continua publicada respondendo 410 para que uma aba antiga do app, ou alguem
// chamando direto, nao consiga abrir assinatura no Mercado Pago pelo preco antigo.
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
