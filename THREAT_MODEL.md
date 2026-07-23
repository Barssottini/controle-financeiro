# North Finances — Modelo de Ameaças

Documento honesto do que o North protege, do que **não** protege, e do que ainda está no caminho. Preferimos candura a marketing: se você encontrar um furo não listado aqui, abra uma issue.

## O que o produto faz

Controle financeiro pessoal. Você **exporta** o extrato do seu banco (OFX/CSV) e **importa** manualmente — nada se conecta à sua conta bancária, nenhuma IA lê seus gastos. Os dados são **cifrados no seu navegador** (E2E) antes de subir para a nuvem.

## O que é protegido

- **Criptografia de ponta a ponta (at-rest).** Chave-mestra aleatória, embrulhada por uma chave derivada da sua senha (PBKDF2-SHA256, 600k) **e** por uma chave de recuperação independente. Conteúdo cifrado com AES-GCM-256. O servidor guarda **só texto cifrado** — verificável no banco.
- **A senha crua não vai ao servidor de auth.** Derivamos no cliente um segredo de auth separado (PBKDF2, outro uso); é ele que autentica no Supabase. A chave de cifragem vem da senha crua com outro sal.
- **Auto-update assinado + anti-rollback (desktop).** O app só executa um instalador cuja assinatura Ed25519 (sobre `versão|sha256`) bate com uma chave pública embutida, e recusa versões ≤ a atual. Chave privada offline.
- **Código fixado no desktop.** O app de desktop empacota o código e serve de `localhost` — o servidor remoto não injeta JS sob medida. Servidor local com bind em 127.0.0.1 e validação de `Host` (anti DNS-rebinding).
- **CSP limitando exfiltração.** `connect-src`/`img-src` em allowlist: um script injetado não consegue mandar dados para hosts fora da lista.
- **Escape rígido** de todo dado de arquivo/usuário renderizado (parser OFX, nome de arquivo, campos digitados).
- Isolamento por usuário no banco (RLS), 2FA opcional, alerta de novo login, sessão única, bloqueio por inatividade.

## O que NÃO está resolvido (resíduos conhecidos)

1. **Entrega web não é fixada.** No navegador, você confia no que o servidor te serve **a cada carregamento**. Um GitHub Pages / DNS / TLS comprometido poderia servir um JS malicioso que lê a chave-mestra da memória. O desktop empacotado fecha isso; a web, não. *Correção no radar: build reproduzível + hash publicado.*
2. **XSS seria comprometimento total.** Num app E2EE, execução de script arbitrário no contexto lê a chave — a cripto at-rest vira irrelevante. Mitigamos com escape rígido + CSP, **mas** `script-src` mantém `unsafe-inline` (o app usa handlers inline), então um script inline injetado não é bloqueado — só seus canais de exfiltração são. Não é uma barreira completa.
3. **Build ainda não é reproduzível.** Empacotar prova que você roda o que **compilamos**, não que compilamos o que está no GitHub. Terceiro ainda não consegue reproduzir o binário e conferir. *É o próximo passo.*
4. **O salto para a primeira versão assinada é feito por clientes antigos, sem verificação.** Da primeira versão assinada em diante, todo update é verificado.
5. **Sem EV code-signing.** O instalador dispara o aviso do SmartScreen. O canal de update está fechado (Ed25519), mas o instalador não é confiável pelo SO.
6. **A senha transita o login do Supabase.** É um hash derivado no cliente, não a senha crua — mas o material de derivação (a senha) passa pelo TLS do provedor de auth.
7. **Sal determinístico** (derivado do e-mail) permite pré-computação alvo-a-alvo. Inerente: precisa ser derivável antes do login.
8. **KDF é PBKDF2, não memory-hard.** Argon2id resistiria melhor a GPU pelo mesmo custo de UX. No radar.
9. **Fallback de senha legada** existe até uma data de corte curta, para migrar contas antigas — janela estreita e protegida por flag local (que, na web, um bundle adulterado poderia ignorar; ver item 1/2).
10. **Contas não migradas** ficam com dados em texto puro no banco até o próximo login (migração é oportunística, no login — não temos a chave para cifrar por você).

## Modelo de confiança, em uma frase

No **desktop**, você confia que compilamos honestamente (uma vez, verificável quando o build for reproduzível). Na **web**, você confia no servidor a cada carregamento. Em ambos, você confia que o código aberto é o que roda — e pode ler o código para verificar boa parte disso.
