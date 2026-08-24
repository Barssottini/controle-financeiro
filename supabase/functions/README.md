# Edge functions

Fonte das funções de servidor do North Finances, projeto Supabase
`uipywjbcjzhqueyrfwef` (região sa-east-1 / São Paulo).

> **Por que isto passou a existir em 21/08/2026.** Até essa data as funções
> existiam **apenas implantadas**. Não havia fonte no repositório nem no disco —
> não dava para revisar, versionar nem reimplantar em caso de perda. E o claim
> "código aberto — qualquer um pode auditar" só era verdade para o cliente: o
> servidor que cria a assinatura do usuário ninguém podia ler.

## Inventário

| Função | JWT | O que faz |
|---|---|---|
| `create-subscription` | exige | Cria a assinatura no Mercado Pago (token de cartão ou checkout hospedado) |
| `cancel-subscription` | exige | Cancela no Mercado Pago e marca a assinatura como cancelada |
| `mp-webhook` | **público** | Recebe a notificação do Mercado Pago e sincroniza o status |
| `panic-lockdown` | **público** | Botão "não fui eu": embaralha a senha e derruba todas as sessões |
| `email-unsubscribe` | **público** | Descadastro do lembrete mensal, inclusive one-click do Gmail |
| `notify-migrate` | **público** | Aposentada. One-off de migração, hoje no-op |
| `login-alert` | exige | E-mail de alerta de login novo, com link de pânico de uso único |
| `b3-quotes` | exige | Cotações da B3 via Yahoo Finance, para a carteira |
| `statement-reminder` | exige | Lembrete mensal de exportar o extrato (cron, dia 1) |
| `request-deletion` | exige | Abre a carência de 15 dias para exclusão de conta |
| `purge-deleted-accounts` | exige | Apaga definitivamente as contas vencidas (cron diário) |
| `bill-reminders` | exige | Aposentada. O aviso de vencimento passou a ser no app |
| `meta-capi` | exige | Conversions API da Meta — fonte no branch `meta-capi` |

"Público" significa `verify_jwt: false`. Nenhuma delas fica sem autenticação por
isso: `mp-webhook` é chamada pelo Mercado Pago, `panic-lockdown` e
`email-unsubscribe` autenticam pelo token que recebem no corpo ou na querystring.

## Nenhum segredo aqui dentro

Todas leem credencial de variável de ambiente. Isso passou a ser verdade em
21/08/2026: até então, `create-subscription`, `cancel-subscription` e
`mp-webhook` tinham **o mesmo token de teste do Mercado Pago escrito no código**,
como último recurso caso a variável faltasse. Foi removido nas três.

Sobrou uma herança: a cadeia lê `MP_ACCESS_TOKEN` e, se não achar,
`MP_ACESS_TOKEN` — sem o C. Alguém errou o nome do segredo e, em vez de corrigir,
empilhou o nome errado no fallback. As três funções agora avisam nos logs qual
nome respondeu; quando isso ficar claro, renomeie o segredo e remova a cadeia.

## Implantar

```bash
supabase functions deploy <nome> --project-ref uipywjbcjzhqueyrfwef
```

## Pendências conhecidas

1. **`mp-webhook` não verifica a assinatura do webhook.** Qualquer um pode
   chamá-lo e forçar re-sincronizações — e disparar e-mails de boas-vindas. O
   conteúdo não é forjável, porque a função consulta o Mercado Pago antes de
   gravar; ninguém se autopromove a pagante. Mas é vetor de abuso.
2. **`bill-reminders` e `notify-migrate` são no-op.** Podem ser removidas de vez,
   junto com o agendamento `bill-reminders-daily` no painel.
3. **`purge-deleted-accounts` tem uma lista fixa de tabelas.** Tabela nova com
   `user_id` que não entre nela deixa dado de conta excluída para trás.

## Quem pagou o mês, usa o mês

Decisão do Pedro em 24/08/2026, agora garantida no código.

O acesso de cortesia depois de um cancelamento depende de `current_period_end`
estar no futuro — é o que o `subAccess` do app consulta. Antes, `cancel-subscription`
e `request-deletion` gravavam só o `status` e deixavam esse campo como estava.
Na prática funcionava, porque `create-subscription` e `mp-webhook` já o
preenchiam, e o botão de cancelar só aparece para quem está `active`. Mas a
garantia morava em outro arquivo.

Agora as duas calculam o campo elas mesmas: fica a data mais distante entre o que
já havia, o `next_payment_date` que o Mercado Pago devolve no cancelamento, e o
fim do teste. **Nunca encurta o que o usuário já tinha.**

No `request-deletion` isso importa por um caminho fácil de esquecer: quem pede
exclusão e depois clica em "Quero reativar minha conta" voltava com status
`canceled` e, sem o campo, caía direto no paywall — mesmo tendo pago o mês.
