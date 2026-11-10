#!/usr/bin/env node
// Confere a sincronizacao com a nuvem usando o bloco REAL do index.html (de
// "// ═══ SINCRONIA ═══" ate "// ═══ FIM DA SINCRONIA ═══"). Dois aparelhos falam
// com uma nuvem falsa que se comporta como a tabela user_data: a gravacao so vale
// se a versao (updated_at) for a que o aparelho conhece. O que importa: nenhum
// lancamento some, nenhum lado "vence" por inteiro, e o que nao subiu por falta de
// conexao continua marcado ate subir.
//
// Rodar:  node verificar-sincronia.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const ini = t.indexOf('// ═══ SINCRONIA ═══'), fim = t.indexOf('// ═══ FIM DA SINCRONIA ═══');
if (ini < 0 || fim < 0) { console.error('nao achei o bloco SINCRONIA no index.html'); process.exit(2); }
const BLOCO = t.slice(ini, fim);

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo + (ok ? '' : '\n        esperado: ' + JSON.stringify(esperado) + '\n        obtido:   ' + JSON.stringify(obtido)));
}

// ── nuvem falsa: uma linha, versao trocada a cada gravacao que acerta a versao ──
function novaNuvem(estado) {
  return { seq: 0, linha: { user_id: 'u', enc_data: { ct: JSON.stringify(estado) }, updated_at: 'v0' } };
}
function sbFalso(nuvem, ctl) {
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }) },
    from() {
      const q = { modo: null, dados: null, filtros: [] };
      const exec = async () => {
        if (ctl.offline) throw new Error('sem conexao');
        await new Promise(r => setImmediate(r));
        const l = nuvem.linha, casa = l && q.filtros.every(([c, v]) => String(l[c]) === String(v));
        if (q.modo === 'select') return { data: casa ? { enc_data: l.enc_data, updated_at: l.updated_at } : null, error: null };
        if (q.modo === 'update') {
          if (ctl.antesDeGravar) { const f = ctl.antesDeGravar; ctl.antesDeGravar = null; f(); }
          if (!casa) return { data: [], error: null };
          l.enc_data = q.dados.enc_data; l.updated_at = 'v' + (++nuvem.seq);
          return { data: [{ updated_at: l.updated_at }], error: null };
        }
        throw new Error('modo nao previsto: ' + q.modo);
      };
      const b = {
        select() { if (!q.modo) q.modo = 'select'; return b; },
        update(d) { q.modo = 'update'; q.dados = d; return b; },
        insert(d) { q.modo = 'insert'; q.dados = d; return b; },
        eq(c, v) { q.filtros.push([c, v]); return b; },
        maybeSingle: () => exec(),
        then: (ok, erro) => exec().then(ok, erro),
      };
      return b;
    },
  };
}

// ── um aparelho: o bloco real, com o estado e o localStorage dele ──
function aparelho(nuvem, nome) {
  const loja = new Map();
  const ctl = { offline: false, antesDeGravar: null, ilegivel: false, agendou: 0, novaTentativa: 0 };
  const S = { settings: {}, transactions: [], ccItems: [], investments: [], goals: [], budgets: [], bills: [], recurring: [], accounts: [], devedores: [] };
  const amb = {
    sb: sbFalso(nuvem, ctl), S, _mk: {}, cloudReady: true,
    nfEnc: async (mk, txt) => ({ ct: txt }),
    nfDec: async (mk, b) => { if (ctl.ilegivel) throw new Error('chave errada'); return b.ct; },
    setSync: () => {},
    applyCloud: d => { for (const k of Object.keys(S)) if (k !== 'settings') S[k] = d[k] || []; S.settings = { ...S.settings, ...(d.settings || {}) }; },
    renderContaSwitch: () => {}, showPage: () => {},
    scheduleCloudSave: () => { ctl.agendou++; },
    localStorage: { getItem: k => (loja.has(k) ? loja.get(k) : null), setItem: (k, v) => loja.set(k, String(v)), removeItem: k => loja.delete(k) },
    document: { querySelector: () => null, addEventListener: () => {}, visibilityState: 'visible' },
    window: { addEventListener: () => {} },
    setTimeout: () => { ctl.novaTentativa++; return 0; }, clearTimeout: () => {},
  };
  const nomes = Object.keys(amb);
  const api = new Function(...nomes, BLOCO + '\nreturn {cloudSaveNow,marcarSujo,estaSujo,guardarBase,mesclar3,juntarComNuvem,_igual};')(...nomes.map(n => amb[n]));
  // abrir o app com a nuvem ja lida: estado da nuvem + base + versao (o que o loadCloud faz)
  const abrir = () => { const d = JSON.parse(nuvem.linha.enc_data.ct); amb.applyCloud(d); api.guardarBase(nuvem.linha.enc_data.ct, nuvem.linha.updated_at); };
  // mudanca feita pela pessoa: e o que o _guardar faz depois de gravar no aparelho
  const muda = f => { f(S); api.marcarSujo(); };
  return { S, ctl, api, abrir, muda, nome };
}
const tx = (id, desc, valor) => ({ id, description: desc, amount: valor, type: 'expense' });
const nuvemDe = n => JSON.parse(n.linha.enc_data.ct);
const ids = lista => lista.map(x => x.id);

