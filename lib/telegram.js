// ═══════════════════════════════════════════════════════════════════
// telegram.js — Trimitere alerte Telegram, partajat de toate paginile (TG.*)
// Înlocuiește ~8 copii de sendTelegram + config. Config-ul e PARTAJAT între pagini
// prin localStorage 'tt_tg_config' { token, chatId, enabled }.
//
// Folosire: <script src="../lib/telegram.js"></script>
//   await TG.send('text <b>html</b>');  // întoarce true/false
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const TG_KEY = 'tt_tg_config';

  function getConfig(){
    try { const c = JSON.parse(localStorage.getItem(TG_KEY) || '{}'); return { token: c.token || '', chatId: c.chatId || '', enabled: !!c.enabled }; }
    catch(e){ return { token: '', chatId: '', enabled: false }; }
  }
  function setConfig(token, chatId, enabled){
    try { localStorage.setItem(TG_KEY, JSON.stringify({ token: token || '', chatId: chatId || '', enabled: !!enabled })); } catch(e){}
  }

  // Trimite un mesaj. opts.force = trimite chiar dacă enabled=false (pt butonul „Test").
  async function send(text, opts){
    opts = opts || {};
    const c = getConfig();
    if(!c.token || !c.chatId) return false;
    if(!c.enabled && !opts.force) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: c.chatId, text, parse_mode: opts.parseMode || 'HTML', disable_web_page_preview: true })
      });
      const j = await r.json().catch(() => ({}));
      return !!j.ok;
    } catch(e){ return false; }
  }

  // Test rapid de conexiune (pt modalele de config)
  async function test(){ return send('✅ Test Trading Tools — conexiune Telegram OK.', { force: true }); }

  global.TG = { getConfig, setConfig, send, test, KEY: TG_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
