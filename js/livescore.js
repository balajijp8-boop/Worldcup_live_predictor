/* =============================================================================
 * livescore.js — LIVE World Cup scores via ESPN's free API (CORS-enabled)
 * -----------------------------------------------------------------------------
 * ESPN's public scoreboard returns the ENTIRE 2026 World Cup (all 72 group
 * games + knockouts) in ONE call, with scores + live status, and sends CORS
 * headers — so it runs straight from the browser with no key and no proxy.
 * This replaces TheSportsDB, whose free endpoints only returned patchy windows.
 *
 *   GET .../soccer/fifa.world/scoreboard?dates=YYYYMMDD-YYYYMMDD
 *
 * We map ESPN's stable 3-letter team codes to our canonical names, so matching
 * is exact and every finished/live game updates automatically.
 * ========================================================================== */

const LiveScore = (() => {

  // ESPN 3-letter code -> our canonical BASE_TEAMS name.
  const CODE = {
    ALG: 'Algeria', ARG: 'Argentina', AUS: 'Australia', AUT: 'Austria',
    BEL: 'Belgium', BIH: 'Bosnia & Herzegovina', BRA: 'Brazil', CAN: 'Canada',
    CIV: 'Ivory Coast', COD: 'DR Congo', COL: 'Colombia', CPV: 'Cape Verde',
    CRO: 'Croatia', CUW: 'Curaçao', CZE: 'Czechia', ECU: 'Ecuador',
    EGY: 'Egypt', ENG: 'England', ESP: 'Spain', FRA: 'France', GER: 'Germany',
    GHA: 'Ghana', HAI: 'Haiti', IRN: 'Iran', IRQ: 'Iraq', JOR: 'Jordan',
    JPN: 'Japan', KOR: 'South Korea', KSA: 'Saudi Arabia', MAR: 'Morocco',
    MEX: 'Mexico', NED: 'Netherlands', NOR: 'Norway', NZL: 'New Zealand',
    PAN: 'Panama', PAR: 'Paraguay', POR: 'Portugal', QAT: 'Qatar',
    RSA: 'South Africa', SCO: 'Scotland', SEN: 'Senegal', SUI: 'Switzerland',
    SWE: 'Sweden', TUN: 'Tunisia', TUR: 'Turkey', URU: 'Uruguay',
    USA: 'United States', UZB: 'Uzbekistan',
  };

  const ESPN = (CONFIG.LIVESCORE_BASE || 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard');
  const RANGE = CONFIG.WC_DATE_RANGE || '20260611-20260719';

  function statusOf(comp) {
    const t = (comp.status && comp.status.type) || {};
    if (t.state === 'post' || t.completed) return 'FINISHED';
    if (t.state === 'in') return 'LIVE';
    return 'SCHEDULED';
  }

  function normalise(ev) {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp || !comp.competitors) return null;
    const H = comp.competitors.find(c => c.homeAway === 'home');
    const A = comp.competitors.find(c => c.homeAway === 'away');
    if (!H || !A) return null;
    const name = c => CODE[(c.team && c.team.abbreviation) || ''] || (c.team && c.team.displayName) || '';
    const num = s => (s === '' || s == null ? null : parseInt(s, 10));
    return {
      home: name(H), away: name(A),
      homeGoals: num(H.score), awayGoals: num(A.score),
      status: statusOf(comp),
    };
  }

  /* One call -> the whole tournament, normalised + mapped to our team names. */
  async function fetchEvents() {
    const res = await fetch(`${ESPN}?dates=${RANGE}`);
    if (!res.ok) throw new Error('ESPN ' + res.status);
    const data = await res.json();
    return (data.events || []).map(normalise).filter(Boolean);
  }

  return { fetchEvents };
})();

if (typeof module !== 'undefined') module.exports = { LiveScore };
