import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const workspaceSource = readFileSync('lib/journal-workspace.js', 'utf8');
const journalSource = readFileSync('lib/journal.js', 'utf8');
const journalPage = readFileSync('journal/index.html', 'utf8');
const decode = value => String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => '$' + Number(value).toFixed(2);

// The UI uses browser-provided dialog focus containment. This DOM records native
// dialog calls and dispatches their close/cancel events; the browser smoke test
// verifies the browser's own containment and responsive visibility.
class Element {
  constructor(tag, document, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.style = {};
    this.hidden = false;
    this.open = false;
    this.value = '';
    this.checked = false;
    this.tabIndex = 0;
    this._text = '';
    this._html = '';
    this.showModalCalls = 0;
    this.classList = {
      contains: cls => this.classes().includes(cls),
      add: (...classes) => this.setAttribute('class', [...new Set([...this.classes(), ...classes])].join(' ')),
      remove: (...classes) => this.setAttribute('class', this.classes().filter(c => !classes.includes(c)).join(' ')),
      toggle: (cls, force) => {
        const on = force ?? !this.classList.contains(cls);
        if (on) this.classList.add(cls); else this.classList.remove(cls);
        return on;
      }
    };
    for (const [key, value] of Object.entries(attrs)) this.setAttribute(key, value);
  }
  classes() { return (this.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
  get dataset() {
    return Object.fromEntries(Object.entries(this.attributes).filter(([k]) => k.startsWith('data-')).map(([k,v]) => [k.slice(5).replace(/-([a-z])/g, (_,c) => c.toUpperCase()), v]));
  }
  get id() { return this.getAttribute('id'); }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'hidden') this.hidden = true;
    if (key === 'tabindex') this.tabIndex = Number(value);
    if (key === 'value') this.value = String(value);
    if (key === 'style') for (const declaration of String(value).split(';')) { const colon = declaration.indexOf(':'); if (colon > 0) this.style[declaration.slice(0,colon).trim()] = declaration.slice(colon+1).trim(); }
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'hidden') this.hidden = false; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(value) { this.children = []; this._text = String(value); this._html = ''; }
  get innerHTML() { return this._html; }
  set innerHTML(value) {
    this._html = String(value);
    this.children = [];
    this._text = '';
    const stack = [this];
    for (const token of this._html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith('<!')) continue;
      if (token.startsWith('<')) {
        const tag = token.match(/^<([a-z][\w-]*)/i)?.[1];
        if (!tag) continue;
        const attrs = {};
        const content = token.slice(tag.length + 1, -1);
        for (const match of content.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
        const child = new Element(tag, this.ownerDocument, attrs);
        child.parentElement = stack.at(-1);
        child.parentElement.children.push(child);
        if (!['br','input','img','hr','meta','link'].includes(tag.toLowerCase()) && !token.endsWith('/>')) stack.push(child);
      } else stack.at(-1)._text += decode(token);
    }
  }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(s => this.matches(s.trim()));
    selector = selector.trim();
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    for (const [,cls] of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(cls)) return false;
    for (const match of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
      if (this.getAttribute(match[1]) == null || (match[2] != null && this.getAttribute(match[1]) !== match[2])) return false;
    }
    const id = selector.match(/#([\w-]+)/)?.[1];
    return !id || this.id === id;
  }
  querySelectorAll(selector) {
    const direct = selector.startsWith(':scope > ');
    if (direct) selector = selector.slice(9);
    const all = direct ? this.children : this.children.flatMap(c => [c, ...c.descendants()]);
    return all.filter(c => c.matches(selector));
  }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    event.defaultPrevented ??= false;
    event.preventDefault ??= function() { this.defaultPrevented = true; };
    event.stopPropagation ??= () => {};
    for (const callback of this.listeners.get(event.type) || []) callback(event);
    this['on' + event.type]?.(event);
    return !event.defaultPrevented;
  }
  click() { this.dispatchEvent({type:'click'}); }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.showModalCalls++; this.open = true; }
  close() { this.open = false; this.dispatchEvent({type:'close'}); }
  get isConnected() { return this === this.ownerDocument.body || !!this.parentElement; }
  contains(other) { return other === this || this.descendants().includes(other); }
}

function makeDocument(markup) {
  const document = {activeElement:null};
  document.body = new Element('body', document);
  document.body.innerHTML = markup;
  document.getElementById = id => document.body.descendants().find(e => e.id === id) ?? null;
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.querySelector = selector => document.body.querySelector(selector);
  return document;
}

