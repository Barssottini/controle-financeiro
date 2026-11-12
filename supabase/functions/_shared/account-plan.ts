export type AccountType = "pf" | "pj";
export type AccountPlan = {
  accountType: AccountType;
  name: string;
  unitAmount: number;
  priceEnv: string;
};

// O tipo vem de account_profiles, nunca do corpo do pedido ou de user_metadata.
export function planoDaConta(accountType: unknown): AccountPlan | null {
  if (accountType === "pf") return { accountType, name: "North Pessoal Pro", unitAmount: 1990, priceEnv: "STRIPE_PRICE_ID" };
  if (accountType === "pj") return { accountType, name: "North Empresarial", unitAmount: 4990, priceEnv: "STRIPE_BUSINESS_PRICE_ID" };
  return null;
}

export function precoConfere(plano: AccountPlan, preco: {
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
}): boolean {
  return preco.active && preco.currency === "brl" && preco.unit_amount === plano.unitAmount
    && preco.recurring?.interval === "month" && preco.recurring.interval_count === 1;
}
