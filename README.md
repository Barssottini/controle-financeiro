# North Finances

Controle financeiro pessoal — site + app de desktop, com conta na nuvem (Supabase). Um único `index.html` com tudo dentro. *Encontre seu norte financeiro.*

## App nativo para Windows (recomendado)

**`North-Setup-X.Y.Z.exe`** (na aba [Releases](https://github.com/Barssottini/controle-financeiro/releases)) — app Electron de verdade:

- Janela nativa própria, ícone da North garantido na barra de tarefas e Menu Iniciar
- Carrega sempre a **versão mais recente** direto do GitHub Pages — atualização automática, sem reinstalar
- Funciona **offline** após o primeiro acesso (service worker faz cache)
- Mesma conta e mesmos dados do navegador — sincroniza pela nuvem, cifrado de ponta a ponta

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

Os dados (transações, cartão, investimentos, metas, orçamentos, contas a pagar) ficam na sua conta, em banco PostgreSQL da Supabase na região de São Paulo — e **cifrados de ponta a ponta**: a chave é derivada da sua senha no seu próprio aparelho e nunca é enviada. No servidor fica só texto cifrado. Uma cópia local fica no `localStorage` para o app abrir rápido e funcionar offline.

⚠️ **Chave de recuperação:** no primeiro acesso o app gera uma chave de recuperação e pede para você guardá-la. Ela é a única forma de reabrir seus dados se você esquecer a senha. **Sem a senha e sem a chave, nem nós conseguimos recuperar** — é consequência do desenho que protege você, não uma falha.

Detalhes do que é e do que não é protegido: [THREAT_MODEL.md](THREAT_MODEL.md).

## Conferir se o site está entregando o código público

Você não precisa acreditar na nossa palavra. Este comando compara, byte a byte, o
que `app.northfinances.com.br` está servindo agora com o `index.html` deste
repositório:

```
node verificar-entrega.js          # compara com o main
node verificar-entrega.js v1.5.0   # compara com uma versão específica
```

Não instala nada e funciona para qualquer pessoa, não só para quem desenvolve.

Sendo honesto sobre o alcance: isso detecta adulteração, não impede. O navegador
de quem usa o app não faz essa conferência sozinho — é o item 1 do
[THREAT_MODEL.md](THREAT_MODEL.md), que continua aberto.

## Funcionalidades

- Dashboard com gráfico receitas × despesas
- Transações com 4 tipos: receita, despesa, crédito e **investimento** (aportes XP/cripto/caixinha aparecem separados dos gastos)
- Cartão de crédito (fatura, pago/em aberto)
- Investimentos com rendimento CDI por dias úteis (taxa ajustável em Configurações)
- Metas & reserva de emergência com rendimento opcional
- Orçamento mensal por categoria
- Importação de extrato OFX/CSV (todos os bancos BR, com correção de encoding)
- Transações recorrentes
- Contas a pagar com aviso de vencimento no painel
- Sincronização entre navegador e desktop pela conta na nuvem

## Rotina recomendada

1. Exportar o extrato do banco (OFX) e importar no app
2. Classificar aportes como tipo **Investimento**
3. No dia 1º de cada mês: exportar CSV e usar na atualização mensal da carteira (projeto `meu-assessor`)
