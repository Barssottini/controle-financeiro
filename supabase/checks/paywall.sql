-- ══════════════════════════════════════════════════════════════════════════
-- North Finances — diagnóstico do paywall
-- Projeto: uipywjbcjzhqueyrfwef (barssottini-financas)
-- Rodar no SQL Editor do Supabase. Tudo aqui é leitura e agregado —
-- nenhuma consulta lê conteúdo de usuário.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. A PERGUNTA CENTRAL ────────────────────────────────────────────────
-- O cliente libera acesso quando NÃO existe linha em subscriptions
-- (subAccess: `if(!sub) return {ok:true}`). Se alguém ficou sem linha,
-- essa conta nunca vai ser cobrada e nunca vai ver o paywall.
select
  (select count(*) from auth.users where deleted_at is null)          as usuarios,
  (select count(*) from public.subscriptions)                          as com_assinatura,
  (select count(*) from auth.users u
     where u.deleted_at is null
       and not exists (select 1 from public.subscriptions s
                        where s.user_id = u.id))                       as SEM_LINHA_acesso_livre;
-- Se SEM_LINHA_acesso_livre > 0, essas contas usam o app de graça, para sempre.


-- ── 2. QUEM SÃO, E HÁ QUANTO TEMPO ───────────────────────────────────────
select u.id, u.created_at, u.last_sign_in_at,
       date_part('day', now() - u.created_at)::int as dias_de_conta
from auth.users u
where u.deleted_at is null
  and not exists (select 1 from public.subscriptions s where s.user_id = u.id)
order by u.created_at;


-- ── 3. EXISTE GATILHO CRIANDO A LINHA NO CADASTRO? ───────────────────────
-- Se não houver nada aqui, a linha depende de alguém chamá-la — e toda conta
-- criada fora desse caminho entra sem assinatura.
select t.tgname as gatilho,
       c.relname as tabela,
       n.nspname as schema,
       p.proname as funcao,
       t.tgenabled as habilitado
from pg_trigger t
join pg_class c    on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p     on p.oid = t.tgfoid
where not t.tgisinternal
  and (c.relname in ('users','subscriptions') or p.proname ilike '%subscription%');


-- ── 4. RLS: O USUÁRIO CONSEGUE SE PROMOVER A "ACTIVE"? ───────────────────
-- Esta é a mais importante das quatro. O paywall é client-side: ele só
-- esconde a div #app. A defesa real é o banco. Se houver policy de UPDATE
-- em subscriptions para o próprio dono da linha, qualquer usuário troca
-- status para 'active' pelo console do navegador e assina de graça.
select tablename,
       rowsecurity as rls_ligado
from pg_tables
where schemaname = 'public'
  and tablename in ('subscriptions','user_data','active_sessions','email_prefs','account_deletion');

select tablename, policyname, cmd as operacao, roles, qual as condicao_leitura, with_check as condicao_escrita
from pg_policies
where schemaname = 'public'
  and tablename = 'subscriptions'
order by cmd, policyname;
-- ESPERADO: SELECT liberado para o dono; INSERT/UPDATE/DELETE para NINGUÉM
-- além do service_role (só as edge functions escrevem, com a chave de serviço).


-- ── 5. FOTO DA RECEITA ───────────────────────────────────────────────────
select status,
       count(*) as contas,
       count(*) filter (where trial_ends_at < now())        as teste_vencido,
       count(*) filter (where current_period_end < now())   as periodo_vencido
from public.subscriptions
group by status
order by contas desc;


-- ── 6. TRIAL VENCIDO MAS AINDA ENTRANDO ──────────────────────────────────
-- Deveriam estar batendo no paywall. Se estão com last_sign_in recente,
-- ou o fail-open de rede está soltando, ou o gate não está pegando.
select s.status,
       count(*) as contas,
       count(*) filter (where u.last_sign_in_at > now() - interval '7 days') as logaram_na_semana
from public.subscriptions s
join auth.users u on u.id = s.user_id
where s.status = 'trialing'
  and s.trial_ends_at < now()
group by s.status;
