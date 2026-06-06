// ═══════════════════════════════════════════════════════════════════
// markov.js — Model Markov Chain pentru trading (observabil, agnostic la piață)
// Stări definite pe randament NORMALIZAT la volatilitate (r / ATR%), deci
// aceeași stare „UP" înseamnă același lucru pe crypto volatil și pe un stock calm.
//
// Pipeline: OHLC ──► labelStates ──► buildMatrix ──► predictNext / stationary
//                                              └────► backtest (walk-forward) + chi²
//
// Folosire: <script src="../lib/markov.js"></script> apoi MK.labelStates(ohlc) etc.
// Dependențe: opțional lib/indicators.js (TI.calcATR). Dacă lipsește, fallback intern.
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  // ──────────────────────────────────────────────────────────────────
  // PRESETURI DE STĂRI — praguri în unități de „z" (randament / ATR%)
  // 5 stări = sweet spot: destulă granularitate, matrice 5×5 nu prea sparse.
  // ──────────────────────────────────────────────────────────────────
  const PRESETS = {
    5: {
      labels: ['STRONG_DOWN', 'DOWN', 'FLAT', 'UP', 'STRONG_UP'],
      short:  ['⇊', '↓', '·', '↑', '⇈'],
      score:  [-2, -1, 0, 1, 2],          // scor direcțional semnat per stare
      cuts:   [-1.0, -0.25, 0.25, 1.0]    // n-1 praguri care separă n stări
    },
    3: {
      labels: ['DOWN', 'FLAT', 'UP'],
      short:  ['↓', '·', '↑'],
      score:  [-1, 0, 1],
      cuts:   [-0.33, 0.33]
    }
  };

  // ATR% fallback (dacă TI nu e încărcat) — Wilder smoothing, returnat ca fracție din preț.
  function _atrPct(ohlc, period){
    period = period || 14;
    const n = ohlc.length;
    if (n < period + 1) return new Array(n).fill(0);
    const trs = [0];
    for (let i = 1; i < n; i++){
      const h = ohlc[i].h, l = ohlc[i].l, pc = ohlc[i-1].c;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const out = new Array(n).fill(0);
    let atr = 0;
    for (let i = 1; i <= period; i++) atr += trs[i];
    atr /= period;
    out[period] = atr / ohlc[period].c;
    for (let i = period + 1; i < n; i++){
      atr = (atr * (period - 1) + trs[i]) / period;
      out[i] = atr / ohlc[i].c;
    }
    // forward-fill seed-ul pe primele bare ca să nu împărțim la 0
    for (let i = 1; i < period; i++) out[i] = out[period];
    return out;
  }

  // ──────────────────────────────────────────────────────────────────
  // labelStates — transformă OHLC într-o secvență de stări întregi [0..n-1]
  //   ohlc: [{o,h,l,c}, ...]  (cronologic, cel mai vechi primul)
  //   opts: { nStates:5|3, atrPeriod:14, cuts:[...]?, presetOverride?:{} }
  // Returnează { states:[int], labels:[str], short:[str], score:[num], cuts:[num], z:[num] }
  // ──────────────────────────────────────────────────────────────────
  function labelStates(ohlc, opts){
    opts = opts || {};
    const nStates = opts.nStates || 5;
    const preset = opts.presetOverride || PRESETS[nStates];
    if (!preset) throw new Error('markov: nStates suportat doar 3 sau 5 (sau dă presetOverride)');
    const cuts = opts.cuts || preset.cuts;
    const atrP = opts.atrPeriod || 14;

    // ATR% per bară (Wilder), ca fracție din preț — aceeași formulă ca TI din suită.
    const atrPctArr = _atrPct(ohlc, atrP);

    const states = [], zArr = [];
    for (let i = 1; i < ohlc.length; i++){
      const r = (ohlc[i].c - ohlc[i-1].c) / ohlc[i-1].c;
      const a = atrPctArr[i] || atrPctArr[i-1] || 0;
      const z = a > 1e-9 ? r / a : 0;            // randament în „deviații ATR"
      zArr.push(z);
      // bucket: numără câte praguri depășește
      let s = 0;
      while (s < cuts.length && z > cuts[s]) s++;
      states.push(s);
    }
    return {
      states, z: zArr,
      labels: preset.labels, short: preset.short, score: preset.score, cuts
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // buildMatrix — matrice de tranziție cu Laplace smoothing (add-k)
  //   states: [int], n: nr stări, opts:{ k:0.5, window?:int (doar ultimele N) }
  // Returnează { counts:[[..]], probs:[[..]], rowN:[int], n, total, k }
  //   probs[i][j] = P(next=j | current=i)
  // ──────────────────────────────────────────────────────────────────
  function buildMatrix(states, n, opts){
    opts = opts || {};
    const k = opts.k != null ? opts.k : 0.5;
    let seq = states;
    if (opts.window && opts.window < states.length) seq = states.slice(-opts.window);

    const counts = Array.from({length: n}, () => new Array(n).fill(0));
    for (let t = 1; t < seq.length; t++){
      const a = seq[t-1], b = seq[t];
      if (a >= 0 && a < n && b >= 0 && b < n) counts[a][b]++;
    }
    const probs = Array.from({length: n}, () => new Array(n).fill(0));
    const rowN = new Array(n).fill(0);
    let total = 0;
    for (let i = 0; i < n; i++){
      let rs = 0;
      for (let j = 0; j < n; j++) rs += counts[i][j];
      rowN[i] = rs; total += rs;
      const denom = rs + k * n;
      for (let j = 0; j < n; j++) probs[i][j] = (counts[i][j] + k) / denom;
    }
    return { counts, probs, rowN, n, total, k };
  }

  // ──────────────────────────────────────────────────────────────────
  // predictNext — distribuția stării următoare + scor direcțional
  //   m: rezultat buildMatrix, current:int, score:[num] (din labelStates)
  // Returnează { dist:[p0..pn], expScore, pUp, pDown, top:{state,p}, confident:bool }
  // ──────────────────────────────────────────────────────────────────
  function predictNext(m, current, score){
    const n = m.n;
    if (current < 0 || current >= n) return null;
    const dist = m.probs[current].slice();
    let expScore = 0, pUp = 0, pDown = 0, top = 0;
    for (let j = 0; j < n; j++){
      expScore += (score ? score[j] : 0) * dist[j];
      if (score){
        if (score[j] > 0) pUp += dist[j];
        else if (score[j] < 0) pDown += dist[j];
      }
      if (dist[j] > dist[top]) top = j;
    }
    return {
      dist, expScore, pUp, pDown,
      top: { state: top, p: dist[top] },
      // „confident" = avem destule observații pe rândul curent ca să ne încredem
      confident: m.rowN[current] >= 20
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // stationary — distribuția staționară π (πP = π) prin power iteration
  // Arată mix-ul de regim pe termen lung implicat de matrice.
  // ──────────────────────────────────────────────────────────────────
  function stationary(probs, iters){
    const n = probs.length;
    let pi = new Array(n).fill(1 / n);
    iters = iters || 200;
    for (let it = 0; it < iters; it++){
      const nx = new Array(n).fill(0);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) nx[j] += pi[i] * probs[i][j];
      let s = 0; for (let j = 0; j < n; j++) s += nx[j];
      for (let j = 0; j < n; j++) pi[j] = nx[j] / s;
    }
    return pi;
  }

  // ──────────────────────────────────────────────────────────────────
  // chiSquare — test de independență: are starea curentă MEMORIE asupra următoarei?
  // H0: next ⟂ current (zero edge). chi² mare + p mic ⇒ există structură exploatabilă.
  // Returnează { chi2, df, pApprox, hasStructure }
  // ──────────────────────────────────────────────────────────────────
  function chiSquare(counts){
    const n = counts.length;
    const rowSum = new Array(n).fill(0), colSum = new Array(n).fill(0);
    let total = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++){ rowSum[i] += counts[i][j]; colSum[j] += counts[i][j]; total += counts[i][j]; }
    let chi2 = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++){
        const exp = total > 0 ? (rowSum[i] * colSum[j]) / total : 0;
        if (exp > 0){ const d = counts[i][j] - exp; chi2 += d * d / exp; }
      }
    const df = (n - 1) * (n - 1);
    // p-value aproximativ via aproximarea Wilson–Hilferty pentru chi² → normal
    const pApprox = _chi2pUpper(chi2, df);
    // fiabil doar dacă media celulelor așteptate ≥ 5 (regula chi²): total ≥ 5·n². Altfel = zgomot.
    const reliable = total >= 5 * n * n;
    return { chi2, df, pApprox, total, reliable, hasStructure: reliable && pApprox < 0.05 };
  }

  // Coadă superioară chi² ≈ via transformarea Wilson–Hilferty (suficient pentru un flag).
  function _chi2pUpper(x, k){
    if (x <= 0 || k <= 0) return 1;
    const t = Math.pow(x / k, 1/3);
    const m = 1 - 2/(9*k);
    const s = Math.sqrt(2/(9*k));
    const z = (t - m) / s;
    return 1 - _normCdf(z);
  }
  function _normCdf(z){
    // aproximare Abramowitz–Stegun 7.1.26
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  // ──────────────────────────────────────────────────────────────────
  // backtest — VALIDARE walk-forward (out-of-sample). La fiecare pas:
  //   construiește matricea DOAR pe trecut (fereastră glisantă) ─► prezice ─► compară cu realul.
  // Metrici cheie:
  //   logLoss model vs baseline (necondiționat). model < baseline ⇒ EDGE real.
  //   dirHit  = rata cu care semnul lui (pUp-pDown) prezice corect direcția barei.
  //   edgePct = cât % mai bun e log-loss-ul modelului vs baseline (>0 = bun).
  //   states: [int], n, score:[num], opts:{ window:250, k:0.5, minRowN:10 }
  // ──────────────────────────────────────────────────────────────────
  function backtest(states, n, score, opts){
    opts = opts || {};
    const W = opts.window || 250;
    const k = opts.k != null ? opts.k : 0.5;
    const minRowN = opts.minRowN != null ? opts.minRowN : 10;

    let llModel = 0, llBase = 0, used = 0, dirOk = 0, dirTot = 0, skipped = 0;
    for (let t = W; t < states.length; t++){
      const past = states.slice(t - W, t);
      const cur = past[past.length - 1];
      const actual = states[t];

      const m = buildMatrix(past, n, { k });
      // baseline = frecvența necondiționată a stărilor în fereastră (cu același smoothing)
      const baseFreq = new Array(n).fill(k);
      let bden = k * n;
      for (const s of past){ baseFreq[s] += 1; bden += 1; }
      for (let j = 0; j < n; j++) baseFreq[j] /= bden;

      const pModel = m.probs[cur][actual];
      const pBase = baseFreq[actual];
      llModel += -Math.log(Math.max(pModel, 1e-9));
      llBase  += -Math.log(Math.max(pBase, 1e-9));
      used++;

      // direcție: doar dacă rândul curent are destule observații (altfel e zgomot)
      if (m.rowN[cur] >= minRowN){
        const pr = predictNext(m, cur, score);
        const lean = pr.pUp - pr.pDown;
        const realScore = score[actual];
        if (lean !== 0 && realScore !== 0){
          dirTot++;
          if ((lean > 0 && realScore > 0) || (lean < 0 && realScore < 0)) dirOk++;
        }
      } else skipped++;
    }
    const avgM = used ? llModel / used : 0;
    const avgB = used ? llBase / used : 0;
    return {
      samples: used,
      logLossModel: avgM,
      logLossBaseline: avgB,
      edgePct: avgB > 0 ? (avgB - avgM) / avgB * 100 : 0,   // >0 ⇒ model bate baseline
      dirHitRate: dirTot ? dirOk / dirTot : null,
      dirSamples: dirTot,
      skippedLowData: skipped,
      window: W
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // rvolSeries — RVOL = volum bară / SMA(volum, period). Aliniat la ohlc.
  // ──────────────────────────────────────────────────────────────────
  function rvolSeries(ohlc, period){
    period = period || 20;
    const out = new Array(ohlc.length).fill(1);
    for (let i = 0; i < ohlc.length; i++){
      if (i < period){ out[i] = 1; continue; }
      let s = 0; for (let j = i - period; j < i; j++) s += ohlc[j].v || 0;
      const avg = s / period;
      out[i] = avg > 0 ? (ohlc[i].v || 0) / avg : 1;
    }
    return out;
  }

  // volumeRegime — 1 (HIGH) dacă RVOL ≥ mult, altfel 0 (NORMAL). Aliniat la ohlc.
  function volumeRegime(ohlc, period, mult){
    mult = mult || 1.5;
    const rv = rvolSeries(ohlc, period);
    return rv.map(x => x >= mult ? 1 : 0);
  }

  // ──────────────────────────────────────────────────────────────────
  // backtestConditional — același walk-forward, dar matricea la pasul t e
  // construită DOAR din tranziții al căror bară-origine are ACELAȘI regim de
  // volum ca bara curentă. Testează ipoteza „UP cu volum mare ≠ UP fără volum".
  //   states: [int] (din labelStates)
  //   regAtState: [0/1] regimul barei care a PRODUS fiecare stare (= volumeRegime(ohlc).slice(1))
  //   Returnează { all, high, normal } — fiecare cu edgePct/dirHitRate/samples
  // ──────────────────────────────────────────────────────────────────
  function backtestConditional(states, regAtState, n, score, opts){
    opts = opts || {};
    const W = opts.window || 300;
    const k = opts.k != null ? opts.k : 0.5;
    const minRowN = opts.minRowN != null ? opts.minRowN : 10;
    const acc = { 0: _newAcc(), 1: _newAcc(), all: _newAcc() };

    for (let t = W; t < states.length; t++){
      const curReg = regAtState[t - 1];      // regimul barei curente (origine)
      const cur = states[t - 1];
      const actual = states[t];

      // numără tranziții din fereastră, filtrate la același regim de origine
      const counts = Array.from({length: n}, () => new Array(n).fill(0));
      const baseCnt = new Array(n).fill(0);
      let condN = 0;
      for (let i = Math.max(1, t - W); i < t; i++){
        if (regAtState[i - 1] !== curReg) continue;
        counts[states[i - 1]][states[i]]++;
        baseCnt[states[i]]++; condN++;
      }
      // prob model (rând cur) + baseline necondiționat (în sub-eșantionul de regim) cu Laplace
      let rs = 0; for (let j = 0; j < n; j++) rs += counts[cur][j];
      const pModel = (counts[cur][actual] + k) / (rs + k * n);
      const pBase = (baseCnt[actual] + k) / (condN + k * n);

      for (const key of [curReg, 'all']){
        const a = acc[key];
        a.llM += -Math.log(Math.max(pModel, 1e-9));
        a.llB += -Math.log(Math.max(pBase, 1e-9));
        a.used++;
        if (rs >= minRowN){
          let pUp = 0, pDown = 0;
          for (let j = 0; j < n; j++){
            const p = (counts[cur][j] + k) / (rs + k * n);
            if (score[j] > 0) pUp += p; else if (score[j] < 0) pDown += p;
          }
          const lean = pUp - pDown, real = score[actual];
          if (lean !== 0 && real !== 0){ a.dirTot++; if ((lean > 0 && real > 0) || (lean < 0 && real < 0)) a.dirOk++; }
        }
      }
    }
    return { all: _finAcc(acc.all, W), normal: _finAcc(acc[0], W), high: _finAcc(acc[1], W) };
  }
  function _newAcc(){ return { llM: 0, llB: 0, used: 0, dirOk: 0, dirTot: 0 }; }
  function _finAcc(a, W){
    const avgM = a.used ? a.llM / a.used : 0, avgB = a.used ? a.llB / a.used : 0;
    return {
      samples: a.used, logLossModel: avgM, logLossBaseline: avgB,
      edgePct: avgB > 0 ? (avgB - avgM) / avgB * 100 : 0,
      dirHitRate: a.dirTot ? a.dirOk / a.dirTot : null, dirSamples: a.dirTot, window: W
    };
  }

  // ══════════════════════════════════════════════════════════════════
  //  HMM — Hidden Markov Model gaussian (Baum-Welch / forward-backward cu scaling)
  //  „Markov-ul care chiar merge": stări ASCUNSE de regim, observi doar randamentul.
  //  Aplicație cheie: detecția de regim (calm / normal / volatil) — exploatează
  //  volatility clustering mult mai fin decât un lanț discret observabil.
  // ══════════════════════════════════════════════════════════════════
  function _gauss(x, mu, sigma){
    const s = Math.max(sigma, 1e-9);
    return Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * 2.5066282746310002); // 1/√(2π)
  }

  // fitHMM — antrenează un HMM gaussian pe o serie de observații (ex. log-randamente).
  //   obs:[num], K: nr regimuri (2-4), opts:{ iters:60, tol:1e-5, seedMeansZero:true }
  // Returnează { K, pi, A, mu, sigma, gamma:[[..]], states:[int viterbi], logLik,
  //              order:[idx sortat după sigma cresc.], iters }
  function _fitHMMOnce(obs, K, opts, rIdx){
    opts = opts || {};
    K = K || 3;
    rIdx = rIdx || 0;
    const T = obs.length, iters = opts.iters || 60, tol = opts.tol || 1e-5;
    if (T < K * 10) throw new Error('hmm: prea puține observații (' + T + ') pentru ' + K + ' stări');

    // statistici globale pentru init
    let mean = 0; for (const o of obs) mean += o; mean /= T;
    let varG = 0; for (const o of obs) varG += (o - mean) ** 2; varG /= T;
    const sd = Math.sqrt(varG);

    // RNG determinist pt perturbarea restart-ului (rIdx=0 → init canonic; rIdx>0 → jitter)
    let _s = (rIdx * 2654435761 + 12345) >>> 0;
    const jit = () => { _s = (_s * 1103515245 + 12345) >>> 0; return _s / 4294967296; };
    const pert = rIdx === 0 ? 0 : 1;

    // INIT: medii ~0 (regimuri pe VOLATILITATE, nu pe direcție), sigma împrăștiat → EM le separă pe vol
    let pi = new Array(K).fill(1 / K);
    const diag = 0.9 - pert * 0.25 * jit();                          // diagonală 0.65..0.9 pe restart
    let A = Array.from({length: K}, () => new Array(K).fill((1 - diag) / (K - 1 || 1)));
    for (let i = 0; i < K; i++) A[i][i] = diag;                      // persistență mare la init (regimuri = sticky)
    let mu = new Array(K).fill(mean);
    if (pert) for (let i = 0; i < K; i++) mu[i] = mean + (jit() - 0.5) * sd * 0.3;
    let sigma = new Array(K);
    for (let i = 0; i < K; i++){
      const base = 0.4 + 1.2 * i / Math.max(1, K - 1);              // 0.4σ … 1.6σ
      sigma[i] = sd * base * (1 + pert * (jit() - 0.5) * 0.5);      // ±25% jitter pe restart
    }

    const alpha = Array.from({length: T}, () => new Array(K));
    const beta  = Array.from({length: T}, () => new Array(K));
    const gamma = Array.from({length: T}, () => new Array(K));
    const c = new Array(T);
    let prevLL = -Infinity, logLik = -Infinity, it = 0;

    for (it = 0; it < iters; it++){
      // --- emisii B[t][i] ---
      // forward cu scaling
      for (let i = 0; i < K; i++) alpha[0][i] = pi[i] * _gauss(obs[0], mu[i], sigma[i]);
      let s0 = 0; for (let i = 0; i < K; i++) s0 += alpha[0][i];
      c[0] = s0 > 0 ? 1 / s0 : 1; for (let i = 0; i < K; i++) alpha[0][i] *= c[0];
      for (let t = 1; t < T; t++){
        let st = 0;
        for (let j = 0; j < K; j++){
          let a = 0; for (let i = 0; i < K; i++) a += alpha[t-1][i] * A[i][j];
          alpha[t][j] = a * _gauss(obs[t], mu[j], sigma[j]); st += alpha[t][j];
        }
        c[t] = st > 0 ? 1 / st : 1; for (let j = 0; j < K; j++) alpha[t][j] *= c[t];
      }
      // backward cu scaling
      for (let i = 0; i < K; i++) beta[T-1][i] = c[T-1];
      for (let t = T - 2; t >= 0; t--){
        for (let i = 0; i < K; i++){
          let b = 0;
          for (let j = 0; j < K; j++) b += A[i][j] * _gauss(obs[t+1], mu[j], sigma[j]) * beta[t+1][j];
          beta[t][i] = b * c[t];
        }
      }
      // log-likelihood
      logLik = 0; for (let t = 0; t < T; t++) logLik -= Math.log(c[t]);

      // gamma + xi acumulat
      const Anum = Array.from({length: K}, () => new Array(K).fill(0));
      const Aden = new Array(K).fill(0);
      const muNum = new Array(K).fill(0), wSum = new Array(K).fill(0);
      for (let t = 0; t < T; t++){
        let g = 0; for (let i = 0; i < K; i++){ gamma[t][i] = alpha[t][i] * beta[t][i]; g += gamma[t][i]; }
        for (let i = 0; i < K; i++){ gamma[t][i] = g > 0 ? gamma[t][i] / g : 1 / K; muNum[i] += gamma[t][i] * obs[t]; wSum[i] += gamma[t][i]; }
        if (t < T - 1){
          let xs = 0; const xi = Array.from({length: K}, () => new Array(K));
          for (let i = 0; i < K; i++) for (let j = 0; j < K; j++){
            xi[i][j] = alpha[t][i] * A[i][j] * _gauss(obs[t+1], mu[j], sigma[j]) * beta[t+1][j]; xs += xi[i][j];
          }
          for (let i = 0; i < K; i++) for (let j = 0; j < K; j++){ const v = xs > 0 ? xi[i][j] / xs : 0; Anum[i][j] += v; Aden[i] += v; }
        }
      }
      // --- M-step ---
      pi = gamma[0].slice();
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) A[i][j] = Aden[i] > 0 ? Anum[i][j] / Aden[i] : 1 / K;
      for (let i = 0; i < K; i++) mu[i] = wSum[i] > 0 ? muNum[i] / wSum[i] : mean;
      const varNum = new Array(K).fill(0);
      for (let t = 0; t < T; t++) for (let i = 0; i < K; i++) varNum[i] += gamma[t][i] * (obs[t] - mu[i]) ** 2;
      for (let i = 0; i < K; i++) sigma[i] = Math.max(Math.sqrt(wSum[i] > 0 ? varNum[i] / wSum[i] : varG), sd * 0.05);

      if (Math.abs(logLik - prevLL) < tol * Math.abs(prevLL)) { it++; break; }
      prevLL = logLik;
    }

    // Viterbi (pe params finali) pentru calea cea mai probabilă de regim
    const states = _viterbi(obs, pi, A, mu, sigma, K);
    const order = Array.from({length: K}, (_, i) => i).sort((a, b) => sigma[a] - sigma[b]); // calm→volatil
    return { K, pi, A, mu, sigma, gamma, states, logLik, order, iters: it };
  }

  // fitHMM — ROBUST: rulează `restarts` init-uri (Baum-Welch are optime locale) și
  // păstrează fit-ul cu cel mai mare logLik. restarts:1 = comportamentul vechi.
  function fitHMM(obs, K, opts){
    opts = opts || {};
    const restarts = opts.restarts != null ? opts.restarts : 6;
    let best = null;
    for (let r = 0; r < restarts; r++){
      let cand;
      try { cand = _fitHMMOnce(obs, K, opts, r); } catch(e){ if (r === 0) throw e; continue; }
      if (cand && (!best || cand.logLik > best.logLik)) best = cand;
    }
    return best;
  }

  // bic — Bayesian Information Criterion pt HMM gaussian (mai MIC = mai bun).
  //   p = K² + 2K − 1 parametri liberi; BIC = −2·logLik + p·ln(T). Penalizează complexitatea.
  function bic(hmm, T){
    const K = hmm.K, p = K * K + 2 * K - 1;
    return -2 * hmm.logLik + p * Math.log(T);
  }

  // selectK — alege AUTOMAT nr. de regimuri minimizând BIC (nu mai ghicești 2 vs 3 vs 4).
  //   Returnează { bestK, fits:{K→hmm}, table:[{K,logLik,bic}] }
  function selectK(obs, Kmin, Kmax, opts){
    Kmin = Kmin || 2; Kmax = Kmax || 4;
    const fits = {}, table = [];
    let bestK = Kmin, bestBic = Infinity;
    for (let K = Kmin; K <= Kmax; K++){
      let h; try { h = fitHMM(obs, K, opts); } catch(e){ continue; }
      const b = bic(h, obs.length);
      fits[K] = h; table.push({ K, logLik: h.logLik, bic: b });
      if (b < bestBic){ bestBic = b; bestK = K; }
    }
    return { bestK, fits, table };
  }

  // regimeStats — statistici per regim, EXACT ce contează pentru trading:
  //   autocorelația lag-1 a randamentelor semnate în interiorul regimului.
  //   ac < 0 ⇒ mean-reverting (FADEȘTI mișcarea) · ac > 0 ⇒ trending (URMĂREȘTI) · ~0 ⇒ direcție impredictibilă.
  function regimeStats(obs, hmm){
    const K = hmm.K, st = hmm.states, out = [];
    for (let R = 0; R < K; R++){
      let n = 0; for (let t = 0; t < st.length; t++) if (st[t] === R) n++;
      const xs = [], ys = [];
      for (let t = 0; t < obs.length - 1; t++) if (st[t] === R){ xs.push(obs[t]); ys.push(obs[t+1]); }
      let ac = null;
      if (xs.length >= 20){
        const m = xs.length; let mx = 0, my = 0; for (let i = 0; i < m; i++){ mx += xs[i]; my += ys[i]; } mx /= m; my /= m;
        let nu = 0, dx = 0, dy = 0; for (let i = 0; i < m; i++){ nu += (xs[i]-mx)*(ys[i]-my); dx += (xs[i]-mx)**2; dy += (ys[i]-my)**2; }
        ac = (dx > 0 && dy > 0) ? nu / Math.sqrt(dx * dy) : 0;
      }
      out.push({ state: R, n, sigma: hmm.sigma[R], persistence: hmm.A[R][R], autocorr: ac, pairs: xs.length });
    }
    return out;
  }

  function _viterbi(obs, pi, A, mu, sigma, K){
    const T = obs.length;
    const logA = A.map(r => r.map(x => Math.log(Math.max(x, 1e-12))));
    const delta = new Array(K), ndelta = new Array(K);
    const psi = Array.from({length: T}, () => new Array(K).fill(0));
    for (let i = 0; i < K; i++) delta[i] = Math.log(Math.max(pi[i], 1e-12)) + Math.log(Math.max(_gauss(obs[0], mu[i], sigma[i]), 1e-300));
    for (let t = 1; t < T; t++){
      for (let j = 0; j < K; j++){
        let best = -Infinity, arg = 0;
        for (let i = 0; i < K; i++){ const v = delta[i] + logA[i][j]; if (v > best){ best = v; arg = i; } }
        ndelta[j] = best + Math.log(Math.max(_gauss(obs[t], mu[j], sigma[j]), 1e-300)); psi[t][j] = arg;
      }
      for (let j = 0; j < K; j++) delta[j] = ndelta[j];
    }
    let last = 0, bestV = -Infinity;
    for (let i = 0; i < K; i++) if (delta[i] > bestV){ bestV = delta[i]; last = i; }
    const path = new Array(T); path[T-1] = last;
    for (let t = T - 2; t >= 0; t--) path[t] = psi[t+1][path[t+1]];
    return path;
  }

  // backtestRegimeFade — VALIDARE OOS: ține strategia „fade mișcarea precedentă DOAR în
  // regimul volatil" pe bani out-of-sample? HMM reantrenat periodic, decizie doar pe trecut.
  //   ohlc/closes, opts:{ K:2, train:400, refit:25, restarts:3 }
  //   Returnează { volFade, allFade } — fiecare {n, avgPct, hitPct, t, totPct}
  //   t = t-statistic naiv (mean/se). |t|>2 ≈ semnificativ. Atenție: BRUT, fără costuri.
  function backtestRegimeFade(arr, opts){
    opts = opts || {};
    const K = opts.K || 2, TR = opts.train || 400, REFIT = opts.refit || 25, RS = opts.restarts || 3;
    const closes = (arr[0] && typeof arr[0] === 'object') ? arr.map(b => b.c) : arr;
    const r = logReturns(closes), N = r.length;
    if (N < TR + 30) throw new Error('backtestRegimeFade: prea puține bare (' + N + ')');
    const sgn = x => x > 0 ? 1 : (x < 0 ? -1 : 0);
    let p = null, lastFit = -1e9, f = null; const volF = [], allF = [];
    // un pas de forward-filter (cauzal) cu params curenți p — returnează belief nou normalizat
    const advance = (fin, obs) => {
      const b = new Array(K); for (let k = 0; k < K; k++) b[k] = _gauss(obs, p.mu[k], p.sigma[k]);
      const nf = new Array(K).fill(0);
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) nf[j] += fin[i] * p.A[i][j] * b[j];
      let sm = 0; for (let k = 0; k < K; k++) sm += nf[k];
      const out = new Array(K); for (let k = 0; k < K; k++) out[k] = sm > 0 ? nf[k] / sm : 1 / K;
      return out;
    };
    for (let t = TR; t < N; t++){
      if (t - lastFit >= REFIT){
        const h = fitHMM(r.slice(0, t), K, { restarts: RS, iters: 80 });
        p = { K, pi: h.pi, A: h.A, mu: h.mu, sigma: h.sigma, volState: h.order[h.order.length - 1] };
        lastFit = t;
        // params noi → reconstruiește filtrul de la zero cu params curenți (până la t-1)
        f = p.pi.slice();
        for (let s = 0; s < t; s++) f = advance(f, r[s]);
      } else {
        // params neschimbați → avansează incremental cu O bară (O(1)) — rezultat IDENTIC cu recalculul total
        f = advance(f, r[t-1]);
      }
      let reg = 0; for (let k = 1; k < K; k++) if (f[k] > f[reg]) reg = k;
      const pnl = -sgn(r[t-1]) * r[t];
      allF.push(pnl);
      if (reg === p.volState) volF.push(pnl);
    }
    const stat = a => {
      const n = a.length; if (!n) return { n: 0 };
      const m = a.reduce((x, y) => x + y, 0) / n;
      const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / n);
      return { n, avgPct: m * 100, hitPct: a.filter(x => x > 0).length / n * 100,
               t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, totPct: a.reduce((x, y) => x + y, 0) * 100 };
    };
    return { volFade: stat(volF), allFade: stat(allF), train: TR, refit: REFIT };
  }

  // firstPassage — P(TP înainte de SL) regim-aware, prin Monte Carlo pe lanțul HMM.
  // Dat un entry, simulează forward: regimul evoluează (A), fiecare bară trage un randament
  // din gaussiana regimului curent. Se oprește la +tp / −sl / maxBars (timeout).
  // Vol clustering contează: pornind în regim volatil → mișcări mai mari → rezolvare mai rapidă.
  //   hmm: fit din fitHMM, tpFrac/slFrac: fracții pozitive (0.02 = 2%), opts:{sims, maxBars, startDist, seed}
  // Returnează { pTP, pSL, pTimeout, expBars, naivePTP, sims, maxBars }
  function firstPassage(hmm, tpFrac, slFrac, opts){
    opts = opts || {};
    const sims = opts.sims || 4000, maxBars = opts.maxBars || 80;
    const lnTP = Math.log(1 + tpFrac), lnSL = Math.log(1 - slFrac);   // bariere în log-randament
    const startDist = opts.startDist || hmm.gamma[hmm.gamma.length - 1] || hmm.pi;
    // RNG DETERMINIST (LCG) → rezultate stabile între randări
    let seed = (opts.seed || 987654321) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let spare = null;
    const randn = () => {
      if (spare !== null){ const v = spare; spare = null; return v; }
      let u = 0, v = 0, s = 0;
      do { u = rnd()*2-1; v = rnd()*2-1; s = u*u + v*v; } while (s === 0 || s >= 1);
      const m = Math.sqrt(-2 * Math.log(s) / s); spare = v * m; return u * m;
    };
    const sampleCat = probs => { let r = rnd(), acc = 0; for (let i = 0; i < probs.length; i++){ acc += probs[i]; if (r <= acc) return i; } return probs.length - 1; };

    let tp = 0, sl = 0, to = 0, barsSum = 0, resolved = 0;
    for (let s = 0; s < sims; s++){
      let st = sampleCat(startDist), cum = 0, hit = 0;
      for (let b = 0; b < maxBars; b++){
        cum += hmm.mu[st] + randn() * hmm.sigma[st];
        if (cum >= lnTP){ tp++; barsSum += b + 1; resolved++; hit = 1; break; }
        if (cum <= lnSL){ sl++; barsSum += b + 1; resolved++; hit = 1; break; }
        st = sampleCat(hmm.A[st]);
      }
      if (!hit) to++;
    }
    // baseline naiv: gambler's ruin pt random walk simetric fără drift → P(sus) = b/(a+b)
    const a = lnTP, b = -lnSL;
    const naivePTP = (a + b) > 0 ? b / (a + b) : 0.5;
    return { pTP: tp/sims, pSL: sl/sims, pTimeout: to/sims, expBars: resolved ? barsSum/resolved : null, naivePTP, sims, maxBars };
  }

  // logReturns — helper: ln(c_t / c_{t-1}) dintr-un OHLC sau array de close-uri.
  function logReturns(arr){
    const closes = (arr[0] && typeof arr[0] === 'object') ? arr.map(b => b.c) : arr;
    const out = [];
    for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i-1]));
    return out;
  }

  global.MK = {
    PRESETS, labelStates, buildMatrix, predictNext, stationary, chiSquare, backtest,
    rvolSeries, volumeRegime, backtestConditional,
    fitHMM, logReturns, bic, selectK, regimeStats, backtestRegimeFade, firstPassage,
    _atrPct, _viterbi, _gauss, _fitHMMOnce  // expuse pentru debugging
  };
})(typeof window !== 'undefined' ? window : globalThis);
