// Assina o instalador do release com a chave privada OFFLINE (Ed25519).
// Uso:  node sign-release.js [caminho-do-exe]
// Sem argumento, assina dist/North-Setup-<versao>.exe.
// Gera <exe>.sig (base64) — suba OS DOIS arquivos (.exe e .exe.sig) no GitHub Release.
//
// A chave privada NUNCA é commitada (*.pem está no .gitignore). O app verifica a assinatura
// contra a chave pública embutida em electron/main.js antes de executar qualquer instalador.
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const PRIV = process.env.NF_UPDATE_KEY || 'nf-update-private.pem';
if (!fs.existsSync(PRIV)) {
  console.error('ERRO: chave privada não encontrada em "' + PRIV + '".');
  console.error('Aponte com  NF_UPDATE_KEY=caminho\\da\\chave.pem  ou coloque nf-update-private.pem aqui (fica gitignorada).');
  process.exit(1);
}
const version = require('./package.json').version;
const exe = process.argv[2] || path.join('dist', 'North-Setup-' + version + '.exe');
if (!fs.existsSync(exe)) {
  console.error('ERRO: instalador não encontrado: ' + exe + '\nRode "npm run dist" antes.');
  process.exit(1);
}
const buf = fs.readFileSync(exe);
const sig = crypto.sign(null, buf, crypto.createPrivateKey(fs.readFileSync(PRIV)));
fs.writeFileSync(exe + '.sig', sig.toString('base64'));
console.log('Assinado: ' + exe + '.sig  (' + buf.length + ' bytes assinados)');
console.log('Suba no Release os DOIS: ' + path.basename(exe) + '  +  ' + path.basename(exe) + '.sig');
