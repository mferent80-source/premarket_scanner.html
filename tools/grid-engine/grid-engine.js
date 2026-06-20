// grid-engine.js — funcții pure pentru motorul de grid dual (ER).
// SURSĂ DE ADEVĂR. Copia inline din crypto-scanner trebuie ținută identică.
// Fără DOM, fără fetch, fără globale.

function sma(arr, period){
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for(let i=0;i<arr.length;i++){
    sum += arr[i];
    if(i>=period) sum -= arr[i-period];
    if(i>=period-1) out[i] = sum/period;
  }
  return out;
}

function efficiencyRatio(closes){
  const n = closes.length;
  if(n < 2) return 0;
  const net = Math.abs(closes[n-1] - closes[0]);
  let vol = 0;
  for(let i=1;i<n;i++) vol += Math.abs(closes[i]-closes[i-1]);
  if(vol === 0) return 0;
  return net/vol;
}

function rangePct(highs, lows){
  const mx = Math.max.apply(null, highs);
  const mn = Math.min.apply(null, lows);
  if(mn <= 0) return 0;
  return (mx-mn)/mn*100;
}

function atrPct(highs, lows, closes){
  const n = closes.length;
  if(n < 2) return 0;
  let sumTR = 0;
  for(let i=1;i<n;i++){
    const tr = Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]));
    sumTR += tr;
  }
  const atr = sumTR/(n-1);
  const last = closes[n-1];
  if(last<=0) return 0;
  return atr/last*100;
}

function oscillationRate(closes, period){
  period = period || 20;
  const n = closes.length;
  if(n < period+2) return 0;
  const s = sma(closes, period);
  let crossings = 0, counted = 0, prevSign = 0;
  for(let i=0;i<n;i++){
    if(s[i]==null) continue;
    const d = closes[i]-s[i];
    const sign = d>0?1:d<0?-1:0;
    if(sign!==0){
      if(prevSign!==0 && sign!==prevSign) crossings++;
      prevSign = sign;
    }
    counted++;
  }
  if(counted===0) return 0;
  return crossings/counted;
}

function slopePct(closes){
  const n = closes.length;
  if(n < 2) return 0;
  let sx=0, sy=0, sxx=0, sxy=0;
  for(let i=0;i<n;i++){ sx+=i; sy+=closes[i]; sxx+=i*i; sxy+=i*closes[i]; }
  const denom = n*sxx - sx*sx;
  if(denom===0) return 0;
  const slope = (n*sxy - sx*sy)/denom;
  const last = closes[n-1];
  if(last<=0) return 0;
  return slope*n/last*100;
}

// ── SCORING DUAL ──

function lerp(x, x0, x1, y0, y1){
  if(x<=x0) return y0;
  if(x>=x1) return y1;
  return y0 + (y1-y0)*(x-x0)/(x1-x0);
}

function volPointsNeutral(rp, tf){
  if(tf==='1h'){
    if(rp>=6 && rp<=30) return 25;
    if((rp>=3 && rp<6) || (rp>30 && rp<=50)) return 12;
    return 0;
  }
  // 4h
  if(rp>=10 && rp<=45) return 25;
  if((rp>=5 && rp<10) || (rp>45 && rp<=70)) return 12;
  return 0;
}

function neutralSubScore(o){
  let s = 0;
  if(o.er<=0.30) s += 35;
  else if(o.er<=0.60) s += lerp(o.er,0.30,0.60,35,0);
  s += volPointsNeutral(o.rangePct, o.tf);
  s += lerp(o.oscRate,0.03,0.15,0,20);
  if(o.driftPct<=5) s += 10; else if(o.driftPct<=12) s += 5;
  if(o.quoteVol>=5e6) s += 10; else if(o.quoteVol>=1e6) s += 6;
  return Math.max(0, Math.min(100, s));
}

function directionalSubScore(o){
  let s = 0;
  if(o.er>=0.30 && o.er<=0.65) s += 35;
  else if((o.er>=0.20 && o.er<0.30) || (o.er>0.65 && o.er<=0.80)) s += 18;
  s += volPointsNeutral(o.rangePct, o.tf);
  if(o.quoteVol>=5e6) s += 15; else if(o.quoteVol>=1e6) s += 9;
  return Math.max(0, Math.min(75, s));
}

function combineNeutral(n1h, n4h){
  const mn = Math.min(n1h, n4h);
  const mean = (n1h+n4h)/2;
  return Math.round(0.6*mn + 0.4*mean);
}

function combineDirectional(d1hBase, d4hBase, slope1h, slope4h){
  const base = (d1hBase + d4hBase)/2;
  const FLAT = 0.5;
  const s1 = slope1h>0?1:slope1h<0?-1:0;
  const s4 = slope4h>0?1:slope4h<0?-1:0;
  const flat1 = Math.abs(slope1h)<FLAT;
  const flat4 = Math.abs(slope4h)<FLAT;
  let align, direction;
  if(!flat1 && !flat4 && s1===s4){ align = 25; direction = s4; }
  else if(flat1 !== flat4){ align = 12; direction = flat1 ? s4 : s1; }
  else if(!flat1 && !flat4 && s1!==s4){ align = 0; direction = s4; }
  else { align = 0; direction = s4 || s1 || 0; }
  const score = Math.round(base + align);
  return { score: Math.max(0, Math.min(100, score)), direction };
}
