// Dedicated server trigger. GitHub credentials stay in GH_DISPATCH_TOKEN.
// The single Durable Object serializes requests across browsers and devices.
export const ORIGIN = 'https://mferent80-source.github.io';
export function dayInBucharest(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin'}});
}
export class BreadthDaily {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.record = null;
    ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get('daily') || null; });
  }
  async fetch() {
    if (!this.env.GH_DISPATCH_TOKEN) return json({status:'unavailable',reason:'server_not_configured'},503);
    const day = dayInBucharest();
    if (this.record?.day === day) return json(this.publicRecord());
    // Reserve before network I/O. A timeout/crash never retries an ambiguous POST.
    // Manual GitHub Run workflow remains available after a failed daily request.
    this.record = {day, requestId:'open-'+day, status:'requesting',requestedAt:new Date().toISOString()};
    await this.ctx.storage.put('daily',this.record);
    let result;
    try {
      result = await fetch('https://api.github.com/repos/mferent80-source/premarket_scanner.html/actions/workflows/pages.yml/dispatches', {
        method:'POST',signal:AbortSignal.timeout(20000),
        headers:{'Authorization':'Bearer '+this.env.GH_DISPATCH_TOKEN,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'tt-breadth-daily','Content-Type':'application/json'},
        body:JSON.stringify({ref:'main',inputs:{request_id:this.record.requestId}})
      });
      this.record.status = result.status === 204 ? 'queued' : 'failed';
      if (result.status !== 204) this.record.reason = 'github_rejected';
    } catch (_) { this.record.status = 'unknown'; this.record.reason = 'dispatch_not_verified'; }
    await this.ctx.storage.put('daily',this.record);
    return json(this.publicRecord(),this.record.status === 'queued' ? 202 : 502);
  }
  publicRecord() { const {day,requestId,status,requestedAt,reason} = this.record; return {day,requestId,status,requestedAt,...(reason?{reason}:{})}; }
}
export default {
  async fetch(request,env) {
    if (new URL(request.url).pathname !== '/daily') return json({status:'not_found'},404);
    if (request.headers.get('Origin') !== ORIGIN) return json({status:'forbidden'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'}});
    if (request.method !== 'POST') return json({status:'method_not_allowed'},405);
    if (!env.BREADTH_DAILY || !env.GH_DISPATCH_TOKEN) return json({status:'unavailable',reason:'server_not_configured'},503);
    const id = env.BREADTH_DAILY.idFromName('decision-app');
    return env.BREADTH_DAILY.get(id).fetch(new Request('https://breadth.internal/daily',{method:'POST'}));
  }
};
