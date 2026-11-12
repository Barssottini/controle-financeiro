import type { AccountPlan } from "./account-plan.ts";

export function mensagemAssinatura(plano: AccountPlan | null, valorCentavos: number | null) {
  const nome = plano?.name ?? "North Finances";
  const valor = valorCentavos !== null && Number.isSafeInteger(valorCentavos) && valorCentavos > 0
    ? `, de <b style="color:#faf9f7">${(valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</b>` : "";
  const recursos = plano?.accountType === "pj"
    ? "✓ Faturamento, custos e lucro<br>✓ Contas a pagar e a receber<br>✓ Relatório mensal para o contador<br>✓ App para Windows"
    : plano?.accountType === "pf"
    ? "✓ Carteira de investimentos<br>✓ Contas a pagar e a receber<br>✓ Mais de uma conta, separada por banco"
    : "Consulte os detalhes da assinatura em Configurações → Assinatura.";
  const subject = `Assinatura confirmada — ${nome}`;
  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 0;font-family:'Segoe UI',system-ui,Arial,sans-serif"><tr><td align="center"><table width="460" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden"><tr><td style="height:3px;background:#c8903a"></td></tr><tr><td style="padding:36px 40px 8px;text-align:center"><div style="font-size:22px;font-weight:800;color:#faf9f7">North <span style="color:#c8903a">Finances</span></div></td></tr><tr><td style="padding:16px 40px 4px;text-align:center"><div style="font-size:19px;font-weight:700;color:#faf9f7;margin-bottom:8px">Assinatura confirmada</div><div style="font-size:13px;line-height:1.7;color:#b5afa9">Sua assinatura do ${nome}${valor} está ativa. Sem fidelidade: cancele quando quiser em Configurações → Assinatura.</div></td></tr><tr><td style="padding:24px 40px;font-size:13px;color:#b5afa9;line-height:1.9">${recursos}</td></tr><tr><td style="padding:8px 40px 24px;text-align:center"><a href="https://app.northfinances.com.br/" style="display:inline-block;background:#c8903a;color:#0d0d0d;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px">Abrir o North</a></td></tr><tr><td style="padding:0 40px 32px;text-align:center;border-top:1px solid #262626"><div style="font-size:11px;color:#b5afa9;line-height:1.6;margin-top:16px">Dúvidas? Responda este e-mail ou escreva para suporte@northfinances.com.br<br>North Finances</div></td></tr></table></td></tr></table>`;
  return { subject, html };
}
