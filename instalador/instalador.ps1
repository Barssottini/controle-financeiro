# ============================================================
#  Barssottini & Finanças — Instalador & Atualizador
#  Baixa a versão mais recente do GitHub e cria os atalhos.
# ============================================================
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoRaw    = 'https://raw.githubusercontent.com/Barssottini/controle-financeiro/main'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Barssottini Financas'
$IndexPath  = Join-Path $InstallDir 'index.html'
$IcoPath    = Join-Path $InstallDir 'logo.ico'

# ---------- utilidades ----------
function Get-EdgePath {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    )
    foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
    try {
        $reg = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction Stop
        if ($reg.'(default)' -and (Test-Path $reg.'(default)')) { return $reg.'(default)' }
    } catch {}
    return $null
}

function Get-RemoteHash($url) {
    $tmp = Join-Path $env:TEMP ('bf_' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tmp -TimeoutSec 30
        $h = (Get-FileHash $tmp -Algorithm SHA256).Hash
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        return $h
    } catch {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        return $null
    }
}

function New-AppShortcut($lnkPath, $edge) {
    $ws  = New-Object -ComObject WScript.Shell
    $l   = $ws.CreateShortcut($lnkPath)
    $l.TargetPath = $edge
    $url = 'file:///' + (($IndexPath -replace '\\', '/') -replace ' ', '%20')
    $l.Arguments  = "--app=$url --start-maximized"
    $l.IconLocation = "$IcoPath,0"
    $l.WorkingDirectory = $InstallDir
    $l.Description = 'Barssottini & Financas - controle financeiro pessoal (100% local)'
    $l.Save()
}

function Open-App {
    $edge = Get-EdgePath
    if (-not $edge) { return }
    $url = 'file:///' + (($IndexPath -replace '\\', '/') -replace ' ', '%20')
    Start-Process $edge -ArgumentList "--app=$url", '--start-maximized'
}

# ---------- interface ----------
$ink   = [System.Drawing.Color]::FromArgb(13, 13, 13)
$ink2  = [System.Drawing.Color]::FromArgb(56, 53, 51)
$gold  = [System.Drawing.Color]::FromArgb(200, 144, 58)
$paper = [System.Drawing.Color]::FromArgb(250, 249, 247)
$muted = [System.Drawing.Color]::FromArgb(181, 175, 169)

$form = New-Object System.Windows.Forms.Form
$form.Text            = 'Barssottini & Financas'
$form.Size            = New-Object System.Drawing.Size(460, 560)
$form.StartPosition   = 'CenterScreen'
$form.BackColor       = $ink
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox     = $false

