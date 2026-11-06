#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// FORMATO DE CRIPTOGRAFIA DO NORTH — v1
//
// Este arquivo tem dois donos:
//
//   1. O app web. Ele trava o formato contra deriva: se alguem mexer na
//      cifragem do index.html, os vetores abaixo param de abrir e o teste
//      acusa. Nao ha copia da logica aqui — as funcoes sao EXTRAIDAS do
//      index.html em tempo de execucao, igual ao verificar-importacao.js.
//
//   2. O app nativo (React Native), quando existir. O WebCrypto nao existe
//      no React Native, entao a derivacao de chave, o embrulho por senha e a
//      chave de recuperacao vao ser REESCRITOS sobre biblioteca nativa. Se o
//      formato nao sair identico, quem usa os dois perde os dados ao trocar
//      de aparelho — e descobre isso depois de ja ter perdido. Os vetores
//      abaixo sao o criterio de aceite: a implementacao nova passa quando
//      decifra estes bytes exatos, gerados pela implementacao web real.
//
// O FORMATO, em palavras:
//
//   Chave-mestra (MK)   AES-GCM 256 bits, aleatoria. Cifra o blob financeiro.
//                       Sobe ao servidor SO embrulhada, nunca em aberto.
//   Derivacao           PBKDF2-SHA256, 600.000 iteracoes, sal de 16 bytes,
//                       saida de 256 bits usada como chave AES-GCM.
//                         - pela senha:    material = bytes UTF-8 da senha
//                         - pela recovery: material = os 20 bytes CRUS
//                           (NAO a string com tracos que o usuario ve)
//   Embrulho / cifragem AES-GCM, IV de 12 bytes aleatorios, SEM AAD.
//                       Resultado {iv, ct}, os dois em base64 padrao.
//   Tag do GCM          vem ANEXADO ao fim do ct (convencao do WebCrypto).
//                       Biblioteca nativa que devolve o tag separado precisa
//                       concatenar — este e o erro mais provavel do port.
//   enc_meta            {v:1, iter, salt_pw, salt_rk, mk_pw:{iv,ct},
//                        mk_rk:{iv,ct}}
//   Recovery key        20 bytes aleatorios → base32 Crockford, alfabeto
//                       0123456789ABCDEFGHJKMNPQRSTVWXYZ (sem O/I/L), exibida
//                       em 8 grupos de 4. Na leitura: maiusculiza, O→0, I/L→1
//                       e descarta o resto.
//   Segredo de auth     Derivacao SEPARADA, que nao toca nos dados: sal =
//                       SHA-256("nf-auth-v1|" + e-mail em minusculas),
//                       PBKDF2-SHA256 600k, 256 bits, prefixo "nfa2_" +
//                       base64. E ISSO que vai ao Supabase como senha — a
//                       senha crua nunca sai do aparelho. Se o nativo errar
//                       aqui, o login falha (barulhento, nao perde dados).
//
// ARMADILHA DE DESEMPENHO: 600.000 iteracoes de PBKDF2 em JavaScript puro no
// celular levam dezenas de segundos. O port PRECISA de implementacao nativa
// (ex.: react-native-quick-crypto). Baixar as iteracoes "porque no celular
// demora" quebra a compatibilidade com todas as contas que ja existem.
//
// Rodar:  node verificar-cripto.js        (precisa de Node 18+)
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, 'index.html');
const t = fs.readFileSync(APP, 'utf8');

function fatia(de, ate) {
  const i = t.indexOf(de), j = t.indexOf(ate, i);
  if (i < 0 || j < 0) throw new Error('nao achei a ancora no index.html: ' + (i < 0 ? de : ate));
  return t.slice(i, j);
}

// Extrai as funcoes REAIS. Copiar a logica para ca faria o teste passar
// enquanto o app quebra, que e o oposto do que ele existe para fazer.
const src = fatia('const NF_KDF_ITER=', 'async function nfEstablishKey(') + '\n'
          + fatia('async function nfAuthSecretV(', '// Anti-downgrade') + '\n';

const mod = {};
new Function('module', 'localStorage', 'crypto', 'btoa', 'atob', 'TextEncoder', 'TextDecoder',
  src + '\nmodule.exports={_b64,_unb64,nfDeriveKey,nfUnwrap,nfDec,nfToB32,nfFromB32,nfAuthSecret,NF_KDF_ITER};'
)(mod, { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  crypto, btoa, atob, TextEncoder, TextDecoder);
const C = mod.exports;

// ─── Vetores gerados pela implementacao web real. NAO EDITAR A MAO. ────────
// Mudou de proposito? Regere com a implementacao nova e diga no commit por
// que o formato mudou e o que acontece com as contas que ja existem.
const V = {
  senha: 'Senha-De-Teste-2026!',
  email: 'Teste@Exemplo.com.BR',
  texto: '{"transacoes":[{"v":36.5,"d":"almoço","cat":"Alimentação"}]}',
  mk_raw_b64: 'AAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK+2vcTL0tk=',
  rk_bytes_b64: 'yMXCv7y5trOwraqnpKGem5iVko8=',
  rk_display: 'S32W-5FXW-Q6VB-7C5D-NAKT-98CY-KEC9-B4MF',
  meta: {
    v: 1, iter: 600000,
    salt_pw: 'AQIDBAUGBwgJCgsMDQ4PEA==',
    salt_rk: 'ZGVmZ2hpamtsbW5vcHFycw==',
    mk_pw: { iv: 'Hh8gISIjJCUmJygp', ct: 'JzXtZt6gPdm6MSbo1yP3JLLFkMUx55ki6zoYPTsW69xiL944HXhi0o7p+U9P1mKs' },
    mk_rk: { iv: 'PD0+P0BBQkNERUZH', ct: 'VFq4nSBJk9Ap4CFyRhgUSBZwO94BPXt0O+62NRXpT3etwL/8XMB4VzL8J1+3YeR+' },
  },
  blob: {
    iv: 'WltcXV5fYGFiY2Rl',
    ct: 'Q3QJeStKMO3g7mZJj3/GN+1fdz+PlqOwNTcHiwJQoOjYyxfLdDDBhMzO5I5q/A81otVfXlewBLo6wKUjAQXjjn5+GDR9+E2vb0se6TlUEA==',
  },
  auth_secret: 'nfa2_62KyszJRrrX4cPRR3b51OLh5epjat/9fVz1HsOLkptI=',
};

const L = [];
let falhas = 0;
function checa(rotulo, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + esperado); L.push('        obtido:   ' + obtido); }
}

