#!/usr/bin/env node
// Confere a leitura de comprovantes e notificacoes do banco, extraindo o codigo
// real do index.html: valor (com "R$" lido como "RS"), data em varios formatos,
// entrada ou saida, e o nome de quem recebeu ou pagou.
//
// Rodar:  node verificar-comprovante.js

const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = t.indexOf('// ═══ COMPROVANTE E NOTIFICAÇÃO ═══');
const j = t.indexOf('// ═══ FIM DE COMPROVANTE E NOTIFICAÇÃO ═══', i);
if (i < 0 || j < 0) { console.error('nao achei o bloco COMPROVANTE E NOTIFICAÇÃO no index.html'); process.exit(2); }
const real = re => { const m = t.match(re); if (!m) { console.error('nao achei ' + re); process.exit(2); } return m[0]; };
const aux = [/function _isoDia\(d\)\{.*\}/, /function cleanDesc\(s\)\{[\s\S]*?\n\}/].map(real).join('\n');
const C = new Function(aux + '\n' + t.slice(i, j) + '\nreturn {lerComprovante,lerNotificacao};')();

let falhas = 0;
const L = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  L.push('  ' + (ok ? 'ok  ' : 'FALHOU') + '  ' + rotulo);
  if (!ok) { L.push('        esperado: ' + JSON.stringify(esperado)); L.push('        obtido:   ' + JSON.stringify(obtido)); }
}
const hoje = new Date(2026, 10, 10, 12, 0);
const ler = txt => { const r = C.lerComprovante(txt, hoje); return r && [r.type, r.amount, r.date, r.description]; };
const not = txt => { const r = C.lerNotificacao(txt, hoje); return r && [r.type, r.amount, r.date, r.description]; };

// 1. Comprovantes
checa('Pix enviado em blocos (Destino > Nome na linha de baixo)', ler(`Comprovante de transferência
10 NOV 2026 - 15:57:12
Valor
R$ 32,90
Tipo de transferência
Pix
Destino
Nome
PADARIA DOCE PAO LTDA
CNPJ
12.345.678/0001-90
Instituição
BANCO INTER
Origem
Nome
Pedro Exemplo
Instituição
NU PAGAMENTOS - IP`), ['expense', 32.9, '2026-11-10', 'Padaria Doce Pao Ltda']);
checa('Pix recebido com "Quem pagou" e milhar', ler(`Pix recebido
Valor: R$ 1.250,00
Data: 05/11/2026 às 09:14
Quem pagou
JOAO DA SILVA
CPF ***.456.789-**
Instituição: Banco do Brasil S.A.`), ['income', 1250, '2026-11-05', 'Joao da Silva']);
checa('boleto: beneficiario na mesma linha, valor da linha "Valor"', ler(`Comprovante de pagamento de boleto
Beneficiário: ENEL DISTRIBUICAO SAO PAULO
Data do pagamento 07/11/2026
Tarifa R$ 0,00
Valor do documento R$ 189,90
Valor pago R$ 189,90`), ['expense', 189.9, '2026-11-07', 'Enel Distribuicao Sao Paulo']);
checa('leitura de imagem com "RS" e data por extenso', ler(`Pix enviado
RS 45,00
8 de novembro de 2026
Para Maria Souza
Chave: maria@email.com`), ['expense', 45, '2026-11-08', 'Maria Souza']);
checa('sem nome reconhecivel: descricao generica', ler(`Pix enviado
R$ 10,00
10/11/2026`), ['expense', 10, '2026-11-10', 'Pagamento']);
checa('sem valor: nao le nada', C.lerComprovante('Comprovante\nPara Fulano', hoje), null);
checa('saldo nao e confundido com o valor', ler(`Transferência recebida
Saldo disponível R$ 3.400,00
R$ 200,00
De: ANA LIMA`), ['income', 200, '2026-11-10', 'Ana Lima']);

// 2. Notificacoes do banco (para os apps nativos)
checa('compra com cartao final no fim', not('Compra de R$ 32,90 APROVADA em PADARIA DOCE PÃO para o cartão com final 1234'), ['expense', 32.9, '2026-11-10', 'Padaria Doce Pão']);
checa('Pix recebido: o nome vem depois do segundo "de"', not('Você recebeu um Pix de R$ 50,00 de MARIA DE SOUZA'), ['income', 50, '2026-11-10', 'Maria de Souza']);
checa('Pix enviado para', not('Pix enviado: R$ 120,00 para JOAO SILVA'), ['expense', 120, '2026-11-10', 'Joao Silva']);
checa('data e hora no lugar do nome: o nome vem depois da virgula', not('Compra aprovada no cartão final 1234, valor R$ 32,90, em 09/11 às 15:57, PADARIA DOCE PAO'), ['expense', 32.9, '2026-11-09', 'Padaria Doce Pao']);
checa('asterisco do estabelecimento sai', not('Compra no débito de R$ 15,50 aprovada em UBER *TRIP'), ['expense', 15.5, '2026-11-10', 'Uber Trip']);
checa('notificacao sem valor: nada', C.lerNotificacao('Seu cartão foi bloqueado', hoje), null);

console.log(L.join('\n'));
console.log(falhas ? '\n  ' + falhas + ' falha(s)' : '\n  todos passaram');
process.exit(falhas ? 1 : 0);
