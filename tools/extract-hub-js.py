# -*- coding: utf-8 -*-
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
src = (ROOT / "index.html").read_text(encoding="utf-8")
lines = src.splitlines()
pb_body = "\n".join(lines[1850:2914])
ledger_body = "\n".join(lines[2917:3022])

if pb_body.strip().startswith("(function(){"):
    pb_body = pb_body.split("\n", 1)[1]
if pb_body.rstrip().endswith("})();"):
    pb_body = pb_body.rstrip()[:-5].rstrip()

if ledger_body.strip().startswith("(function(){"):
    ledger_body = ledger_body.split("\n", 1)[1]
if ledger_body.rstrip().endswith("})();"):
    ledger_body = ledger_body.rstrip()[:-5].rstrip()

COCKPIT = r'''
  function getHubSessionMode(){
    try {
      const o = localStorage.getItem('hub_session_mode');
      if (o === 'pre' || o === 'rth' || o === 'review') return o;
    } catch(e){}
    const s = (window.__hubMkt && window.__hubMkt.session) || 'rth';
    if (s === 'pre' || s === 'after') return 'pre';
    if (s === 'weekend' || s === 'closed') return 'review';
    return 'rth';
  }
  function applyHubSessionMode(){
    const mode = getHubSessionMode();
    document.body.dataset.hubMode = mode;
    ['hubModePre','hubModeRth','hubModeReview'].forEach(id => {
      const b = $(id);
      if (!b) return;
      const on = (id === 'hubModePre' && mode === 'pre') || (id === 'hubModeRth' && mode === 'rth') || (id === 'hubModeReview' && mode === 'review');
      b.classList.toggle('on', on);
    });
    const tier2 = $('pbTier2');
    if (tier2 && mode === 'review') tier2.open = true;
  }
  function cmdCell(lbl, val, sub, lvl, extra){
    return '<div class="hub-cmd-cell lvl-'+lvl+'"><div class="hub-cmd-lbl">'+escHtml(lbl)+'</div><div class="hub-cmd-val">'+val+'</div><div class="hub-cmd-sub">'+escHtml(sub||'—')+'</div>'+(extra||'')+'</div>';
  }
  function renderHubCmd(){
    const el = $('hubCmd');
    if (!el || !window.RT) return;
    try {
      const p = RT.evaluate();
      const c = p.context || RT.buildContext();
      const sd = c.sessionDetail || {};
      const db = c.dangerBand || {};
      const sessLvl = c.session==='open'?'ok':(c.session==='pre'||c.session==='after')?'warn':'neut';
      const regLvl = c.regimeNorm==='risk-on'?'ok':c.regimeNorm==='risk-off'?'bear':'warn';
      const j = c.journal || {};
      const fmtUsd = v => v==null?'—':((v>=0?'+':'')+'$'+Math.abs(v).toFixed(0));
      el.innerHTML =
        cmdCell('GO', '<span class="go-'+escHtml(p.goCls||'caution')+'">'+p.goScore+'</span>', p.goLabel, p.goCls==='go'?'ok':p.goCls==='caution'?'warn':'bear') +
        cmdCell('Regim', escHtml(c.regime||'—'), (c.composite!=null?((c.composite>=0?'+':'')+c.composite.toFixed(1)):'—'), regLvl) +
        cmdCell('Danger', c.danger!=null?c.danger+'<span class="hub-cmd-dim">/100</span>':'—', escHtml(db.label||''), c.danger>=70?'bear':c.danger>=45?'warn':'ok', p.dangerSpark?'<div class="hub-cmd-spark">'+p.dangerSpark+'</div>':'') +
        cmdCell('Sesiune', escHtml(c.sessionLabel||'—'), sd.countdown||'—', sessLvl) +
        cmdCell('Journal', String(j.closed||0)+' / '+String(j.open||0), fmtUsd(j.todayPnl), 'neut');
    } catch(e){
      el.innerHTML = '<div class="hub-cmd-cell lvl-neut"><div class="hub-cmd-val">Desk n/a</div></div>';
    }
  }
  function renderHubCockpit(){
    renderHubCmd();
    pbShowGovBanner();
    const box = $('hubCockpit');
    if (!box || !window.RT) return;
    try {
      const p = RT.evaluate();
      const c = p.context || RT.buildContext();
      const stay = p.strategy === 'STAY OUT';
      box.className = 'hub-cockpit'+(stay?' stay':'');
      $('hubStrat').textContent = p.strategy;
      $('hubRule').textContent = p.ruleOrder ? ('Regulă #'+p.ruleOrder+(p.matchedNote?' · '+p.matchedNote:'')) : 'Fără regulă matched';
      $('hubMeta').textContent = [p.goLabel,'×'+p.sizingMult,p.tradesLeftToday+' trades',p.presetLabel].filter(Boolean).join(' · ');
      $('hubGoNum').textContent = p.goScore;
      $('hubGoNum').className = 'hub-go-num '+(p.goCls||'caution');
      $('hubGoLbl').textContent = p.goLabel+' · '+p.goScore+'/100';
      const gCol = p.goCls==='go'?'var(--green)':p.goCls==='caution'?'#d4892c':'#ff4d4d';
      const fill = $('hubGoFill');
      if (fill){ fill.style.width=(p.goScore||0)+'%'; fill.style.background=gCol; }
      $('hubBlockers').innerHTML = (p.blockers||[]).slice(0,3).map(b=>'<span class="hub-block '+escHtml(b.cls)+'">'+escHtml(b.text)+'</span>').join('');
      $('hubPlan').textContent = (p.reasons&&p.reasons[0]) ? p.reasons[0] : (p.matchedNote||'Deschide Router pentru plan complet');
      const mf = c.macroFreeze||{};
      const fr = $('hubFreezeTop');
      if (fr){
        if (mf.message){ fr.className='hub-freeze-top '+(mf.active?'red':'amber'); fr.textContent=(mf.active?'🚫 ':'⏳ ')+mf.message; fr.style.display=''; }
        else fr.style.display='none';
      }
      const rv = $('pbRouteVal'), rs = $('pbRouteSub');
      if (rv){
        const col2 = stay?'#ff4d4d':'var(--green)';
        const goCol = p.goCls==='go'?'#22d66b':p.goCls==='caution'?'#d4892c':'#ff4d4d';
        rv.innerHTML = '<span style="color:'+col2+'">🧭 '+escHtml(p.strategy)+'</span> <span style="color:'+goCol+';font-size:12px;font-weight:700">GO '+p.goScore+'</span>';
        if (rs) rs.textContent = [p.goLabel,'×'+p.sizingMult,p.tradesLeftToday+' trades',p.regimeNorm||p.regime,p.presetLabel].filter(Boolean).join(' · ');
      }
      if (window.HB_SL_MINI) HB_SL_MINI.renderReview();
    } catch(e){}
    try {
      if (window.GV){
        const s = GV.status();
        const lb = GV.labelOf(s.verdict);
        const col = lb.cls==='halted'?'#ff4d4d':lb.cls==='caution'?'#d4892c':'var(--green)';
        const gv = $('pbGovVal'), gs = $('pbGovSub');
        if (gv) gv.innerHTML = '<span style="color:'+col+'">🛑 '+escHtml(lb.text)+'</span>';
        if (gs) gs.textContent = 'PnL '+(s.todayPnl>=0?'+':'')+'$'+s.todayPnl.toFixed(2)+' · buget '+s.budgetUsedPct.toFixed(0)+'% · '+s.tradesRemaining+' rămase';
      }
    } catch(e){}
  }
  function pbLoadProDesk(){ renderHubCockpit(); }
  function pbRenderOvernightHero(){
    let store=null;
    try{ store=JSON.parse(localStorage.getItem('pb_daily_snap')||'null'); }catch(e){}
    const cur=store&&store.cur, prev=store&&store.prev;
    const el=$('pbDiffHero');
    if(!el) return;
    if(!cur||!prev){ el.style.display='none'; return; }
    const major = cur.regime&&prev.regime&&cur.regime!==prev.regime;
    const dDanger = typeof cur.danger==='number'&&typeof prev.danger==='number'&&Math.abs(cur.danger-prev.danger)>=5;
    if(!major&&!dDanger){ el.style.display='none'; return; }
    const parts=[];
    if(major) parts.push('regim <b>'+escHtml(prev.regime)+'</b> → <b>'+escHtml(cur.regime)+'</b>');
    if(dDanger) parts.push('Danger '+prev.danger+' → '+cur.danger);
    el.innerHTML='🌙 <b>Schimbare majoră:</b> '+parts.join(' · ');
    el.style.display='';
  }
  const _pbRenderOvernightOrig = pbRenderOvernight;
  pbRenderOvernight = function(){ _pbRenderOvernightOrig(); pbRenderOvernightHero(); };

  function initHubBrief(){
    applyHubSessionMode();
    ['hubModePre','hubModeRth','hubModeReview'].forEach(id => {
      const b=$(id); if(!b) return;
      b.addEventListener('click', () => {
        const m=id==='hubModePre'?'pre':id==='hubModeRth'?'rth':'review';
        try{ localStorage.setItem('hub_session_mode', m); }catch(e){}
        applyHubSessionMode();
      });
    });
    const tier2=$('pbTier2');
    try{
      if(tier2 && localStorage.getItem('pb_tier2_open')==='1') tier2.open=true;
      else if(tier2) tier2.open=false;
    }catch(e){}
    if(tier2) tier2.addEventListener('toggle', ()=>{ try{ localStorage.setItem('pb_tier2_open', tier2.open?'1':'0'); }catch(e){} });
    renderHubCockpit();
    setInterval(()=>{ try{ renderHubCmd(); pbRenderFreeze(); }catch(e){} }, 60000);
  }

  global.HB = { init: initHubBrief, refresh: pbLoadAll, renderCockpit: renderHubCockpit, renderCmd: renderHubCmd, sessionMode: getHubSessionMode };
'''

