/* =============================================================================
 * ui-pro.js — Editorial UI Renderer (Septiembre register)
 * -----------------------------------------------------------------------------
 * Warm cream canvas (#efe9dc), monochrome charcoal text, hairline rules,
 * trophy-gold (#b8893a) as the only accent. Same public API as the original
 * ui.js. The bracket is rendered as a true mirrored tournament tree with
 * CSS-drawn connector lines (R16 left → QF → SF → FINAL center → SF → QF → R16 right).
 * ========================================================================== */

var UI = (() => {
  const $ = id => document.getElementById(id);
  const fmtPct = p => (p * 100).toFixed(1) + '%';

  // Editorial palette
  const C = {
    t1: '#141413',         // primary
    t2: '#6a655c',         // secondary
    t3: '#9a948a',          // tertiary
    line: 'rgba(20,20,19,0.14)',
    line2: 'rgba(20,20,19,0.08)',
    fill: 'rgba(20,20,19,0.04)',
    paper: '#ffffff',
    ink: '#1a1a1a',
    gold: '#b8893a',
    green: '#15693e',
    red: '#a52826',
  };

  function flag(team, size = 'sm') {
    const w = size === 'lg' ? 56 : size === 'md' ? 38 : 22;
    const h = size === 'lg' ? 42 : size === 'md' ? 28 : 16;
    if (!team || !team.iso)
      return `<span style="display:inline-block;width:${w}px;height:${h}px;background:rgba(0,0,0,0.08);border-radius:2px;flex-shrink:0;"></span>`;
    const dim = size === 'lg' ? '56x42' : size === 'md' ? '40x30' : '24x18';
    return `<img src="https://flagcdn.com/${dim}/${team.iso}.png" width="${w}" height="${h}"
      style="display:inline-block;border-radius:2px;object-fit:cover;box-shadow:0 0 0 0.5px rgba(0,0,0,0.18);vertical-align:middle;flex-shrink:0;"
      alt="${team.name}" loading="lazy">`;
  }

  /* ---- Hero "current favourite" ------------------------------------------ */
  function renderHero(state) {
    const el = $('hero-leader');
    if (!el) return;
    const ranked = Object.keys(state.teamsByName)
      .map(n => [n, state.champProb[n] ?? 0])
      .sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] <= 0) return;
    const [name, p] = ranked[0];
    const t = state.teamsByName[name];
    const [n2, p2] = ranked[1] || [null, 0];
    const t2 = n2 ? state.teamsByName[n2] : null;

    el.innerHTML = `
      <div style="font-size:11px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:${C.gold};margin-bottom:24px;">— Current favourite</div>
      <div style="display:flex;align-items:center;gap:18px;">
        ${flag(t, 'lg')}
        <div>
          <div style="font-size:36px;font-weight:400;letter-spacing:-0.02em;color:${C.t1};line-height:1;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-style:italic;">${name}</div>
          <div style="font-size:13px;color:${C.t2};margin-top:8px;letter-spacing:0.02em;">FIFA world rank no. ${t.rank}</div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-top:34px;border-top:1px solid ${C.line2};padding-top:24px;">
        <span style="font-size:64px;font-weight:300;letter-spacing:-0.04em;color:${C.t1};font-variant-numeric:tabular-nums;line-height:0.9;">${(p * 100).toFixed(1)}</span>
        <span style="font-size:24px;font-weight:300;color:${C.t2};">%</span>
        <span style="font-size:13px;color:${C.t2};margin-left:10px;letter-spacing:0.02em;">probability of lifting the trophy</span>
      </div>
      ${t2 ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid ${C.line2};display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;color:${C.t3};letter-spacing:0.1em;text-transform:uppercase;">Closest challenger</span>
        ${flag(t2, 'sm')}
        <span style="font-size:14px;font-weight:500;color:${C.t1};">${n2}</span>
        <span style="font-size:14px;color:${C.t2};font-variant-numeric:tabular-nums;margin-left:auto;">${(p2 * 100).toFixed(1)}%</span>
      </div>` : ''}`;
  }

  /* ---- Championship Odds leaderboard ------------------------------------- */
  let oddsMetric = 'champ';
  function setOddsMetric(m, state) { oddsMetric = m; renderOdds(state); }

  function metricValue(state, name) {
    if (oddsMetric === 'market') return state.market[name] ?? 0;
    const r = state.reach[name];
    if (!r) return 0;
    return oddsMetric === 'champ' ? r.champ : r[oddsMetric] ?? r.champ;
  }

  function renderOdds(state) {
    const board = $('odds-board');
    if (!board) return;
    const ranked = Object.keys(state.teamsByName)
      .map(n => [n, metricValue(state, n)])
      .sort((a, b) => b[1] - a[1]);
    const max = ranked.length ? Math.max(ranked[0][1], 0.0001) : 1;

    board.innerHTML = ranked.map(([name, p], i) => {
      const t = state.teamsByName[name];
      const elim = state.eliminated.has(name);
      const cur = state.champProb[name] ?? 0;
      const prev = state.prevChampProb[name] ?? cur;
      const arrow = cur > prev + 0.0005 ? '▲' : cur < prev - 0.0005 ? '▼' : '';
      const arrowColor = arrow === '▲' ? C.green : arrow === '▼' ? C.red : 'transparent';
      const barW = max > 0 ? Math.max(1.5, (p / max) * 100) : 1.5;
      const mk = state.market[name];
      const mkTag = oddsMetric === 'champ' && mk > 0.0002
        ? `<span style="font-size:11px;color:${C.t3};font-variant-numeric:tabular-nums;">${(mk * 100).toFixed(1)}%</span>` : '';
      const barColor = i === 0 ? C.gold : i < 3 ? C.ink : '#3a342d';

      return `<div class="odds-row" data-team="${name}" style="display:flex;align-items:center;gap:14px;padding:11px 6px;border-bottom:1px solid ${C.line2};transition:background .15s ease;${elim ? 'opacity:.32;' : ''}">
        <span style="width:22px;text-align:right;font-size:11px;font-weight:500;color:${C.t3};flex-shrink:0;font-variant-numeric:tabular-nums;letter-spacing:0.04em;">${String(i + 1).padStart(2, '0')}</span>
        ${flag(t, 'sm')}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;gap:8px;">
            <div style="display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;">
              <span style="font-size:14px;font-weight:${i < 3 ? '500' : '400'};color:${elim ? C.t3 : C.t1};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.005em;">${name}</span>
              ${elim ? `<span style="font-size:9px;font-weight:600;color:${C.red};flex-shrink:0;letter-spacing:0.1em;">OUT</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              ${mkTag}
              <span style="font-size:14px;font-weight:500;color:${elim ? C.t3 : C.t1};font-variant-numeric:tabular-nums;">${fmtPct(p)}</span>
              <span style="font-size:10px;color:${arrowColor};width:8px;flex-shrink:0;">${arrow}</span>
            </div>
          </div>
          <div style="height:2px;background:${C.line2};overflow:hidden;">
            <div style="height:100%;background:${barColor};width:${barW}%;transition:width .8s cubic-bezier(.4,0,.2,1);"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    board.querySelectorAll('.odds-row').forEach(row => {
      if (row.style.opacity) return;
      row.onmouseenter = () => row.style.background = 'rgba(20,20,19,.025)';
      row.onmouseleave = () => row.style.background = '';
    });
  }

  /* ---- Predicted group standings ----------------------------------------- */
  function renderGroups(state) {
    const board = $('groups-board');
    if (!board || !state.predicted) return;
    const { standings } = state.predicted;
    const thirds = new Set(state.predicted.thirds);

    board.innerHTML = GROUP_LETTERS.map(letter => {
      const rows = standings[letter];
      return `<div style="background:${C.paper};border:1px solid ${C.line};padding:20px 22px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid ${C.line2};padding-bottom:10px;">
          <span style="font-size:10px;font-weight:500;color:${C.t3};letter-spacing:0.18em;text-transform:uppercase;">Group</span>
          <span style="font-size:22px;font-weight:300;color:${C.t1};font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;letter-spacing:-0.02em;">${letter}</span>
        </div>
        ${rows.map((r, i) => {
          const t = state.teamsByName[r.name];
          const isThird = i === 2 && thirds.has(r.name);
          const q = i < 2 || isThird;
          const badge = i < 2
            ? `<span style="font-size:10px;font-weight:600;color:${C.green};letter-spacing:0.08em;">Q</span>`
            : isThird
            ? `<span style="font-size:10px;font-weight:600;color:${C.gold};letter-spacing:0.08em;">3rd</span>`
            : `<span style="font-size:10px;color:${C.t3};">·</span>`;
          return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;${q ? '' : 'opacity:.42;'}">
            <span style="width:12px;font-size:11px;color:${C.t3};text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums;">${i + 1}</span>
            ${flag(t, 'sm')}
            <span style="flex:1;font-size:13px;font-weight:${q ? '500' : '400'};color:${q ? C.t1 : C.t2};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.005em;">${r.name}</span>
            <span style="font-size:12px;color:${C.t2};font-variant-numeric:tabular-nums;flex-shrink:0;">${Math.round(r.advance * 100)}%</span>
            <span style="width:26px;text-align:right;flex-shrink:0;">${badge}</span>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  }

  /* ---- TRUE TOURNAMENT BRACKET with connecting lines --------------------- *
   * Renders a mirrored bracket: left half flows right toward the centre,
   * right half flows left toward the centre. The champion sits dead-centre.
   * Connector lines are drawn with absolutely-positioned divs sized by JS so
   * pairs of matches visibly merge into the next round.
   *
   * Layout strategy: each round column is `display:flex; flex-direction:column;
   * justify-content:space-around` so children distribute evenly. Match cards
   * have a `--h` height. Spacing between cards is computed from container
   * height so left/right halves align.
   * ========================================================================*/
  function renderBracket(state) {
    const board = $('bracket-board');
    if (!board) return;
    const src = state.bracketMode === 'sample' ? state.bracket : state.predicted;
    if (!src || !src.bracket) return;
    const predicted = state.bracketMode !== 'sample';

    // Use rounds R16..Final for the mirrored layout (R32 makes 16 leaves which
    // is fine, but R16 makes the most legible chart). If R32 exists (sample
    // mode), keep the visualization starting at R16 (winners of R32) instead.
    let rounds = src.bracket;
    if (rounds[0] && /Round of 32/i.test(rounds[0].name)) rounds = rounds.slice(1);
    if (!rounds.length) return;

    const f = n => flag(state.teamsByName[n], 'sm');
    const pct = p => `${Math.round(p * 100)}%`;
    const champ = src.champion;

    // Split each round in half (preserves the seeded pairing tree).
    const halves = rounds.slice(0, -1).map(r => {
      const half = r.matches.length / 2;
      return { name: r.name, left: r.matches.slice(0, half), right: r.matches.slice(half) };
    });
    const finalRound = rounds[rounds.length - 1];

    const matchCard = (m, side) => {
      if (!m) return `<div style="height:64px;"></div>`;
      const hw = m.winner === m.home, aw = m.winner === m.away;
      const teamLine = (name, won, val) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:${won ? '600' : '400'};color:${won ? C.t1 : C.t3};overflow:hidden;min-width:0;letter-spacing:-0.005em;">
          ${f(name)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
        </span>
        <span style="font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;flex-shrink:0;color:${won ? C.t2 : C.t3};">${val}</span>
      </div>`;
      return `<div class="bk-match bk-${side}" style="background:${C.paper};border:1px solid ${C.line};padding:9px 12px;width:170px;min-height:60px;display:flex;flex-direction:column;justify-content:center;gap:6px;position:relative;">
        ${teamLine(m.home, hw, predicted ? pct(m.pHome) : m.hg)}
        <div style="height:1px;background:${C.line2};"></div>
        ${teamLine(m.away, aw, predicted ? pct(m.pAway) : m.ag)}
      </div>`;
    };

    const roundCol = (matches, side, idx) => {
      // Spacing grows with round: R16 base, QF 2x, SF 4x
      // We render with `justify-content: space-around` and the rows handle it.
      return `<div class="bk-col bk-col-${side}" data-side="${side}" data-round="${idx}" style="display:flex;flex-direction:column;justify-content:space-around;align-items:${side === 'L' ? 'flex-end' : 'flex-start'};padding:8px 0;flex:0 0 auto;">
        ${matches.map(m => matchCard(m, side)).join('')}
      </div>`;
    };

    const leftRounds = halves.map((r, i) => roundCol(r.left, 'L', i)).join('');
    const rightRounds = halves.map((r, i) => roundCol(r.right, 'R', i)).reverse().join('');

    // Headers row above the bracket (mirrored)
    const headerCell = txt => `<div style="flex:1;text-align:center;font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${C.t3};padding:0 4px;">${txt}</div>`;
    const headerSpacer = `<div style="width:170px;flex:0 0 auto;"></div>`;
    const headers = halves.map(r => r.name);
    const headerBar = `<div style="display:flex;align-items:center;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};padding:11px 0;margin-bottom:16px;gap:24px;min-width:1140px;">
      ${headers.map(h => `<div style="width:170px;text-align:center;font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${C.t3};flex:0 0 auto;">${h}</div>`).join('')}
      <div style="flex:1;text-align:center;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${C.gold};">Final</div>
      ${[...headers].reverse().map(h => `<div style="width:170px;text-align:center;font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${C.t3};flex:0 0 auto;">${h}</div>`).join('')}
    </div>`;

    // Final + Champion centerpiece
    const finalMatch = finalRound.matches[0];
    const finalLine = (name, won, val) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:${won ? '600' : '400'};color:${won ? C.t1 : C.t2};overflow:hidden;min-width:0;letter-spacing:-0.005em;">
        ${f(name)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
      </span>
      <span style="font-size:12px;font-weight:500;font-variant-numeric:tabular-nums;flex-shrink:0;color:${C.t2};">${val}</span>
    </div>`;
    const finalBlock = `<div style="display:flex;flex-direction:column;align-items:center;gap:18px;flex:1;min-width:240px;padding:0 14px;">
      <div style="background:${C.paper};border:1px solid ${C.t1};padding:14px 18px;width:100%;max-width:240px;">
        ${finalLine(finalMatch.home, finalMatch.winner === finalMatch.home, predicted ? pct(finalMatch.pHome) : finalMatch.hg)}
        <div style="height:1px;background:${C.line};margin:9px 0;"></div>
        ${finalLine(finalMatch.away, finalMatch.winner === finalMatch.away, predicted ? pct(finalMatch.pAway) : finalMatch.ag)}
      </div>
      <div style="width:1px;height:28px;background:${C.t1};"></div>
      <div style="text-align:center;background:${C.t1};color:#f5efe1;padding:18px 26px;width:100%;max-width:240px;">
        <div style="font-size:10px;font-weight:500;letter-spacing:0.24em;text-transform:uppercase;color:${C.gold};margin-bottom:9px;">Champion</div>
        ${flag(state.teamsByName[champ], 'md')}
        <div style="font-size:18px;font-weight:400;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;letter-spacing:-0.01em;margin-top:9px;">${champ}</div>
      </div>
    </div>`;

    board.innerHTML = `<div style="overflow-x:auto;padding-bottom:8px;">
      <div style="min-width:1280px;">
        ${headerBar}
        <div class="bk-grid" style="display:flex;align-items:stretch;gap:24px;min-height:560px;position:relative;">
          ${leftRounds}
          ${finalBlock}
          ${rightRounds}
        </div>
      </div>
    </div>`;

    // After mount, draw connector lines between consecutive rounds.
    requestAnimationFrame(() => drawBracketConnectors(board));
  }

  /* Draw simple L-shaped connectors between consecutive round columns. */
  function drawBracketConnectors(board) {
    board.querySelectorAll('.bk-connector').forEach(n => n.remove());
    const cols = [...board.querySelectorAll('.bk-col')];
    const grid = board.querySelector('.bk-grid');
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const drawLine = (x, y, w, h) => {
      const d = document.createElement('div');
      d.className = 'bk-connector';
      d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:rgba(20,20,19,0.22);pointer-events:none;`;
      grid.appendChild(d);
    };

    // For each column, connect pairs of matches into the next column (toward centre).
    // LEFT cols flow rightward; RIGHT cols flow leftward.
    cols.forEach((col, idx) => {
      const side = col.dataset.side;
      const r = parseInt(col.dataset.round, 10);
      // Find the next round on the same side
      const next = cols.find(c => c.dataset.side === side && parseInt(c.dataset.round, 10) === r + 1);
      if (!next) return;
      const matches = [...col.querySelectorAll('.bk-match')];
      const nextMatches = [...next.querySelectorAll('.bk-match')];
      for (let i = 0; i < nextMatches.length; i++) {
        const a = matches[i * 2], b = matches[i * 2 + 1], target = nextMatches[i];
        if (!a || !b || !target) continue;
        const aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect(), tR = target.getBoundingClientRect();
        const aMidY = aR.top + aR.height / 2 - gridRect.top;
        const bMidY = bR.top + bR.height / 2 - gridRect.top;
        const tMidY = tR.top + tR.height / 2 - gridRect.top;
        if (side === 'L') {
          const lineStartX = aR.right - gridRect.left;
          const lineEndX = tR.left - gridRect.left;
          const midX = (lineStartX + lineEndX) / 2;
          drawLine(lineStartX, aMidY, midX - lineStartX, 1);          // upper horizontal out
          drawLine(lineStartX, bMidY, midX - lineStartX, 1);          // lower horizontal out
          drawLine(midX - 1, Math.min(aMidY, bMidY), 1, Math.abs(bMidY - aMidY)); // vertical
          drawLine(midX, tMidY, lineEndX - midX, 1);                  // into next
        } else {
          const lineStartX = aR.left - gridRect.left;
          const lineEndX = tR.right - gridRect.left;
          const midX = (lineStartX + lineEndX) / 2;
          drawLine(midX, aMidY, lineStartX - midX, 1);
          drawLine(midX, bMidY, lineStartX - midX, 1);
          drawLine(midX - 1, Math.min(aMidY, bMidY), 1, Math.abs(bMidY - aMidY));
          drawLine(lineEndX, tMidY, midX - lineEndX, 1);
        }
      }
    });
  }

  /* ---- Fixtures list ----------------------------------------------------- */
  function renderMatches(state) {
    const list = $('match-list');
    if (!list) return;
    // Chronological — exactly the order the matches kick off.
    const fixtures = [...state.groupFixtures]
      .sort((x, y) => (x.ko || '').localeCompare(y.ko || '') || x.id - y.id);

    list.innerHTML = fixtures.map(fx => {
      const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
      const done = fx.status === 'FINISHED', live = fx.status === 'LIVE';
      const probs = fx.predicted || (done ? null : Engine.matchProbabilities(a, b));
      const sel = state.selectedFixtureId === fx.id;
      const hasScore = fx.homeGoals != null;

      const statusBadge = live
        ? `<span style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.red};"><span style="width:6px;height:6px;border-radius:50%;background:${C.red};animation:pulseDot 1.4s ease-in-out infinite;flex-shrink:0;"></span>Live</span>`
        : done
        ? `<span style="font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.t3};">Full time</span>`
        : `<span style="font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.t3};">Upcoming</span>`;

      const score = (done || (live && hasScore)) ? `${fx.homeGoals} – ${fx.awayGoals}` : live ? '· – ·' : 'vs';

      const miniBar = probs ? `<div style="display:flex;height:2px;margin-top:13px;gap:2px;">
        <div style="background:${C.green};flex:${probs.win};"></div>
        <div style="background:${C.t3};flex:${probs.draw};"></div>
        <div style="background:${C.red};flex:${probs.loss};"></div>
      </div>` : '';

      let predictedInfo = '';
      if ((done || live) && fx.predicted) {
        const p = fx.predicted;
        let verdict;
        if (done) {
          const actual = fx.homeGoals > fx.awayGoals ? 'win' : fx.homeGoals === fx.awayGoals ? 'draw' : 'loss';
          const pick = p.win >= p.draw && p.win >= p.loss ? 'win' : p.draw >= p.loss ? 'draw' : 'loss';
          const hit = pick === actual;
          const exact = p.likelyScore === `${fx.homeGoals}-${fx.awayGoals}`;
          verdict = `<span style="color:${hit ? C.green : C.red};font-weight:500;">${hit ? 'Called correctly' : 'Upset'}${exact ? ' · exact' : ''}</span>`;
        } else {
          verdict = `<span style="color:${C.t3};">awaiting result</span>`;
        }
        predictedInfo = `<div style="display:flex;justify-content:space-between;font-size:11px;color:${C.t2};margin-top:10px;">
          <span>Predicted <span style="color:${C.t1};">${p.likelyScore}</span></span>${verdict}
        </div>`;
      }

      const bg = sel ? 'rgba(184,137,58,0.06)' : C.paper;
      const bd = sel ? C.gold : C.line;

      return `<button class="match-card" data-id="${fx.id}" style="width:100%;text-align:left;cursor:pointer;display:block;background:${bg};border:1px solid ${bd};padding:16px 18px;transition:background .15s,border-color .15s;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:13px;">
          <span style="font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.t3};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">Group ${a.group}${fx.day ? ` · ${fx.day}, ${fx.time}` : ''}${fx.city ? ` · ${fx.city}` : ''}</span><span style="flex-shrink:0;margin-left:10px;">${statusBadge}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <span style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:500;color:${C.t1};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;letter-spacing:-0.005em;">${flag(a, 'sm')}${fx.home}</span>
          <span style="font-size:15px;font-weight:500;color:${done || live ? C.t1 : C.t3};font-variant-numeric:tabular-nums;flex-shrink:0;">${score}</span>
          <span style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:500;color:${C.t1};justify-content:flex-end;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;letter-spacing:-0.005em;">${fx.away}${flag(b, 'sm')}</span>
        </div>
        ${miniBar}${predictedInfo}
      </button>`;
    }).join('');
  }

  /* ---- Detailed match prediction panel ----------------------------------- */
  function renderMatchDetail(state, fx) {
    const panel = $('match-detail');
    if (!panel) return;
    if (!fx) { panel.innerHTML = placeholder(); return; }
    const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
    const p = fx.predicted || Engine.matchProbabilities(a, b);
    const done = fx.status === 'FINISHED', live = fx.status === 'LIVE';
    const hasScore = fx.homeGoals != null;

    const scoreBanner = (done || (live && hasScore))
      ? `<div style="text-align:center;margin-bottom:26px;">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${live ? C.red : C.t3};margin-bottom:10px;">${live ? 'Live score' : 'Full time'}</div>
          <div style="font-size:58px;font-weight:300;letter-spacing:-0.03em;color:${C.t1};font-variant-numeric:tabular-nums;line-height:0.9;">${fx.homeGoals}<span style="color:${C.t3};margin:0 14px;">–</span>${fx.awayGoals}</div>
        </div>` : '';

    const squadLine = t => {
      const fe = t.formElo || 0;
      const parts = [];
      if (t.squad != null) parts.push(`<span style="color:${C.t3};font-size:11px;">squad ${t.squad}</span>`);
      if (Math.abs(fe) >= 1) parts.push(fe > 0
        ? `<span style="color:${C.green};font-size:11px;">▲${Math.round(fe)}</span>`
        : `<span style="color:${C.red};font-size:11px;">▼${Math.round(-fe)}</span>`);
      return parts.length ? `<div style="display:flex;justify-content:center;gap:10px;margin-top:5px;">${parts.join('')}</div>` : '';
    };

    const bar = (label, val, color) => `<div style="margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span style="font-size:13px;color:${C.t2};letter-spacing:-0.005em;">${label}</span>
        <span style="font-size:17px;font-weight:500;color:${C.t1};font-variant-numeric:tabular-nums;">${fmtPct(val)}</span>
      </div>
      <div style="height:3px;background:${C.line2};overflow:hidden;">
        <div style="height:100%;background:${color};width:${val * 100}%;transition:width .8s cubic-bezier(.4,0,.2,1);"></div>
      </div>
    </div>`;

    let verdict = '';
    if (done) {
      const actual = fx.homeGoals > fx.awayGoals ? 'win' : fx.homeGoals === fx.awayGoals ? 'draw' : 'loss';
      const pick = p.win >= p.draw && p.win >= p.loss ? 'win' : p.draw >= p.loss ? 'draw' : 'loss';
      const hit = pick === actual;
      const exact = p.likelyScore === `${fx.homeGoals}-${fx.awayGoals}`;
      verdict = `<div style="text-align:center;font-size:12px;font-weight:500;margin-top:14px;color:${hit ? C.green : C.red};letter-spacing:0.04em;">${hit ? 'Outcome correctly predicted' : 'Result went against the model'}${exact ? ' · exact score' : ''}</div>`;
    }

    const teamBlock = (t, name) => `<div style="text-align:center;flex:1;min-width:0;">
      ${flag(t, 'lg')}
      <div style="font-size:16px;font-weight:500;color:${C.t1};margin-top:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.005em;">${name}</div>
      <div style="font-size:11px;color:${C.t3};margin-top:3px;letter-spacing:0.04em;">no. ${t.rank} · ${Math.round(t.elo)} pts</div>
      ${squadLine(t)}
    </div>`;

    panel.innerHTML = `<div style="animation:fadeUp .3s ease;">
      ${scoreBanner}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:28px;">
        ${teamBlock(a, fx.home)}
        <div style="text-align:center;padding-top:14px;flex-shrink:0;">
          <div style="font-size:10px;font-weight:500;color:${C.t3};margin-bottom:6px;letter-spacing:0.12em;text-transform:uppercase;">xG</div>
          <div style="font-size:18px;font-weight:500;color:${C.t2};font-variant-numeric:tabular-nums;white-space:nowrap;">${p.lambdaA.toFixed(2)} : ${p.lambdaB.toFixed(2)}</div>
        </div>
        ${teamBlock(b, fx.away)}
      </div>
      <div style="font-size:10px;font-weight:500;color:${C.t3};margin-bottom:20px;letter-spacing:0.12em;text-transform:uppercase;">${done ? 'Pre-match model' : 'Live model'} · Dixon-Coles bivariate Poisson</div>
      ${bar(fx.home + ' win', p.win, C.green)}
      ${bar('Draw', p.draw, C.t2)}
      ${bar(fx.away + ' win', p.loss, C.red)}
      <div style="text-align:center;padding:18px;background:${C.fill};margin-top:14px;border-top:1px solid ${C.line2};border-bottom:1px solid ${C.line2};">
        <div style="font-size:10px;font-weight:500;color:${C.t3};margin-bottom:8px;letter-spacing:0.12em;text-transform:uppercase;">Most likely scoreline</div>
        <div style="font-size:30px;font-weight:300;color:${C.t1};font-variant-numeric:tabular-nums;letter-spacing:-0.02em;">${p.likelyScore}</div>
      </div>
      ${verdict}
    </div>`;
  }

  function placeholder() {
    return `<div style="height:100%;min-height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px;gap:18px;">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;color:${C.t3};letter-spacing:-0.02em;">Select a fixture</div>
      <div style="font-size:13px;color:${C.t2};line-height:1.6;max-width:240px;">Choose any match to see the engine's win, draw and loss probabilities.</div>
    </div>`;
  }

  /* ---- Status ------------------------------------------------------------ */
  function setStatus(text, mode) {
    const el = $('status');
    if (!el) return;
    el.textContent = text;
    const colors = { live: C.green, sim: C.gold, idle: C.t2 };
    const col = colors[mode] || C.t2;
    el.style.color = col;
    const dot = document.querySelector('.status-dot');
    if (dot) dot.style.background = col;
  }

  function flashRecalc() {
    const b = $('recalc-badge');
    if (!b) return;
    b.style.opacity = '1';
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.style.opacity = '0'; }, 1500);
  }

  function setMarketNote(text) { const el = $('market-note'); if (el) el.textContent = text; }
  function setPlayerNote(text) { const el = $('player-note'); if (el) el.textContent = text; }

  return {
    renderHero, renderOdds, renderGroups, renderBracket, renderMatches, renderMatchDetail,
    setStatus, flashRecalc, setOddsMetric, setMarketNote, setPlayerNote,
  };
})();
