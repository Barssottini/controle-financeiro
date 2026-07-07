# Barssottini & Finanças

Controle financeiro pessoal — 100% local, sem nuvem. Um único `index.html` com tudo dentro.

## Como usar como app de desktop (Windows)

O app roda em janela própria (sem barra de navegador) usando o modo aplicativo do Edge:

- **Atalho pronto:** `Barssottini & Finanças` na Área de Trabalho
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
