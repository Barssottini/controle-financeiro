// Isolated browser test: no login, network, or user data. Uses the actual import UI/code.
const fs=require('fs'),path=require('path'),assert=require('assert');
// Requires Playwright and local Microsoft Edge. NODE_PATH may point to an external test install.
const {chromium}=require('playwright');
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const markup=html.slice(html.indexOf('    <!-- IMPORT -->'),html.indexOf('    <!-- BUDGET -->'));
 const code=html.slice(html.indexOf('let parsedRows=[];'),html.indexOf('// ═══ PERSISTENCE',html.indexOf('let parsedRows=[];')));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 page.on('pageerror',e=>console.error(e.message));
 await page.route('**/*',route=>route.abort());
 await page.setContent('<style>'+css+' .page{display:block!important;max-width:1100px;margin:auto;padding:24px}body{display:block!important}</style>'+markup);
 await page.addScriptTag({content:`
 const S={settings:{},transactions:[{id:1,conta:1,type:'expense',description:'Compra existente',amount:50,date:'2026-11-01',category:'Outros'}]};
 const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 const fmtCur=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v),fmtDate=v=>v;
 const contas=()=>[{id:1,nome:'Nubank'},{id:2,nome:'Itaú'}],contaDe=t=>t.conta,contaPadraoId=()=>1,nomeDaConta=id=>contas().find(c=>c.id===id).nome;
 let nextId=10;const newId=()=>++nextId,persist=()=>{},persistSettings=()=>{},updateDashboard=()=>{},populateMonthFilter=()=>{},toast=()=>{},showPage=()=>{},showAlert=async()=>{},showConfirm=async()=>true,saldoDaConta=()=>0,precisaEscolherBanco=()=>false;
 function registrarImportacaoMes(){S.settings.importou=true;S.settings.extratoImportadoMes='2026-11';}
 `+code});
 await page.evaluate(()=>buildBankGuide());
 await page.screenshot({path:path.join(process.env.TEMP,'north-import-upload.png')});
 await page.evaluate(()=>{
 parsedRows=[{type:'expense',description:'Nova compra',amount:100,date:'2026-11-02',category:'Outros'},
 {type:'expense',description:'Compra similar',amount:50,date:'2026-11-01',category:'Outros'},
 {type:'expense',description:'Compra existente',amount:50,date:'2026-11-01',category:'Outros'}];
 renderImportPreview('extrato.ofx');
 });
 assert.equal(await page.locator('.imp-chk:checked').count(),1);
 await page.locator('.imp-compare summary').click();
 assert(await page.locator('.imp-compare p').isVisible());
 await page.locator('#imp-bulk').selectOption('Alimentação');await page.getByText('Aplicar aos selecionados',{exact:true}).click();
 assert.equal(await page.evaluate(()=>parsedRows[0].category),'Alimentação');
 await page.locator('.imp-chk').first().uncheck();
 await page.locator('#imp-conta').selectOption('2');
 assert.equal(await page.locator('.imp-chk').first().isChecked(),false);
 await page.locator('#imp-conta').selectOption('1');
 await page.getByText('Selecionar novas',{exact:true}).click();
 assert.equal(await page.locator('.imp-chk:checked').count(),1);
 await page.getByRole('button',{name:/Possíveis duplicatas/}).click();
 assert.equal(await page.locator('.imp-row').count(),1);
 assert.equal(await page.locator('#imp-count').textContent(),'1'); // hidden selections still count
 await page.getByRole('button',{name:/Todas ·/}).click();
 await page.screenshot({path:path.join(process.env.TEMP,'north-import-review.png')});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(process.env.TEMP,'north-import-mobile.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.evaluate(()=>{parsedBal={amt:200,date:'2026-11-02'};});
 await page.locator('#imp-submit').click();
 assert.equal(await page.evaluate(()=>S.transactions.length),3); // original, new, reconciliation
 assert(await page.getByText('1 lançamentos importados',{exact:true}).isVisible());
 await page.evaluate(()=>S.transactions.push({id:999,conta:1,description:'Criado depois',amount:1}));
 await page.getByRole('button',{name:'Desfazer importação',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>S.transactions.map(t=>t.id)),[1,999]);
 assert(await page.locator('#imp-upload').isVisible());
 console.log('OK: review, duplicates, bulk category, account changes, filters, mobile overflow, confirmation, reconciliation and undo isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

