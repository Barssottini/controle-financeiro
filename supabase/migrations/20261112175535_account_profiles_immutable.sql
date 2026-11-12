-- O tipo da conta é informação operacional, separado dos dados financeiros cifrados.
-- Contas anteriores só são migradas depois que o cliente abre suas preferências.
-- Não atribuir pf a todas as contas existentes: isso converteria empresas por engano.
create schema if not exists private;

create table public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('pf', 'pj')),
  created_at timestamptz not null default now()
);

alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public, anon, authenticated, service_role;
grant select on public.account_profiles to authenticated, service_role;
create policy account_profiles_select_own on public.account_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

-- O cliente não ganha INSERT/UPDATE/DELETE. A única entrada recebe apenas o tipo,
-- obtém o usuário da sessão e devolve o valor canônico se ele já estiver registrado.
create function private.register_account_type(p_account_type text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_account_type text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_account_type is null or p_account_type not in ('pf', 'pj') then
    raise exception 'invalid_account_type' using errcode = '22023';
  end if;
  -- Serializa duas primeiras gravações simultâneas do mesmo usuário.
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  insert into public.account_profiles(user_id, account_type)
    values (v_user_id, p_account_type) on conflict (user_id) do nothing;
  select account_type into strict v_account_type
    from public.account_profiles where user_id = v_user_id;
  return v_account_type;
end;
$$;
revoke all on function private.register_account_type(text) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.register_account_type(text) to authenticated;

-- A API pública é invoker; o código privilegiado fica no schema não exposto.
create function public.register_account_type(p_account_type text)
returns text language sql security invoker set search_path = '' as $$
  select private.register_account_type(p_account_type);
$$;
revoke all on function public.register_account_type(text) from public, anon, authenticated, service_role;
grant execute on function public.register_account_type(text) to authenticated;

create function private.account_profile_on_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account_type text := new.raw_user_meta_data ->> 'account_type';
begin
  -- O valor é escolhido no cadastro e copiado uma única vez. Mudanças posteriores
  -- em user_metadata NÃO alteram o perfil nem são usadas para autorização.
  if v_account_type in ('pf', 'pj') then
    insert into public.account_profiles(user_id, account_type)
      values (new.id, v_account_type) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.account_profile_on_signup() from public, anon, authenticated, service_role;
create trigger north_account_profile_on_signup after insert on auth.users
  for each row execute function private.account_profile_on_signup();

create function private.account_profile_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id or new.account_type is distinct from old.account_type then
    raise exception 'account_type_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.account_profile_immutable() from public, anon, authenticated, service_role;
create trigger north_account_profile_immutable before update on public.account_profiles
  for each row execute function private.account_profile_immutable();

comment on table public.account_profiles is
  'Tipo operacional imutável: pf=Pessoal, pj=Empresarial. Sem CPF/CNPJ ou dados financeiros.';
