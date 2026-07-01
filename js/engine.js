/* =============================================================================
 * engine.js — The Prediction Engine
 * -----------------------------------------------------------------------------
 * Three layers, all real (no placeholders):
 *
 *   1. ELO          -> team strength prior, updated live after every result.
 *   2. POISSON      -> turns the Elo gap + attack/defence rates into expected
 *                      goals (λ) for each side, giving Win/Draw/Loss + scoreline
 *                      probabilities for a single match.
 *   3. MONTE CARLO  -> plays the ENTIRE remaining tournament thousands of times
 *                      using the Poisson model, counting how often each team
 *                      lifts the trophy -> "win the World Cup" probability.
 *
 * When a live result arrives, app.js calls:
 *     Engine.applyResult(...)  -> mutates Elo
 *     Engine.simulateTournament(state) -> fresh odds for everyone
 * ========================================================================== */

var Engine = (() => {

  /* ---- Seeded RNG (mulberry32) --------------------------------------------
   * The whole Monte-Carlo is driven by this so a recompute with unchanged
   * inputs returns IDENTICAL odds (no more "new winner every refresh"). The
   * full tournament sim reseeds to a fixed value; only the "random sample"
   * bracket reseeds to a fresh value so re-rolls differ. */
  let _seed = 123456789;
  function seed(s) { _seed = s >>> 0; }
  function rand() {
    _seed = (_seed + 0x6D2B79F5) >>> 0;
    let t = _seed;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /* ---- 1. ELO -------------------------------------------------------------
   * Expected score of A vs B from the logistic Elo curve. dr = elo gap. */
  function eloExpected(eloA, eloB, homeAdv = 0) {
    const dr = (eloA + homeAdv) - eloB;
    return 1 / (1 + Math.pow(10, -dr / 400));
  }

  /* Update both teams' Elo after a finished match.
   * result: actual score for A in {1 win, 0.5 draw, 0 loss}.
   * Goal difference inflates K (a la World Football Elo). */
  function updateElo(eloA, eloB, goalsA, goalsB, K = CONFIG.ELO_K_FACTOR) {
    const expA = eloExpected(eloA, eloB);
    const actualA = goalsA > goalsB ? 1 : goalsA === goalsB ? 0.5 : 0;
    const gd = Math.abs(goalsA - goalsB);
    const gdMult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8; // margin-of-victory weighting
    const delta = K * gdMult * (actualA - expA);
    return { eloA: eloA + delta, eloB: eloB - delta };
  }

  /* ---- Player-strength & form adjustments --------------------------------
   * effRating: the rating actually used for the matchup = FIFA points
   *   + squad-talent nudge (individual player strength)
   *   + live form/momentum (formElo, set from recent results).
   * attMult: attacking output scaled up/down by squad talent (and any live
   *   per-team multiplier the Player API has set in attMultLive). */
  function squadDelta(t) {
    if (t.squad == null) return 0;
    return (t.squad - CONFIG.SQUAD_PIVOT) * CONFIG.SQUAD_ELO_WEIGHT;
  }
  function effRating(t) {
    return t.elo + squadDelta(t) + (t.formElo || 0);
  }
  function attMult(t) {
    const squad = t.squad == null ? 1
      : 1 + (t.squad - CONFIG.SQUAD_PIVOT) * CONFIG.SQUAD_ATT_WEIGHT;
    return squad * (t.attMultLive || 1);
  }
  function defMult(t) { return t.defMultLive || 1; }   // live API can stiffen/loosen a defence

  /* ---- 2. POISSON MATCH MODEL --------------------------------------------
   * Convert two teams into expected goals (λ). We blend:
   *   - the rating expectation (FIFA pts + player talent + form),
   *   - each side's attack (talent-scaled) vs the other's defence. */
  function expectedGoals(a, b) {
    const exp = eloExpected(effRating(a), effRating(b), CONFIG.HOME_ADVANTAGE_ELO);
    // Base attacking output: own (talent-scaled) attack tempered by opp defence.
    const baseA = (a.att * attMult(a) + b.def * defMult(b)) / 2;
    const baseB = (b.att * attMult(b) + a.def * defMult(a)) / 2;
    const tiltA = exp;                       // strength share centred on 0.5
    const tiltB = 1 - tiltA;
    const lambdaA = Math.max(0.15, baseA * (2 * tiltA));
    const lambdaB = Math.max(0.15, baseB * (2 * tiltB));
    return { lambdaA, lambdaB };
  }

  function poissonPMF(k, lambda) {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  }
  const _fact = [1];
  function factorial(n) {
    if (_fact[n] !== undefined) return _fact[n];
    let r = _fact[_fact.length - 1];
    for (let i = _fact.length; i <= n; i++) { r *= i; _fact[i] = r; }
    return _fact[n];
  }

  /* Dixon-Coles low-score dependence factor τ(x,y).
   * Plain independent Poisson under-rates 0-0/1-1 draws and over-rates 1-0/0-1.
   * The classic Dixon & Coles (1997) correction fixes exactly those four cells
   * via a single parameter ρ (rho). This is the standard football match model. */
  function dcTau(x, y, lambda, mu, rho) {
    if (x === 0 && y === 0) return 1 - lambda * mu * rho;
    if (x === 0 && y === 1) return 1 + lambda * rho;
    if (x === 1 && y === 0) return 1 + mu * rho;
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
  }

  /* Full W/D/L probabilities over the Dixon-Coles bivariate-Poisson score grid.
   * Also returns the single most likely scoreline for the UI. */
  function matchProbabilities(a, b) {
    const { lambdaA, lambdaB } = expectedGoals(a, b);
    const rho = CONFIG.DIXON_COLES_RHO;
    let pWin = 0, pDraw = 0, pLoss = 0;
    let bestP = -1, bestScore = '0-0';
    for (let i = 0; i <= CONFIG.MAX_GOALS; i++) {
      const pi = poissonPMF(i, lambdaA);
      for (let j = 0; j <= CONFIG.MAX_GOALS; j++) {
        const p = pi * poissonPMF(j, lambdaB) * dcTau(i, j, lambdaA, lambdaB, rho);
        if (i > j) pWin += p; else if (i === j) pDraw += p; else pLoss += p;
        if (p > bestP) { bestP = p; bestScore = `${i}-${j}`; }
      }
    }
    const total = pWin + pDraw + pLoss || 1;
    return {
      win:  pWin  / total,
      draw: pDraw / total,
      loss: pLoss / total,
      lambdaA, lambdaB,
      likelyScore: bestScore,
      model: 'Dixon-Coles bivariate Poisson · Elo-scaled',
    };
  }

  /* ---- 3. MONTE CARLO TOURNAMENT -----------------------------------------
   * Sample one match: returns goals. In knockout, a draw is broken by a
   * coin-flip weighted by the Elo-implied win share (penalties proxy). */
  function samplePoisson(lambda) {
    // Knuth's algorithm.
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return Math.min(k - 1, CONFIG.MAX_GOALS);
  }

  function playMatch(a, b, knockout) {
    const { lambdaA, lambdaB } = expectedGoals(a, b);
    let ga = samplePoisson(lambdaA);
    let gb = samplePoisson(lambdaB);
    if (knockout && ga === gb) {
      // Extra time + penalties: decide by a rating-weighted coin flip
      // (uses player talent + form, same as the rest of the model).
      const share = eloExpected(effRating(a), effRating(b));
      if (rand() < share) ga++; else gb++;
    }
    return { ga, gb };
  }

  /* Apply a *known* (already-played) fixture deterministically inside a sim. */
  function applyKnown(table, fx) {
    const A = fx.home, B = fx.away;
    bumpGroup(table, A, B, fx.homeGoals, fx.awayGoals);
  }

  function bumpGroup(table, A, B, ga, gb) {
    const ra = table[A], rb = table[B];
    ra.gf += ga; ra.ga += gb; rb.gf += gb; rb.ga += ga;
    if (ga > gb) { ra.pts += 3; }
    else if (ga < gb) { rb.pts += 3; }
    else { ra.pts += 1; rb.pts += 1; }
  }

  /* ---- Official 2026 Round-of-32 slotting (FIFA) -------------------------
   * Each of the 16 R32 matches (#73–88) by group-position slot.
   *   ['W','A'] = winner of Group A · ['R','A'] = runner-up A
   *   ['3','ABCDF'] = best-3rd-placed team from one of groups A/B/C/D/F.
   * Source: FIFA / Wikipedia "2026 FIFA World Cup knockout stage". */
  const R32_SLOTS = [
    { a: ['R','A'], b: ['R','B'] },        // 73
    { a: ['W','E'], b: ['3','ABCDF'] },    // 74
    { a: ['W','F'], b: ['R','C'] },        // 75
    { a: ['W','C'], b: ['R','F'] },        // 76
    { a: ['W','I'], b: ['3','CDFGH'] },    // 77
    { a: ['R','E'], b: ['R','I'] },        // 78
    { a: ['W','A'], b: ['3','CEFHI'] },    // 79
    { a: ['W','L'], b: ['3','EHIJK'] },    // 80
    { a: ['W','D'], b: ['3','BEFIJ'] },    // 81
    { a: ['W','G'], b: ['3','AEHIJ'] },    // 82
    { a: ['R','K'], b: ['R','L'] },        // 83
    { a: ['W','H'], b: ['R','J'] },        // 84
    { a: ['W','B'], b: ['3','EFGIJ'] },    // 85
    { a: ['W','J'], b: ['R','H'] },        // 86
    { a: ['W','K'], b: ['3','DEIJL'] },    // 87
    { a: ['R','D'], b: ['R','G'] },        // 88
  ];

  /* Bijectively assign the 8 qualifying 3rd-place GROUPS to the 8 third-place
   * slots, honouring each slot's allowed-group set (backtracking match — FIFA's
   * 495-combination table always admits a valid assignment). Returns a map of
   * R32_SLOTS index -> group letter. */
  function assignThirds(thirdGroups) {
    const slots = R32_SLOTS
      .map((s, i) => ({ i, set: s.b[0] === '3' ? s.b[1] : (s.a[0] === '3' ? s.a[1] : null) }))
      .filter(s => s.set);
    const assign = {};
    const used = new Set();
    (function bt(k) {
      if (k === slots.length) return true;
      for (const g of thirdGroups) {
        if (used.has(g) || !slots[k].set.includes(g)) continue;
        used.add(g); assign[slots[k].i] = g;
        if (bt(k + 1)) return true;
        used.delete(g); delete assign[slots[k].i];
      }
      return false;
    })(0);
    return assign;
  }

  /* Build the 16 R32 matchups [nameA,nameB] from group results + the official
   * slotting. winners/runners = {letter->name}; thirdByGroup = {letter->name}. */
  function buildR32(winners, runners, thirdByGroup, thirdSlotAssign) {
    const resolve = (spec, slotIdx) => {
      const [type, val] = spec;
      if (type === 'W') return winners[val];
      if (type === 'R') return runners[val];
      return thirdByGroup[thirdSlotAssign[slotIdx]];   // '3'
    };
    return R32_SLOTS.map((s, i) => [resolve(s.a, i), resolve(s.b, i)]);
  }

  /* Stage indices: how far a team got in one simulation.
   * 0 group-only · 1 R32 · 2 R16 · 3 QF · 4 SF · 5 Final · 6 Champion */
  const STAGE = { GROUP: 0, R32: 1, R16: 2, QF: 3, SF: 4, FINAL: 5, CHAMP: 6 };
  const ROUND_NAMES = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

  /* Run the whole 2026 tournament once, using the OFFICIAL bracket slotting.
   * Returns { champion, stageReached, groupPos:{name:1..4}, bracket? }. */
  function simulateOnce(state, recordBracket = false) {
    const T = state.teamsByName;

    // ---- Group stage (12 groups of 4) ----
    const groups = {};
    for (const letter of GROUP_LETTERS) groups[letter] = {};
    for (const name in T) {
      const g = T[name].group;
      groups[g][name] = { name, pts: 0, gf: 0, ga: 0, group: g };
    }
    for (const fx of state.groupFixtures) {
      if (fx.status === 'FINISHED') {
        applyKnown(groups[T[fx.home].group], fx);
      } else {
        const a = T[fx.home], b = T[fx.away];
        const { ga, gb } = playMatch(a, b, false);
        bumpGroup(groups[T[fx.home].group], fx.home, fx.away, ga, gb);
      }
    }

    // ---- Rank each group; record finishing position 1..4 ----
    const winnersMap = {}, runnersMap = {}, thirdsRows = [];
    const groupPos = {};
    for (const letter of GROUP_LETTERS) {
      const rows = Object.values(groups[letter]).sort(cmpGroupRow);
      rows.forEach((r, idx) => { groupPos[r.name] = idx + 1; });
      winnersMap[letter] = rows[0].name;
      runnersMap[letter] = rows[1].name;
      thirdsRows.push(rows[2]);
    }

    // ---- 8 best 3rd-placed teams advance (2026 rule) ----
    thirdsRows.sort(cmpGroupRow);
    const bestThirds = thirdsRows.slice(0, 8);
    const thirdByGroup = {};
    for (const r of bestThirds) thirdByGroup[r.group] = r.name;
    const thirdSlotAssign = assignThirds(bestThirds.map(r => r.group));

    // ---- Build Round of 32 from the official slotting ----
    let round = buildR32(winnersMap, runnersMap, thirdByGroup, thirdSlotAssign);
    const stageReached = {};
    for (const [a, b] of round) { stageReached[a] = STAGE.R32; stageReached[b] = STAGE.R32; }

    // ---- Play down: R32 -> R16 -> QF -> SF -> Final, recording stages ----
    const tree = [];
    let stage = STAGE.R16;
    let champion;
    while (true) {
      const winnersThisRound = [];
      const matches = [];
      for (const [n1, n2] of round) {
        const { winner, hg, ag } = playKnockout(T[n1], T[n2]);
        winnersThisRound.push(winner);
        if (stage > (stageReached[winner] || 0)) stageReached[winner] = stage;
        if (recordBracket) matches.push({ home: n1, away: n2, hg, ag, winner });
      }
      if (recordBracket) tree.push({ name: ROUND_NAMES[stage - 2], matches });
      if (winnersThisRound.length === 1) { champion = winnersThisRound[0]; break; }
      round = pairUp(winnersThisRound);
      stage++;
    }

    return { champion, stageReached, groupPos, bracket: recordBracket ? tree : null };
  }

  /* Knockout match: like playMatch but always resolves a winner (ET/pens). */
  function playKnockout(a, b) {
    const { ga, gb } = playMatch(a, b, true);
    return { winner: ga >= gb ? a.name : b.name, hg: ga, ag: gb };
  }
  function winnerOf(a, b) { return playKnockout(a, b).winner; }

  function pairUp(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i += 2) out.push([arr[i], arr[i + 1]]);
    return out;
  }
  function cmpGroupRow(x, y) {
    if (y.pts !== x.pts) return y.pts - x.pts;
    const gdX = x.gf - x.ga, gdY = y.gf - y.ga;
    if (gdY !== gdX) return gdY - gdX;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return rand() - 0.5; // drawing of lots
  }

  /* Public: run N simulations.
   * Returns { champProb, reach, groupOdds }. groupOdds[name] holds the
   * probability of finishing 1st/2nd/3rd/4th in the group + an expected
   * finishing-position score (lower = better). */
  function simulateTournament(state, runs = CONFIG.MONTE_CARLO_RUNS) {
    seed(0x9E3779B1);              // fixed seed => identical odds for identical inputs
    const hist = {};               // name -> furthest-stage histogram [0..6]
    const gpos = {};               // name -> finishing-position histogram [_,1,2,3,4]
    for (const name in state.teamsByName) { hist[name] = [0,0,0,0,0,0,0]; gpos[name] = [0,0,0,0,0]; }

    for (let i = 0; i < runs; i++) {
      const { stageReached, groupPos } = simulateOnce(state);
      for (const name in hist) {
        hist[name][stageReached[name] || 0]++;
        gpos[name][groupPos[name] || 4]++;
      }
    }

    const champProb = {}, reach = {}, groupOdds = {};
    for (const name in hist) {
      const h = hist[name];
      let cum = 0; const r = [0, 0, 0, 0, 0, 0, 0];
      for (let s = 6; s >= 0; s--) { cum += h[s]; r[s] = cum / runs; }
      reach[name] = { r32: r[1], r16: r[2], qf: r[3], sf: r[4], final: r[5], champ: r[6] };
      champProb[name] = r[6];

      const g = gpos[name];
      const p1 = g[1]/runs, p2 = g[2]/runs, p3 = g[3]/runs, p4 = g[4]/runs;
      groupOdds[name] = {
        p1, p2, p3, p4,
        advance: r[1],                                  // P(reach knockout)
        rankScore: 1*p1 + 2*p2 + 3*p3 + 4*p4,           // expected finishing position
      };
    }
    return { champProb, reach, groupOdds };
  }

  /* Predicted final group standings: each group's teams ordered by expected
   * finishing position. Returns { letter: [ {name, ...groupOdds} x4 ] }. */
  function predictedStandings(state, groupOdds) {
    const byGroup = {};
    for (const letter of GROUP_LETTERS) byGroup[letter] = [];
    for (const name in state.teamsByName)
      byGroup[state.teamsByName[name].group].push({ name, ...groupOdds[name] });
    for (const letter of GROUP_LETTERS)
      byGroup[letter].sort((a, b) => a.rankScore - b.rankScore);
    return byGroup;
  }

  /* Public: the model's single best-guess bracket — built from the PREDICTED
   * group standings via the official slotting, each tie resolved by the more
   * likely team. Returns { bracket, champion, standings, thirds }. */
  function predictBracket(state, groupOdds) {
    const T = state.teamsByName;
    const standings = predictedStandings(state, groupOdds);

    const winnersMap = {}, runnersMap = {}, thirds = [];
    for (const letter of GROUP_LETTERS) {
      winnersMap[letter] = standings[letter][0].name;
      runnersMap[letter] = standings[letter][1].name;
      thirds.push({ name: standings[letter][2].name, group: letter, score: standings[letter][2].rankScore });
    }
    thirds.sort((a, b) => a.score - b.score);
    const best = thirds.slice(0, 8);
    const thirdByGroup = {};
    for (const t of best) thirdByGroup[t.group] = t.name;
    const assign = assignThirds(best.map(t => t.group));

    let round = buildR32(winnersMap, runnersMap, thirdByGroup, assign);
    const tree = [];
    let stage = STAGE.R16, champion;
    while (true) {
      const winners = [], matches = [];
      for (const [n1, n2] of round) {
        const p = matchProbabilities(T[n1], T[n2]);
        const pHome = p.win + p.draw / 2, pAway = p.loss + p.draw / 2;
        const winner = pHome >= pAway ? n1 : n2;
        winners.push(winner);
        matches.push({ home: n1, away: n2, winner, pHome, pAway, likely: p.likelyScore });
      }
      tree.push({ name: ROUND_NAMES[stage - 2], matches });
      if (winners.length === 1) { champion = winners[0]; break; }
      round = pairUp(winners);
      stage++;
    }
    return { bracket: tree, champion, standings, thirds: best.map(t => t.name) };
  }

  /* Real group standings from FINISHED results (points, goal difference, goals),
   * NOT the simulation. Teams with no finished games sit at 0. */
  function actualStandings(state) {
    const byGroup = {};
    for (const letter of GROUP_LETTERS) byGroup[letter] = [];
    for (const name in state.teamsByName) {
      const t = state.teamsByName[name];
      let pts = 0, gf = 0, ga = 0, played = 0;
      for (const fx of state.groupFixtures) {
        if (fx.group !== t.group || fx.status !== 'FINISHED' || fx.homeGoals == null) continue;
        if (fx.home !== name && fx.away !== name) continue;
        const me = fx.home === name ? fx.homeGoals : fx.awayGoals;
        const op = fx.home === name ? fx.awayGoals : fx.homeGoals;
        played++; gf += me; ga += op; pts += me > op ? 3 : me === op ? 1 : 0;
      }
      byGroup[t.group].push({ name, group: t.group, pts, gf, ga, played, advance: 0 });
    }
    for (const letter of GROUP_LETTERS) byGroup[letter].sort(cmpGroupRow);
    return byGroup;
  }

  /* Public: the ACTUAL bracket — R32 built from the REAL finished group results
   * (the live feed carries the group games), then knockout rounds projected by
   * the model. Reads as "what really happened in the groups -> projected on".
   * Same shape as predictBracket so the UI renders it identically. Throws if the
   * groups aren't complete enough to resolve the official third-place slotting;
   * the caller falls back to the predicted bracket in that case. */
  function actualBracket(state) {
    const T = state.teamsByName;
    const standings = actualStandings(state);

    const winnersMap = {}, runnersMap = {}, thirds = [];
    for (const letter of GROUP_LETTERS) {
      winnersMap[letter] = standings[letter][0].name;
      runnersMap[letter] = standings[letter][1].name;
      const r = standings[letter][2];
      thirds.push({ name: r.name, group: letter, pts: r.pts, gd: r.gf - r.ga, gf: r.gf });
    }
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    const best = thirds.slice(0, 8);
    const thirdByGroup = {};
    for (const t of best) thirdByGroup[t.group] = t.name;
    const assign = assignThirds(best.map(t => t.group));

    let round = buildR32(winnersMap, runnersMap, thirdByGroup, assign);
    // Guard: every slot must resolve to a real team.
    for (const [n1, n2] of round) if (!T[n1] || !T[n2]) throw new Error('groups incomplete for actual bracket');

    const tree = [];
    let stage = STAGE.R16, champion;
    while (true) {
      const winners = [], matches = [];
      for (const [n1, n2] of round) {
        const p = matchProbabilities(T[n1], T[n2]);
        const pHome = p.win + p.draw / 2, pAway = p.loss + p.draw / 2;
        const winner = pHome >= pAway ? n1 : n2;
        winners.push(winner);
        matches.push({ home: n1, away: n2, winner, pHome, pAway, likely: p.likelyScore });
      }
      tree.push({ name: ROUND_NAMES[stage - 2], matches });
      if (winners.length === 1) { champion = winners[0]; break; }
      round = pairUp(winners);
      stage++;
    }
    return { bracket: tree, champion, standings };
  }

  /* Public: one representative RANDOM simulated bracket (full knockout tree).
   * Fresh seed each call so re-rolls genuinely differ. */
  function sampleBracket(state) {
    seed((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    return simulateOnce(state, true);
  }

  return {
    eloExpected, updateElo, expectedGoals,
    matchProbabilities, simulateTournament, sampleBracket,
    predictBracket, predictedStandings, actualBracket,
  };
})();

if (typeof module !== 'undefined') module.exports = { Engine };
