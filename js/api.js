/* =============================================================================
 * api.js — Live data integration
 * -----------------------------------------------------------------------------
 * If CONFIG.API_TOKEN is set, we hit football-data.org and normalise their
 * match objects into our internal fixture shape. If not, we expose a
 * SIMULATION driver that invents realistic finished results over time so the
 * "auto-updating" behaviour is fully demonstrable with no signup.
 *
 * Internal fixture shape:
 *   { id, home, away, group|round, status, homeGoals, awayGoals, utcDate }
 * ========================================================================== */

var Api = (() => {
  const live = !!CONFIG.API_TOKEN;

  function url(path) {
    const base = CONFIG.PROXY_URL
      ? CONFIG.PROXY_URL + encodeURIComponent(CONFIG.API_BASE + path)
      : CONFIG.API_BASE + path;
    return base;
  }

  async function rawFetch(path) {
    const res = await fetch(url(path), {
      headers: { 'X-Auth-Token': CONFIG.API_TOKEN },
    });
    if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
    return res.json();
  }

  // Map a football-data.org match -> our shape.
  function normalise(m) {
    return {
      id: m.id,
      home: m.homeTeam?.name ?? m.homeTeam?.shortName,
      away: m.awayTeam?.name ?? m.awayTeam?.shortName,
      group: m.group ? m.group.replace('GROUP_', '') : null,
      round: m.stage,
      status: m.status,                          // SCHEDULED | LIVE | FINISHED ...
      homeGoals: m.score?.fullTime?.home ?? null,
      awayGoals: m.score?.fullTime?.away ?? null,
      utcDate: m.utcDate,
    };
  }

  /* Fetch all matches for the competition. */
  async function fetchMatches() {
    if (!live) return null;
    const data = await rawFetch(`/competitions/${CONFIG.COMPETITION}/matches`);
    return (data.matches || []).map(normalise);
  }

  /* ---- Simulation driver --------------------------------------------------
   * Picks the next still-unplayed fixture (in chronological/stage order) and
   * resolves it using the engine's own probabilities, then hands the finished
   * fixture back via the callback — exactly like a real result landing. */
  function startSimulation(state, onResult) {
    const tick = () => {
      const pending = state.groupFixtures.filter(f => f.status !== 'FINISHED');
      if (!pending.length) return; // group stage complete; knockout is simulated
      const fx = pending[0];
      const a = state.teamsByName[fx.home];
      const b = state.teamsByName[fx.away];
      const { lambdaA, lambdaB } = Engine.expectedGoals(a, b);
      fx.homeGoals = knuth(lambdaA);
      fx.awayGoals = knuth(lambdaB);
      fx.status = 'FINISHED';
      onResult(fx);
    };
    return setInterval(tick, CONFIG.SIM_TICK_MS);
  }

  function knuth(lambda) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return Math.min(k - 1, CONFIG.MAX_GOALS);
  }

  return { live, fetchMatches, startSimulation };
})();

if (typeof module !== 'undefined') module.exports = { Api };
