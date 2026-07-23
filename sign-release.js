// Assina o release com a chave privada OFFLINE (Ed25519).
// Uso:  node sign-release.js [caminho-do-exe]
// Sem argumento, assina dist/North-Setup-<versao>.exe.
// Gera <exe>.sig = manifesto JSON {version, sha256, sig} — a VERSÃO e o HASH ficam DENTRO da
// assinatura, então o app recusa rollback (build antiga) e arquivo trocado. Suba OS DOIS
// (.exe e .exe.sig) no GitHub Release.
//
// A chave privada NUNCA é commitada (*.pem no .gitignore). O app verifica contra as chaves
// públicas embutidas em electron/main.js (UPDATE_PUBKEYS) antes de executar qualquer instalador.
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
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
const msg = Buffer.from(version + '|' + sha256, 'utf8');
const sig = crypto.sign(null, msg, crypto.createPrivateKey(fs.readFileSync(PRIV))).toString('base64');
fs.writeFileSync(exe + '.sig', JSON.stringify({ version, sha256, sig }));
console.log('Assinado: ' + exe + '.sig');
console.log('  versão ' + version + ' + sha256 ' + sha256.slice(0, 16) + '… dentro do manifesto assinado');
console.log('Suba no Release os DOIS: ' + path.basename(exe) + '  +  ' + path.basename(exe) + '.sig');
