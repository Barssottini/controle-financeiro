// Confere os scripts de terceiro do index.html: versão fixa, integrity que bate
// com o que o CDN entrega, e crossorigin presente.
//
// Por que isso existe: esses arquivos rodam na MESMA página que deriva a chave e
// cifra os dados, e carregam antes disso. Quem controlar um deles lê a senha e o
// texto em claro. O verificar-entrega.js prova que o index.html servido é o
// público — mas não olha nada do que o index.html manda o navegador buscar.
// Este script cobre justamente esse buraco.
//
// Rode depois de qualquer mudança de versão. Sai com código 1 se algo estiver
// errado, para prender num hook ou em CI.
//
// Um hash errado não degrada em silêncio: o navegador RECUSA o script e o app
// não abre. Por isso conferir antes de publicar não é zelo, é obrigatório.
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const get = (u) => new Promise((res, rej) => {
  https.get(u, { headers: { 'User-Agent': 'north-verificar-sri' } }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      return res(get(new URL(r.headers.location, u).href));
    }
    const d = [];
    r.on('data', (x) => d.push(x));
    r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(d) }));
  }).on('error', rej);
});

const sri = (b) => 'sha384-' + crypto.createHash('sha384').update(b).digest('base64');

(async () => {
  const arquivo = process.argv[2] || 'index.html';
  const html = fs.readFileSync(arquivo, 'utf8');
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];

  const externos = tags.filter((m) => /^https?:/i.test(m[1]));
  if (!externos.length) {
    console.log('Nenhum script externo em ' + arquivo + '. Nada a verificar —');
    console.log('e essa é a situação ideal: o app não depende de ninguém em tempo de execução.');
    return;
  }

  console.log('Scripts de terceiro em ' + arquivo + ': ' + externos.length);
  console.log('');

  let problemas = 0;
  for (const m of externos) {
    const [tag, src] = m;
    const integridade = (tag.match(/integrity="([^"]+)"/) || [])[1] || null;
    const temCross = /crossorigin=/.test(tag);
    const fixa = /@\d+\.\d+\.\d+/.test(src);

    const r = await get(src);
    const real = sri(r.body);

    const falhas = [];
    if (r.status !== 200) falhas.push('o CDN respondeu ' + r.status);
    if (!fixa) falhas.push('versão FLUTUANTE — o CDN pode servir outro código amanhã');
    if (!integridade) falhas.push('sem integrity — o navegador executa o que vier');
    else if (integridade !== real) falhas.push('integrity NÃO bate: o navegador bloquearia este script e o app não abriria');
    if (!temCross) falhas.push('sem crossorigin — sem ele a verificação falha e o script é bloqueado');

    console.log('  ' + src.replace(/^https:\/\/[^/]+\//, ''));
    console.log('    ' + r.body.length.toLocaleString('pt-BR') + ' bytes servidos');
    if (falhas.length) {
      problemas += falhas.length;
      falhas.forEach((f) => console.log('    ✗ ' + f));
      if (integridade && integridade !== real) console.log('    hash correto seria: ' + real);
      if (!integridade) console.log('    hash a usar: ' + real);
    } else {
      console.log('    ✓ versão fixa, integrity confere, crossorigin presente');
    }
    console.log('');
  }

  if (problemas) {
    console.log(problemas + ' problema(s). NÃO publique antes de resolver.');
    process.exitCode = 1;
  } else {
    console.log('Todos conferem. O navegador recusa qualquer conteúdo diferente destes.');
    console.log('');
    console.log('Ressalva honesta: isto prova que o código de terceiro é o esperado,');
    console.log('não que ele seja confiável. A garantia forte é não depender de');
    console.log('terceiro nenhum — hospedar os arquivos aqui e servir do nosso domínio.');
  }
})();
