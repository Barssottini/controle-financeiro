# Liberação de assinaturas — 13/11/2026

Autorizado pelo responsável: liberar Pessoal Pro a R$ 19,90/mês e Empresarial
Pro a R$ 49,90/mês, preservando o Free, os testes grátis e os acessos concedidos.

## Verificação realizada

- O endpoint de checkout ainda respondeu HTTP 503 `pagamento_nao_configurado`.
- A configuração anterior bloqueava a chave de teste apenas pelo cabeçalho Origin.
- Produção agora exige chave `sk_live_` ou `rk_live_`, independentemente do Origin.
- Checkout confere modalidade canônica, moeda BRL, periodicidade mensal e valor.
- Webhook recusa eventos de teste e retorna erro quando a gravação falha,
  permitindo o reenvio pelo Stripe.
- Contas com Pro concedido não abrem uma nova cobrança.
- Não há clientes/assinaturas Stripe referenciados na tabela subscriptions;
  não foi necessário apagar ou alterar registros de assinaturas de teste.
- Nenhuma cobrança real foi feita. A validação automatizada usa mocks.

## Configuração externa pendente

No Stripe **em produção**, confirmar `charges_enabled`, pendências da conta,
produtos e preços mensais ativos em BRL:

| Variável no Supabase | Conteúdo |
| --- | --- |
| STRIPE_SECRET_KEY | Chave secreta/restrita live com acesso necessário a clientes, preços, Checkout, assinaturas e portal |
| STRIPE_PRICE_ID | Preço mensal Pessoal: 1990 centavos |
| STRIPE_BUSINESS_PRICE_ID | Preço mensal Empresarial: 4990 centavos |
| STRIPE_WEBHOOK_SECRET | Segredo do endpoint **live** abaixo |
| APP_URL | https://app.northfinances.com.br/ |

Guardar os segredos diretamente em Supabase → Edge Functions → Secrets.
Não colocar chaves no código, em commits ou em mensagens.

Webhook de produção (eventos snapshot):
`https://uipywjbcjzhqueyrfwef.supabase.co/functions/v1/stripe-webhook`

Eventos: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.
O endpoint usa assinatura Stripe e mantém `verify_jwt=false`; checkout/portal
mantêm autenticação Supabase. Configurar o portal para atualização do cartão,
faturas e cancelamento no fim do período. Não oferecer troca entre PF e PJ.

Antes da liberação pública: validar Checkout PF/PJ e portal, confirmar o endpoint
e entregas do webhook no Stripe e executar os testes de cobrança em sandbox
isolada. Não usar cartão real para teste em produção.

## Textos prontos para a publicação após a validação live

- Site Pessoal: “Pro por R$ 19,90/mês, com contratação pelo aplicativo.
  Crie sua conta e experimente por 7 dias, sem cartão. Depois do teste,
  continue no Free ou assine o Pro.”
- Site Empresarial: mesma mensagem com R$ 49,90/mês.
- Página de preços: retirar a pausa da descrição SEO e dos avisos; manter
  os preços e os links de cadastro separados por modalidade.
- Termos: substituir o aviso atual de contratação pausada por
  “Assinaturas disponíveis pelo aplicativo, com pagamento processado pelo
  Stripe. Nenhuma cobrança começa sem sua contratação e autorização.
  Sem assinatura, a conta continua no plano Free.”
- Atualizar revisão, histórico e TERMOS_RESUMO; sincronizar termos do site
  pelo script sync-termos.ps1 e publicar os dois repositórios.

Os avisos de pausa permanecem publicados até a configuração externa ser
confirmada. Ativar a conta no painel Stripe não troca as chaves do Supabase.
