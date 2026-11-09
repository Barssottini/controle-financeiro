// Aposentada em 09/11/2026: o pagamento do Pro passou para o Stripe (stripe-webhook).
// Responde 200 sem processar nada. Assim o Mercado Pago para de reenviar, e um aviso
// atrasado — por exemplo, o cancelamento da assinatura de teste antiga, ligada a uma
// conta cortesia — nao muda mais o acesso de ninguem na tabela subscriptions.
// O codigo do Mercado Pago esta no historico do git (antes do commit que trouxe isto).
Deno.serve(() => new Response("ok"));
