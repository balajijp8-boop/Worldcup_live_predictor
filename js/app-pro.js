/* =============================================================================
 * app-pro.js — Application controller (Apple Pro build)
 * -----------------------------------------------------------------------------
 * Same orchestration as the original app.js, with two differences:
 *   1. NO `DOMContentLoaded` auto-boot — init() is called by the Design
 *      Component's componentDidMount (the DOM is already mounted by then).
 *   2. Interactive button/tab feedback uses inline-style class toggles instead
 *      of Tailwind utility classes.
 * ========================================================================== */

// Persist across helmet re-injection / remounts so live interactivity survives.
var state = window.__wcState || (window.__wcState = {
  teamsByName: {},
  groupFixtures: [],
  champProb: {},
  prevChampProb: {},
  reach: {},
  groupOdds: {},
  predicted: null,
  bracket: null,
  bracketMode: 'predicted',
  eliminated: new Set(),
  selectedFixtureId: null,
  market: {},
});

/* ---- Bootstrap ----------------------------------------------------------- */
function buildTeams() {
  for (const t of BASE_TEAMS) state.teamsByName[t.name] = { ...t };
}

function buildGroupFixtures() {
  let id = 1;
  for (const letter of GROUP_LETTERS) {
    const g = BASE_TEAMS.filter(t => t.group === letter).map(t => t.name);
    const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    for (const [i, j] of pairs) {
      state.groupFixtures.push({
        id: id++, home: g[i], away: g[j],
        group: letter, status: 'SCHEDULED',
        homeGoals: null, awayGoals: null, predicted: null,
      });
    }
  }
}

function applyKnownResults() {
  if (typeof KNOWN_RESULTS === 'undefined') return;
  for (const k of KNOWN_RESULTS) {
    const fx = state.groupFixtures.find(f => f.home === k.home && f.away === k.away);
    if (!fx) continue;
    const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
    fx.predicted = Engine.matchProbabilities(a, b);
    if (k.status === 'FINISHED') {
      fx.homeGoals = k.homeGoals; fx.awayGoals = k.awayGoals;
      fx.status = 'FINISHED';
      const upd = Engine.updateElo(a.elo, b.elo, fx.homeGoals, fx.awayGoals);
      a.elo = upd.eloA; b.elo = upd.eloB;
    } else if (k.status === 'LIVE') {
      fx.status = 'LIVE';
      if (k.homeGoals != null) { fx.homeGoals = k.homeGoals; fx.awayGoals = k.awayGoals; }
    }
  }
}

function mergeLiveMatches(matches) {
  if (!matches) return;
  for (const m of matches) {
    const fx = state.groupFixtures.find(f => sameTeam(f.home, m.home) && sameTeam(f.away, m.away));
    if (!fx) continue;
    if (!fx.predicted) {
      const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
      fx.predicted = Engine.matchProbabilities(a, b);
    }
    if (m.status === 'FINISHED' && fx.status !== 'FINISHED') {
      fx.homeGoals = m.homeGoals; fx.awayGoals = m.awayGoals;
      fx.status = 'FINISHED';
      onResult(fx, false);
    } else if (['LIVE', 'IN_PLAY', 'PAUSED'].includes(m.status)) {
      fx.status = 'LIVE';
      fx.homeGoals = m.homeGoals; fx.awayGoals = m.awayGoals;
      UI.renderMatches(state);
    }
  }
}
var sameTeam = (a, b) => a && b && a.toLowerCase().includes(b.toLowerCase().split(' ')[0]);

/* ---- The core reactive cycle -------------------------------------------- */
function onResult(fx, silent) {
  const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
  if (!fx.predicted) fx.predicted = Engine.matchProbabilities(a, b);
  const upd = Engine.updateElo(a.elo, b.elo, fx.homeGoals, fx.awayGoals);
  a.elo = upd.eloA; b.elo = upd.eloB;
  recomputeForm();
  recomputeEliminations();
  recompute();
  UI.renderMatches(state);
  UI.flashRecalc();
  if (state.selectedFixtureId) {
    const sel = state.groupFixtures.find(f => f.id === state.selectedFixtureId);
    if (sel) UI.renderMatchDetail(state, sel);
  }
  if (!silent) UI.setStatus(`${fx.home} ${fx.homeGoals}-${fx.awayGoals} ${fx.away} — odds updated`, Api.live ? 'live' : 'sim');
}