try {
    $selfIcon = [System.Drawing.Icon]::ExtractAssociatedIcon([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName)
    if ($selfIcon) { $form.Icon = $selfIcon }
} catch {}

# logo (extraida do proprio exe)
$pic = New-Object System.Windows.Forms.PictureBox
$pic.Size     = New-Object System.Drawing.Size(96, 96)
$pic.Location = New-Object System.Drawing.Point(174, 42)
$pic.SizeMode = 'Zoom'
try { if ($selfIcon) { $pic.Image = $selfIcon.ToBitmap() } } catch {}
$form.Controls.Add($pic)

$title = New-Object System.Windows.Forms.Label
$title.Text      = 'Barssottini & Financas'
$title.Font      = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = $paper
$title.TextAlign = 'MiddleCenter'
$title.Size      = New-Object System.Drawing.Size(420, 36)
$title.Location  = New-Object System.Drawing.Point(12, 152)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text      = 'Instalador e Atualizador'
$subtitle.Font      = New-Object System.Drawing.Font('Segoe UI', 10)
$subtitle.ForeColor = $gold
$subtitle.TextAlign = 'MiddleCenter'
$subtitle.Size      = New-Object System.Drawing.Size(420, 24)
$subtitle.Location  = New-Object System.Drawing.Point(12, 188)
$form.Controls.Add($subtitle)

$status = New-Object System.Windows.Forms.Label
$status.Font      = New-Object System.Drawing.Font('Segoe UI', 9.5)
$status.ForeColor = $muted
$status.TextAlign = 'MiddleCenter'
$status.Size      = New-Object System.Drawing.Size(420, 60)
$status.Location  = New-Object System.Drawing.Point(12, 240)
$form.Controls.Add($status)

$btn = New-Object System.Windows.Forms.Button
$btn.Size      = New-Object System.Drawing.Size(300, 52)
$btn.Location  = New-Object System.Drawing.Point(72, 330)
$btn.FlatStyle = 'Flat'
$btn.FlatAppearance.BorderSize = 0
$btn.BackColor = $gold
$btn.ForeColor = $ink
$btn.Font      = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$btn.Cursor    = 'Hand'
$form.Controls.Add($btn)

$note = New-Object System.Windows.Forms.Label
$note.Text      = "Instala em: $InstallDir`nSeus dados ficam apenas neste computador."
$note.Font      = New-Object System.Drawing.Font('Segoe UI', 8.5)
$note.ForeColor = $ink2
$note.TextAlign = 'MiddleCenter'
$note.Size      = New-Object System.Drawing.Size(420, 44)
$note.Location  = New-Object System.Drawing.Point(12, 430)
$form.Controls.Add($note)

# ---------- estado ----------
$script:mode = 'install'   # install | update | uptodate | open

function Refresh-State {
    $installed = Test-Path $IndexPath
    if (-not $installed) {
        $script:mode = 'install'
        $btn.Text    = 'Instalar'
        $status.Text = 'O aplicativo ainda nao esta instalado neste computador.'
        return
    }
    $status.Text = 'Verificando atualizacoes...'
    $form.Refresh()
    $remote = Get-RemoteHash "$RepoRaw/index.html"
    if (-not $remote) {
        $script:mode = 'open'
        $btn.Text    = 'Abrir aplicativo'
        $status.Text = 'Sem conexao para verificar atualizacoes.' + [Environment]::NewLine + 'O aplicativo instalado continua funcionando.'
        return
    }
    $local = (Get-FileHash $IndexPath -Algorithm SHA256).Hash
    if ($remote -ne $local) {
        $script:mode = 'update'
        $btn.Text    = 'Atualizar agora'
        $status.Text = 'Nova versao disponivel!'
    } else {
        $script:mode = 'open'
        $btn.Text    = 'Abrir aplicativo'
        $status.Text = 'Voce ja esta na versao mais recente.'
    }
}

$btn.Add_Click({
    if ($script:mode -eq 'open') { Open-App; $form.Close(); return }
    $btn.Enabled = $false
    try {
        $status.Text = 'Baixando a versao mais recente...'
        $form.Refresh()
        if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
        Invoke-WebRequest -UseBasicParsing -Uri "$RepoRaw/index.html" -OutFile $IndexPath -TimeoutSec 60
        Invoke-WebRequest -UseBasicParsing -Uri "$RepoRaw/logo.ico"   -OutFile $IcoPath   -TimeoutSec 60

        $edge = Get-EdgePath
        if (-not $edge) {
            $status.Text = 'Aplicativo baixado, mas o Microsoft Edge nao foi encontrado.'
            $btn.Enabled = $true
            return
        }
        $status.Text = 'Criando atalhos...'
        $form.Refresh()
        New-AppShortcut (Join-Path ([Environment]::GetFolderPath('Desktop'))  'Barssottini & Financas.lnk') $edge
        New-AppShortcut (Join-Path ([Environment]::GetFolderPath('Programs')) 'Barssottini & Financas.lnk') $edge

        $status.Text = 'Tudo pronto! Atalhos criados na Area de Trabalho e no Menu Iniciar.'
        $script:mode = 'open'
        $btn.Text    = 'Abrir aplicativo'
    } catch {
        $status.Text = 'Erro: ' + $_.Exception.Message
    }
    $btn.Enabled = $true
})

$form.Add_Shown({ Refresh-State })
[void]$form.ShowDialog()