function workspace({classic = false, search = ''} = {}) {
  const body = journalPage.match(/<body\b[^>]*>([\s\S]*?)<script\b/i)?.[1] || '';
  const document = makeDocument(body);
  const store = new Map();
  const edits = [], renders = [], alerts = [];
  const context = {console,Date,Intl,URLSearchParams,document,
    localStorage:{getItem:k => store.get(k) ?? null, setItem:(k,v) => store.set(k,String(v))},
    confirm:() => true, alert:msg => alerts.push(msg), prompt:() => null,
    location:{search,reload(){}}, requestAnimationFrame:fn => fn()};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(journalSource,context);
  if (classic) context.JR.saveSettings({workspaceV2:false});
  vm.runInContext(workspaceSource,context);
  const $ = id => document.getElementById(id);
  context.JWS.init({$,esc,fmt$:money,TAGS:['FOMO','Plan respectat'],
    isOpenE:e => e.exit == null, fillForm:e => edits.push(e.id),
    renderAll:() => renders.push(true),openPriceCache:{AAPL:105,MSFT:190}});
  return {context,document,$,edits,renders,alerts};
}

function fixture(JR,patch = {}) {
  const now = Date.now();
  return JR.add({sym:'AAPL',dir:'long',entry:100,size:10,fees:2,slAtEntry:95,
    openTs:now-86400000,source:'manual',tags:[],...patch});
}

