const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    console.log(new Date().toISOString() + ' - ' + req.method + ' ' + req.url);

    let filePath = req.url === '/' ? '/index.html' : req.url;

    // Remove query strings
    filePath = filePath.split('?')[0];
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.error('Arquivo não encontrado: ' + filePath);
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 - Arquivo não encontrado</h1>');
            } else {
                console.error('Erro ao ler arquivo: ' + err);
                res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>500 - Erro interno do servidor</h1>');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
            res.end(content);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('Servidor rodando na porta ' + PORT);
    console.log('Ambiente: ' + (process.env.NODE_ENV || 'development'));
});

server.on('error', (err) => {
    console.error('Erro no servidor:', err);
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM recebido, encerrando servidor...');
    server.close(() => {
        console.log('Servidor encerrado');
        process.exit(0);
    });
});