function recomputeEliminations() {
  state.eliminated.clear();
  for (const letter of GROUP_LETTERS) {
    const teams = Object.values(state.teamsByName).filter(t => t.group === letter);
    const rows = teams.map(t => groupStanding(letter, t.name));
    for (const r of rows) {
      const maxPossible = r.pts + 3 * r.remaining;
      const locked = rows.filter(o => o.name !== r.name && o.pts > maxPossible).length;
      if (locked >= 3) state.eliminated.add(r.name);
    }
  }
  for (const name of state.eliminated) state.teamsByName[name].out = true;
}

function recomputeForm() {
  for (const name in state.teamsByName) {
    const games = state.groupFixtures
      .filter(f => f.status === 'FINISHED' && (f.home === name || f.away === name));
    const recent = games.slice(-CONFIG.FORM_GAMES);
    if (!recent.length) { state.teamsByName[name].formElo = 0; continue; }
    let s = 0;
    for (const f of recent) {
      const me = f.home === name ? f.homeGoals : f.awayGoals;
      const op = f.home === name ? f.awayGoals : f.homeGoals;
      s += me > op ? 1 : me === op ? 0.5 : 0;
    }
    state.teamsByName[name].formElo = (s / recent.length - 0.5) * CONFIG.FORM_RANGE;
  }
}

function groupStanding(letter, name) {
  let pts = 0, played = 0;
  const games = state.groupFixtures.filter(f => f.group === letter && (f.home === name || f.away === name));
  for (const f of games) {
    if (f.status !== 'FINISHED') continue;
    played++;
    const me = f.home === name ? f.homeGoals : f.awayGoals;
    const op = f.home === name ? f.awayGoals : f.homeGoals;
    pts += me > op ? 3 : me === op ? 1 : 0;
  }
  return { name, pts, remaining: games.length - played };
}

function recompute() {
  state.prevChampProb = { ...state.champProb };
  const { champProb, reach, groupOdds } = Engine.simulateTournament(state);
  state.champProb = champProb;
  state.reach = reach;
  state.groupOdds = groupOdds;
  for (const name of state.eliminated) {
    state.champProb[name] = 0;
    if (state.reach[name]) state.reach[name] = { r32: 0, r16: 0, qf: 0, sf: 0, final: 0, champ: 0 };
  }
  state.predicted = Engine.predictBracket(state, groupOdds);
  state.bracket = Engine.sampleBracket(state);
  // "Actual outcome": R32 from the real finished group results, knockouts projected.
  // Falls back to the predicted bracket until the groups can resolve the slotting.
  try { state.actual = Engine.actualBracket(state); } catch (e) { state.actual = state.predicted; }
  UI.renderOdds(state);
  UI.renderGroups(state);
  UI.renderBracket(state);
  UI.renderHero(state);
}

/* Paint the whole UI from current state into the (possibly freshly-mounted) DOM. */
function renderAll() {
  UI.renderOdds(state);
  UI.renderGroups(state);
  UI.renderBracket(state);
  UI.renderMatches(state);
  UI.renderHero(state);
  const sel = state.groupFixtures.find(f => f.id === state.selectedFixtureId);
  UI.renderMatchDetail(state, sel || null);
}

/* ---- Wiring ------------------------------------------------------------- */
function attachEvents() {
  document.getElementById('match-list').addEventListener('click', e => {
    const card = e.target.closest('.match-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    const fx = state.groupFixtures.find(f => f.id === id);
    if (!fx) return;
    state.selectedFixtureId = id;
    UI.renderMatchDetail(state, fx);
    UI.renderMatches(state);
  });

  // Stage-metric selector (Win it / Final / Semis / Quarters / Reach R16 / Market)
  document.querySelectorAll('.metric-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.metric-btn').forEach(b => b.classList.toggle('metric-active', b === btn));
      UI.setOddsMetric(btn.dataset.metric, state);
    }));

  // Bracket mode toggle
  document.querySelectorAll('.bracket-mode').forEach(btn =>
    btn.addEventListener('click', () => {
      state.bracketMode = btn.dataset.mode;
      if (state.bracketMode === 'sample') state.bracket = Engine.sampleBracket(state);
      if (state.bracketMode === 'actual') {
        try { state.actual = Engine.actualBracket(state); } catch (e) { state.actual = state.predicted; }
      }
      document.querySelectorAll('.bracket-mode').forEach(b => b.classList.toggle('mode-active', b === btn));
      UI.renderBracket(state);
    }));

  // Manual refresh
  const refresh = document.getElementById('refresh-btn');
  if (refresh) refresh.addEventListener('click', () => {
    UI.flashRecalc();
    recomputeForm(); recomputeEliminations(); recompute();
    UI.renderMatches(state);
    UI.setStatus('Odds refreshed', Api.live ? 'live' : 'idle');
  });

  // Train & validate on real historical results
  const train = document.getElementById('train-btn');
  if (train) train.addEventListener('click', async () => {
    if (typeof Trainer === 'undefined') return;
    train.disabled = true; const orig = train.textContent; train.textContent = '⚙ training…';
    try {
      const report = await Trainer.run(state);
      recomputeForm(); recomputeEliminations(); recompute();
      UI.renderMatches(state);
      UI.setStatus(report || 'model trained', 'live');
    } catch (err) {
      UI.setStatus('training failed: ' + err.message, 'idle');
    } finally {
      train.disabled = false; train.textContent = orig;
    }
  });
}

