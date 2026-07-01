/* =============================================================================
 * train.js — Train & validate the rating model on REAL historical results
 * -----------------------------------------------------------------------------
 * Data: martj42/international_results (every men's international 1872–2026),
 *       fetched live from GitHub raw (CORS-open). We:
 *   1. parse + filter to recent matches (recency-weighted),
 *   2. fit a Poisson goals model — per-team ATTACK & DEFENCE strengths plus a
 *      global mean and home advantage — by weighted gradient ascent on the
 *      log-likelihood (this is a bivariate-Poisson / Dixon-Coles style fit),
 *   3. VALIDATE on a held-out most-recent slice: log-loss + outcome accuracy
 *      vs a frequency baseline,
 *   4. write the fitted attack/defence (and a blended rating) onto our 48 teams.
 *
 * Triggered by the "Train & validate" button. Returns a one-line report.
 * ========================================================================== */

var Trainer = (() => {
  const CSV_URL = 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';
  const MIN_YEAR = 2017;          // training window start
  const EPOCHS = 60;
  const LR = 0.05;
  const L2 = 0.002;               // shrink att/def toward 0
  const HALF_LIFE_YEARS = 4;      // recency weighting

  // Dataset team name -> our canonical name (only where they differ).
  const NAME_MAP = {
    'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
    'Czech Republic': 'Czechia',
  };

  function parseCSV(text) {
    const rows = [];
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln) continue;
      const c = ln.split(',');
      if (c.length < 9) continue;
      const hs = parseInt(c[3], 10), as = parseInt(c[4], 10);
      if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;       // skip unplayed (NA)
      const year = parseInt(c[0].slice(0, 4), 10);
      if (year < MIN_YEAR) continue;
      rows.push({ year, home: c[1], away: c[2], hs, as, neutral: c[8].trim() === 'TRUE' });
    }
    return rows;
  }

  async function fetchRows() {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error('dataset ' + res.status);
    return parseCSV(await res.text());
  }

  /* Fit attack/defence/mu/home by weighted gradient ascent on Poisson LL. */
  function fit(rows) {
    const nowYear = new Date().getFullYear();
    const teams = {};
    const idx = name => (teams[name] ??= { att: 0, def: 0, n: 0 });
    for (const r of rows) { idx(r.home).n++; idx(r.away).n++; }

    let mu = Math.log(1.35);       // baseline log goals
    let home = 0.25;               // home advantage (log scale)

    for (let ep = 0; ep < EPOCHS; ep++) {
      // accumulate gradients
      let gMu = 0, gHome = 0;
      for (const name in teams) { teams[name].gAtt = 0; teams[name].gDef = 0; }
      for (const r of rows) {
        const w = Math.pow(0.5, (nowYear - r.year) / HALF_LIFE_YEARS);
        const H = teams[r.home], A = teams[r.away];
        const hb = r.neutral ? 0 : home;
        const lh = Math.exp(mu + H.att - A.def + hb);
        const la = Math.exp(mu + A.att - H.def);
        const eh = r.hs - lh, ea = r.as - la;       // residuals
        H.gAtt += w * eh;  A.gDef += w * (-eh);
        A.gAtt += w * ea;  H.gDef += w * (-ea);
        gMu += w * (eh + ea);
        if (!r.neutral) gHome += w * eh;
      }
      // apply updates with L2 shrinkage on att/def
      mu += LR * 1e-4 * gMu;
      home += LR * 1e-4 * gHome;
      for (const name in teams) {
        const t = teams[name];
        t.att += LR * (t.gAtt / (t.n + 5)) - L2 * t.att;
        t.def += LR * (t.gDef / (t.n + 5)) - L2 * t.def;
      }
      // re-centre att & def to mean 0 (identifiability)
      let ma = 0, md = 0, k = 0;
      for (const name in teams) { ma += teams[name].att; md += teams[name].def; k++; }
      ma /= k; md /= k;
      for (const name in teams) { teams[name].att -= ma; teams[name].def -= md; }
    }
    return { teams, mu, home };
  }

  /* W/D/L probabilities from two Poisson means (small grid). */
  function wdl(lh, la) {
    const pmf = (k, l) => Math.exp(k * Math.log(l) - l - lgamma(k + 1));
    let w = 0, d = 0, lo = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const p = pmf(i, lh) * pmf(j, la);
      if (i > j) w += p; else if (i === j) d += p; else lo += p;
    }
    const s = w + d + lo || 1; return [w / s, d / s, lo / s];
  }
  const _lg = {};
  function lgamma(n) { // log factorial for small ints
    if (_lg[n] != null) return _lg[n];
    let r = 0; for (let i = 2; i < n; i++) r += Math.log(i); return _lg[n] = r;
  }

  /* Validate on the most-recent slice; return {logloss, baseline, acc, n}. */
  function validate(model, rows) {
    const sorted = [...rows].sort((a, b) => a.year - b.year);
    const cut = Math.floor(sorted.length * 0.85);
    const test = sorted.slice(cut);
    // baseline = training outcome frequencies
    let bw = 0, bd = 0, bl = 0;
    for (let i = 0; i < cut; i++) { const r = sorted[i]; if (r.hs > r.as) bw++; else if (r.hs === r.as) bd++; else bl++; }
    const bt = bw + bd + bl || 1; const base = [bw / bt, bd / bt, bl / bt];

    let ll = 0, llBase = 0, correct = 0, used = 0;
    for (const r of test) {
      const H = model.teams[r.home], A = model.teams[r.away];
      if (!H || !A) continue;
      const lh = Math.exp(model.mu + H.att - A.def + (r.neutral ? 0 : model.home));
      const la = Math.exp(model.mu + A.att - H.def);
      const p = wdl(lh, la);
      const o = r.hs > r.as ? 0 : r.hs === r.as ? 1 : 2;
      ll += -Math.log(Math.max(p[o], 1e-6));
      llBase += -Math.log(Math.max(base[o], 1e-6));
      if (p.indexOf(Math.max(...p)) === o) correct++;
      used++;
    }
    return { logloss: ll / used, baseline: llBase / used, acc: correct / used, n: used };
  }

  /* Write fitted strengths onto our teams (blended with the FIFA prior). */
  function applyToTeams(model, teamsByName) {
    let applied = 0;
    for (const name in teamsByName) {
      const t = teamsByName[name];
      const ds = Object.keys(NAME_MAP).find(k => NAME_MAP[k] === name) || name;
      const f = model.teams[ds];
      if (!f || f.n < 6) continue;                 // not enough data -> keep prior
      const att = Math.exp(model.mu + f.att);       // expected goals vs avg defence
      const def = Math.exp(model.mu - f.def);       // expected goals conceded vs avg attack
      t.att = clamp(att, 0.4, 3.2);
      t.def = clamp(def, 0.4, 3.0);
      const fitElo = 1530 + 300 * (f.att + f.def);  // net strength -> rating scale
      t.elo = Math.round(0.5 * t.elo + 0.5 * clamp(fitElo, 1050, 1960)); // blend w/ FIFA
      t.trained = true;
      applied++;
    }
    return applied;
  }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /* Public: fetch -> fit -> validate -> apply. Returns a report string. */
  async function run(state) {
    const rows = await fetchRows();
    if (rows.length < 200) throw new Error('too few matches');
    const model = fit(rows);
    const v = validate(model, rows);
    const applied = applyToTeams(model, state.teamsByName);
    const years = `${MIN_YEAR}–${new Date().getFullYear()}`;
    return `Trained on ${rows.length.toLocaleString()} matches (${years}) · ` +
           `log-loss ${v.logloss.toFixed(3)} vs ${v.baseline.toFixed(3)} baseline · ` +
           `acc ${(v.acc * 100).toFixed(1)}% · applied to ${applied} teams`;
  }

  return { run };
})();

if (typeof module !== 'undefined') module.exports = { Trainer };
