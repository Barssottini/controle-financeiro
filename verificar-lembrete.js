// Executa o lembrete e a confirmação real da importação, sem rede ou contas reais.
const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const reminder=html.slice(html.indexOf('function checkReminder(){'),html.indexOf('// ═══ PERÍODO DO PAINEL'));
const confirm=html.slice(html.indexOf('async function confirmImport(){'),html.indexOf('// ═══ BANK GUIDE'));
function client(tipo,settings={}){
 const S={settings:{accountType:tipo,...settings},transactions:[]},els=new Map(),saved=[];
 const document={visibilityState:'visible',addEventListener(){},querySelectorAll(){return [];},getElementById(id){
  if(id==='imp-submit')return null;
  if(!els.has(id)){const classes=new Set();els.set(id,{value:'',innerHTML:'',classList:{add:x=>classes.add(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)}});}
  return els.get(id);
 }};
 const api=new Function('S','document','saved',`
 let now='2026-11-13T12:00:00';const NativeDate=globalThis.Date;
 class FakeDate extends NativeDate{constructor(v){super(v===undefined?now:v);}}const Date=FakeDate;
 const monthKeyOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
 const localStorage={getItem(){return null;},setItem(){}};
 const persistSettings=()=>saved.push(JSON.parse(JSON.stringify(S.settings)));
 const imp={busy:false,undo:[]};let parsedRows=[],parsedBal=null,parsedFile='',selected=[],answer=true,nextId=0;
 const estadoImport=()=>selected,showAlert=()=>{},showConfirm=async()=>answer,atualizarTotaisImport=()=>{},contaDoImport=()=>1,contaDe=t=>t.conta;
 const newId=()=>++nextId,persist=()=>{},updateDashboard=()=>checkReminder(),populateMonthFilter=()=>{},etapaImport=()=>{},esc=x=>x,nomeDaConta=()=> 'Banco';
 ${reminder}${confirm}
 return {checkReminder,confirmImport,S,setDate:v=>now=v,prepare:(maybe=false)=>{parsedRows=[{description:'Extrato',amount:10,date:'2026-10-10',type:'income'}];selected=[{checked:true,maybe,i:0}];},cancel:()=>answer=false,hidden:()=>document.getElementById('reminder-bar').classList.contains('hidden')};
 `)(S,document,saved);
 return {...api,saved};
}
(async()=>{
 for(const tipo of ['pf','pj']){
  let c=client(tipo);c.checkReminder();assert.equal(c.hidden(),false);
  await c.confirmImport();assert.equal(c.saved.length,0); // sem seleção não é importação
  c.prepare(true);c.cancel();await c.confirmImport();assert.equal(c.saved.length,0); // cancelar não esconde
  c=client(tipo);c.prepare();await c.confirmImport();assert.equal(c.hidden(),true);
  assert.equal(c.saved[0].extratoImportadoMes,'2026-11'); // mês da ação, não o mês do extrato
  c=client(tipo,c.saved[0]);c.checkReminder();assert.equal(c.hidden(),true); // reabrir/outro aparelho
  c.setDate('2026-11-30T23:59:59');c.checkReminder();assert.equal(c.hidden(),true);
  c.setDate('2026-12-01T00:00:00');c.checkReminder();assert.equal(c.hidden(),false);
  c.prepare();await c.confirmImport();assert.equal(c.hidden(),true);assert.equal(c.S.settings.extratoImportadoMes,'2026-12');
  c.setDate('2027-01-01T00:00:00');c.checkReminder();assert.equal(c.hidden(),false);
  const other=client(tipo);other.checkReminder();assert.equal(other.hidden(),false); // contas isoladas
 }
 console.log('Lembrete PF/PJ: confirmação real, cancelamento, persistência por conta, mês da importação e viradas de mês/ano OK.');
})().catch(e=>{console.error(e);process.exitCode=1});
