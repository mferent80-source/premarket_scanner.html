// ═══════════════════════════════════════════════════════════════════
// telegram.js — Trimitere alerte, partajat de toate paginile (TG.*)
//
// 11.10.2026: canalul e DISCORD, nu Telegram. Marius: „aș vrea să se ducă tot pe Discord”
// (același canal ca Crypto Radar și botul de știri). Numele fișierului și interfața TG.*
// (send / test / getConfig / setConfig) rămân, ca cele 13 pagini care le cheamă să nu se
// schimbe. Config-ul e PARTAJAT între pagini prin localStorage 'tt_dc_config' { webhook, enabled }.
// Webhook-ul e secret: stă doar în browserul lui, nu în depozit (depozitul e public).
//
// Folosire: <script src="../lib/telegram.js"></script>
//   await TG.send('text <b>html</b>');  // întoarce true/false; HTML-ul Telegram devine markdown
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const DC_KEY = 'tt_dc_config';
  const TG_KEY_VECHI = 'tt_tg_config';
  const LIMITA = 1900;

  function esteWebhook(u){
    return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(String(u || '').trim());
  }

  function citeste(k){
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; }
  }

  // token/chatId rămân în răspuns pentru paginile care întreabă „configurat?” cu `token && chatId`
  function getConfig(){
    let c = citeste(DC_KEY);
    if (!c) { const v = citeste(TG_KEY_VECHI) || {}; c = { webhook: '', enabled: !!v.enabled }; }
    const webhook = esteWebhook(c.webhook) ? String(c.webhook).trim() : '';
    return { webhook, enabled: !!c.enabled, token: webhook, chatId: webhook ? 'discord' : '', canal: 'discord' };
  }

  // setConfig(webhook, _, enabled). Un token Telegram vechi (din modalele încă neschimbate)
  // nu e webhook: se păstrează webhook-ul salvat și se schimbă doar „pornit”.
  function setConfig(a, b, enabled){
    const nou = esteWebhook(a) ? String(a).trim() : esteWebhook(b) ? String(b).trim() : getConfig().webhook;
    try { localStorage.setItem(DC_KEY, JSON.stringify({ webhook: nou, enabled: !!enabled })); } catch(e){}
  }

  function entitati(s){
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }

  function htmlLaDiscord(html){
    let s = String(html || '');
    const linkuri = [];
    s = s.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, function(_, u, t){
      linkuri.push(entitati(u));
      return '[' + t + '](\u0000' + (linkuri.length - 1) + '\u0000)';
    });
    s = s.replace(/<\/?(b|strong)>/gi, '**').replace(/<\/?(i|em)>/gi, '*').replace(/<\/?code>/gi, '`');
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    s = entitati(s);
    return s.replace(/\u0000(\d+)\u0000/g, function(_, i){ return '<' + linkuri[+i] + '>'; });
  }

  function bucati(text){
    const out = [];
    let rest = String(text || '');
    while (rest.length > LIMITA) {
      let taie = rest.lastIndexOf('\n', LIMITA);
      if (taie < LIMITA * 0.5) taie = LIMITA;
      out.push(rest.slice(0, taie));
      rest = rest.slice(taie).replace(/^\n/, '');
    }
    if (rest) out.push(rest);
    return out;
  }

  // Trimite un mesaj.
  //   opts.webhook — override explicit (butonul „Test” din modal, înainte de Salvează).
  //   opts.force — trimite chiar dacă enabled=false (pt butonul „Test" sau gating propriu).
  async function send(text, opts){
    opts = opts || {};
    const c = getConfig();
    const webhook = esteWebhook(opts.webhook) ? String(opts.webhook).trim() : esteWebhook(opts.token) ? String(opts.token).trim() : c.webhook;
    if (!webhook) return false;
    if (!c.enabled && !opts.force) return false;
    let ok = true;
    for (const parte of bucati(htmlLaDiscord(text))) {
      try {
        const r = await fetch(webhook + '?wait=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'Alerts', allowed_mentions: { parse: [] }, content: parte })
        });
        if (!r.ok) ok = false;
      } catch(e){ ok = false; }
    }
    return ok;
  }

  // Test rapid de conexiune (pt modalele de config)
  async function test(){ return send('✅ Test Trading Tools — conexiune Discord OK.', { force: true }); }

  global.TG = { getConfig, setConfig, send, test, esteWebhook, KEY: DC_KEY, canal: 'discord' };
})(typeof window !== 'undefined' ? window : globalThis);
