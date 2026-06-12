/* =============================================================================
 * market.js — Polymarket "World Cup winner" odds (model vs market)
 * -----------------------------------------------------------------------------
 * SNAPSHOT below is a REAL pull from Polymarket's Gamma API (event
 * "world-cup-winner", 12 Jun 2026) — implied P(win) = the market's "Yes" price.
 * It loads instantly so the board always has market numbers even when the live
 * browser fetch is CORS-blocked. fetchImpliedProbs() then tries to refresh it
 * live and falls back to the snapshot on any error.
 * ========================================================================== */

const Market = (() => {

  // Real Polymarket implied probabilities (canonical team names).
  const SNAPSHOT = {
    'Spain': 0.1645, 'France': 0.1605, 'Portugal': 0.1075, 'England': 0.0965,
    'Brazil': 0.0835, 'Argentina': 0.0785, 'Germany': 0.0515, 'Netherlands': 0.0485,
    'Norway': 0.0245, 'Japan': 0.0215, 'Belgium': 0.0205, 'Colombia': 0.0175,
    'Morocco': 0.0155, 'Switzerland': 0.0135, 'Mexico': 0.0135, 'United States': 0.0115,
    'Turkey': 0.0115, 'Uruguay': 0.0095, 'Croatia': 0.0085, 'Ecuador': 0.0085,
    'Senegal': 0.0065, 'South Korea': 0.0045, 'Austria': 0.0045, 'Ivory Coast': 0.0035,
    'Sweden': 0.0035, 'Canada': 0.0025, 'Paraguay': 0.0025, 'Scotland': 0.0025,
    'Iran': 0.0015, 'Ghana': 0.0015, 'Algeria': 0.0015, 'Bosnia & Herzegovina': 0.0015,
    'DR Congo': 0.0015, 'Czechia': 0.0015, 'Australia': 0.0015, 'Egypt': 0.0015,
    'New Zealand': 0.0005, 'Haiti': 0.0005, 'Jordan': 0.0005, 'Curaçao': 0.0005,
    'Tunisia': 0.0005, 'Uzbekistan': 0.0005, 'Panama': 0.0005, 'Iraq': 0.0005,
    'South Africa': 0.0005, 'Cape Verde': 0.0005, 'Qatar': 0.0005, 'Saudi Arabia': 0.0005,
  };

  // Polymarket label -> our canonical team name.
  const ALIASES = {
    'usa': 'United States', 'turkiye': 'Turkey', 'türkiye': 'Turkey',
    'bosnia-herzegovina': 'Bosnia & Herzegovina', 'congo dr': 'DR Congo',
    'south korea': 'South Korea', 'ivory coast': 'Ivory Coast', 'czechia': 'Czechia',
    'cape verde': 'Cape Verde', 'curaçao': 'Curaçao',
  };

  function canonical(label, teamNames) {
    const key = label.trim().toLowerCase();
    if (ALIASES[key]) return ALIASES[key];
    return teamNames.find(n => n.toLowerCase() === key) || null;
  }

  function snapshot() { return { ...SNAPSHOT }; }

  /* Best-effort live refresh from Polymarket's Gamma API. */
  async function fetchImpliedProbs(teamNames) {
    const base = CONFIG.POLYMARKET_API + '/events?limit=1&closed=false&order=volume&ascending=false&tag=World%20Cup';
    const u = CONFIG.PROXY_URL ? CONFIG.PROXY_URL + encodeURIComponent(base) : base;
    const res = await fetch(u);
    if (!res.ok) throw new Error('Polymarket ' + res.status);
    const data = await res.json();
    const event = Array.isArray(data) ? data[0] : data;
    if (!event || !event.markets) throw new Error('no markets');

    const out = {};
    for (const m of event.markets) {
      const label = m.groupItemTitle || '';
      let prices = m.outcomePrices;
      if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = null; } }
      if (!prices || !prices.length) continue;
      const yes = parseFloat(prices[0]);
      const team = canonical(label, teamNames);
      if (team && yes > 0) out[team] = yes;
    }
    return Object.keys(out).length ? out : null;
  }

  return { snapshot, fetchImpliedProbs };
})();

if (typeof module !== 'undefined') module.exports = { Market };
