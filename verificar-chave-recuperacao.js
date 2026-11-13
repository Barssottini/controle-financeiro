// Verifica o código real com chave fictícia, sem abrir webmail nem enviar mensagens.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=html.slice(html.indexOf("let _reckeyStr='',"),html.indexOf('function showUnlock(session)'));
assert(source.length>100);
function client({blocked=false,throws=false,copyFails=false}={}){
  const elements=new Map(),opened=[],copied=[],alerts=[];
  const document={getElementById(id){
    if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,checked:false,disabled:false,style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},scrollIntoView(){}});
    return elements.get(id);
  }};
  document.getElementById('udisp').textContent='endereco-antigo@example.com';
  const window={open(...args){if(throws)throw Error('blocked');opened.push(args);return blocked?null:{};}};
  const navigator={clipboard:{async writeText(text){if(copyFails)throw Error('denied');copied.push(text);}}};
  const api=new Function('document','window','navigator','URLSearchParams','alerts',`
    const _nfUser={email:'teste+empresa@example.com'};
    function showAlert(msg){alerts.push(msg);}
    function matchMedia(){return {matches:false};}
    ${source}
    return {showRecoveryDisplay,guardarChave,abrirEmailChave,urlEmailChave,reckeyGate,saved:()=>_reckeyDled};
  `)(document,window,navigator,URLSearchParams,alerts);
  api.showRecoveryDisplay('CHAVE-FICTICIA-PARA-TESTE');
  return {...api,document,opened,copied,alerts};
}
(async()=>{
  let c=client();await c.guardarChave('email');
  assert.equal(c.document.getElementById('reckey-email').hidden,false);
  assert.equal(c.document.getElementById('reckey-email-btn').attrs['aria-expanded'],'true');
  assert.equal(c.opened.length,0);assert.equal(c.saved(),false);
  for(const provider of ['gmail','outlook','app']){
    c=client();c.document.getElementById('reckey-chk').checked=true;
    c.abrirEmailChave(provider);
    const [target,name,features]=c.opened[0],url=new URL(target);
    assert.equal(name,'_blank');assert.equal(features,'noopener,noreferrer');
    if(provider==='gmail'){assert.equal(url.hostname,'mail.google.com');assert.equal(url.searchParams.get('to'),'teste+empresa@example.com');}
    if(provider==='outlook'){assert.equal(url.hostname,'outlook.live.com');assert.equal(url.searchParams.get('to'),'teste+empresa@example.com');}
    if(provider==='app'){assert.equal(url.protocol,'mailto:');assert.equal(decodeURIComponent(url.pathname),'teste+empresa@example.com');}
    assert(url.searchParams.get('body').includes('CHAVE-FICTICIA-PARA-TESTE'));
    assert(url.searchParams.get('body').includes('Conta: teste+empresa@example.com'));
    assert.equal(c.document.getElementById('reckey-ok').textContent,'');
    assert.equal(c.saved(),false);assert.equal(c.document.getElementById('reckey-continue').disabled,true);
    c.document.getElementById('reckey-chk').checked=true;c.reckeyGate();
    assert.equal(c.document.getElementById('reckey-continue').disabled,false);
    c.showRecoveryDisplay('OUTRA-CHAVE-FICTICIA');
    assert.equal(c.document.getElementById('reckey-email').hidden,true);
    c.document.getElementById('reckey-chk').checked=true;c.reckeyGate();
    assert.equal(c.document.getElementById('reckey-continue').disabled,true);
  }
  c=client({blocked:true});c.abrirEmailChave('gmail');
  assert(c.document.getElementById('reckey-email-status').textContent.includes('Se nada abriu'));
  assert.equal(c.document.getElementById('reckey-continue').disabled,true);assert.equal(c.saved(),false);
  c=client({throws:true});c.abrirEmailChave('gmail');
  assert(c.document.getElementById('reckey-email-status').textContent.includes('Não foi possível'));
  c.document.getElementById('reckey-chk').checked=true;c.reckeyGate();assert.equal(c.document.getElementById('reckey-continue').disabled,true);
  c=client();await c.guardarChave('copiar');assert.deepEqual(c.copied,['CHAVE-FICTICIA-PARA-TESTE']);assert(c.saved());
  c=client({copyFails:true});await c.guardarChave('copiar');assert(!c.saved());assert.equal(c.alerts.length,1);
  console.log('Recuperação: Gmail, Outlook, aplicativo, destinatário, popup bloqueado, confirmação explícita, reinício e cópia verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