// Um passo que estoura (tag do GCM nao bate, por exemplo) vira uma falha com
// nome e deixa o resto rodar. Sem isso, mudar as iteracoes derruba o script no
// meio e o relatorio some — o teste acusaria "operation failed" e nada mais.
async function passo(rotulo, fn) {
  try { return await fn(); }
  catch (e) { falhas++; L.push('  FALHOU  ' + rotulo + ' — ' + e.message); return null; }
}

(async () => {
  const b64 = C._b64, unb = C._unb64;

  // 1. Parametros do formato. Mudar qualquer um invalida as contas existentes.
  checa('PBKDF2 continua em 600.000 iteracoes', C.NF_KDF_ITER, 600000);
  checa('enc_meta continua na versao 1', V.meta.v, 1);

  // 2. O tag de 16 bytes vem anexado ao ct (32 da MK + 16 do tag = 48).
  checa('ct do embrulho = MK + tag de 16 bytes', unb(V.meta.mk_pw.ct).length, 48);

  const cru = async k => b64(new Uint8Array(await crypto.subtle.exportKey('raw', k)));

  // 3. Caminho da SENHA: deriva, desembrulha a MK, decifra o blob.
  const mkPw = await passo('senha desembrulha a MK', async () =>
    C.nfUnwrap(V.meta.mk_pw, await C.nfDeriveKey(new TextEncoder().encode(V.senha), unb(V.meta.salt_pw))));
  if (mkPw) {
    checa('senha desembrulha a MK exata', await cru(mkPw), V.mk_raw_b64);
    checa('MK decifra o blob, com acentos intactos', await C.nfDec(mkPw, V.blob), V.texto);
  }

  // 4. Caminho da RECOVERY KEY: tem que chegar na MESMA MK.
  const mkRk = await passo('recovery desembrulha a MK', async () =>
    C.nfUnwrap(V.meta.mk_rk, await C.nfDeriveKey(unb(V.rk_bytes_b64), unb(V.meta.salt_rk))));
  if (mkRk) checa('recovery desembrulha a MESMA MK', await cru(mkRk), V.mk_raw_b64);

  // 5. Base32 da recovery, ida e volta, incluindo a normalizacao de O/I/L.
  checa('20 bytes viram a recovery key exibida', C.nfToB32(unb(V.rk_bytes_b64)).match(/.{1,4}/g).join('-'), V.rk_display);
  checa('recovery key digitada volta aos 20 bytes', b64(C.nfFromB32(V.rk_display)), V.rk_bytes_b64);
  // o usuario digita minusculo, troca O por 0 e I por 1, e erra os tracos
  const sujo = V.rk_display.toLowerCase().replace(/0/g, 'O').replace(/1/g, 'l').replace(/-/g, ' ');
  checa('recovery key suja (minuscula, O/l, espacos) tambem volta', b64(C.nfFromB32(sujo)), V.rk_bytes_b64);

  // 6. Segredo de auth: derivacao separada, e-mail normalizado para minusculas.
  checa('segredo de auth bate', await C.nfAuthSecret(V.email, V.senha), V.auth_secret);
  checa('e-mail em caixa diferente da o mesmo segredo', await C.nfAuthSecret(V.email.toLowerCase(), V.senha), V.auth_secret);

  // 7. Senha errada tem que falhar, nao devolver lixo.
  let recusou = false;
  try {
    const kruim = await C.nfDeriveKey(new TextEncoder().encode(V.senha + 'x'), unb(V.meta.salt_pw));
    await C.nfUnwrap(V.meta.mk_pw, kruim);
  } catch (e) { recusou = true; }
  checa('senha errada e recusada pelo tag do GCM', recusou, true);

  console.log('FORMATO DE CRIPTOGRAFIA v1 — ' + (falhas ? falhas + ' FALHA(S)' : 'tudo bate'));
  console.log(L.join('\n'));
  if (falhas) {
    console.log('\nSe a mudanca foi de proposito: as contas que ja existem foram cifradas');
    console.log('no formato antigo. Mudar sem caminho de migracao perde os dados delas.');
  }
  process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('FALHOU ao rodar:', e.message); process.exitCode = 1; });
