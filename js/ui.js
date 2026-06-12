/* =============================================================================
 * ui.js — DOM rendering & animation
 * -----------------------------------------------------------------------------
 * Pure view layer. Reads from `state`, writes to the DOM. Every probability
 * change animates: progress bars tween their width, odds rows flip-animate
 * into their new ranking, and changed values flash.
 * ========================================================================== */

const UI = (() => {
  const $ = sel => document.querySelector(sel);
  const fmtPct = p => (p * 100).toFixed(1) + '%';

  /* Real flag images (Windows can't render flag emoji). Sizes match flagcdn. */
  function flag(team, size = 'sm') {
    const iso = team && team.iso;
    if (!iso) return '';
    const dim = size === 'lg' ? '64x48' : size === 'md' ? '40x30' : '24x18';
    return `<img src="https://flagcdn.com/${dim}/${iso}.png"
                 class="inline-block rounded-sm align-middle shadow-sm" alt="${team.name}"
                 loading="lazy">`;
  }

  /* ---- Tournament Odds leaderboard --------------------------------------- */
  // Active stage metric ('champ' | 'final' | 'sf' | 'qf' | 'r16').
  let oddsMetric = 'champ';
  function setOddsMetric(m, state) { oddsMetric = m; renderOdds(state); }

  function metricValue(state, name) {
    if (oddsMetric === 'market') return state.market[name] ?? 0;
    const r = state.reach[name];
    if (!r) return 0;
    return oddsMetric === 'champ' ? r.champ : r[oddsMetric] ?? r.champ;
  }

  function renderOdds(state) {
    const board = $('#odds-board');
    if (!board) return;
    const ranked = Object.keys(state.teamsByName)
      .map(name => [name, metricValue(state, name)])
      .sort((a, b) => b[1] - a[1]);

    const max = ranked.length ? Math.max(ranked[0][1], 0.0001) : 1;
    board.innerHTML = ranked.map(([name, p], i) => {
      const t = state.teamsByName[name];
      const eliminated = state.eliminated.has(name);
      // Movement arrow tracks the champion odds regardless of metric shown.
      const cur = state.champProb[name] ?? 0, prev = state.prevChampProb[name] ?? cur;
      const arrow = cur > prev + 0.0005 ? '▲' : cur < prev - 0.0005 ? '▼' : '';
      const arrowColor = arrow === '▲' ? 'text-emerald-400'
                       : arrow === '▼' ? 'text-rose-400' : 'text-slate-500';
      const barW = max > 0 ? Math.max(2, (p / max) * 100) : 2;
      // Optional market comparison (Polymarket champ odds).
      const mk = state.market[name];
      const mkTag = (oddsMetric === 'champ' && mk != null)
        ? `<span class="text-fuchsia-300 text-[11px]" title="Polymarket implied">mkt ${(mk*100).toFixed(1)}%</span>` : '';
      return `
        <div class="odds-row flex items-center gap-3 px-3 py-2 rounded-lg
                    ${eliminated ? 'opacity-40 grayscale' : 'hover:bg-slate-700/40'}"
             data-team="${name}">
          <span class="w-6 text-sm font-bold text-slate-400">${i + 1}</span>
          ${flag(t, 'sm')}
          <div class="flex-1 min-w-0">
            <div class="flex justify-between text-sm gap-2">
              <span class="font-semibold truncate">${name}
                <span class="text-slate-500 text-[11px] font-normal">#${t.rank}</span>
                ${eliminated ? '<span class="text-rose-400 text-xs">OUT</span>' : ''}
              </span>
              <span class="tabular-nums font-mono flex items-center gap-2">
                ${mkTag}${fmtPct(p)} <span class="${arrowColor}">${arrow}</span>
              </span>
            </div>
            <div class="h-2 mt-1 bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500
                          transition-all duration-700 ease-out" style="width:${barW}%"></div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ---- Predicted group standings ----------------------------------------- */
  function renderGroups(state) {
    const board = $('#groups-board');
    if (!board || !state.predicted) return;
    const standings = state.predicted.standings;
    const qualifierThirds = new Set(state.predicted.thirds);

    board.innerHTML = GROUP_LETTERS.map(letter => {
      const rows = standings[letter];
      return `
        <div class="bg-slate-900/50 border border-slate-700 rounded-xl p-3">
          <div class="font-bold text-sm mb-2 text-cyan-300">Group ${letter}</div>
          ${rows.map((r, i) => {
            const t = state.teamsByName[r.name];
            const isThird = i === 2 && qualifierThirds.has(r.name);
            const qualifies = i < 2 || isThird;
            const tag = i < 2 ? '<span class="text-emerald-400 text-[10px] font-bold">Q</span>'
                      : isThird ? '<span class="text-amber-400 text-[10px] font-bold">3rd→Q</span>'
                      : '<span class="text-slate-600 text-[10px]">out</span>';
            return `
              <div class="flex items-center gap-2 text-xs py-1 ${qualifies ? '' : 'opacity-50'}">
                <span class="w-4 text-slate-500">${i + 1}</span>
                ${flag(t, 'sm')}
                <span class="flex-1 truncate ${qualifies ? 'font-semibold' : ''}">${r.name}</span>
                <span class="font-mono text-slate-400">${(r.advance * 100).toFixed(0)}%</span>
                ${tag}
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
  }

  /* ---- Knockout bracket (predicted or random sample) --------------------- */
  function renderBracket(state) {
    const board = $('#bracket-board');
    if (!board) return;
    const src = state.bracketMode === 'sample' ? state.bracket : state.predicted;
    if (!src || !src.bracket) return;
    const rounds = src.bracket;
    const champ = src.champion;
    const predicted = state.bracketMode !== 'sample';
    const f = n => flag(state.teamsByName[n], 'sm');

    const col = (round) => `
      <div class="flex flex-col justify-around gap-2 min-w-[160px]">
        <div class="text-[11px] uppercase tracking-wide text-slate-400 text-center mb-1">${round.name}</div>
        ${round.matches.map(m => `
          <div class="bg-slate-900/60 border border-slate-700 rounded-lg p-2 text-xs">
            ${bracketTeam(m.home, m.winner, f, predicted ? pctTag(m.pHome) : m.hg)}
            ${bracketTeam(m.away, m.winner, f, predicted ? pctTag(m.pAway) : m.ag)}
          </div>`).join('')}
      </div>`;

    board.innerHTML = `
      <div class="flex gap-3 items-stretch">
        ${rounds.map(col).join('')}
        <div class="flex flex-col justify-center min-w-[150px]">
          <div class="text-[11px] uppercase tracking-wide text-amber-400 text-center mb-1">${predicted ? 'Predicted Winner' : 'Champion'}</div>
          <div class="bg-amber-500/15 border border-amber-500/50 rounded-lg p-3 text-center">
            <div>${flag(state.teamsByName[champ], 'md')}</div>
            <div class="font-bold mt-1">${champ}</div>
          </div>
        </div>
      </div>`;
  }
  const pctTag = p => `${Math.round(p * 100)}%`;
  function bracketTeam(name, winner, f, val) {
    const won = name === winner;
    return `<div class="flex items-center justify-between gap-1 ${won ? 'text-white font-semibold' : 'text-slate-400'}">
      <span class="truncate">${f(name)} ${name}</span>
      <span class="font-mono">${val}</span>
    </div>`;
  }

  /* ---- Match list (upcoming + live + finished) --------------------------- */
  function renderMatches(state) {
    const list = $('#match-list');
    // Order: live first, then finished results, then upcoming fixtures.
    const rank = { LIVE: 0, FINISHED: 1, SCHEDULED: 2 };
    const fixtures = [...state.groupFixtures]
      .sort((x, y) => (rank[x.status] ?? 2) - (rank[y.status] ?? 2) || x.id - y.id);

    list.innerHTML = fixtures.map(fx => {
      const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
      const done = fx.status === 'FINISHED';
      const live = fx.status === 'LIVE';
      const probs = fx.predicted || (done ? null : Engine.matchProbabilities(a, b));
      const hasScore = fx.homeGoals != null;

      const tag = live
        ? '<span class="text-rose-400 font-semibold animate-pulse">● LIVE</span>'
        : done ? 'FT' : 'Upcoming';

      const scoreText = (done || (live && hasScore))
        ? `${fx.homeGoals} - ${fx.awayGoals}` : (live ? '· - ·' : 'vs');

      return `
        <button class="match-card w-full text-left bg-slate-800/60 hover:bg-slate-700/70
                       border ${live ? 'border-rose-500/50' : 'border-slate-700'} rounded-xl p-3
                       transition ${done ? '' : 'cursor-pointer hover:scale-[1.01]'}"
                data-id="${fx.id}">
          <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Group ${a.group}</span><span>${tag}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 font-medium">
              ${flag(a, 'sm')}${fx.home}
            </span>
            <span class="font-mono font-bold ${done || live ? 'text-cyan-300' : 'text-slate-500'}">
              ${scoreText}
            </span>
            <span class="flex items-center gap-2 font-medium">
              ${fx.away}${flag(b, 'sm')}
            </span>
          </div>
          ${probs ? miniBar(probs) : ''}
          ${(done || live) && fx.predicted ? predictedVsActual(fx) : ''}
        </button>`;
    }).join('');
  }

  /* Predicted scoreline + outcome vs the real result (with a ✓/✗ hit marker). */
  function predictedVsActual(fx) {
    const p = fx.predicted;
    let verdict = '';
    if (fx.status === 'FINISHED') {
      const actual = fx.homeGoals > fx.awayGoals ? 'win'
                   : fx.homeGoals === fx.awayGoals ? 'draw' : 'loss';
      const pick = p.win >= p.draw && p.win >= p.loss ? 'win'
                 : p.draw >= p.loss ? 'draw' : 'loss';
      const hit = pick === actual;
      const exact = p.likelyScore === `${fx.homeGoals}-${fx.awayGoals}`;
      verdict = `<span class="${hit ? 'text-emerald-400' : 'text-rose-400'} font-semibold">
                   ${hit ? '✓ outcome called' : '✗ upset'}${exact ? ' · exact score!' : ''}
                 </span>`;
    } else {
      verdict = '<span class="text-rose-300">awaiting result…</span>';
    }
    return `
      <div class="flex items-center justify-between text-[11px] mt-2 text-slate-400">
        <span>Predicted <span class="font-mono text-slate-200">${p.likelyScore}</span>
          · ${(Math.max(p.win, p.draw, p.loss) * 100).toFixed(0)}% most-likely outcome</span>
        ${verdict}
      </div>`;
  }

  function miniBar(p) {
    return `
      <div class="flex h-1.5 mt-2 rounded-full overflow-hidden">
        <div class="bg-emerald-500" style="width:${p.win * 100}%"></div>
        <div class="bg-slate-500"   style="width:${p.draw * 100}%"></div>
        <div class="bg-rose-500"    style="width:${p.loss * 100}%"></div>
      </div>`;
  }

  /* ---- Detailed match prediction panel ----------------------------------- */
  function renderMatchDetail(state, fx) {
    const panel = $('#match-detail');
    if (!fx) { panel.innerHTML = placeholder(); return; }
    const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
    // Use the captured pre-match prediction for played/live games; live model
    // otherwise. This keeps "predicted vs actual" honest (no hindsight).
    const p = fx.predicted || Engine.matchProbabilities(a, b);
    const done = fx.status === 'FINISHED';
    const live = fx.status === 'LIVE';
    const hasScore = fx.homeGoals != null;

    const resultBanner = (done || (live && hasScore)) ? `
      <div class="text-center mb-3 ${live ? 'text-rose-300' : 'text-cyan-300'}">
        <span class="text-xs uppercase tracking-wide">${live ? 'Live score' : 'Full time'}</span>
        <div class="text-3xl font-mono font-bold">${fx.homeGoals} – ${fx.awayGoals}</div>
      </div>` : '';

    panel.innerHTML = `
      <div class="animate-[fadeIn_.4s_ease]">
        ${resultBanner}
        <div class="flex items-center justify-between mb-4">
          <div class="text-center flex-1">
            <div>${flag(a, 'lg')}</div>
            <div class="font-bold mt-1">${fx.home}</div>
            <div class="text-xs text-slate-400">FIFA #${a.rank} · ${Math.round(a.elo)} pts</div>
            ${squadLine(a)}
          </div>
          <div class="text-slate-500 font-mono text-sm text-center">xG<br>
            <span class="text-cyan-300 text-lg">${p.lambdaA.toFixed(2)}</span>
            <span class="mx-1">:</span>
            <span class="text-cyan-300 text-lg">${p.lambdaB.toFixed(2)}</span>
          </div>
          <div class="text-center flex-1">
            <div>${flag(b, 'lg')}</div>
            <div class="font-bold mt-1">${fx.away}</div>
            <div class="text-xs text-slate-400">FIFA #${b.rank} · ${Math.round(b.elo)} pts</div>
            ${squadLine(b)}
          </div>
        </div>

        <div class="text-[11px] text-slate-500 mb-2">
          ${done ? 'Pre-match prediction' : 'Model prediction'} ·
          ${p.model || 'Dixon-Coles bivariate Poisson'}
        </div>

        ${probRow(fx.home + ' win', p.win, 'from-emerald-400 to-emerald-600')}
        ${probRow('Draw', p.draw, 'from-slate-400 to-slate-600')}
        ${probRow(fx.away + ' win', p.loss, 'from-rose-400 to-rose-600')}

        <div class="mt-4 text-center text-sm text-slate-400">
          Predicted scoreline:
          <span class="text-white font-mono font-bold">${p.likelyScore}</span>
          ${done ? predictedVsActualVerdict(fx, p) : ''}
        </div>
      </div>`;
  }

  /* Squad-talent index + recent-form chip for the detail panel. */
  function squadLine(t) {
    const squad = t.squad != null ? `<span class="text-emerald-300">squad ${t.squad}</span>` : '';
    const fe = t.formElo || 0;
    const form = Math.abs(fe) < 1 ? '<span class="text-slate-500">form —</span>'
      : fe > 0 ? `<span class="text-emerald-400">form ▲${Math.round(fe)}</span>`
               : `<span class="text-rose-400">form ▼${Math.round(-fe)}</span>`;
    return `<div class="text-[11px] mt-0.5 flex justify-center gap-2">${squad} ${form}</div>`;
  }

  function predictedVsActualVerdict(fx, p) {
    const actual = fx.homeGoals > fx.awayGoals ? 'win'
                 : fx.homeGoals === fx.awayGoals ? 'draw' : 'loss';
    const pick = p.win >= p.draw && p.win >= p.loss ? 'win'
               : p.draw >= p.loss ? 'draw' : 'loss';
    const hit = pick === actual;
    return `<div class="mt-1 ${hit ? 'text-emerald-400' : 'text-rose-400'} font-semibold">
      Actual ${fx.homeGoals}–${fx.awayGoals} · ${hit ? '✓ outcome correctly predicted' : '✗ result went against the model'}
    </div>`;
  }

  function probRow(label, val, grad) {
    return `
      <div class="mb-3">
        <div class="flex justify-between text-sm mb-1">
          <span>${label}</span><span class="font-mono tabular-nums">${fmtPct(val)}</span>
        </div>
        <div class="h-3 bg-slate-700 rounded-full overflow-hidden">
          <div class="h-full rounded-full bg-gradient-to-r ${grad}
                      transition-all duration-700 ease-out" style="width:${val * 100}%"></div>
        </div>
      </div>`;
  }

  function placeholder() {
    return `<div class="h-full grid place-items-center text-slate-500 text-center p-8">
      <div>
        <div class="text-5xl mb-3">⚽</div>
        Select an upcoming match to see the engine's<br>win / draw / loss breakdown.
      </div></div>`;
  }

  /* ---- Status / ticker --------------------------------------------------- */
  function setStatus(text, mode) {
    const el = $('#status');
    el.textContent = text;
    el.className = 'text-xs px-2 py-1 rounded-full ' +
      (mode === 'live' ? 'bg-emerald-500/20 text-emerald-300'
        : mode === 'sim' ? 'bg-amber-500/20 text-amber-300'
          : 'bg-slate-600/30 text-slate-300');
  }

  function flashRecalc() {
    const b = $('#recalc-badge');
    b.classList.remove('opacity-0');
    setTimeout(() => b.classList.add('opacity-0'), 1200);
  }

  function setMarketNote(text) {
    const el = $('#market-note');
    if (el) el.textContent = text;
  }
  function setPlayerNote(text) {
    const el = $('#player-note');
    if (el) el.textContent = text;
  }

  return { renderOdds, renderGroups, renderBracket, renderMatches, renderMatchDetail,
           setStatus, flashRecalc, setOddsMetric, setMarketNote, setPlayerNote };
})();
