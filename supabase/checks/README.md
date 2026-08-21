# Conferências no banco

Consultas de diagnóstico para rodar no SQL Editor do Supabase
(projeto `uipywjbcjzhqueyrfwef`). Todas são **somente leitura e agregadas** —
nenhuma lê conteúdo de usuário. E nem conseguiriam: o conteúdo está cifrado.

## `paywall.sql`

Responde quatro perguntas que o código do cliente não consegue responder sozinho.

A mais importante é a **seção 4, sobre RLS**. O paywall é inteiramente
client-side — `showPaywall()` apenas esconde a div `#app`. Quem defende a receita
de verdade é o Postgres. Se existir policy de `UPDATE` em `subscriptions` para o
dono da linha, qualquer pessoa troca `status` para `active` pelo console do
navegador e assina de graça.

O esperado:

| Operação | Quem pode |
|---|---|
| `SELECT` | o dono da linha |
| `INSERT` / `UPDATE` / `DELETE` | apenas `service_role` — só as edge functions escrevem |

As outras seções contam quantas contas existem sem linha em `subscriptions` (que
nunca veem o paywall, por causa do fail-open em `subAccess`), se existe gatilho
criando a linha no cadastro, e quantos testes vencidos continuam entrando.

## Por que isto é um arquivo e não uma conversa

Porque a resposta muda com o tempo e a pergunta não. Rodar de novo depois de
mexer em policy ou em fluxo de cadastro custa dez segundos, e a alternativa é
redescobrir a dúvida do zero daqui a três meses.
