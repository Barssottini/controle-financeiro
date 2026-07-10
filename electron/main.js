const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const SITE = 'https://barssottini.github.io/controle-financeiro/';

const OFFLINE_HTML = 'data:text/html;charset=utf-8,' + encodeURIComponent(`
<body style="background:#0d0d0d;color:#faf9f7;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <div style="font-size:22px;font-weight:800">Barssottini <span style="color:#c8903a">&</span> Finan&ccedil;as</div>
    <p style="color:#b5afa9;margin-top:14px;line-height:1.6">Sem conex&atilde;o com a internet.<br>
    O primeiro acesso precisa de internet — depois disso o app funciona offline.</p>
    <button onclick="location.href='${SITE}'" style="margin-top:18px;padding:12px 28px;background:#c8903a;color:#0d0d0d;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer">Tentar novamente</button>
  </div>
</body>`);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#0d0d0d',
    icon: path.join(__dirname, '..', 'logo.ico'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  });

  Menu.setApplicationMenu(null);
  win.maximize();
  win.show();

  // Carrega a versão mais recente do GitHub Pages;
  // o service worker do app garante funcionamento offline após o 1º acesso.
  win.loadURL(SITE).catch(() => win.loadURL(OFFLINE_HTML));

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    if (url && url.startsWith('http')) win.loadURL(OFFLINE_HTML);
  });

  // Links externos (ex.: bcb.gov.br, brapi.dev) abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
