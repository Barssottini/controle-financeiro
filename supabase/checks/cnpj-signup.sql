-- Exercita o trigger real sem deixar contas nem dados de teste; não envia e-mail.
begin;
do $$
declare
  v_id uuid; v_bad text; v_type text; v_cnpj text;
begin
  if not private.cnpj_valid('11222333000181')
    or not private.cnpj_valid('12ABC34501DE35')
    or not private.cnpj_valid('00000000E08G12') then
    raise exception 'CNPJ válido recusado';
  end if;
  foreach v_bad in array array[null, '', '00000000000000', '11111111111111', '12ABC34501DE34', '11222333000180', '11!222333000181'] loop
    if private.cnpj_valid(v_bad) then raise exception 'CNPJ inválido aceito'; end if;
    begin
      insert into auth.users(id, raw_user_meta_data) values (gen_random_uuid(), jsonb_build_object('account_type','pj','cnpj',v_bad));
      raise exception 'Cadastro PJ sem CNPJ válido foi aceito';
    exception when invalid_parameter_value then
      if sqlerrm <> 'valid_cnpj_required' then raise; end if;
    end;
  end loop;
  begin
    insert into auth.users(id, raw_user_meta_data) values (gen_random_uuid(), '{}'::jsonb);
    raise exception 'Cadastro sem tipo foi aceito';
  exception when invalid_parameter_value then
    if sqlerrm <> 'invalid_account_type' then raise; end if;
  end;
  foreach v_type in array array['pf','pj'] loop
    v_id := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v_id, jsonb_build_object('account_type',v_type,'cnpj','12.abc.345/01de-35'));
    select cnpj into v_cnpj from public.account_profiles where user_id = v_id;
    if (v_type = 'pj' and v_cnpj is distinct from '12ABC34501DE35')
      or (v_type = 'pf' and v_cnpj is not null) then raise exception 'CNPJ persistido incorretamente'; end if;
    update auth.users set raw_user_meta_data = '{"account_type":"pf","cnpj":"00000000000000"}'::jsonb where id = v_id;
    if not exists(select 1 from public.account_profiles where user_id=v_id and account_type=v_type and cnpj is not distinct from v_cnpj) then
      raise exception 'Metadata alterou perfil canônico';
    end if;
  end loop;
  if has_table_privilege('anon','public.account_profiles','select')
    or has_table_privilege('authenticated','public.account_profiles','insert')
    or has_table_privilege('authenticated','public.account_profiles','update') then raise exception 'Permissões indevidas'; end if;
end;
$$;
rollback;
select 'CNPJ: formatos numérico/alfanumérico, rejeições, cadastro PF/PJ, metadata e permissões verificados; dados de teste revertidos.' as resultado;
