# Backend (Supabase)

Projeto: `uipywjbcjzhqueyrfwef` (barssottini-financas, região sa-east-1 / São Paulo).

> ⚠️ **Dívida conhecida.** Até agosto de 2026 as edge functions existiam **apenas
> implantadas** — não havia fonte em lugar nenhum. Cinco funções sustentam o
> produto pago (`create-subscription`, `cancel-subscription`, `request-deletion`,
> `login-alert`, `b3-quotes`) e nenhuma delas podia ser revisada, versionada ou
> reimplantada em caso de perda. `meta-capi` é a primeira a nascer versionada.
> **As outras cinco precisam ser trazidas para cá** — `supabase functions download <nome>`
> resolve, e é rápido.

## Funções

| Função | O que faz | Fonte aqui? |
|---|---|---|
| `create-subscription` | Cria a assinatura no Mercado Pago (token de cartão ou checkout) | ❌ só implantada |
| `cancel-subscription` | Cancela a assinatura, mantendo acesso até o fim do período | ❌ só implantada |
| `request-deletion` | Abre a carência de 15 dias para exclusão de conta | ❌ só implantada |
| `login-alert` | E-mail de alerta de login novo (via Resend) | ❌ só implantada |
| `b3-quotes` | Cotações de ativos da B3 para a carteira | ❌ só implantada |
| `meta-capi` | Conversions API da Meta, server-side | ✅ |

## Implantar

```bash
supabase functions deploy meta-capi --project-ref uipywjbcjzhqueyrfwef
```

## Segredos do `meta-capi`

```bash
supabase secrets set META_PIXEL_ID=2612957169101239 --project-ref uipywjbcjzhqueyrfwef
supabase secrets set META_CAPI_TOKEN=<token da Conversions API> --project-ref uipywjbcjzhqueyrfwef
# Enquanto estiver testando (os eventos não contam para a otimização):
supabase secrets set META_TEST_CODE=<código do Events Manager> --project-ref uipywjbcjzhqueyrfwef
```

Sem `META_PIXEL_ID` e `META_CAPI_TOKEN` definidos a função vira no-op silenciosa e
devolve `{ok:true, skipped:'not_configured'}`. Isso é de propósito: ela roda no
caminho do cadastro e não pode derrubar ninguém por falta de configuração.

O token é o mesmo tipo de segredo que a chave do Mercado Pago — nunca no cliente,
nunca commitado.

## Antes de ligar em produção: os termos precisam mudar

O `termos.html` diz hoje que a Meta recebe dados **"apenas no site institucional
(northfinances.com.br)"**. Com o `meta-capi` ativo isso deixa de ser verdade: o
app passa a enviar à Meta um **e-mail com hash**, o IP e o user-agent, no momento
em que o teste grátis começa.

É bem menos que o Pixel faria (nenhum script da Meta roda no app, nenhum cookie é
gravado no domínio do app, e a Meta não vê navegação alguma dentro do produto) —
mas não é nada. O manual de marca é explícito: *"Admita a limitação. É o que torna
o resto crível."* Publicar a função sem corrigir os termos repete exatamente o
problema que a revisão de agosto apontou.

**Redação sugerida** para substituir a linha da Meta na lista de subprocessadores:

> **Meta (Facebook/Instagram)** — medição de publicidade, e **somente se você
> aceitou o aviso de cookies** no site northfinances.com.br. No site, a medição é
> por cookie. No aplicativo não há cookie nem script da Meta: se você chegou pelo
> site tendo aceitado o aviso, no momento em que o teste grátis começa o nosso
> servidor informa à Meta que houve um cadastro, enviando o seu e-mail de forma
> embaralhada (hash), o endereço IP e o navegador usado. Quem entra direto no
> aplicativo, ou recusou o aviso, não é informado à Meta em momento nenhum. A
> Meta não recebe nenhum dado financeiro seu e não tem acesso ao conteúdo do
> aplicativo.

O consentimento não depende de disciplina de quem escreve o código: os cookies
`_fbc`/`_fbp` só existem depois do aceite, e tanto o cliente quanto a função
recusam disparar sem pelo menos um deles.

## Como a atribuição funciona

1. O anúncio leva a `northfinances.com.br?fbclid=…` — o Pixel roda ali, sob consentimento.
2. O site guarda `fbc`/`fbp` e os repassa na querystring do CTA para `app.northfinances.com.br`.
3. O app guarda os dois no `localStorage` no primeiro carregamento e limpa a URL.
4. Quando o teste grátis começa, o app chama `meta-capi` (domínio da Supabase, já
   liberado na CSP) e o servidor envia o evento `StartTrial` à Meta.

Sem `fbc`/`fbp` o evento ainda é enviado, mas casa só pelo hash do e-mail — a
qualidade da atribuição cai. Por isso o passo 2 importa.
