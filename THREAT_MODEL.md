# North Finances — Modelo de Ameaças

Documento honesto do que o North protege, do que **não** protege, e do que ainda está no caminho. Preferimos candura a marketing: se você encontrar um furo não listado aqui, abra uma issue.

## O que o produto faz

Controle financeiro pessoal. Você **exporta** o extrato do seu banco (OFX/CSV) e **importa** manualmente — nada se conecta à sua conta bancária, nenhuma IA lê seus gastos. Os dados são **cifrados no seu navegador** (E2E) antes de subir para a nuvem.

## O que é protegido

- **Criptografia de ponta a ponta (at-rest).** Chave-mestra aleatória, embrulhada por uma chave derivada da sua senha (PBKDF2-SHA256, 600k) **e** por uma chave de recuperação independente. Conteúdo cifrado com AES-GCM-256. O servidor guarda **só texto cifrado** — verificável no banco.
- **A senha crua não vai ao servidor de auth.** Derivamos no cliente um segredo de auth separado (PBKDF2, outro uso); é ele que autentica no Supabase. A chave de cifragem vem da senha crua com outro sal.
- **Desktop e web são o MESMO app.** O app de desktop (Electron) carrega o site ao vivo — mesma versão, mesma criptografia, mesma sincronização (via nuvem), sem diferença. Não há código empacotado separado.
- **Auto-update assinado + anti-rollback (instalador desktop).** O app só executa um instalador cuja assinatura Ed25519 (sobre `versão|sha256`) bate com uma chave pública embutida, e recusa versões ≤ a atual. Chave privada guardada fora de qualquer pasta sincronizada — ver o item 11 para o que isso custou. (Protege o wrapper/instalador; o código do app vem do site.)
- **CSP limitando exfiltração.** `connect-src`/`img-src` em allowlist: um script injetado não consegue mandar dados para hosts fora da lista.
- **Escape rígido** de todo dado de arquivo/usuário renderizado (parser OFX, nome de arquivo, campos digitados).
- Isolamento por usuário no banco (RLS), 2FA opcional, alerta de novo login, sessão única, bloqueio por inatividade.

## O que NÃO está resolvido (resíduos conhecidos)

1. **A entrega do app não é fixada (web e desktop).** Você confia no que o servidor te serve **a cada carregamento** — vale para o navegador e para o app de desktop (que carrega o mesmo site). Um GitHub Pages / DNS / TLS comprometido poderia servir um JS malicioso que lê a chave-mestra da memória. *Correção no radar: build reproduzível + hash publicado, ou uma versão desktop com código empacotado e verificável.*
2. **XSS seria comprometimento total.** Num app E2EE, execução de script arbitrário no contexto lê a chave — a cripto at-rest vira irrelevante. Mitigamos com escape rígido + CSP, **mas** `script-src` mantém `unsafe-inline` (o app usa handlers inline), então um script inline injetado não é bloqueado — só seus canais de exfiltração são. Não é uma barreira completa.
3. **Build ainda não é reproduzível.** Empacotar prova que você roda o que **compilamos**, não que compilamos o que está no GitHub. Terceiro ainda não consegue reproduzir o binário e conferir. *É o próximo passo.*
4. **O salto para a primeira versão assinada é feito por clientes antigos, sem verificação.** Da primeira versão assinada em diante, todo update é verificado.
5. **Sem EV code-signing.** O instalador dispara o aviso do SmartScreen. O canal de update está fechado (Ed25519), mas o instalador não é confiável pelo SO.
6. **A senha transita o login do Supabase.** É um hash derivado no cliente, não a senha crua — mas o material de derivação (a senha) passa pelo TLS do provedor de auth.
7. **Sal determinístico** (derivado do e-mail) permite pré-computação alvo-a-alvo. Inerente: precisa ser derivável antes do login.
8. **KDF é PBKDF2, não memory-hard.** Argon2id resistiria melhor a GPU pelo mesmo custo de UX. No radar.
9. ~~**Fallback de senha legada.**~~ **Encerrado.** A janela (`NF_RAW_LEGACY_UNTIL`) expirou em **02/08/2026**; desde então só os esquemas hasheados autenticam. Mantido aqui como registro histórico.
10. ~~**Contas não migradas com dados em texto puro.**~~ **Encerrado.** Verificado no banco em **18/08/2026**: todas as contas têm `enc_data` preenchido e **nenhuma** tem `data` em texto puro. A migração oportunística no login concluiu. A afirmação "no servidor só existe texto cifrado" passou de meta a fato — e é conferível com uma consulta de contagem, sem ler o conteúdo de ninguém.

11. **A chave de assinatura do update esteve sincronizada com o OneDrive.** Descoberto em **21/08/2026**: o `nf-update-private.pem` vivia dentro de `OneDrive\Área de Trabalho\…`, replicado para a nuvem da Microsoft. O `.gitignore` protegia contra o GitHub e não contra isso. Quem tivesse a conta Microsoft poderia assinar um instalador que **todo cliente desktop aceita e executa** — exatamente o RCE que a assinatura existe para fechar. A chave foi movida no mesmo dia para fora de qualquer pasta sincronizada, **mas mover não desfaz a exposição**: cópias podem persistir no histórico de versões e na lixeira do OneDrive. Por isso ela é tratada como comprometida e a rotação está encenada — a chave 2 já consta em `UPDATE_PUBKEYS`. Só fecha quando (a) sair uma versão assinada pela chave 1 contendo as duas, para os clientes instalados passarem a aceitar a chave 2, e (b) a versão seguinte for assinada pela chave 2 com a chave 1 removida da lista.

> **Nota de manutenção.** Os itens 9 e 10 foram fechados em 18/08/2026 e ficam listados riscados de propósito: um modelo de ameaças que apaga o que já resolveu perde a serventia de mostrar o caminho percorrido. Os itens 1 a 8 e o 11 continuam abertos. O 11 é o mais urgente, por ser o único com uma janela de exposição já ocorrida; o item 1 (entrega não fixada) segue sendo o mais estrutural.

## Modelo de confiança, em uma frase

Desktop e web são o mesmo app e têm o mesmo modelo de confiança: você confia no servidor a cada carregamento. O código é aberto — você pode ler e verificar boa parte disso. Fixar o código de forma verificável (build reproduzível + hash publicado, ou um desktop com bundle assinado) é um passo futuro.
