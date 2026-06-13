/* =============================================================================
 * app.js — Application controller (the orchestrator)
 * -----------------------------------------------------------------------------
 * Owns the single source of truth `state`, builds fixtures, kicks off either
 * live polling or the simulation driver, and on EVERY finished result:
 *     1. updates the two teams' Elo,
 *     2. marks knocked-out teams,
 *     3. re-runs the Monte Carlo tournament,
 *     4. re-renders the UI with animation.
 * ========================================================================== */

const state = {
  teamsByName: {},        // name -> { name, code, group, elo, att, def, flag }
  groupFixtures: [],      // round-robin group games
  champProb: {},          // name -> P(win World Cup)
  prevChampProb: {},      // last cycle's odds (for ▲▼ arrows)
  reach: {},              // name -> { r32, r16, qf, sf, final, champ } probabilities
  groupOdds: {},          // name -> { p1,p2,p3,p4, advance, rankScore }
  predicted: null,        // model's predicted bracket (official slotting) to final
  bracket: null,          // one representative RANDOM simulated knockout tree
  bracketMode: 'predicted', // 'predicted' | 'sample'
  eliminated: new Set(),
  selectedFixtureId: null,
  market: {},             // name -> market-implied champ prob (Polymarket)
};

/* ---- Bootstrap ----------------------------------------------------------- */
function buildTeams() {
  for (const t of BASE_TEAMS) {
    state.teamsByName[t.name] = { ...t };
  }
}

/* Generate a round-robin (3 games each) for every group of 4. */
function buildGroupFixtures() {
  let id = 1;
  for (const letter of GROUP_LETTERS) {
    const g = BASE_TEAMS.filter(t => t.group === letter).map(t => t.name);
    const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    for (const [i, j] of pairs) {
      state.groupFixtures.push({
        id: id++, home: g[i], away: g[j],
        group: letter, status: 'SCHEDULED',
        homeGoals: null, awayGoals: null,
        predicted: null,                    // pre-match model snapshot (vs actual)
      });
    }
  }
}

/* Seed the real already-played / live matches from KNOWN_RESULTS so the app
 * boots into the true tournament state even with no API token. For each one we
 * FIRST snapshot the model's pre-match prediction (so we can show predicted vs
 * actual), THEN apply the real score to Elo. */
function applyKnownResults() {
  if (typeof KNOWN_RESULTS === 'undefined') return;
  for (const k of KNOWN_RESULTS) {
    const fx = state.groupFixtures.find(f => f.home === k.home && f.away === k.away);
    if (!fx) continue;
    const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
    fx.predicted = Engine.matchProbabilities(a, b);      // snapshot BEFORE Elo moves
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

/* Merge live API matches into our fixture list (matched by team names).
 * THIS is the realtime automation: every poll, any match that has just gone
 * FINISHED triggers a full Elo update + tournament re-simulation + re-render —
 * no manual editing, ever. Live (in-play) scores are mirrored too. */
function mergeLiveMatches(matches) {
  if (!matches) return;
  for (const m of matches) {
    const fx = state.groupFixtures.find(f =>
      sameTeam(f.home, m.home) && sameTeam(f.away, m.away));
    if (!fx) continue;

    // Snapshot the pre-match prediction the first time we see this fixture.
    if (!fx.predicted) {
      const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
      fx.predicted = Engine.matchProbabilities(a, b);
    }

    if (m.status === 'FINISHED' && fx.status !== 'FINISHED') {
      fx.homeGoals = m.homeGoals; fx.awayGoals = m.awayGoals;
      fx.status = 'FINISHED';
      onResult(fx, /*silent*/ false);                    // <-- realtime recompute
    } else if (['LIVE', 'IN_PLAY', 'PAUSED'].includes(m.status)) {
      fx.status = 'LIVE';
      fx.homeGoals = m.homeGoals; fx.awayGoals = m.awayGoals;
      UI.renderMatches(state);                            // mirror live scoreline
    }
  }
}
const sameTeam = (a, b) => a && b && a.toLowerCase().includes(b.toLowerCase().split(' ')[0]);

/* ---- The core reactive cycle -------------------------------------------- */
function onResult(fx, silent) {
  const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];

  // 0. Snapshot the pre-match prediction (if not already captured).
  if (!fx.predicted) fx.predicted = Engine.matchProbabilities(a, b);

  // 1. Live Elo update from the real scoreline.
  const upd = Engine.updateElo(a.elo, b.elo, fx.homeGoals, fx.awayGoals);
  a.elo = upd.eloA; b.elo = upd.eloB;

  // 2. Refresh momentum (recent-form) and group-stage eliminations.
  recomputeForm();
  recomputeEliminations();

  // 3. Recalculate the ENTIRE tournament.
  recompute();

  // 4. Re-render.
  UI.renderMatches(state);
  UI.flashRecalc();
  if (!silent) UI.setStatus(
    `${fx.home} ${fx.homeGoals}-${fx.awayGoals} ${fx.away} — odds updated`,
    Api.live ? 'live' : 'sim');
}

/* 2026 rule: top 2 of each group + 8 best 3rd-placed teams advance. So a team
 * is only definitely OUT when it cannot even finish 3rd in its group — i.e. at
 * least 3 rivals are already guaranteed to finish above it. (The Monte-Carlo
 * sim resolves the subtler "best 3rd" race; this just snaps clear-cut KOs to 0%.) */
function recomputeEliminations() {
  state.eliminated.clear();
  for (const letter of GROUP_LETTERS) {
    const teams = Object.values(state.teamsByName).filter(t => t.group === letter);
    const rows = teams.map(t => groupStanding(letter, t.name));
    for (const r of rows) {
      const maxPossible = r.pts + 3 * r.remaining;
      // How many rivals are already guaranteed to finish above this team?
      const locked = rows.filter(o => o.name !== r.name && o.pts > maxPossible).length;
      if (locked >= 3) state.eliminated.add(r.name);
    }
  }
  for (const name of state.eliminated) state.teamsByName[name].out = true;
}

/* Momentum: convert each team's last few real results into a rating swing
 * (formElo) that the engine folds into every prediction. Win-heavy form lifts a
 * team's effective strength; a bad run drags it down. Purely from real games. */
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
    const avg = s / recent.length;                 // 0..1
    state.teamsByName[name].formElo = (avg - 0.5) * CONFIG.FORM_RANGE;
  }
}