/* ---- Polymarket model-vs-market feed ------------------------------------ */
async function startMarketFeed() {
  if (typeof Market === 'undefined' || !CONFIG.ENABLE_POLYMARKET) return;
  const names = Object.keys(state.teamsByName);
  state.market = Market.snapshot();
  UI.setMarketNote('Polymarket snapshot');
  UI.renderOdds(state);
  const pull = async () => {
    try {
      const probs = await Market.fetchImpliedProbs(names);
      if (probs && Object.keys(probs).length) {
        state.market = probs;
        UI.setMarketNote('Polymarket live');
        UI.renderOdds(state);
      }
    } catch (err) { /* keep snapshot */ }
  };
  await pull();
  setInterval(pull, CONFIG.MARKET_REFRESH_MS);
}

/* ---- Live scores: TheSportsDB (free, CORS-enabled, no token) ----------- */
async function startLiveScoreFeed() {
  if (typeof LiveScore === 'undefined' || !CONFIG.ENABLE_LIVESCORES) return;
  const pull = async () => {
    try {
      const events = await LiveScore.fetchEvents();
      if (events && events.length) {
        mergeLiveMatches(events);
        UI.setStatus('LIVE · TheSportsDB', 'live');
      }
    } catch (err) { /* silent retry */ }
  };
  await pull();
  setInterval(pull, CONFIG.LIVESCORE_POLL_MS || 60000);
}

/* ---- Live player-strength feed (API-Football) --------------------------- */
async function startPlayerFeed() {
  if (typeof PlayerData === 'undefined' || !CONFIG.PLAYER_API_KEY) {
    UI.setPlayerNote('squad index + form');
    return;
  }
  const pull = async () => {
    try {
      const n = await PlayerData.enrich(state.teamsByName);
      if (n) { UI.setPlayerNote(`API-Football · ${n} squads`); recompute(); }
    } catch (err) {
      UI.setPlayerNote('squad index (API offline)');
    }
  };
  await pull();
  setInterval(pull, CONFIG.PLAYER_REFRESH_MS);
}

/* ---- Start -------------------------------------------------------------- */
async function init() {
  // Bind events to the CURRENT DOM on every mount.
  attachEvents();

  // If the tournament was already computed in a prior mount, just repaint the
  // current DOM from the persisted state — no need to re-simulate.
  if (window.__wcBooted) {
    renderAll();
    UI.setMarketNote('Polymarket snapshot');
    UI.setPlayerNote('squad index + form');
    UI.setStatus(Api.live ? 'LIVE · football-data.org' : 'Stable · press ↻ Refresh', Api.live ? 'live' : 'sim');
    if (typeof Motion !== 'undefined') Motion.setupAll();
    return;
  }
  window.__wcBooted = true;

  buildTeams();
  buildGroupFixtures();
  applyKnownResults();

  recomputeForm();
  recomputeEliminations();
  recompute();
  UI.renderMatches(state);
  UI.renderMatchDetail(state, null);

  startMarketFeed();
  startPlayerFeed();
  startLiveScoreFeed();

  if (typeof Motion !== 'undefined') Motion.setupAll();

  if (Api.live) {
    UI.setStatus('LIVE · football-data.org', 'live');
    const poll = async () => {
      try { mergeLiveMatches(await Api.fetchMatches()); }
      catch (err) { UI.setStatus('API error — retrying… ' + err.message, 'idle'); }
    };
    await poll();
    setInterval(poll, CONFIG.POLL_INTERVAL_MS);
  } else {
    UI.setStatus('Stable · press ↻ Refresh', 'sim');
  }
}