function region(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing UI region: ${start}`);
  return source.slice(from,to);
}

function tabs({embedded = true, search = ''} = {}) {
  const body = journalPage.match(/<body\b[^>]*>([\s\S]*?)<script\b/i)?.[1] || '';
  const document = makeDocument(body);
  const messages = [], historyEvents = [];
  const location = {hash:'',search,origin:'https://trading.example'};
  const context = {document,URLSearchParams,location,console,scrollTo(){},
    history:{
      replaceState:(_state,_title,hash) => { location.hash = hash; historyEvents.push(['replace',hash]); },
      pushState:(_state,_title,hash) => { location.hash = hash; historyEvents.push(['push',hash]); }
    }};
  context.window = context;
  context.parent = embedded ? {postMessage:(message,origin) => messages.push({message,origin})} : context;
  vm.createContext(context);
  vm.runInContext('let jTab = "desk", jTabInitialized = false;\n' + region(journalPage,'function setJTab(', 'function sbToast('),context);
  return {context,document,messages,historyEvents};
}

test('workspace tab keys select the correct panel and preserve one keyboard entry point', () => {
  const {context,document} = tabs();
  context.setJTab('desk',{notify:false});
  const buttons = document.querySelectorAll('.jr-tab');
  const active = () => buttons.filter(b => b.tabIndex === 0);
  const check = name => {
    assert.equal(active().length,1);
    assert.equal(active()[0].dataset.jtab,name);
    assert.equal(active()[0].getAttribute('aria-selected'),'true');
    const panel = document.getElementById(active()[0].getAttribute('aria-controls'));
    assert.ok(panel,'active tab must point to a real panel');
    assert.equal(panel.hidden,false);
    assert.equal(panel.getAttribute('aria-labelledby'),active()[0].id);
    assert.equal(document.querySelectorAll('.jr-pane').filter(p => !p.hidden).length,1);
  };
  check('desk');
  for (const [key,expected] of [['ArrowRight','setup'],['End','capital'],['ArrowRight','desk'],['ArrowLeft','capital'],['Home','desk']]) {
    const event = {type:'keydown',key};
    active()[0].dispatchEvent(event);
    assert.equal(event.defaultPrevented,true);
    check(expected);
    assert.equal(document.activeElement,active()[0]);
  }
});

test('embedded workspace reports explicit tab changes and suppresses initialization/restoration', () => {
  const {context,messages,historyEvents} = tabs({search:'?sym=su.pa'});
  context.setJTab('portfolio',{notify:false});
  assert.equal(messages.length,0);
  assert.equal(historyEvents[0][1],'#portfolio&sym=SU.PA');
  context.setJTab('exec');
  assert.equal(messages.length,1);
  assert.equal(messages[0].origin,'https://trading.example');
  assert.equal(messages[0].message.ttModuleState.module,'journal/');
  assert.equal(messages[0].message.ttModuleState.hash,'#exec');
  context.setJTab('exec');
  assert.equal(messages.length,1,'same-tab refresh must not create another history entry');
  context.setJTab('desk',{notify:false});
  assert.equal(messages.length,1,'restoring a tab must not report a new user navigation');
});

test('standalone workspace keeps browser Back history for explicit tab changes', () => {
  const {context,historyEvents} = tabs({embedded:false});
  context.setJTab('desk',{notify:false});
  context.setJTab('exec');
  assert.equal(historyEvents[0][0],'replace');
  assert.equal(historyEvents[1][0],'push');
  assert.equal(historyEvents[1][1],'#exec');
});

test('journal tags expose toggle state and return exactly the selected tags', () => {
  const document = makeDocument('<div id="tagRow"></div>');
  const context = {document,TAGS:['FOMO','Plan respectat'],esc,$:id => document.getElementById(id)};
  vm.createContext(context);
  vm.runInContext(region(journalPage,'function renderTagRow(', 'function resetForm('),context);
  context.renderTagRow(['Plan respectat']);
  const buttons = document.querySelectorAll('.tagchip');
  assert.ok(buttons.every(b => b.tagName === 'BUTTON'));
  assert.equal(buttons[0].getAttribute('aria-pressed'),'false');
  assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
  buttons[0].click();
  buttons[1].click();
  assert.equal(buttons[0].getAttribute('aria-pressed'),'true');
  assert.equal(buttons[1].getAttribute('aria-pressed'),'false');
  assert.deepEqual(Array.from(context.selectedTags()),['FOMO']);
});

function ledgerParts(wrap) {
  const desktop = wrap.querySelector('.exec-desktop-table');
  const mobile = wrap.querySelector('.exec-mobile-cards');
  assert.ok(desktop && mobile,'both responsive representations must be rendered');
  assert.equal(mobile.getAttribute('role'),'list');
  const table = desktop.querySelector('table.exec-ledger');
  const rows = table.querySelector('tbody').children;
  const cards = mobile.querySelectorAll('article.exec-card');
  assert.equal(rows.length,cards.length);
  for (const card of cards) {
    assert.equal(card.getAttribute('role'),'listitem');
    assert.ok(card.querySelector('details.exec-card-details'));
  }
  return {desktop,mobile,table,rows,cards};
}

test('open cards and desktop ledger preserve JR valuations without doubling the total', () => {
  const {context,$} = workspace();
  const a = fixture(context.JR);
  const b = fixture(context.JR,{sym:'MSFT',dir:'short',entry:200,slAtEntry:205});
  const c = fixture(context.JR,{sym:'SU.PA',quoteCurrency:'EUR',fxEntryUsd:1.1,markPrice:105});
  const before = JSON.stringify(context.JR.all());
  context.JWS.renderExecTable();
  const {rows,cards} = ledgerParts($('tblWrap'));
  for (const [entry,expected] of [[a,'+$50.00'],[b,'+$100.00'],[c,'—']]) {
    const row = rows.find(r => r.children[0].textContent === entry.sym);
    const card = cards.find(r => r.dataset.executionId === entry.id);
    assert.equal(row.children[6].querySelector('span').textContent,expected);
    assert.equal(card.querySelector('.exec-card-result').querySelector('strong').textContent,expected);
    assert.ok(card.textContent.includes(context.JR.quotePrice(entry,entry.entry)));
    assert.ok(card.textContent.includes(context.JR.quotePrice(entry,entry.slAtEntry)));
  }
  assert.equal($('openUnrealSum').textContent,'PnL nerealizat total: +$150.00');
  assert.equal(JSON.stringify(context.JR.all()),before,'view rendering must preserve journal data');
});

test('closed cards retain net FX-aware PnL, R, fees and financial values from JR', () => {
  const {context,$} = workspace();
  const now = Date.now();
  const a = fixture(context.JR,{exit:110,closeTs:now,notes:'Closing note'});
  const b = fixture(context.JR,{sym:'SU.PA',quoteCurrency:'EUR',fxEntryUsd:1.1,fxExitUsd:1.2,exit:110,closeTs:now});
  const before = JSON.stringify(context.JR.all());
  $('execSubtabs').querySelector('[data-exec-view="closed"]').click();
  const {rows,cards} = ledgerParts($('tblWrap'));
  for (const entry of [a,b]) {
    const expected = '+' + money(context.JR.pnl(entry));
    const expectedR = '+' + context.JR.rMult(entry).toFixed(2) + 'R';
    const row = rows.find(r => r.children[0].textContent === entry.sym);
    const card = cards.find(r => r.dataset.executionId === entry.id);
    assert.equal(row.children[2].textContent,expected);
    assert.equal(row.children[3].textContent,expectedR);
    assert.equal(card.querySelector('.exec-card-result').querySelector('strong').textContent,expected);
    assert.ok(card.textContent.includes(expectedR));
    assert.ok(card.textContent.includes(context.JR.quotePrice(entry,entry.exit)));
    assert.ok(card.textContent.includes(money(entry.fees)));
    for (const root of [row,card]) {
      const review = root.querySelector('a.act');
      assert.equal(review.getAttribute('href'),'../postmortem/?id=' + encodeURIComponent(entry.id));
      assert.ok(review.getAttribute('aria-label').includes(entry.sym));
    }
  }
  assert.equal($('openUnrealSum').textContent,'');
  assert.equal(JSON.stringify(context.JR.all()),before);
});

test('both responsive ledgers bind labelled edit and delete to the correct execution', () => {
  const {context,$,edits,renders} = workspace();
  const entry = fixture(context.JR);
  context.JWS.renderExecTable();
  const {rows,cards} = ledgerParts($('tblWrap'));
  for (const root of [rows[0],cards[0]]) {
    const edit = root.querySelector('[data-edit]');
    assert.equal(edit.getAttribute('aria-label'),'Editează execuția AAPL');
    edit.click();
    assert.equal(edits.at(-1),entry.id);
    const remove = root.querySelector('[data-del]');
    assert.equal(remove.getAttribute('aria-label'),'Șterge execuția AAPL');
  }
  cards[0].querySelector('[data-del]').click();
  assert.equal(context.JR.all().length,0);
  assert.equal(renders.length,1);
});

test('native close dialog focuses exit, handles cancel and restores its opening control', () => {
  const {context,$,document} = workspace();
  const entry = fixture(context.JR);
  context.JWS.renderExecTable();
  const trigger = $('tblWrap').querySelector('.exec-mobile-cards').querySelector('[data-close]');
  trigger.focus();
  trigger.click();
  const dialog = $('jrCloseSheet');
  assert.equal(dialog.tagName,'DIALOG');
  assert.equal(dialog.showModalCalls,1);
  assert.equal(dialog.open,true);
  assert.equal(document.activeElement,$('jrCloseExit'));
  assert.equal(Number($('jrCloseExit').value),105);
  const tags = $('jrCloseTagRow').querySelectorAll('.tagchip');
  assert.ok(tags.every(t => t.tagName === 'BUTTON'));
  tags[0].click();
  assert.equal(tags[0].getAttribute('aria-pressed'),'true');
  const event = {type:'cancel'};
  dialog.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);
  assert.equal(dialog.open,false);
  assert.equal(document.activeElement,trigger);
  assert.equal(context.JR.all()[0].id,entry.id);
  assert.equal(context.JR.all()[0].exit,null,'Escape/cancel must not close the trade');
  trigger.click();
  dialog.close();
  assert.equal(document.activeElement,trigger,'a native external close also restores focus');
});

test('confirming the close dialog writes JR once and preserves its net financial result', () => {
  const {context,$,document,renders} = workspace();
  const entry = fixture(context.JR);
  context.JWS.renderExecTable();
  const trigger = $('tblWrap').querySelector('[data-close]');
  trigger.focus();
  trigger.click();
  $('jrCloseExit').value = '110';
  $('jrCloseFees').value = '3';
  $('jrCloseExit').dispatchEvent({type:'input'});
  assert.equal($('jrClosePreview').textContent,'PnL net estimat: +$97.00');
  $('jrCloseTagRow').querySelector('.tagchip').click();
  $('jrCloseConfirm').click();
  const saved = context.JR.all().find(e => e.id === entry.id);
  assert.equal(context.JR.pnl(saved),97);
  assert.equal(saved.exit,110);
  assert.equal(saved.fees,3);
  assert.ok(saved.tags.includes('FOMO'));
  assert.equal($('jrCloseSheet').open,false);
  assert.equal(document.activeElement === $('openPanelTitle'),true, 'closing removes the old row, so focus moves to the stable ledger heading');
  assert.match($('jrExecActionStatus').textContent,/Execuția AAPL a fost închisă/);
  assert.equal(renders.length,1);
});

test('classic journal also uses native closure and the responsive ledger without altering settings', () => {
  const {context,$,document} = workspace({classic:true});
  const entry = fixture(context.JR);
  assert.equal(context.JWS.renderExecTable(),false);
  assert.equal(context.JWS.renderLegacyOpen(),true);
  const {cards} = ledgerParts($('tblWrap'));
  const trigger = cards[0].querySelector('[data-close]');
  trigger.focus();
  trigger.click();
  assert.equal($('jrCloseSheet').open,true);
  $('jrCloseCancel').click();
  assert.equal(document.activeElement,trigger);
  assert.equal(context.JR.getSettings().workspaceV2,false);
  assert.equal(context.JR.all()[0].id,entry.id);
});

test('ticker search filters both representations and labels the sum for the visible subset', () => {
  const {context,$} = workspace({search:'?symbol=msft'});
  fixture(context.JR);
  const entry = fixture(context.JR,{sym:'MSFT',dir:'short',entry:200,slAtEntry:205});
  context.JWS.renderExecTable();
  const {rows,cards} = ledgerParts($('tblWrap'));
  assert.equal(rows.length,1);
  assert.equal(rows[0].children[0].textContent,'MSFT');
  assert.equal(cards[0].dataset.executionId,entry.id);
  assert.equal($('openUnrealSum').textContent,'PnL nerealizat pentru filtrul ales: +$100.00');
  $('jrExecSearch').value = 'no-such-ticker';
  $('jrExecSearch').dispatchEvent({type:'input'});
  assert.equal($('tblWrap').querySelector('.exec-mobile-cards'),null);
  assert.equal($('openUnrealSum').textContent,'');
});

test('capital details use labelled buttons, preserve disclosure after refresh and leave totals unchanged', () => {
  const {context,$} = workspace();
  vm.runInContext(readFileSync('lib/equity.js','utf8'),context);
  context.EQ.addSnapshot(1000,'Capital de test',{ts:Date.now()-2*86400000});
  fixture(context.JR,{exit:110,status:'closed',closeTs:Date.now()-86400000});
  context.$ = $;
  context.esc = esc;
  context.openPriceCache = {};
  context.isOpenE = context.JR.isOpen;
  context.setJTab = () => {};
  vm.runInContext(region(journalPage,'function fmtUsd0(', 'function renderCapitalPanel('),context);
  context.renderCapitalDrill();
  const before = context.EQ.drawdownStats().current;
  const button = $('capDrill').querySelector('[data-cap-row="pnl"]');
  assert.equal(button.tagName,'BUTTON');
  assert.match(button.textContent,/PnL realizat/);
  assert.equal(button.getAttribute('aria-expanded'),'false');
  const detail = $(button.getAttribute('aria-controls'));
  assert.equal(detail.style.display,'none');
  button.click();
  assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(detail.style.display,'');
  assert.match(detail.textContent,/AAPL/);
  context.renderCapitalDrill();
  const refreshed = $('capDrill').querySelector('[data-cap-row="pnl"]');
  assert.equal(refreshed.getAttribute('aria-expanded'),'true');
  assert.equal(context.EQ.drawdownStats().current,before);
  refreshed.click();
  assert.equal(refreshed.getAttribute('aria-expanded'),'false');
});

test('scorecard segmentation does not capture execution filters or capital mode controls', () => {
  const {context,document} = tabs();
  let renders = 0;
  context.renderSeg = () => { renders++; };
  vm.runInContext('let seg = "source"; const segOpen = new Set();\n' + region(journalPage,"document.querySelectorAll('.seg-tab[data-seg]')",'// ── Tabel execuții'),context);
  const source = document.querySelector('[data-seg="source"]');
  const ticker = document.querySelector('[data-seg="sym"]');
  ticker.click();
  assert.equal(renders,1);
  assert.equal(ticker.classList.contains('active'),true);
  assert.equal(source.classList.contains('active'),false);
  document.querySelector('[data-exec-filter="today"]').click();
  document.querySelector('[data-cap-mode="lite"]').click();
  assert.equal(renders,1,'unrelated controls must not rerender the scorecard with an undefined segment');
  assert.equal(ticker.classList.contains('active'),true);
});
