/* =============================================================================
 * players.js — Live PLAYER strength & form (API-Football / api-sports.io)
 * -----------------------------------------------------------------------------
 * When CONFIG.PLAYER_API_KEY is set, this enriches every team with REAL data:
 *
 *   • /teams/statistics  -> recent FORM string + goals-for/against averages
 *                           => refreshes att / def and a momentum (formElo).
 *   • /players           -> per-player season RATINGS, split by position
 *                           => squad index + attMultLive / defMultLive so the
 *                              model literally weights individual player quality.
 *
 * Browser calls to api-sports.io are CORS-blocked, so route through the bundled
 * proxy (set CONFIG.PROXY_URL). Free tier is 100 req/day, so results are cached
 * in localStorage for 24h and team-id lookups are cached forever.
 *
 * Without a key the app keeps the curated `squad` prior + live in-match form —
 * this module simply upgrades those numbers to live ones. Fails silently.
 * ========================================================================== */

var PlayerData = (() => {
  const DAY = 86_400_000;
  const cache = {
    get(k) { try { const v = JSON.parse(localStorage.getItem(k)); return (v && v.exp > Date.now()) ? v.val : null; } catch { return null; } },
    set(k, val, ttl = DAY) { try { localStorage.setItem(k, JSON.stringify({ val, exp: Date.now() + ttl })); } catch {} },
  };

  function url(path) {
    const full = CONFIG.PLAYER_API_BASE + path;
    return CONFIG.PROXY_URL ? CONFIG.PROXY_URL + encodeURIComponent(full) : full;
  }
  async function call(path) {
    const res = await fetch(url(path), { headers: { 'x-apisports-key': CONFIG.PLAYER_API_KEY } });
    if (!res.ok) throw new Error(`player API ${res.status}`);
    const json = await res.json();
    return json.response;
  }

  // Resolve an API-Football team id from a team name (cached permanently).
  async function teamId(name) {
    const key = `afid:${name}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const q = name.replace('&', 'and');
    const r = await call(`/teams?search=${encodeURIComponent(q)}`);
    const id = r && r[0] && r[0].team && r[0].team.id;
    if (id) cache.set(key, id, 365 * DAY);
    return id || null;
  }

  // Convert an average player match rating (~6.0–7.6) to a 0–100 index.
  const ratingToIndex = r => Math.max(0, Math.min(100, (r - 5.6) * 42));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function formToElo(formStr) {
    if (!formStr) return null;
    const last = formStr.slice(-CONFIG.FORM_GAMES).split('');
    if (!last.length) return null;
    let s = 0;
    for (const c of last) s += c === 'W' ? 1 : c === 'D' ? 0.5 : 0;
    return (s / last.length - 0.5) * CONFIG.FORM_RANGE;
  }

  // Pull team statistics (form + goal averages) for one team.
  async function teamStats(id) {
    const path = `/teams/statistics?league=${CONFIG.PLAYER_WC_LEAGUE_ID}&season=${CONFIG.PLAYER_SEASON}&team=${id}`;
    const r = await call(path);
    if (!r) return null;
    const gf = parseFloat(r.goals?.for?.average?.total);
    const ga = parseFloat(r.goals?.against?.average?.total);
    return { form: r.form, gf: Number.isFinite(gf) ? gf : null, ga: Number.isFinite(ga) ? ga : null };
  }

  // Pull squad player ratings (first page) and split attack vs defence.
  async function squadRatings(id) {
    const r = await call(`/players?team=${id}&season=${CONFIG.PLAYER_SEASON}`);
    if (!r || !r.length) return null;
    let att = [], def = [];
    for (const p of r) {
      const st = p.statistics && p.statistics[0];
      const rating = parseFloat(st?.games?.rating);
      if (!Number.isFinite(rating)) continue;
      const pos = (st.games.position || p.player?.position || '').toLowerCase();
      if (pos.startsWith('att') || pos.startsWith('mid') || pos.startsWith('for')) att.push(rating);
      else def.push(rating);
    }
    const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
    return { attack: avg(att), defense: avg(def), overall: avg(att.concat(def)) };
  }

  /* Enrich teamsByName in place. Returns how many squads were updated. */
  async function enrich(teamsByName) {
    if (!CONFIG.PLAYER_API_KEY) return 0;
    let updated = 0;
    for (const name in teamsByName) {
      const t = teamsByName[name];
      const ck = `afdata:${name}`;
      let data = cache.get(ck);
      if (!data) {
        try {
          const id = await teamId(name);
          if (!id) continue;
          const [stats, squad] = await Promise.all([teamStats(id), squadRatings(id)]);
          data = { stats, squad };
          cache.set(ck, data);
        } catch { continue; }
      }
      applyToTeam(t, data);
      updated++;
    }
    return updated;
  }

  function applyToTeam(t, data) {
    if (!data) return;
    // Form + goal averages from team statistics.
    if (data.stats) {
      if (data.stats.gf != null) t.att = data.stats.gf;
      if (data.stats.ga != null) t.def = data.stats.ga;
      const fe = formToElo(data.stats.form);
      if (fe != null) t.apiFormElo = fe;          // baseline form until live games override
      if ((t.formElo || 0) === 0 && fe != null) t.formElo = fe;
    }
    // Squad player ratings -> squad index + attack/defence multipliers.
    if (data.squad && data.squad.overall) {
      t.squad = Math.round(ratingToIndex(data.squad.overall));
      if (data.squad.attack)  t.attMultLive = clamp(0.8 + (ratingToIndex(data.squad.attack) - 60) / 120, 0.8, 1.3);
      if (data.squad.defense) t.defMultLive = clamp(0.8 + (60 - ratingToIndex(data.squad.defense)) / 120, 0.8, 1.3);
    }
  }

  return { enrich };
})();

if (typeof module !== 'undefined') module.exports = { PlayerData };
