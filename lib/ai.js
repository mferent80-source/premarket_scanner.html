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

  // complete — răspuns întreg (non-streaming). Întoarce textul.
  async function complete(opts){
    if(!getKey()) throw new Error('Cheia Anthropic lipsește (seteaz-o în pagină).');
    const resp = await fetch(API, { method: 'POST', headers: _headers(), body: JSON.stringify(_body(opts, false)) });
    if(!resp.ok) throw await _err(resp);
    const data = await resp.json();
    return (data && data.content && data.content[0] && data.content[0].text) || '';
  }

  // stream — răspuns în flux. onToken(textDelta) la fiecare bucată. Întoarce textul complet.
  async function stream(opts, onToken){
    if(!getKey()) throw new Error('Cheia Anthropic lipsește (seteaz-o în pagină).');
    const resp = await fetch(API, { method: 'POST', headers: _headers(), body: JSON.stringify(_body(opts, true)) });
    if(!resp.ok) throw await _err(resp);
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
  }

  // extractJson — scoate primul obiect JSON valabil dintr-un text (LLM-uri pun text în jur).
  function extractJson(text){
    if(!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fence ? fence[1] : text;
    const start = candidate.indexOf('{'), end = candidate.lastIndexOf('}');
    if(start < 0 || end <= start) return null;
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch(e){ return null; }
  }

  global.AI = { getKey, setKey, clearKey, hasKey, complete, stream, extractJson, KEY, DEFAULT_MODEL };
})(typeof window !== 'undefined' ? window : globalThis);
