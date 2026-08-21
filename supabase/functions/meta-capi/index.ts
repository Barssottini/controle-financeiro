// meta-capi — Conversions API da Meta, server-side.
//
// POR QUE ESTA FUNCAO EXISTE
// O plano de marketing precisa medir se o anuncio virou teste gratis. O jeito
// obvio seria colar o Pixel no app, e ele foi recusado por dois motivos:
//
//   1. A CSP do app so existe para travar exfiltracao. Num app E2EE, um XSS le a
//      chave-mestra da memoria; a unica barreira restante e o allowlist de
//      connect-src (THREAT_MODEL, item 2). Liberar graph.facebook.com abriria
//      exatamente esse canal.
//   2. Os termos declaram a Meta como subprocessador "apenas no site
//      institucional". Pixel no app contradiz o proprio texto legal.
//
// Aqui o navegador do usuario fala SO com o dominio da Supabase, que a CSP ja
// permite. Quem fala com a Meta e este servidor. O token de acesso nunca chega
// ao cliente e nenhum cookie da Meta e gravado no dominio do app.
//
// LIMITE HONESTO: isto continua enviando um e-mail (com hash) para a Meta. E
// menos dado e menos rastreio que o Pixel, mas nao e zero — os termos precisam
// dizer isso antes de a funcao entrar em producao. Ver README.md desta pasta.
//
// Segredos esperados (supabase secrets set):
//   META_PIXEL_ID     id do pixel (o mesmo do site: 2612957169101239)
//   META_CAPI_TOKEN   token de acesso da Conversions API
//   META_TEST_CODE    opcional; enquanto estiver definido os eventos chegam como
//                     teste no Events Manager e NAO contam para a otimizacao.

const GRAPH_VERSION = 'v21.0';

const ALLOWED_ORIGINS = [
  'https://app.northfinances.com.br',
  'https://northfinances.com.br',
];

// Eventos que esta funcao aceita. Lista fechada de proposito: um cliente
// adulterado nao consegue inventar evento para sujar a otimizacao da campanha.
const ALLOWED_EVENTS = new Set(['StartTrial', 'Subscribe']);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// A Meta exige o e-mail normalizado (minusculas, sem espaco nas pontas) antes do
// hash. Hash de e-mail nao normalizado simplesmente nao casa com ninguem.
function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

// Pega o IP real do cliente. O x-forwarded-for pode vir com varios saltos; o
// primeiro e o do usuario.
function clientIp(req: Request): string | undefined {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') || undefined;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const pixelId = Deno.env.get('META_PIXEL_ID');
  const capiToken = Deno.env.get('META_CAPI_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  // Sem segredo configurado a funcao vira no-op silenciosa, de proposito: ela
  // roda no caminho do cadastro e nao pode derrubar ninguem por falta de config.
  if (!pixelId || !capiToken) {
    return new Response(JSON.stringify({ ok: true, skipped: 'not_configured' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── Autenticacao: so usuario logado dispara evento ──
  // Sem isto, qualquer um na internet inflaria a conversao da campanha.
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || !supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let userEmail = '';
  try {
    const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: anonKey },
    });
    if (!who.ok) throw new Error('invalid token');
    const user = await who.json();
    userEmail = normalizeEmail(user?.email || '');
    if (!userEmail) throw new Error('no email');
  } catch {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const eventName = String(body.event || '');
  if (!ALLOWED_EVENTS.has(eventName)) {
    return new Response(JSON.stringify({ error: 'event_not_allowed' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // fbc/fbp vem do site institucional (onde o Pixel roda com consentimento) e
  // atravessa para o app na querystring do CTA. Sao eles que ligam a conversao
  // ao clique no anuncio.
  const fbc = typeof body.fbc === 'string' && body.fbc.length < 256 ? body.fbc : undefined;
  const fbp = typeof body.fbp === 'string' && body.fbp.length < 256 ? body.fbp : undefined;

  // CONSENTIMENTO, POR CONSTRUCAO.
  // Os cookies _fbc/_fbp so existem se o usuario aceitou o aviso no site — o
  // gate do Pixel nao carrega nada antes disso. Entao a presenca de um deles E
  // a evidencia de consentimento, e a ausencia dos dois significa "essa pessoa
  // nao autorizou medicao". Recusar aqui, e nao so no cliente, garante que
  // nenhum usuario que chegou direto no app (a maioria) seja informado a Meta.
  if (!fbc && !fbp) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_consent_signal' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // event_id deixa a Meta deduplicar caso o mesmo evento chegue duas vezes
  // (retry de rede, dois aparelhos). Derivado do usuario + evento, nao aleatorio.
  const eventId = await sha256Hex(`${userEmail}|${eventName}`);

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: 'https://app.northfinances.com.br/',
        user_data: {
          em: [await sha256Hex(userEmail)],
          client_ip_address: clientIp(req),
          client_user_agent: req.headers.get('user-agent') || undefined,
          fbc,
          fbp,
        },
      },
    ],
  };

  const testCode = Deno.env.get('META_TEST_CODE');
  if (testCode) payload.test_event_code = testCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(capiToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Loga o codigo, nunca o payload — ele carrega hash de e-mail e IP.
      console.error('meta-capi: graph respondeu', res.status, out?.error?.code, out?.error?.message);
      return new Response(JSON.stringify({ ok: false, error: 'graph_error' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, received: out?.events_received ?? null }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('meta-capi: falha de rede ao chamar a Graph API');
    return new Response(JSON.stringify({ ok: false, error: 'network' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
