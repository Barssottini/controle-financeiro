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

const ms = (v?: string | null): number => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
};

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
    const { data: sub } = await admin.from("subscriptions")
      .select("mp_preapproval_id,current_period_end,trial_ends_at")
      .eq("user_id", user.id).single();

    // Cancela a recorrencia no Mercado Pago. A resposta traz next_payment_date,
    // que e a data ate a qual o mes ja pago vale — melhor fonte que qualquer
    // calculo local.
    let mpNextPayment: string | null = null;
    if (sub?.mp_preapproval_id && MP_TOKEN) {
      try {
        const r = await fetch(`https://api.mercadopago.com/preapproval/${sub.mp_preapproval_id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        const pa = await r.json().catch(() => null);
        // Conferir a resposta e o que separa "cancelado" de "achamos que cancelou".
        // Antes desta guarda, um 400 ou 401 do Mercado Pago virava "Assinatura
        // cancelada" na tela enquanto a cobranca seguia todo mes — e sem caminho de
        // volta, porque o app ja se considerava cancelado e nem oferecia o botao.
        // Falhar em voz alta e melhor: a pessoa tenta de novo e o dinheiro para.
        const jaEstavaCancelado = r.status === 404 || (pa && pa.status === "cancelled");
        if (!r.ok && !jaEstavaCancelado) {
          console.error("CANCEL_SUB_MP_RECUSOU", r.status, "user=", user.id, "resp=", JSON.stringify(pa));
          return json({ error: "mp_cancel_failed", detail: pa }, 502);
        }
        if (pa && typeof pa.next_payment_date === "string") mpNextPayment = pa.next_payment_date;
      } catch (e) {
        // Nao alcancar o Mercado Pago tambem nao autoriza gravar "cancelado".
        console.error("CANCEL_SUB: falha ao cancelar no Mercado Pago", String(e));
        return json({ error: "mp_unreachable" }, 502);
      }
    }

    // QUEM PAGOU O MES, USA O MES.
    //
    // O acesso de cortesia depois do cancelamento depende de current_period_end
    // estar no futuro (ver subAccess no app). Antes de 24/08/2026 esta funcao
    // gravava so o status e deixava o campo como estava — o que funcionava na
    // pratica, porque create-subscription e mp-webhook ja o preenchiam, mas
    // deixava a garantia na mao de outro codigo. Se por qualquer motivo o campo
    // estivesse vazio, alguem que pagou perderia o acesso no instante do clique,
    // logo depois de ler na tela que manteria.
    //
    // Agora a garantia e desta funcao: fica a data mais distante entre o que ja
    // havia, o next_payment_date do Mercado Pago e o fim do teste. Nunca encurta
    // o que o usuario ja tinha.
    const candidatos = [ms(sub?.current_period_end), ms(mpNextPayment), ms(sub?.trial_ends_at)];
    const maior = Math.max(...candidatos);

    const patch: Record<string, unknown> = { status: "canceled" };
    if (maior > Date.now()) patch.current_period_end = new Date(maior).toISOString();

    await admin.from("subscriptions").update(patch).eq("user_id", user.id);
    return json({ ok: true, access_until: patch.current_period_end ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
