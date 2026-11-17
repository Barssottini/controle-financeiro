const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
const code=html.slice(html.indexOf('function proximaCobrancaAssinatura('),html.indexOf('function renderBillsPage(){'));
const els={};
const rows=[{id:1,name:'Streaming <teste>',subscription:true,kind:'pay',amount:30,day:31},{id:2,name:'Software',subscription:true,kind:'pay',amount:20,day:10},{id:3,name:'Aluguel',amount:900,day:10},{id:4,name:'Recebimento',subscription:true,kind:'receive',amount:300,day:10}];
const ctx={document:{getElementById:id=>els[id]??={}},billsVis:()=>rows,billKind:b=>b.kind||'pay',setCurAnimated:(id,v)=>{els[id]=v},fmtCur:v=>String(v),emptyHTML:v=>v,esc:v=>v.replace(/</g,'&lt;'),billStatus:()=>({k:'open',label:'Em aberto',color:'red'}),monthKeyOf:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),billPaidThisMonth:(b,m)=>(b.paidMonths||[]).includes(m)};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.renderSubscriptions();assert.equal(els['subscriptions-total'],50);assert(!els['subscriptions-list'].innerHTML.includes('Aluguel'));assert(!els['subscriptions-list'].innerHTML.includes('Recebimento'));assert(els['subscriptions-list'].innerHTML.includes('&lt;teste>'));
const next=(b,d)=>{const x=ctx.proximaCobrancaAssinatura(b,new Date(d));return [x.getFullYear(),x.getMonth()+1,x.getDate()]};
assert.deepEqual(next({day:31},'2026-02-01T12:00:00'),[2026,2,28]);
assert.deepEqual(next({day:31,paidMonths:['2026-12']},'2026-12-31T12:00:00'),[2027,1,31]);
assert.deepEqual(next({day:10},'2026-11-11T12:00:00'),[2026,12,10]);
// Separação: a lista de Contas (billsDaAba) não mostra assinaturas.
const aba=html.match(/function billsDaAba\(\)\{.*\}/)[0];let tab='pay';
const daAba=vm.runInNewContext(aba+';billsDaAba',{billsTab:()=>tab,billsVis:()=>rows,billKind:ctx.billKind});
assert.deepEqual(daAba().map(b=>b.name),['Aluguel']);tab='receive';assert.deepEqual(daAba().map(b=>b.name),['Recebimento']);
rows.length=0;ctx.renderSubscriptions();assert.equal(els['subscriptions-total'],0);
console.log('OK: assinaturas, totais sem duplicacao, escape, mes curto, virada de ano e estado vazio');
