# Tipo da conta e cobrança Empresarial

Implementação preparada em 12/11/2026. **Ainda não implantada no Supabase:** a conexão disponível nesta sessão não lista o projeto `uipywjbcjzhqueyrfwef`. As verificações de SQL foram executadas em Postgres local descartável, sem acesso a dados reais.

## Contrato com o app

- `public.account_profiles`: `user_id` (UUID, chave primária e referência a `auth.users`), `account_type` (`pf` ou `pj`) e `created_at`. Não contém CPF, CNPJ ou dados financeiros.
- O usuário pode ler apenas seu perfil. Não tem permissão de inserir, alterar ou apagar diretamente.
- Cadastro novo: `auth.signUp({..., options:{data:{account_type:'pf'|'pj'}}})`. O gatilho copia a escolha uma vez; editar `user_metadata` depois não muda o perfil.
- Conta existente: depois de abrir as preferências cifradas, chamar `rpc('register_account_type', {p_account_type:tipoExistente})`. Retorna a string canônica `pf` ou `pj`. Repetir com outro tipo mantém o primeiro valor.
- A RPC obtém o usuário da sessão; não recebe `user_id`. Um bloqueio da linha de Auth serializa as primeiras gravações simultâneas.
- Não preencher contas antigas em lote com `pf`: uma empresa existente poderia ser classificada incorretamente.

## Ordem de implantação

1. Restaurar acesso ao projeto correto e revisar os gatilhos/RLS atuais.
2. Aplicar `migrations/20261112175535_account_profiles_immutable.sql` como uma migração única. Não é um script para reaplicar sobre objetos já criados.
3. Executar `checks/account-profiles-live.sql` e os advisors de segurança do Supabase. A leitura e a RPC devem estar acessíveis com uma sessão autenticada, enquanto escrita direta permanece bloqueada.
4. Publicar o cliente que registra/lê o tipo somente após o schema estar disponível.
5. Implantar `stripe-checkout` e `stripe-webhook`, incluindo os dois arquivos de `_shared/`. O checkout recusa contratação sem perfil canônico; não há fallback para Pessoal.
6. Configurar preços de teste separados: `STRIPE_PRICE_ID` para Pessoal Pro (BRL, 1990 centavos/mês) e `STRIPE_BUSINESS_PRICE_ID` para Empresarial (BRL, 4990 centavos/mês). A função relê o preço no Stripe e verifica valor, moeda e recorrência mensal antes de criar checkout.
7. Validar ambos os planos em ambiente de teste. Não mudar para chaves/preços live antes da regularização do CNPJ e da liberação da cobrança.

O bloqueio existente de checkout no domínio de produção com chave `sk_test_` foi mantido. Produtos, preços e segredos do Stripe não foram criados nem alterados nesta entrega. O e-mail de assinatura usa o tipo canônico e o valor real retornado pelo Stripe; nenhum e-mail foi enviado nos testes.

## Verificações locais

```powershell
npm install --prefix "$env:TEMP\north-db-check" --no-audit --no-fund @electric-sql/pglite@0.5.16
node supabase/checks/account-profiles.mjs "$env:TEMP\north-db-check"
node supabase/checks/checkout-plan.mjs
node --experimental-strip-types verificar-stripe.mjs
```

Os testes SQL cobrem cadastro, migração, isolamento, imutabilidade, RPC sem sessão, acesso anônimo, exclusão em cascata e rollback das fixtures. O Postgres em WASM usa uma conexão: a concorrência real de duas sessões não foi reproduzida; a serialização usa `FOR UPDATE` na linha do usuário. Os testes do checkout simulam os serviços e não substituem uma compra de teste após a implantação.
