#!/usr/bin/env node
// Verifica se o que app.northfinances.com.br está SERVINDO é bit a bit igual ao
// que está publicado no GitHub. Qualquer pessoa pode rodar, sem instalar nada:
//
//     node verificar-entrega.js            # compara com o branch main
//     node verificar-entrega.js v1.5.0     # compara com uma tag específica
//
// POR QUE ISTO EXISTE
// O item 1 do THREAT_MODEL.md é o mais importante em aberto: a entrega do app não
// é fixada. Você confia no que o servidor te devolve A CADA CARREGAMENTO — vale
// para o navegador e para o app de desktop, que carrega o mesmo site. Um GitHub
// Pages, DNS ou TLS comprometido poderia servir um JS que lê a chave-mestra da
// memória, e a criptografia at-rest não ajudaria em nada.
//
// Isto NÃO resolve esse problema. O navegador continua sem verificar nada sozinho.
// O que isto faz é tornar a adulteração DETECTÁVEL por terceiros: se o servidor
// passar a entregar algo diferente do código público, este script acusa.
//
// O documento do modelo de ameaças aponta "build reproduzível" como o próximo
// passo. Para o app web o problema é menor do que soa, porque não existe build: o
// arquivo servido é literalmente o arquivo do repositório. Não há o que reproduzir
// — só o que comparar. É o que este script faz.
//
// De propósito não há hash fixo aqui dentro. Hash escrito à mão envelhece em
// silêncio e vira mentira; a fonte da verdade é o próprio commit no GitHub.

const crypto = require('crypto');

const REPO = 'Barssottini/controle-financeiro';
const SERVIDO = 'https://app.northfinances.com.br/index.html';
const ref = process.argv[2] || 'main';
const NO_GITHUB = `https://raw.githubusercontent.com/${REPO}/${ref}/index.html`;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function baixar(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'north-verificar-entrega', 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Onde os dois divergem, em bytes — ajuda a saber se é ruído ou injeção.
function primeiraDivergencia(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function trecho(buf, pos) {
  const ini = Math.max(0, pos - 60);
  return buf.slice(ini, Math.min(buf.length, pos + 60)).toString('utf8').replace(/\s+/g, ' ');
}

(async () => {
  console.log('Referência no GitHub : ' + ref);
  console.log('');

  let servido, github;
  try {
    [servido, github] = await Promise.all([baixar(SERVIDO), baixar(NO_GITHUB)]);
  } catch (e) {
    console.error('Não deu para comparar: ' + e.message);
    console.error('(sem rede, ou a referência "' + ref + '" não existe no GitHub)');
    process.exit(2);
  }

  const hServido = sha256(servido);
  const hGithub = sha256(github);

  console.log('Servido pelo site    : ' + hServido);
  console.log('  ' + servido.length.toLocaleString('pt-BR') + ' bytes');
  console.log('Publicado no GitHub  : ' + hGithub);
  console.log('  ' + github.length.toLocaleString('pt-BR') + ' bytes');
  console.log('');

  if (hServido === hGithub) {
    console.log('CONFEREM. O servidor está entregando exatamente o código público.');
    console.log('');
    console.log('Ressalva honesta: isto vale para ESTE carregamento, feito por ESTE script.');
    console.log('O navegador de quem usa o app não faz esta verificação — o item 1 do');
    console.log('THREAT_MODEL.md continua aberto. O que você acabou de ganhar é a');
    console.log('capacidade de detectar adulteração, não de impedi-la.');
    process.exit(0);
  }

  const pos = primeiraDivergencia(servido, github);
  console.log('NÃO CONFEREM.');
  console.log('');
  console.log('Primeira diferença no byte ' + pos.toLocaleString('pt-BR') + '.');
  console.log('  no GitHub : …' + trecho(github, pos) + '…');
  console.log('  servido   : …' + trecho(servido, pos) + '…');
  console.log('');
  console.log('Antes de assumir o pior: o mais provável é que o site esteja numa versão');
  console.log('diferente da referência comparada. Tente a tag da versão publicada, por');
  console.log('exemplo  node verificar-entrega.js v1.5.0  — ou confira se há commit em');
  console.log('main que ainda não foi para o ar.');
  console.log('');
  console.log('Se as duas pontas deveriam ser a mesma versão e mesmo assim divergem,');
  console.log('trate como incidente: não faça login, e abra uma issue no repositório.');
  process.exit(1);
})();
