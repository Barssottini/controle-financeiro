// Servidor estático mínimo para PRÉ-VISUALIZAÇÃO LOCAL (npm start).
//
// Não serve a produção: app.northfinances.com.br é entregue pelo GitHub Pages
// (ver o arquivo CNAME). O comentário anterior dizia "usado pelo Railway", o que
// deixou de ser verdade e não havia sequer configuração do Railway no repositório
// — comentário obsoleto sobre o que roda em produção é pior que nenhum.
//
// O app desktop usa `npm run electron`.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8'
};

// ROOT com separador no fim. Sem ele, startsWith(ROOT) aceita um diretório IRMÃO
// cujo nome comece igual: com ROOT = .../controle-financeiro, o caminho
// /../controle-financeiro-privado/x normaliza para fora da pasta e mesmo assim
// passa no teste. É estreito, mas é escapar da raiz — que é justamente o que a
// verificação existe para impedir.
const ROOT_SEP = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    // decodeURIComponent lança em sequência inválida — um único "%" na URL basta.
    // Sem este try, a exceção sobe do callback e DERRUBA O PROCESSO: qualquer um
    // que alcance a porta mata o servidor com uma requisição. O scanner não
    // apontou isto; é mais grave que a travessia de caminho que ele apontou.
    res.writeHead(400); res.end('400'); return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT_SEP)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('North Finances servindo na porta ' + PORT));
