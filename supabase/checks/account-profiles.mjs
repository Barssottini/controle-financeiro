// Postgres real em WASM, descartável. Não conecta nem escreve no Supabase.
// npm install --prefix <pasta-temporaria> @electric-sql/pglite@0.5.16
// node supabase/checks/account-profiles.mjs <pasta-temporaria>
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.argv[2] || '.', 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const migration = readFileSync(new URL('../migrations/20261112175535_account_profiles_immutable.sql', import.meta.url), 'utf8');
let checked = 0;
const ok = (condition, message) => { assert(condition, message); checked++; };
async function rejected(sql, code) {
  await db.exec('savepoint denial');
  let caught;
  try { await db.exec(sql); } catch (error) { caught = error; }
  await db.exec('rollback to savepoint denial; release savepoint denial');
  ok(caught?.code === code, `${sql}: esperado ${code}, recebido ${caught?.code}`);
}
async function asUser(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id || '']);
  await db.exec('set local role authenticated');
}
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated, anon, service_role;
  `);
  await db.exec(migration);
  await db.exec('begin');
  const pessoal = randomUUID(), empresa = randomUUID(), legado = randomUUID();
  await db.query("insert into auth.users values ($1, '{\"account_type\":\"pf\"}'), ($2, '{\"account_type\":\"pj\"}'), ($3, '{}')", [pessoal, empresa, legado]);
  ok(await scalar('select count(*) from public.account_profiles') === 2, 'trigger registra somente tipos válidos');
  await db.query("update auth.users set raw_user_meta_data = '{\"account_type\":\"pj\"}' where id = $1", [pessoal]);
  await asUser(pessoal);
  ok(await scalar('select count(*) from public.account_profiles') === 1, 'RLS isola contas');
  ok(await scalar('select account_type from public.account_profiles') === 'pf', 'metadata editável não altera tipo');
  ok(await scalar("select public.register_account_type('pj')") === 'pf', 'RPC não converte conta existente');
  await rejected("update public.account_profiles set account_type = 'pj'", '42501');
  await rejected('delete from public.account_profiles', '42501');
  await rejected(`insert into public.account_profiles(user_id, account_type) values ('${legado}', 'pj')`, '42501');
  await rejected("select public.register_account_type('admin')", '22023');
  await rejected('select public.register_account_type(null)', '22023');
  await asUser(legado);
  ok(await scalar("select public.register_account_type('pj')") === 'pj', 'migração registra o tipo já decifrado');
  ok(await scalar("select public.register_account_type('pf')") === 'pj', 'segunda gravação retorna primeiro valor');
  await asUser(null);
  await rejected("select public.register_account_type('pj')", '42501');
  await asUser(randomUUID());
  await rejected("select public.register_account_type('pf')", '42501');
  await db.exec('reset role; set local role anon');
  await rejected('select * from public.account_profiles', '42501');
  await rejected("select public.register_account_type('pf')", '42501');
  await db.exec('reset role');
  await rejected(`update public.account_profiles set account_type = 'pf' where user_id = '${empresa}'`, '23514');
  await db.query('delete from auth.users where id = $1', [empresa]);
  ok(await scalar(`select count(*) from public.account_profiles where user_id = '${empresa}'`) === 0, 'exclusão Auth remove perfil por cascade');
  await db.exec('rollback');
  ok(await scalar('select count(*) from public.account_profiles') === 0, 'fixtures revertidas');
  console.log(`ACCOUNT PROFILES — ${checked} verificações passaram (Postgres local descartável; sem alteração em produção).`);
} finally { await db.close(); }
