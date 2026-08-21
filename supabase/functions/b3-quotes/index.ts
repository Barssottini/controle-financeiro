// Cotações da B3 via Yahoo Finance (server-side, sem token) para o North Finances.
// verify_jwt: só usuários autenticados do app conseguem chamar.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let tickers: unknown[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.tickers)) tickers = body.tickers;
  } catch (_) { /* corpo vazio ou inválido → lista vazia */ }

  // sanitiza: só A-Z/0-9, tamanho de ticker da B3, máx. 20 por chamada
  const list = [...new Set(
    tickers.map((t) => String(t).toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter((t) => t.length >= 4 && t.length <= 8),
  )].slice(0, 20);

  const out: Record<string, number> = {};
  await Promise.all(list.map(async (t) => {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${t}.SA?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
      );
      const d = await r.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof p === 'number' && p > 0) out[t] = p;
    } catch (_) { /* ticker falhou — simplesmente não entra na resposta */ }
  }));

  return new Response(JSON.stringify(out), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