hub_brief = (
    "// hub-brief.js v1 — Morning Brief + Hub Cockpit\n"
    "(function(global){\n'use strict';\n"
    + pb_body + "\n"
    + COCKPIT
    + "\n})(typeof window !== 'undefined' ? window : global);\n"
)
(ROOT / "lib" / "hub-brief.js").write_text(hub_brief, encoding="utf-8")

LEDGER_EXTRA = r'''
  function slMiniReview(){
    const el = $('hubSlMini');
    if (!el) return;
    const entries = (global.LEDGER ? LEDGER.all() : []).slice();
    if (!entries.length){ el.innerHTML = '<span class="hub-sl-empty">Ledger gol</span>'; return; }
    const bySrc = {};
    entries.forEach(e => (bySrc[e.src]=bySrc[e.src]||[]).push(e));
    const top = Object.keys(bySrc).sort((a,b)=>bySrc[b].length-bySrc[a].length).slice(0,3);
    el.innerHTML = top.map(s=>'<span class="hub-sl-chip">'+escHtml(s)+' <b>'+bySrc[s].length+'</b></span>').join('') + ' <a href="#slWrap" class="hub-sl-link">Ledger →</a>';
  }
  global.HB_SL_MINI = { renderReview: slMiniReview };
'''

ledger_wrap = (
    "// hub-ledger.js — Signal Ledger scorecard\n"
    "(function(global){\n'use strict';\n"
    + ledger_body + "\n"
    + LEDGER_EXTRA
    + "\n})(typeof window !== 'undefined' ? window : global);\n"
)
(ROOT / "lib" / "hub-ledger.js").write_text(ledger_wrap, encoding="utf-8")
print("hub-brief", len(hub_brief), "hub-ledger", len(ledger_wrap))