function groupStanding(letter, name) {
  let pts = 0, played = 0;
  const games = state.groupFixtures.filter(f => f.group === letter &&
    (f.home === name || f.away === name));
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
  // Force eliminated teams to exactly 0 (Monte Carlo already drives this,
  // but this guarantees a clean 0% the instant elimination is confirmed).
  for (const name of state.eliminated) {
    state.champProb[name] = 0;
    if (state.reach[name]) state.reach[name] = { r32: 0, r16: 0, qf: 0, sf: 0, final: 0, champ: 0 };
  }
  state.predicted = Engine.predictBracket(state, groupOdds);  // model's best-guess bracket
  state.bracket = Engine.sampleBracket(state);                // one random playout
  UI.renderOdds(state);
  UI.renderGroups(state);
  UI.renderBracket(state);
}

/* ---- Wiring ------------------------------------------------------------- */
function attachEvents() {
  document.querySelector('#match-list').addEventListener('click', e => {
    const card = e.target.closest('.match-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    const fx = state.groupFixtures.find(f => f.id === id);
    if (!fx) return;                       // finished & live are clickable too
    state.selectedFixtureId = id;
    UI.renderMatchDetail(state, fx);
  });

  // Tabs (mobile)
  document.querySelectorAll('[data-tab]').forEach(btn =>
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('[data-pane]').forEach(p =>
        p.classList.toggle('hidden', p.dataset.pane !== tab));
      document.querySelectorAll('[data-tab]').forEach(b => {
        b.classList.toggle('bg-cyan-500', b === btn);
        b.classList.toggle('bg-slate-700', b !== btn);
      });
    }));

  // Stage-metric selector (Win it / Final / Semis / Quarters / Reach R16)
  document.querySelectorAll('.metric-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.metric-btn').forEach(b => {
        b.classList.toggle('bg-cyan-500', b === btn);
        b.classList.toggle('font-semibold', b === btn);
        b.classList.toggle('bg-slate-700', b !== btn);
      });
      UI.setOddsMetric(btn.dataset.metric, state);
    }));

  // Bracket mode toggle: model's predicted bracket vs a random sampled outcome.
  document.querySelectorAll('.bracket-mode').forEach(btn =>
    btn.addEventListener('click', () => {
      state.bracketMode = btn.dataset.mode;
      if (state.bracketMode === 'sample') state.bracket = Engine.sampleBracket(state);
      document.querySelectorAll('.bracket-mode').forEach(b => {
        b.classList.toggle('bg-emerald-600', b === btn);
        b.classList.toggle('bg-slate-700', b !== btn);
      });
      UI.renderBracket(state);
    }));

  // Manual refresh — the ONLY thing that recomputes odds (besides live results).
  const refresh = document.querySelector('#refresh-btn');
  if (refresh) refresh.addEventListener('click', () => {
    UI.flashRecalc();
    recomputeForm(); recomputeEliminations(); recompute();
    UI.renderMatches(state);
    UI.setStatus('Odds refreshed', Api.live ? 'live' : 'idle');
  });

  // Train & validate the model on real historical results.
  const train = document.querySelector('#train-btn');
  if (train) train.addEventListener('click', async () => {
    if (typeof Trainer === 'undefined') return;
    train.disabled = true; train.textContent = '⚙ training…';
    try {
      const report = await Trainer.run(state);
      recomputeForm(); recomputeEliminations(); recompute();
      UI.renderMatches(state);
      UI.setStatus(report || 'model trained', 'live');
    } catch (err) {
      UI.setStatus('training failed: ' + err.message, 'idle');
    } finally {
      train.disabled = false; train.innerHTML = '⚙ Train &amp; validate';
    }
  });
}