(async () => {
  // 1. Os dois aparelhos mexem; ninguem perde nada.
  const n = novaNuvem({ settings: { tema: 'claro' }, transactions: [tx(1, 'Aluguel', 1150), tx(2, 'Internet', 99.9)] });
  const A = aparelho(n, 'A'), B = aparelho(n, 'B');
  A.abrir(); B.abrir();
  A.muda(S => S.transactions.push(tx(3, 'Mercado', 200)));
  await A.api.cloudSaveNow();
  checa('A grava e a nuvem tem o lancamento novo', ids(nuvemDe(n).transactions), [1, 2, 3]);
  checa('A fica sem pendencia', A.api.estaSujo(), false);
  B.muda(S => S.transactions.push(tx(4, 'Farmacia', 65)));
  await B.api.cloudSaveNow();
  checa('B (desatualizado) grava sem apagar o de A', ids(nuvemDe(n).transactions), [1, 2, 3, 4]);
  checa('B passa a ver o lancamento de A', ids(B.S.transactions), [1, 2, 3, 4]);

  // 2. Edicao de um lado e exclusao do outro, em itens diferentes: as duas valem.
  A.muda(S => { S.transactions[0] = { ...S.transactions[0], amount: 1200 }; });
  await A.api.cloudSaveNow();
  B.muda(S => { S.transactions = S.transactions.filter(x => x.id !== 2); });
  await B.api.cloudSaveNow();
  const n2 = nuvemDe(n);
  checa('exclusao de B vale', ids(n2.transactions), [1, 3, 4]);
  checa('edicao de A no aluguel sobreviveu', n2.transactions[0].amount, 1200);

  // 3. Configuracoes diferentes mudadas em cada aparelho: as duas ficam.
  A.muda(S => { S.settings = { ...S.settings, tema: 'escuro' }; });
  await A.api.cloudSaveNow();
  B.muda(S => { S.settings = { ...S.settings, chartPeriod: '12' }; });
  await B.api.cloudSaveNow();
  checa('tema de A e periodo de B convivem', [nuvemDe(n).settings.tema, nuvemDe(n).settings.chartPeriod], ['escuro', '12']);

  // 4. Sem conexao: a alteracao fica marcada, tenta de novo, e sobe junto com o que mudou no outro.
  A.ctl.offline = true;
  A.muda(S => S.transactions.push(tx(5, 'Cinema', 58)));
  await A.api.cloudSaveNow();
  checa('sem conexao: continua pendente no aparelho', A.api.estaSujo(), true);
  checa('e agenda nova tentativa sozinho', A.ctl.novaTentativa > 0, true);
  B.muda(S => { S.transactions = S.transactions.map(x => (x.id === 3 ? { ...x, amount: 210 } : x)); });
  await B.api.cloudSaveNow();
  A.ctl.offline = false;
  await A.api.cloudSaveNow();
  const n4 = nuvemDe(n);
  checa('conexao voltou: o lancamento feito offline subiu', ids(n4.transactions).includes(5), true);
  checa('e a edicao de B no mercado nao foi desfeita', n4.transactions.find(x => x.id === 3).amount, 210);
  checa('pendencia resolvida', A.api.estaSujo(), false);

  // 5. Mudanca feita enquanto o envio esta em andamento nao se perde.
  A.ctl.antesDeGravar = () => A.muda(S => S.transactions.push(tx(6, 'Padaria', 12)));
  A.muda(S => S.transactions.push(tx(7, 'Uber', 30)));
  const agendouAntes = A.ctl.agendou;
  await A.api.cloudSaveNow();
  checa('o que foi feito durante o envio continua pendente', A.api.estaSujo(), true);
  checa('e outro envio e agendado', A.ctl.agendou > agendouAntes, true);
  await A.api.cloudSaveNow();
  checa('no envio seguinte ele sobe', ids(nuvemDe(n).transactions).includes(6), true);
  checa('e a pendencia acaba', A.api.estaSujo(), false);

  // 6. O mesmo id criado nos dois aparelhos (id e "o maior + 1"): os dois itens ficam.
  A.muda(S => S.bills.push({ id: 50, name: 'Luz', amount: 120 }));
  await A.api.cloudSaveNow();
  B.muda(S => S.bills.push({ id: 50, name: 'Agua', amount: 80 }));
  await B.api.cloudSaveNow();
  const contas6 = nuvemDe(n).bills;
  checa('Luz e Agua estao na nuvem', contas6.map(b => b.name).sort(), ['Agua', 'Luz']);
  checa('com ids diferentes', new Set(contas6.map(b => b.id)).size, 2);

  // 7. O mesmo lancamento mudado nos dois (A desatualizado, B ja gravou): na juncao,
  // vale o do aparelho em uso — o que esta gravando agora.
  B.muda(S => { S.transactions = S.transactions.map(x => (x.id === 4 ? { ...x, description: 'Farmacia B' } : x)); });
  await B.api.cloudSaveNow();
  A.muda(S => { S.transactions = S.transactions.map(x => (x.id === 4 ? { ...x, description: 'Farmacia A' } : x)); });
  await A.api.cloudSaveNow();
  checa('conflito no mesmo item: vale o aparelho em uso', (nuvemDe(n).transactions.find(x => x.id === 4) || {}).description, 'Farmacia A');
  checa('e o resto do que B fez continua', ids(nuvemDe(n).transactions).includes(5) && nuvemDe(n).bills.length === 2, true);

  // 8. A nuvem mudou para algo que este aparelho nao consegue abrir (outra chave):
  // nunca e sobrescrita.
  B.muda(S => S.transactions.push(tx(9, 'Livro', 45)));
  await B.api.cloudSaveNow();
  const antes = n.linha.enc_data.ct;
  A.ctl.ilegivel = true;
  A.muda(S => S.transactions.push(tx(8, 'Teste', 1)));
  await A.api.cloudSaveNow();
  checa('nuvem ilegivel nao e sobrescrita', n.linha.enc_data.ct, antes);
  checa('e a alteracao continua guardada no aparelho', A.api.estaSujo(), true);

  // 9. Juncao pura: casos de borda.
  const C = aparelho(novaNuvem({}), 'C').api;
  const base = { settings: { a: 1 }, transactions: [tx(1, 'x', 1)] };
  checa('nada mudou: fica igual', C._igual(C.mesclar3(base, base, base), C.mesclar3(base, base, base)) && C.mesclar3(base, base, base).transactions.length === 1, true);
  checa('chaves em outra ordem nao contam como mudanca', C._igual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  const apagadoLaMudadoAqui = C.mesclar3(base, { settings: { a: 1 }, transactions: [tx(1, 'x', 5)] }, { settings: { a: 1 }, transactions: [] });
  checa('apagado na nuvem mas mudado aqui: fica (nao se perde dado)', apagadoLaMudadoAqui.transactions.map(x => x.amount), [5]);
  const apagadoAquiMudadoLa = C.mesclar3(base, { settings: { a: 1 }, transactions: [] }, { settings: { a: 1 }, transactions: [tx(1, 'x', 9)] });
  checa('apagado aqui mas mudado na nuvem: fica a versao da nuvem', apagadoAquiMudadoLa.transactions.map(x => x.amount), [9]);
  const contas9 = C.mesclar3({ accounts: [{ id: 1, nome: 'Nubank' }] }, { accounts: [{ id: 1, nome: 'Nubank' }, { id: 7, nome: 'Itaú' }] }, { accounts: [{ id: 1, nome: 'Nubank' }, { id: 9, nome: 'Carteira' }] });
  checa('ordem das contas: a da nuvem primeiro, as novas daqui depois (a primeira conta e a padrao)', contas9.accounts.map(c => c.nome), ['Nubank', 'Carteira', 'Itaú']);

  // 10. Quem me deve: lista nova, sincroniza como as outras, e nuvem antiga (sem a lista) nao apaga nada.
  const n10 = novaNuvem({ transactions: [tx(1, 'x', 1)] });
  const D = aparelho(n10, 'D'), E = aparelho(n10, 'E');
  D.abrir(); E.abrir();
  D.muda(S => { S.devedores = [...(S.devedores || []), { id: 1, pessoa: 'João', valor: 50, recebido: 0 }]; });
  await D.api.cloudSaveNow();
  E.muda(S => { S.devedores = [...(S.devedores || []), { id: 2, pessoa: 'Ana', valor: 30, recebido: 0 }]; });
  await E.api.cloudSaveNow();
  checa('quem me deve: o registro de cada aparelho fica na nuvem', (nuvemDe(n10).devedores || []).map(d => d.pessoa).sort(), ['Ana', 'João']);
  checa('e o aparelho desatualizado passa a ver o do outro', (E.S.devedores || []).map(d => d.pessoa).sort(), ['Ana', 'João']);

  console.log('SINCRONIA — ' + (falhas ? falhas + ' FALHA(S)' : 'tudo bate'));
  console.log(L.join('\n'));
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('ERRO', e); process.exitCode = 2; });
