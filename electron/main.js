const { app, BrowserWindow, Menu, shell, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const SITE = 'https://barssottini.github.io/controle-financeiro/';
const REPO = 'Barssottini/controle-financeiro';

const OFFLINE_HTML = 'data:text/html;charset=utf-8,' + encodeURIComponent(`
<body style="background:#0d0d0d;color:#faf9f7;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <div style="font-size:22px;font-weight:800">Barssottini <span style="color:#c8903a">&</span> Finan&ccedil;as</div>
    <p style="color:#b5afa9;margin-top:14px;line-height:1.6">Sem conex&atilde;o com a internet.<br>
    O primeiro acesso precisa de internet — depois disso o app funciona offline.</p>
    <button onclick="location.href='${SITE}'" style="margin-top:18px;padding:12px 28px;background:#c8903a;color:#0d0d0d;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer">Tentar novamente</button>
  </div>
</body>`);

// ── Tela de atualização (mesma estética do app) ──
function updateHtml(info) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#0d0d0d;font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#faf9f7;border-radius:22px;padding:52px 46px;width:100%;max-width:430px;text-align:center;position:relative;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.55)}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#c8903a,#e8b96a,#c8903a)}
.badge{width:86px;height:86px;margin:0 auto 22px;background:#0d0d0d;border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#c8903a;letter-spacing:-1px;box-shadow:0 10px 30px rgba(200,144,58,.3)}
h1{font-size:21px;color:#0d0d0d;margin:0 0 6px;letter-spacing:-.5px;font-weight:800}
.sub{font-size:13px;color:#79736d;margin:0 0 22px}
.ver{display:inline-block;background:#f4e4c8;color:#8a6420;font-weight:800;font-size:12.5px;padding:5px 16px;border-radius:20px;margin-bottom:26px;letter-spacing:.3px}
.bar{height:10px;background:#e6dfd8;border-radius:20px;overflow:hidden;margin-bottom:10px;display:none}
.fill{height:100%;width:0%;background:linear-gradient(90deg,#c8903a,#e8b96a);transition:width .25s ease}
#st{font-size:12.5px;color:#79736d;min-height:18px;margin-bottom:18px;font-weight:600}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:11px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;background:#0d0d0d;color:#faf9f7;margin-bottom:10px;transition:all .2s}
.btn:hover{background:#c8903a;color:#0d0d0d}
.ghost{background:none;color:#79736d;font-weight:600;font-size:13px}
.ghost:hover{background:#f2ede8;color:#0d0d0d}
</style></head><body><div class="card">
<div class="badge">B&amp;F</div>
<h1>Nova versão disponível</h1>
<p class="sub">Barssottini &amp; Finanças — Atualizador</p>
<div class="ver">v${info.current} &nbsp;→&nbsp; v${info.version}</div>
<div class="bar" id="bar"><div class="fill" id="fill"></div></div>
<div id="st"></div>
<button class="btn" id="up" onclick="document.getElementById('bar').style.display='block';this.style.display='none';document.getElementById('skip').style.display='none';location.href='bfapp://update'">⬇️&nbsp; Atualizar agora</button>
<button class="btn ghost" id="skip" onclick="location.href='bfapp://skip'">Agora não — abrir o app</button>
</div></body></html>`;
}

function isNewer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

function checkUpdate() {
  return new Promise(resolve => {
    const done = v => { if (!resolved) { resolved = true; resolve(v); } };
    let resolved = false;
    setTimeout(() => done(null), 8000);
    try {
      const req = net.request('https://api.github.com/repos/' + REPO + '/releases/latest');
      req.setHeader('User-Agent', 'BarssottiniFinancas');
      req.setHeader('Accept', 'application/vnd.github+json');
      let body = '';
      req.on('response', res => {
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            const latest = (j.tag_name || '').replace(/^v/, '');
            const asset = (j.assets || []).find(a => /\.exe$/i.test(a.name));
            if (latest && asset && isNewer(latest, app.getVersion())) {
              done({ version: latest, current: app.getVersion(), url: asset.browser_download_url });
            } else done(null);
          } catch (e) { done(null); }
        });
        res.on('error', () => done(null));
      });
      req.on('error', () => done(null));
      req.end();
    } catch (e) { done(null); }
  });
}

function loadSite(win) {
  win.loadURL(SITE).catch(() => win.loadURL(OFFLINE_HTML));
}

function downloadAndInstall(win, info) {
  const file = path.join(os.tmpdir(), 'BarssottiniSetup.exe');
  const set = (t, p) => {
    win.webContents.executeJavaScript(
      'document.getElementById("st").textContent=' + JSON.stringify(t) + ';' +
      (p != null ? 'document.getElementById("fill").style.width="' + p + '%";' : '')
    ).catch(() => {});
  };
  set('Baixando atualização...', 0);
  try {
    const req = net.request(info.url);
    req.setHeader('User-Agent', 'BarssottiniFinancas');
    req.on('response', res => {
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      const ws = fs.createWriteStream(file);
      res.on('data', c => {
        got += c.length; ws.write(c);
        if (total) { const pct = Math.round(got / total * 100); set('Baixando atualização... ' + pct + '%', pct); }
      });
      res.on('end', () => {
        ws.end(() => {
          set('Instalando a nova versão...', 100);
          setTimeout(() => {
            spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
            app.quit();
          }, 900);
        });
      });
      res.on('error', () => { set('Falha no download — abrindo o app...', null); setTimeout(() => loadSite(win), 1500); });
    });
    req.on('error', () => { set('Falha no download — abrindo o app...', null); setTimeout(() => loadSite(win), 1500); });
    req.end();
  } catch (e) {
    set('Falha no download — abrindo o app...', null);
    setTimeout(() => loadSite(win), 1500);
  }
}

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

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    if (url && url.startsWith('http')) win.loadURL(OFFLINE_HTML);
  });

  // Ações da tela de atualização
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('bfapp://')) {
      e.preventDefault();
      if (url === 'bfapp://skip') loadSite(win);
      if (url === 'bfapp://update') downloadAndInstall(win, currentUpdateInfo);
    }
  });

  // Links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

let currentUpdateInfo = null;

app.whenReady().then(async () => {
  // Remove service workers herdados — bug do CacheStorage no Electron 33
  // derruba o renderer. localStorage (dados) NÃO é afetado.
  try {
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
  } catch (e) {}
  // Limpa o cache HTTP para SEMPRE carregar a versão mais recente do código
  // (evita login/tela travados numa versão antiga em cache). Dados ficam no localStorage.
  try {
    await session.defaultSession.clearCache();
  } catch (e) {}

  const win = createWindow();
  currentUpdateInfo = await checkUpdate();
  if (currentUpdateInfo) {
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(updateHtml(currentUpdateInfo)));
  } else {
    loadSite(win);
  }
});

app.on('window-all-closed', () => app.quit());
