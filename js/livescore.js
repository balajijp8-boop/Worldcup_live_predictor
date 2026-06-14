/* =============================================================================
 * livescore.js — LIVE World Cup scores via TheSportsDB (free, CORS-enabled)
 * -----------------------------------------------------------------------------
 * Unlike football-data.org (World Cup is paywalled + no CORS), TheSportsDB's
 * free key serves the 2026 World Cup (league 4429) WITH CORS headers — so this
 * runs straight from the browser on the hosted site, no token and no proxy.
 *
 *   eventspastleague.php  -> recently finished matches (with final scores)
 *   eventsnextleague.php  -> upcoming fixtures
 *   eventsday.php         -> today's matches (live in-progress scores)
 *
 * Returns events normalised + mapped to our canonical team names so app.js can
 * merge them into the fixtures and recompute the odds.
 * ========================================================================== */

const LiveScore = (() => {

  // TheSportsDB team name -> our canonical BASE_TEAMS name.
  const NAME_MAP = {
    'USA': 'United States', 'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
    'Bosnia and Herzegovina': 'Bosnia & Herzegovina', 'Korea Republic': 'South Korea',
    'Czech Republic': 'Czechia', 'Turkiye': 'Turkey', 'Türkiye': 'Turkey',
    'Ivory Coast': 'Ivory Coast', "Côte d'Ivoire": 'Ivory Coast', 'Congo DR': 'DR Congo',
    'Curacao': 'Curaçao', 'Cabo Verde': 'Cape Verde',
  };
  const map = n => NAME_MAP[n] || n;

  const FINISHED = ['FT', 'AET', 'PEN', 'Match Finished', 'AP'];
  const LIVE = ['1H', '2H', 'HT', 'ET', 'LIVE', 'Playing', 'BT', 'P'];

  function classify(status, hg, ag) {
    if (FINISHED.includes(status)) return 'FINISHED';
    if (LIVE.includes(status)) return 'LIVE';
    // numeric minute like "57" also means live; scores present + not finished -> live
    if (/^\d{1,3}('?)$/.test(status || '')) return 'LIVE';
    return 'SCHEDULED';
  }

  function normalise(e) {
    const hg = e.intHomeScore === null || e.intHomeScore === '' ? null : parseInt(e.intHomeScore, 10);
    const ag = e.intAwayScore === null || e.intAwayScore === '' ? null : parseInt(e.intAwayScore, 10);
    return {
      home: map((e.strHomeTeam || '').trim()),
      away: map((e.strAwayTeam || '').trim()),
      homeGoals: Number.isFinite(hg) ? hg : null,
      awayGoals: Number.isFinite(ag) ? ag : null,
      status: classify(e.strStatus, hg, ag),
      date: e.dateEvent,
    };
  }

  async function getJSON(path) {
    const res = await fetch(`${CONFIG.LIVESCORE_BASE}/${path}`);
    if (!res.ok) throw new Error('TheSportsDB ' + res.status);
    return res.json();
  }

  /* Fetch finished + upcoming + today's events, de-duplicated.
   * eventsseason is the key one: it returns the FULL list of finished matches
   * with scores, so every completed game updates (not just a rolling window). */
  async function fetchEvents() {
    const id = CONFIG.WC_LEAGUE_ID;
    const season = CONFIG.WC_SEASON || 2026;
    const today = new Date().toISOString().slice(0, 10);
    const [seas, past, next, day] = await Promise.allSettled([
      getJSON(`eventsseason.php?id=${id}&s=${season}`),
      getJSON(`eventspastleague.php?id=${id}`),
      getJSON(`eventsnextleague.php?id=${id}`),
      getJSON(`eventsday.php?d=${today}&l=${id}`),
    ]);
    const all = [];
    for (const r of [seas, past, next, day]) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const arr = r.value.events || r.value.results;
      if (Array.isArray(arr)) all.push(...arr);
    }
    // De-dupe by idEvent, prefer the entry that has a score/most-advanced status.
    const byId = {};
    for (const e of all) {
      const prev = byId[e.idEvent];
      if (!prev || (e.intHomeScore != null && prev.intHomeScore == null)) byId[e.idEvent] = e;
    }
    return Object.values(byId).map(normalise);
  }

  return { fetchEvents };
})();

if (typeof module !== 'undefined') module.exports = { LiveScore };
