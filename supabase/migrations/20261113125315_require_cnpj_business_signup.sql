-- CNPJ é cadastro operacional, não um dado financeiro. RLS e grants existentes
-- continuam permitindo apenas a leitura pelo titular, sem escrita pelo cliente.
alter table public.account_profiles add column cnpj text;

create function private.cnpj_valid(p_cnpj text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  v_sum integer; v_weight integer; v_remainder integer; v_digit integer;
  i integer; n integer;
begin
  if p_cnpj is null or p_cnpj !~ '^[A-Z0-9]{12}[0-9]{2}$'
    or p_cnpj ~ '^([0-9])\1{13}$' then return false; end if;
  for n in 12..13 loop
    v_sum := 0; v_weight := 2;
    for i in reverse n..1 loop
      v_sum := v_sum + (ascii(substr(p_cnpj, i, 1)) - 48) * v_weight;
      v_weight := case when v_weight = 9 then 2 else v_weight + 1 end;
    end loop;
    v_remainder := v_sum % 11;
    v_digit := case when v_remainder < 2 then 0 else 11 - v_remainder end;
    if v_digit <> substr(p_cnpj, n + 1, 1)::integer then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.cnpj_valid(text) from public, anon, authenticated, service_role;

-- NULL preserva contas anteriores, cujo CNPJ nunca foi solicitado.
alter table public.account_profiles add constraint account_profiles_cnpj_valid
  check (cnpj is null or (account_type = 'pj' and private.cnpj_valid(cnpj)));

create or replace function private.account_profile_on_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_account_type text := new.raw_user_meta_data ->> 'account_type';
  v_cnpj text;
begin
  -- Novas contas sempre escolhem um tipo. Não deixar omitir o tipo para
  -- contornar a validação e registrar PJ pelo RPC de migração posteriormente.
  if v_account_type is null or v_account_type not in ('pf', 'pj') then
    raise exception 'invalid_account_type' using errcode = '22023';
  end if;
  if v_account_type = 'pj' then
    v_cnpj := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'cnpj', ''), '[./[:space:]-]', '', 'g'));
    if not private.cnpj_valid(v_cnpj) then
      raise exception 'valid_cnpj_required' using errcode = '22023';
    end if;
  end if;
  -- Captura única no cadastro; mudanças posteriores no metadata não modificam
  -- o perfil canônico. Metadata nunca participa de autorização/RLS.
  insert into public.account_profiles(user_id, account_type, cnpj)
    values (new.id, v_account_type, v_cnpj);
  return new;
end;
$$;
revoke all on function private.account_profile_on_signup() from public, anon, authenticated, service_role;

comment on table public.account_profiles is
  'Cadastro operacional: tipo imutável pf/pj e CNPJ obrigatório em novas contas PJ. Sem dados financeiros. Contas legadas podem ter CNPJ nulo.';
comment on column public.account_profiles.cnpj is
  'CNPJ normalizado de 14 caracteres. Formato e dígitos verificados; não comprova situação fiscal nem titularidade.';
