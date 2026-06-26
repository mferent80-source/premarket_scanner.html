// ═══════════════════════════════════════════════════════════════════
// ai.js — Apel Anthropic (Claude) partajat (AI.*). Înlocuiește ~9 copii de:
// gestionare cheie, fetch /v1/messages, parsare streaming SSE, extractJson.
// Cheia e PARTAJATĂ între pagini prin localStorage 'anthropic_api_key'.
//
// Folosire: <script src="../lib/ai.js"></script>
//   const text = await AI.complete({ prompt, system, maxTokens: 800 });
//   await AI.stream({ prompt, system }, tok => out.textContent += tok);
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'anthropic_api_key';
  const DEFAULT_MODEL = 'claude-opus-4-8';
  const API = 'https://api.anthropic.com/v1/messages';

  function getKey(){ try { return localStorage.getItem(KEY) || ''; } catch(e){ return ''; } }
  function setKey(k){ try { localStorage.setItem(KEY, (k || '').trim()); } catch(e){} }
  function clearKey(){ try { localStorage.removeItem(KEY); } catch(e){} }
  function hasKey(){ return !!getKey(); }

  // Construiește body-ul. system poate fi string (cu cache_control ephemeral) sau lipsă.
  function _body(opts, stream){
    const b = {
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.maxTokens || 800,
      messages: opts.messages || [{ role: 'user', content: opts.prompt || '' }]
    };
    if(stream) b.stream = true;
    if(opts.system){
      b.system = (opts.cacheSystem === false)
        ? opts.system
        : [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }];
    }
    return b;
  }
  function _headers(){
    return { 'Content-Type': 'application/json', 'x-api-key': getKey(),
             'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  }
  async function _err(resp){
    const j = await resp.json().catch(() => ({ error: { message: 'HTTP ' + resp.status } }));
    return new Error((j.error && j.error.message) || ('HTTP ' + resp.status));
  }

  // Timeout pe TOATE apelurile (opts.timeoutMs, default 180s) — un request/stream blocat
  // nu are altfel niciun timeout (reader.read() poate atârna la infinit).
  function _timeoutCtrl(opts){
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), opts.timeoutMs || 180000);
    return { ctrl, done: () => clearTimeout(to) };
  }
  function _wrapAbort(e){
    return (e && e.name === 'AbortError') ? new Error('timeout AI — reîncearcă') : e;
  }

  // complete — răspuns întreg (non-streaming). Întoarce textul.
  async function complete(opts){
    if(!getKey()) throw new Error('Cheia Anthropic lipsește (seteaz-o în pagină).');
    const t = _timeoutCtrl(opts);
    try {
      const resp = await fetch(API, { method: 'POST', headers: _headers(), body: JSON.stringify(_body(opts, false)), signal: t.ctrl.signal });
      if(!resp.ok) throw await _err(resp);
      const data = await resp.json();
      return (data && data.content && data.content[0] && data.content[0].text) || '';
    } catch(e){ throw _wrapAbort(e); }
    finally { t.done(); }
  }

  // stream — răspuns în flux. onToken(textDelta) la fiecare bucată. Întoarce textul complet.
  async function stream(opts, onToken){
    if(!getKey()) throw new Error('Cheia Anthropic lipsește (seteaz-o în pagină).');
    const t = _timeoutCtrl(opts);  // acoperă și citirea stream-ului, nu doar headerele
    try {
      const resp = await fetch(API, { method: 'POST', headers: _headers(), body: JSON.stringify(_body(opts, true)), signal: t.ctrl.signal });
      if(!resp.ok) throw await _err(resp);
      if(!resp.body) throw new Error('stream AI indisponibil (răspuns fără body)');
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '', full = '';
      while(true){
        const { done, value } = await reader.read();
        if(done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for(const line of lines){
          if(!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if(!data || data === '[DONE]') continue;
          try {
            const ev = JSON.parse(data);
            if(ev.type === 'content_block_delta' && ev.delta && ev.delta.text){
              full += ev.delta.text;
              if(onToken) onToken(ev.delta.text);
            }
          } catch(_){}
        }
      }
      return full;
    } catch(e){ throw _wrapAbort(e); }
    finally { t.done(); }
  }

  // extractJson — scoate primul obiect JSON valabil dintr-un text (LLM-uri pun text în jur).
  // Balansare de acolade IGNORÂND string-urile/escape-urile: nu mai rupem pe `}` din proza
  // de după obiect, nici pe două obiecte lipite (ne oprim la primul balansat). Best-effort
  // și pe JSON PARȚIAL (stream tăiat la timeout, fără `}` de închidere) → completăm acoladele.
  function extractJson(text){
    if(!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fence ? fence[1] : text;
    const start = candidate.indexOf('{');
    if(start < 0) return null;
    let depth = 0, inStr = false, esc = false, end = -1;
    for(let i = start; i < candidate.length; i++){
      const ch = candidate[i];
      if(inStr){
        if(esc) esc = false;
        else if(ch === '\\') esc = true;
        else if(ch === '"') inStr = false;
        continue;
      }
      if(ch === '"') inStr = true;
      else if(ch === '{') depth++;
      else if(ch === '}'){ depth--; if(depth === 0){ end = i; break; } }
    }
    if(end >= 0){
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch(e){ /* cade pe best-effort */ }
    }
    // Stream tăiat: închidem string-ul deschis (dacă e) + acoladele rămase, apoi încercăm.
    if(depth > 0){
      let patch = candidate.slice(start);
      if(inStr) patch += '"';
      patch += '}'.repeat(depth);
      try { return JSON.parse(patch); } catch(e){ /* renunțăm */ }
    }
    return null;
  }

  global.AI = { getKey, setKey, clearKey, hasKey, complete, stream, extractJson, KEY, DEFAULT_MODEL };
})(typeof window !== 'undefined' ? window : globalThis);
