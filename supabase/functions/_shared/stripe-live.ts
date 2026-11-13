// Estas funções servem o North em produção. Testes automatizados usam mocks;
// pagamentos de teste devem ficar em um projeto/ambiente separado.
export function chaveStripeProducao(key: string | undefined): boolean {
  return /^(sk|rk)_live_/.test(key ?? "");
}