/* ---- Polymarket model-vs-market feed ------------------------------------ */
async function startMarketFeed() {
  if (typeof Market === 'undefined' || !CONFIG.ENABLE_POLYMARKET) return;
  const names = Object.keys(state.teamsByName);
  // Load the embedded real snapshot immediately so market odds are always there.
  state.market = Market.snapshot();
  UI.setMarketNote('Polymarket (snapshot)');
  UI.renderOdds(state);
  // Then try a live refresh (may be CORS-blocked in the browser).
  const pull = async () => {
    try {
      const probs = await Market.fetchImpliedProbs(names);
      if (probs && Object.keys(probs).length) {
        state.market = probs;
        UI.setMarketNote('Polymarket (live)');
        UI.renderOdds(state);
      }
    } catch (err) { /* keep snapshot */ }
  };
  await pull();
  setInterval(pull, CONFIG.MARKET_REFRESH_MS);
}

/* ---- LIVE World Cup scores (TheSportsDB — free, CORS, works on the site) - */
function mergeLiveScores(events) {
  if (!events) return;
  let changed = false;
  for (const ev of events) {
    const fx = state.groupFixtures.find(f => f.home === ev.home && f.away === ev.away);
    if (!fx) continue;
    if (!fx.predicted) {
      const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
      if (a && b) fx.predicted = Engine.matchProbabilities(a, b);
    }
    if (ev.status === 'FINISHED' && ev.homeGoals != null && fx.status !== 'FINISHED') {
      fx.homeGoals = ev.homeGoals; fx.awayGoals = ev.awayGoals; fx.status = 'FINISHED';
      onResult(fx, false);                       // updates Elo + re-simulates + renders
      changed = true;
    } else if (ev.status === 'LIVE') {
      fx.status = 'LIVE';
      if (ev.homeGoals != null) { fx.homeGoals = ev.homeGoals; fx.awayGoals = ev.awayGoals; }
      changed = true;
    }
  }
  if (changed) { recomputeForm(); UI.renderMatches(state); }
}

async function startLiveScores() {
  if (typeof LiveScore === 'undefined' || !CONFIG.ENABLE_LIVESCORES) return;
  const pull = async () => {
    try {
      mergeLiveScores(await LiveScore.fetchEvents());
      UI.setStatus('LIVE · TheSportsDB', 'live');
    } catch (err) {
      UI.setStatus('Stable · press ↻ Refresh', 'idle');
    }
  };
  await pull();
  setInterval(pull, CONFIG.LIVESCORE_POLL_MS);
}

/* ---- Live player-strength & form feed (API-Football) -------------------- */
async function startPlayerFeed() {
  if (typeof PlayerData === 'undefined' || !CONFIG.PLAYER_API_KEY) {
    UI.setPlayerNote('player model: curated squad index + live form');
    return;
  }
  const pull = async () => {
    try {
      const n = await PlayerData.enrich(state.teamsByName);
      if (n) {
        UI.setPlayerNote(`player model: live API-Football ratings (${n} squads) + form`);
        recompute();                 // re-simulate with refreshed player strengths
      }
    } catch (err) {
      UI.setPlayerNote('player API unavailable — using curated squad index');
    }
  };
  await pull();
  setInterval(pull, CONFIG.PLAYER_REFRESH_MS);
}

/* ---- Start -------------------------------------------------------------- */
async function init() {
  buildTeams();
  buildGroupFixtures();
  applyKnownResults();          // seed real played/live matches (Mexico 2-0, etc.)
  attachEvents();

  // First full computation off the real current state.
  recomputeForm();
  recomputeEliminations();
  recompute();
  UI.renderMatches(state);
  UI.renderMatchDetail(state, null);

  startMarketFeed();
  startPlayerFeed();
  startLiveScores();          // real WC scores, free + CORS, updates the live site

  // Odds are now STABLE: they only change when real results arrive (live API)
  // or when you press "Refresh odds". No more auto-generated churn.
  if (Api.live) {
    UI.setStatus('LIVE · football-data.org', 'live');
    const poll = async () => {
      try { mergeLiveMatches(await Api.fetchMatches()); }
      catch (err) { UI.setStatus('API error — retrying… ' + err.message, 'idle'); }
    };
    await poll();
    setInterval(poll, CONFIG.POLL_INTERVAL_MS);
  } else {
    UI.setStatus('Stable · press ↻ Refresh to recompute', 'idle');
  }
}

document.addEventListener('DOMContentLoaded', init);
