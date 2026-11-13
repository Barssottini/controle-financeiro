// Exercita o fluxo real de cadastro sem criar contas ou enviar e-mails.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const setup=html.slice(html.indexOf('function cadastroJaExiste('),html.indexOf("let pendingEmail='';"));
const back=html.slice(html.indexOf('function voltarDoCadastro(){'),html.indexOf('function showSetupScreen(){'));
assert(setup.length>100&&back.length>100);

function client(response,{tipo='pj',captcha='captcha-test'}={}){
  const elements=new Map(),calls=[];
  const document={getElementById(id){
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{value:'',textContent:'',style:{},
        classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
        scrollIntoView:()=>calls.push(['scroll',id]),focus:()=>calls.push(['focus',id])});
    }
    return elements.get(id);
  }};
  document.getElementById('setup-email').value='  PESSOA@example.com  ';
  document.getElementById('setup-pass').value='Senha-de-teste!';
  document.getElementById('setup-pass2').value='Senha-de-teste!';
  const sb={auth:{signUp:async args=>{calls.push(['signup',args]);return response;}}};
  const api=new Function('document','sb','calls','tipo','captcha',`
    let recoveryMode=false,_tipoCadastro=tipo,_nfPendingSignupPass='senha-anterior',_nfPass=null;
    const TIPO_CONTA_SERVIDOR_ATIVO=true,CAPTCHA_WAIT_MSG='Aguarde a verificação.';
    function passwordIssue(){return '';}
    async function getCaptcha(){return captcha;}
    function captchaOn(){return true;}
    function resetCaptcha(id){calls.push(['reset-captcha',id]);}
    function ensureCaptcha(id){calls.push(['ensure-captcha',id]);}
    async function nfAuthSecret(){return 'segredo-derivado-de-teste';}
    function guardarTipoCadastro(email){calls.push(['guardar-tipo',email,_tipoCadastro]);}
    function showConfirmScreen(email){calls.push(['confirmar',email]);}
    function finishSignIn(session){calls.push(['entrar',session]);}
    ${setup}
    ${back}
    return {doSetup,voltarDoCadastro,pending:()=>_nfPendingSignupPass};
  `)(document,sb,calls,tipo,captcha);
  return {...api,document,calls};
}

(async()=>{
  const duplicateResponses=[
    {data:{user:{identities:[]},session:null},error:null},
    {data:null,error:{code:'user_already_exists',message:'User already registered'}},
    {data:null,error:{code:'email_exists',message:'Address is taken'}},
    {data:null,error:{message:'User already registered'}},
  ];
  for(const tipo of ['pf','pj'])for(const response of duplicateResponses){
    const c=client(response,{tipo});await c.doSetup();
    assert.equal(c.document.getElementById('setup-err-msg').textContent,'Este e-mail já está cadastrado. Entre na sua conta ou use outro e-mail.');
    assert(c.document.getElementById('setup-err').classList.contains('show'));
    assert(c.calls.some(x=>x[0]==='scroll'&&x[1]==='setup-err'));
    assert(!c.calls.some(x=>['confirmar','guardar-tipo','entrar'].includes(x[0])));
    assert.equal(c.pending(),null);
  }
  // Uma conta nova ou ainda não confirmada continua recebendo a confirmação.
  for(const tipo of ['pf','pj']){
    const c=client({data:{user:{identities:[{provider:'email'}]},session:null},error:null},{tipo});
    await c.doSetup();
    assert.deepEqual(c.calls.find(x=>x[0]==='confirmar'),['confirmar','pessoa@example.com']);
    assert.deepEqual(c.calls.find(x=>x[0]==='guardar-tipo'),['guardar-tipo','pessoa@example.com',tipo]);
    assert.equal(c.pending(),'Senha-de-teste!');
    assert.equal(c.calls.find(x=>x[0]==='signup')[1].password,'segredo-derivado-de-teste');
  }
  const session={user:{id:'new-user'}};
  let c=client({data:{user:{identities:[]},session},error:null});await c.doSetup();
  assert(c.calls.some(x=>x[0]==='entrar'&&x[1]===session));
  assert(!c.calls.some(x=>x[0]==='confirmar'));
  c=client({data:null,error:{message:'Email rate limit exceeded'}});await c.doSetup();
  assert.equal(c.document.getElementById('setup-err-msg').textContent,'Erro: Email rate limit exceeded');
  assert(!c.calls.some(x=>x[0]==='confirmar'));
  c=client(null,{captcha:null});await c.doSetup();
  assert(!c.calls.some(x=>x[0]==='signup'));
  c=client(duplicateResponses[0]);await c.doSetup();c.voltarDoCadastro();
  assert.equal(c.document.getElementById('lemail').value,'pessoa@example.com');
  assert.equal(c.document.getElementById('setup-screen').style.display,'none');
  assert.equal(c.document.getElementById('login-screen').style.display,'');
  for(const id of ['setup-pass','setup-pass2','lpass'])assert.equal(c.document.getElementById(id).value,'');
  assert(c.calls.some(x=>x[0]==='focus'&&x[1]==='lpass'));
  assert.equal(c.pending(),null);
  console.log('Cadastro: e-mail existente (PF/PJ), confirmação válida, sessão, CAPTCHA, erro de envio e volta ao login verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
