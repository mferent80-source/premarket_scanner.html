import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync('holdings/layout.js','utf8');
function element(dataset={}){return {dataset,hidden:false,children:[],attrs:{},innerHTML:'',textContent:'',querySelectorAll(){return [];},querySelector(){return null;},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(...xs){this.children=xs;},focus(){},scrollIntoView(){}};}
function setup(){
 const saved=new Map(),ids=Object.fromEntries(['managementReports','holdingManagement','status','holdingQuickList','selectedHoldingLabel','selectedAnalysis','rosterBody','toggleHoldingRoster'].map(k=>[k,element()]));
 ids.holdingManagement.hidden=true;
 const cards=['A','B'].map(ticker=>{const card=element({ticker}),tabs=['summary','plan'].map(k=>element({holdingTab:k})),panels=['summary','plan'].map(k=>element({holdingPanel:k}));card.querySelectorAll=q=>q==='[data-holding-tab]'?tabs:q==='[data-holding-panel]'?panels:[];card.tabs=tabs;card.panels=panels;card.unsavedNote='Draft intact';return card;});
 const document={body:{dataset:{holdingsView:'full'}},getElementById:k=>ids[k],querySelectorAll:q=>q==='.holding[data-ticker]'?cards:[],querySelector:()=>null};
 const sandbox={document,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},addEventListener(){},matchMedia:()=>({matches:false})};vm.runInNewContext(script,sandbox);
 const row=ticker=>({p:{ticker,name:ticker,value:20,unrealized:2,currency:'USD'},m:null}),ctx=scope=>({scope,demo:false,symbol:p=>p.ticker,positions:cards.map(c=>row(c.dataset.ticker).p)});
 return {layout:sandbox.HoldingsLayout,cards,ctx,row,ids,saved,document};
}
test('selected holding follows its ticker through sorting, filtering and account changes',()=>{
 const {layout,cards,ctx,row}=setup();layout.render(ctx('account-a'),[row('A'),row('B')]);layout.pick('B');
 layout.render(ctx('account-a'),[row('B'),row('A')]);assert.equal(cards[1].hidden,false);assert.equal(cards[0].hidden,true);
 layout.render(ctx('account-b'),[row('A'),row('B')]);assert.equal(cards[0].hidden,false);
 layout.render(ctx('account-a'),[row('A'),row('B')]);assert.equal(cards[1].hidden,false);
 layout.render(ctx('account-a'),[row('A')]);assert.equal(cards[0].hidden,false);assert.equal(cards[1].hidden,true);
 layout.render(ctx('account-a'),[]);assert.ok(cards.every(c=>c.hidden));
});
test('detail tabs switch visibility while preserving edits and account-specific preferences',()=>{
 const {layout,cards,ctx,row,saved}=setup();layout.render(ctx('account-a'),[row('A')]);cards[0].tabs[1].onclick();
 assert.equal(cards[0].panels[1].hidden,false);assert.equal(cards[0].panels[0].hidden,true);assert.equal(cards[0].unsavedNote,'Draft intact');
 layout.render(ctx('account-b'),[row('A')]);assert.equal(cards[0].panels[0].hidden,false);
 layout.render(ctx('account-a'),[row('A')]);assert.equal(cards[0].panels[1].hidden,false);
 const prefs=JSON.parse(saved.get('tt_holdings_layout_v1'));assert.equal(prefs.accounts['account-a'].detailTabs.A,'plan');
});
test('demo layout never writes fictitious selections into persistent account preferences',()=>{
 const {layout,ctx,row,saved}=setup();layout.render({...ctx('educational-demo'),demo:true},[row('A'),row('B')]);layout.pick('B');assert.equal(saved.size,0);
});
test('reports move as live nodes and retain disclosure state after their controls rerender',()=>{
 const {layout,ids}=setup();ids.holdingManagement.hidden=false;let reports=[element(),element()];ids.holdingManagement.querySelectorAll=()=>reports;ids.managementReports.querySelectorAll=()=>ids.managementReports.children;
 layout.organize();assert.equal(ids.managementReports.children[0],reports[0]);ids.managementReports.children[0].open=true;
 reports=[element(),element()];layout.organize();assert.equal(ids.managementReports.children[0],reports[0]);assert.equal(reports[0].open,true);
 ids.holdingManagement.hidden=true;layout.organize();assert.equal(ids.managementReports.hidden,true);assert.equal(ids.managementReports.children.length,0);
});
