// Assina o release com a chave privada OFFLINE (Ed25519).
// Uso:  node sign-release.js [caminho-do-exe]
// Sem argumento, assina dist/North-Setup-<versao>.exe.
// Gera <exe>.sig = manifesto JSON {version, sha256, sig} — a VERSÃO e o HASH ficam DENTRO da
// assinatura, então o app recusa rollback (build antiga) e arquivo trocado. Suba OS DOIS
// (.exe e .exe.sig) no GitHub Release.
//
// A chave privada NÃO mora no repositório e nem em pasta sincronizada com nuvem.
// Até 21/08/2026 ela ficava aqui dentro — o .gitignore barrava o GitHub, mas a pasta
// inteira era sincronizada pelo OneDrive, então a chave estava replicada na nuvem da
// Microsoft. Ver o item 11 do THREAT_MODEL.md.
//
// Local canônico: %USERPROFILE%\.north-keys\  (fora do OneDrive, ACL só do dono)
// O caminho vem de NF_UPDATE_KEY, já fixado como variável de ambiente do usuário.
//
// O app verifica contra as chaves públicas embutidas em electron/main.js
// (UPDATE_PUBKEYS) antes de executar qualquer instalador.
const crypto = require('crypto'), fs = require('fs'), path = require('path'), os = require('os');

const DEFAULT_KEY = path.join(os.homedir(), '.north-keys', 'nf-update-private.pem');
const PRIV = process.env.NF_UPDATE_KEY || DEFAULT_KEY;
if (!fs.existsSync(PRIV)) {
  console.error('ERRO: chave privada não encontrada em "' + PRIV + '".');
  console.error('Esperado em ' + DEFAULT_KEY + ' ou no caminho de NF_UPDATE_KEY.');
  console.error('NUNCA coloque a chave dentro do repositório nem em pasta sincronizada (OneDrive, Dropbox, Drive).');
  process.exit(1);
}
if (/[\\/](OneDrive|Dropbox|Google Drive|iCloudDrive)[\\/]/i.test(path.resolve(PRIV))) {
  console.error('ERRO: a chave está numa pasta sincronizada com nuvem: ' + path.resolve(PRIV));
  console.error('Foi exatamente esse o furo encontrado em 21/08/2026. Mova para ' + path.dirname(DEFAULT_KEY) + '.');
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
