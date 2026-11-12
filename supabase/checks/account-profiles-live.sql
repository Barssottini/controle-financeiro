-- Diagnóstico somente leitura. Rodar após aplicar a migração no projeto correto.
select c.relrowsecurity as rls_ativa
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'account_profiles';

select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'account_profiles'
  and grantee in ('anon', 'authenticated', 'service_role') order by grantee, privilege_type;
-- Esperado: SELECT para authenticated e service_role; nenhuma escrita.

select policyname, cmd, roles, qual from pg_policies
where schemaname = 'public' and tablename = 'account_profiles';
-- Esperado: SELECT authenticated usando auth.uid() = user_id.

select n.nspname as schema, p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('register_account_type', 'account_profile_on_signup', 'account_profile_immutable')
  and n.nspname in ('public', 'private');
-- Esperado: RPC pública invoker, helper privado definer, search_path vazio.

select
  has_function_privilege('anon', 'public.register_account_type(text)', 'execute') as anon_rpc,
  has_function_privilege('authenticated', 'public.register_account_type(text)', 'execute') as authenticated_rpc;
-- Esperado: false, true.

select account_type, count(*) as contas from public.account_profiles group by account_type;
select count(*) as contas_aguardando_migracao
from auth.users u left join public.account_profiles p on p.user_id = u.id where p.user_id is null;
