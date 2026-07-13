# North Finances

Controle financeiro pessoal — site + app de desktop, com conta na nuvem (Supabase). Um único `index.html` com tudo dentro. *Encontre seu norte financeiro.*

## App nativo para Windows (recomendado)

**`North-Setup-X.Y.Z.exe`** (na aba [Releases](https://github.com/Barssottini/controle-financeiro/releases)) — app Electron de verdade:

- Janela nativa própria, ícone da North garantido na barra de tarefas e Menu Iniciar
- Carrega sempre a **versão mais recente** direto do GitHub Pages — atualização automática, sem reinstalar
- Funciona **offline** após o primeiro acesso (service worker faz cache)
- Dados 100% locais (perfil do Electron nesta máquina)

Build: `npm install && npm run dist` (fonte em [electron/main.js](electron/main.js))

## Instalador & Atualizador (alternativa leve)

**`North.exe`** — instala e atualiza o app em qualquer Windows:

- **Primeira vez**: baixa a versão mais recente do GitHub para `%LOCALAPPDATA%\North`, cria atalhos na Área de Trabalho e no Menu Iniciar
- **Rodando de novo**: verifica se há versão nova no GitHub e atualiza com um clique (os dados não são tocados — ficam no navegador, não no arquivo)
- Fonte do instalador: [instalador/instalador.ps1](instalador/instalador.ps1) — compilado com ps2exe

> ⚠️ Windows pode exibir o alerta SmartScreen na primeira execução (executável sem assinatura digital). Clique em "Mais informações → Executar assim mesmo".

## Como usar como app de desktop (Windows)

O app roda em janela própria (sem barra de navegador) usando o modo aplicativo do Edge:

- **Atalho pronto:** `North` na Área de Trabalho
- **Ou manualmente:**
  ```
  msedge.exe --app="file:///C:/caminho/para/index.html"
  ```

## Onde ficam os dados

Todos os dados (transações, cartão, investimentos, metas, orçamentos) ficam no `localStorage` do navegador, **na sua máquina**. Nada é enviado para servidor algum.

⚠️ **Importante:** os dados são vinculados à forma como o app é aberto (origem). Se abrir pelo atalho (arquivo local), os dados são independentes de uma eventual versão hospedada (GitHub Pages). Para migrar dados entre versões ou máquinas, use **Configurações → Backup completo (JSON)** e restaure no destino.

## Funcionalidades

- Dashboard com gráfico receitas × despesas
- Transações com 4 tipos: receita, despesa, crédito e **investimento** (aportes XP/cripto/caixinha aparecem separados dos gastos)
- Cartão de crédito (fatura, pago/em aberto)
- Investimentos com rendimento CDI por dias úteis (taxa ajustável em Configurações)
- Metas & reserva de emergência com rendimento opcional
- Orçamento mensal por categoria
- Importação de extrato OFX/CSV (todos os bancos BR, com correção de encoding)
- Transações recorrentes
- Backup/restauração completa em JSON (inclui configurações)

## Rotina recomendada

1. Exportar o extrato do banco (OFX) e importar no app
2. Classificar aportes como tipo **Investimento**
3. No dia 1º de cada mês: exportar CSV e usar na atualização mensal da carteira (projeto `meu-assessor`)
