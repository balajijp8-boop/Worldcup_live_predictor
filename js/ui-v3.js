/* =============================================================================
 * ui-v3.js — Product-grade renderer
 * -----------------------------------------------------------------------------
 * Neutral system-font design language: #1d1d1f ink on white / #f5f5f7,
 * hairline rules, pill controls, rounded cards, one blue accent (#0071e3).
 * Same public API as ui.js / ui-pro.js.
 * ========================================================================== */

var UI = (() => {
  const $ = id => document.getElementById(id);
  const fmtPct = p => (p * 100).toFixed(1) + '%';

  const C = {
    t1: '#1d1d1f',
    t2: '#6e6e73',
    t3: '#86868b',
    line: 'rgba(0,0,0,0.10)',
    line2: 'rgba(0,0,0,0.06)',
    fill: '#f5f5f7',
    paper: '#ffffff',
    blue: '#0071e3',
    blueDark: '#2997ff',
    green: '#248a3d',
    red: '#d70015',
    orange: '#b25000',
  };

  function flag(team, size = 'sm') {
    const w = size === 'lg' ? 56 : size === 'md' ? 38 : 22;
    const h = size === 'lg' ? 42 : size === 'md' ? 28 : 16;
    const rad = size === 'lg' ? 6 : size === 'md' ? 5 : 3;
    if (!team || !team.iso)
      return `<span style="display:inline-block;width:${w}px;height:${h}px;background:rgba(0,0,0,0.08);border-radius:${rad}px;flex-shrink:0;"></span>`;
    const dim = size === 'lg' ? '56x42' : size === 'md' ? '40x30' : '24x18';
    return `<img src="https://flagcdn.com/${dim}/${team.iso}.png" width="${w}" height="${h}"
      style="display:inline-block;border-radius:${rad}px;object-fit:cover;box-shadow:0 0 0 0.5px rgba(0,0,0,0.16);vertical-align:middle;flex-shrink:0;"
      alt="${team.name}" loading="lazy">`;
  }

  /* ---- Current favourite card -------------------------------------------- */
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
    const [n3, p3] = ranked[2] || [null, 0];
    const t3 = n3 ? state.teamsByName[n3] : null;

    const challenger = (tt, nn, pp, label) => tt ? `
      <div style="display:flex;align-items:center;gap:10px;padding:14px 0;border-top:1px solid ${C.line2};">
        <span style="font-size:13px;color:${C.t3};width:112px;flex-shrink:0;">${label}</span>
        ${flag(tt, 'sm')}
        <span style="font-size:15px;font-weight:500;color:${C.t1};letter-spacing:-0.01em;">${nn}</span>
        <span style="font-size:15px;font-weight:500;color:${C.t2};font-variant-numeric:tabular-nums;margin-left:auto;">${(pp * 100).toFixed(1)}%</span>
      </div>` : '';

    el.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:40px 56px;justify-content:space-between;">
        <div style="min-width:250px;flex:1;">
          <div style="font-size:14px;font-weight:600;color:${C.blue};letter-spacing:-0.01em;">Current favourite</div>
          <div style="display:flex;align-items:center;gap:16px;margin-top:18px;">
            ${flag(t, 'lg')}
            <div>
              <div style="font-size:34px;font-weight:700;letter-spacing:-0.02em;color:${C.t1};line-height:1.1;">${name}</div>
              <div style="font-size:14px;color:${C.t3};margin-top:4px;letter-spacing:-0.005em;">FIFA world ranking No. ${t.rank}</div>
            </div>
          </div>
        </div>
        <div style="text-align:left;">
          <div style="display:flex;align-items:baseline;gap:4px;">
            <span style="font-size:clamp(64px,8vw,92px);font-weight:700;letter-spacing:-0.03em;color:${C.t1};font-variant-numeric:tabular-nums;line-height:0.95;">${(p * 100).toFixed(1)}</span>
            <span style="font-size:32px;font-weight:600;color:${C.t2};">%</span>
          </div>
          <div style="font-size:14px;color:${C.t2};margin-top:8px;letter-spacing:-0.005em;">chance of winning the tournament</div>
        </div>
      </div>
      <div style="margin-top:30px;">
        ${challenger(t2, n2, p2, 'Closest challenger')}
        ${challenger(t3, n3, p3, 'Third in line')}
      </div>`;
  }

  /* ---- Championship odds leaderboard -------------------------------------- */
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
        ? `<span style="font-size:12px;color:${C.t3};font-variant-numeric:tabular-nums;">${(mk * 100).toFixed(1)}%</span>` : '';
      const barColor = i === 0 ? C.blue : C.t1;

      return `<div class="odds-row" data-team="${name}" style="display:flex;align-items:center;gap:14px;padding:12px 10px;border-bottom:1px solid ${C.line2};border-radius:10px;transition:background .15s ease;${elim ? 'opacity:.35;' : ''}">
        <span style="width:22px;text-align:right;font-size:12px;font-weight:500;color:${C.t3};flex-shrink:0;font-variant-numeric:tabular-nums;">${i + 1}</span>
        ${flag(t, 'sm')}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;">
              <span style="font-size:15px;font-weight:${i < 3 ? '600' : '400'};color:${elim ? C.t3 : C.t1};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;">${name}</span>
              ${elim ? `<span style="font-size:11px;font-weight:600;color:${C.red};background:rgba(215,0,21,0.07);border-radius:5px;padding:1px 6px;flex-shrink:0;">Out</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              ${mkTag}
              <span style="font-size:15px;font-weight:600;color:${elim ? C.t3 : C.t1};font-variant-numeric:tabular-nums;letter-spacing:-0.01em;">${fmtPct(p)}</span>
              <span style="font-size:10px;color:${arrowColor};width:9px;flex-shrink:0;">${arrow}</span>
            </div>
          </div>
          <div style="height:4px;border-radius:2px;background:rgba(0,0,0,0.06);overflow:hidden;">
            <div style="height:100%;border-radius:2px;background:${barColor};width:${barW}%;transition:width .8s cubic-bezier(.4,0,.2,1);"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    board.querySelectorAll('.odds-row').forEach(row => {
      if (row.style.opacity) return;
      row.onmouseenter = () => row.style.background = C.fill;
      row.onmouseleave = () => row.style.background = '';
    });
  }

  /* ---- Predicted group standings ------------------------------------------ */
  function renderGroups(state) {
    const board = $('groups-board');
    if (!board || !state.predicted) return;
    const { standings } = state.predicted;
    const thirds = new Set(state.predicted.thirds);

    board.innerHTML = GROUP_LETTERS.map(letter => {
      const rows = standings[letter];
      return `<div style="background:${C.paper};border:1px solid ${C.line2};border-radius:18px;padding:22px 22px 14px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid ${C.line2};padding-bottom:12px;">
          <span style="font-size:17px;font-weight:600;color:${C.t1};letter-spacing:-0.01em;">Group ${letter}</span>
          <span style="font-size:12px;color:${C.t3};">advance&nbsp;%</span>
        </div>
        ${rows.map((r, i) => {
          const t = state.teamsByName[r.name];
          const isThird = i === 2 && thirds.has(r.name);
          const q = i < 2 || isThird;
          const badge = i < 2
            ? `<span style="font-size:11px;font-weight:600;color:${C.green};">Q</span>`
            : isThird
            ? `<span style="font-size:11px;font-weight:600;color:${C.orange};">3rd</span>`
            : `<span style="font-size:11px;color:${C.t3};">·</span>`;
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${q ? '' : 'opacity:.4;'}">
            <span style="width:12px;font-size:12px;color:${C.t3};text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums;">${i + 1}</span>
            ${flag(t, 'sm')}
            <span style="flex:1;font-size:14px;font-weight:${q ? '500' : '400'};color:${q ? C.t1 : C.t2};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.01em;">${r.name}</span>
            <span style="font-size:13px;color:${C.t2};font-variant-numeric:tabular-nums;flex-shrink:0;">${Math.round(r.advance * 100)}%</span>
            <span style="width:26px;text-align:right;flex-shrink:0;">${badge}</span>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  }

  /* ---- Mirrored tournament bracket ---------------------------------------- */
  function renderBracket(state) {
    const board = $('bracket-board');
    if (!board) return;
    const src = state.bracketMode === 'sample' ? state.bracket : state.predicted;
    if (!src || !src.bracket) return;
    const predicted = state.bracketMode !== 'sample';

    let rounds = src.bracket;
    if (rounds[0] && /Round of 32/i.test(rounds[0].name)) rounds = rounds.slice(1);
    if (!rounds.length) return;

    const f = n => flag(state.teamsByName[n], 'sm');
    const pct = p => `${Math.round(p * 100)}%`;
    const champ = src.champion;

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
      return `<div class="bk-match bk-${side}" style="background:${C.paper};border:1px solid ${C.line};border-radius:10px;padding:9px 12px;width:170px;min-height:60px;display:flex;flex-direction:column;justify-content:center;gap:6px;position:relative;">
        ${teamLine(m.home, hw, predicted ? pct(m.pHome) : m.hg)}
        <div style="height:1px;background:${C.line2};"></div>
        ${teamLine(m.away, aw, predicted ? pct(m.pAway) : m.ag)}
      </div>`;
    };

    const roundCol = (matches, side, idx) =>
      `<div class="bk-col bk-col-${side}" data-side="${side}" data-round="${idx}" style="display:flex;flex-direction:column;justify-content:space-around;align-items:${side === 'L' ? 'flex-end' : 'flex-start'};padding:8px 0;flex:0 0 auto;">
        ${matches.map(m => matchCard(m, side)).join('')}
      </div>`;

    const leftRounds = halves.map((r, i) => roundCol(r.left, 'L', i)).join('');
    const rightRounds = halves.map((r, i) => roundCol(r.right, 'R', i)).reverse().join('');

    const headers = halves.map(r => r.name);
    const headerBar = `<div style="display:flex;align-items:center;border-bottom:1px solid ${C.line2};padding:0 0 14px;margin-bottom:18px;gap:24px;min-width:1140px;">
      ${headers.map(h => `<div style="width:170px;text-align:center;font-size:12px;font-weight:600;color:${C.t3};flex:0 0 auto;letter-spacing:-0.005em;">${h}</div>`).join('')}
      <div style="flex:1;text-align:center;font-size:12px;font-weight:600;color:${C.blue};letter-spacing:-0.005em;">Final</div>
      ${[...headers].reverse().map(h => `<div style="width:170px;text-align:center;font-size:12px;font-weight:600;color:${C.t3};flex:0 0 auto;letter-spacing:-0.005em;">${h}</div>`).join('')}
    </div>`;

    const finalMatch = finalRound.matches[0];
    const finalLine = (name, won, val) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:${won ? '600' : '400'};color:${won ? C.t1 : C.t2};overflow:hidden;min-width:0;letter-spacing:-0.005em;">
        ${f(name)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
      </span>
      <span style="font-size:12px;font-weight:500;font-variant-numeric:tabular-nums;flex-shrink:0;color:${C.t2};">${val}</span>
    </div>`;
    const finalBlock = `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;flex:1;min-width:240px;padding:0 14px;">
      <div style="background:${C.paper};border:1.5px solid ${C.t1};border-radius:12px;padding:14px 18px;width:100%;max-width:240px;">
        ${finalLine(finalMatch.home, finalMatch.winner === finalMatch.home, predicted ? pct(finalMatch.pHome) : finalMatch.hg)}
        <div style="height:1px;background:${C.line};margin:9px 0;"></div>
        ${finalLine(finalMatch.away, finalMatch.winner === finalMatch.away, predicted ? pct(finalMatch.pAway) : finalMatch.ag)}
      </div>
      <div style="width:1px;height:24px;background:${C.line};"></div>
      <div style="text-align:center;background:${C.t1};color:#f5f5f7;border-radius:16px;padding:20px 26px;width:100%;max-width:240px;">
        <div style="font-size:12px;font-weight:600;color:${C.blueDark};margin-bottom:10px;letter-spacing:-0.005em;">Projected champion</div>
        ${flag(state.teamsByName[champ], 'md')}
        <div style="font-size:19px;font-weight:600;letter-spacing:-0.01em;margin-top:9px;">${champ}</div>
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

    requestAnimationFrame(() => drawBracketConnectors(board));
  }

  function drawBracketConnectors(board) {
    board.querySelectorAll('.bk-connector').forEach(n => n.remove());
    const cols = [...board.querySelectorAll('.bk-col')];
    const grid = board.querySelector('.bk-grid');
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const drawLine = (x, y, w, h) => {
      const d = document.createElement('div');
      d.className = 'bk-connector';
      d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:rgba(0,0,0,0.16);pointer-events:none;`;
      grid.appendChild(d);
    };

    cols.forEach(col => {
      const side = col.dataset.side;
      const r = parseInt(col.dataset.round, 10);
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
          drawLine(lineStartX, aMidY, midX - lineStartX, 1);
          drawLine(lineStartX, bMidY, midX - lineStartX, 1);
          drawLine(midX - 1, Math.min(aMidY, bMidY), 1, Math.abs(bMidY - aMidY));
          drawLine(midX, tMidY, lineEndX - midX, 1);
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

  /* ---- Fixtures list ------------------------------------------------------ */
  function renderMatches(state) {
    const list = $('match-list');
    if (!list) return;
    const rank = { LIVE: 0, FINISHED: 1, SCHEDULED: 2 };
    const fixtures = [...state.groupFixtures]
      .sort((x, y) => (rank[x.status] ?? 2) - (rank[y.status] ?? 2) || x.id - y.id);

    list.innerHTML = fixtures.map(fx => {
      const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
      const done = fx.status === 'FINISHED', live = fx.status === 'LIVE';
      const probs = fx.predicted || (done ? null : Engine.matchProbabilities(a, b));
      const sel = state.selectedFixtureId === fx.id;
      const hasScore = fx.homeGoals != null;

      const statusBadge = live
        ? `<span style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:${C.red};"><span style="width:6px;height:6px;border-radius:50%;background:${C.red};animation:pulseDot 1.4s ease-in-out infinite;flex-shrink:0;"></span>Live</span>`
        : done
        ? `<span style="font-size:12px;font-weight:500;color:${C.t3};">Full-time</span>`
        : `<span style="font-size:12px;font-weight:500;color:${C.t3};">Upcoming</span>`;

      const score = (done || (live && hasScore)) ? `${fx.homeGoals} – ${fx.awayGoals}` : live ? '· – ·' : 'vs';

      const miniBar = probs ? `<div style="display:flex;height:3px;margin-top:13px;gap:2px;border-radius:2px;overflow:hidden;">
        <div style="background:${C.green};flex:${probs.win};"></div>
        <div style="background:rgba(0,0,0,0.18);flex:${probs.draw};"></div>
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
          verdict = `<span style="color:${hit ? C.green : C.red};font-weight:500;">${hit ? 'Called correctly' : 'Upset'}${exact ? ' · exact score' : ''}</span>`;
        } else {
          verdict = `<span style="color:${C.t3};">awaiting result</span>`;
        }
        predictedInfo = `<div style="display:flex;justify-content:space-between;font-size:12px;color:${C.t2};margin-top:10px;">
          <span>Predicted <span style="color:${C.t1};font-weight:500;">${p.likelyScore}</span></span>${verdict}
        </div>`;
      }

      const bg = sel ? 'rgba(0,113,227,0.05)' : C.paper;
      const bd = sel ? C.blue : C.line2;

      return `<button class="match-card" data-id="${fx.id}" style="width:100%;text-align:left;cursor:pointer;display:block;background:${bg};border:1px solid ${bd};border-radius:14px;padding:16px 18px;transition:background .15s,border-color .15s,transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s;margin-bottom:10px;font-family:inherit;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:13px;">
          <span style="font-size:12px;font-weight:500;color:${C.t3};">Group ${a.group}</span>${statusBadge}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <span style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:500;color:${C.t1};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;letter-spacing:-0.01em;">${flag(a, 'sm')}${fx.home}</span>
          <span style="font-size:15px;font-weight:600;color:${done || live ? C.t1 : C.t3};font-variant-numeric:tabular-nums;flex-shrink:0;">${score}</span>
          <span style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:500;color:${C.t1};justify-content:flex-end;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;letter-spacing:-0.01em;">${fx.away}${flag(b, 'sm')}</span>
        </div>
        ${miniBar}${predictedInfo}
      </button>`;
    }).join('');
  }

  /* ---- Detailed match prediction panel ------------------------------------ */
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
          <div style="font-size:12px;font-weight:600;color:${live ? C.red : C.t3};margin-bottom:8px;">${live ? 'Live score' : 'Full-time'}</div>
          <div style="font-size:56px;font-weight:700;letter-spacing:-0.03em;color:${C.t1};font-variant-numeric:tabular-nums;line-height:0.95;">${fx.homeGoals}<span style="color:${C.t3};margin:0 14px;font-weight:400;">–</span>${fx.awayGoals}</div>
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
        <span style="font-size:14px;color:${C.t2};letter-spacing:-0.01em;">${label}</span>
        <span style="font-size:17px;font-weight:600;color:${C.t1};font-variant-numeric:tabular-nums;letter-spacing:-0.01em;">${fmtPct(val)}</span>
      </div>
      <div style="height:4px;border-radius:2px;background:rgba(0,0,0,0.06);overflow:hidden;">
        <div style="height:100%;border-radius:2px;background:${color};width:${val * 100}%;transition:width .8s cubic-bezier(.4,0,.2,1);"></div>
      </div>
    </div>`;

    let verdict = '';
    if (done) {
      const actual = fx.homeGoals > fx.awayGoals ? 'win' : fx.homeGoals === fx.awayGoals ? 'draw' : 'loss';
      const pick = p.win >= p.draw && p.win >= p.loss ? 'win' : p.draw >= p.loss ? 'draw' : 'loss';
      const hit = pick === actual;
      const exact = p.likelyScore === `${fx.homeGoals}-${fx.awayGoals}`;
      verdict = `<div style="text-align:center;font-size:13px;font-weight:500;margin-top:14px;color:${hit ? C.green : C.red};">${hit ? 'Outcome correctly predicted' : 'Result went against the model'}${exact ? ' · exact score' : ''}</div>`;
    }

    const teamBlock = (t, name) => `<div style="text-align:center;flex:1;min-width:0;">
      ${flag(t, 'lg')}
      <div style="font-size:16px;font-weight:600;color:${C.t1};margin-top:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.01em;">${name}</div>
      <div style="font-size:12px;color:${C.t3};margin-top:3px;">No. ${t.rank} · ${Math.round(t.elo)} pts</div>
      ${squadLine(t)}
    </div>`;

    panel.innerHTML = `<div style="animation:fadeUp .3s ease;">
      ${scoreBanner}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:26px;">
        ${teamBlock(a, fx.home)}
        <div style="text-align:center;padding-top:14px;flex-shrink:0;">
          <div style="font-size:11px;font-weight:600;color:${C.t3};margin-bottom:6px;">xG</div>
          <div style="font-size:17px;font-weight:600;color:${C.t2};font-variant-numeric:tabular-nums;white-space:nowrap;">${p.lambdaA.toFixed(2)} : ${p.lambdaB.toFixed(2)}</div>
        </div>
        ${teamBlock(b, fx.away)}
      </div>
      <div style="font-size:12px;font-weight:500;color:${C.t3};margin-bottom:18px;">${done ? 'Pre-match model' : 'Live model'} · Dixon–Coles bivariate Poisson</div>
      ${bar(fx.home + ' win', p.win, C.green)}
      ${bar('Draw', p.draw, 'rgba(0,0,0,0.3)')}
      ${bar(fx.away + ' win', p.loss, C.red)}
      <div style="text-align:center;padding:20px;background:${C.paper};border:1px solid ${C.line2};border-radius:14px;margin-top:16px;">
        <div style="font-size:12px;font-weight:500;color:${C.t3};margin-bottom:8px;">Most likely scoreline</div>
        <div style="font-size:32px;font-weight:700;color:${C.t1};font-variant-numeric:tabular-nums;letter-spacing:-0.02em;">${p.likelyScore}</div>
      </div>
      ${verdict}
    </div>`;
  }

  function placeholder() {
    return `<div style="height:100%;min-height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px;gap:10px;">
      <div style="font-size:19px;font-weight:600;color:${C.t2};letter-spacing:-0.01em;">Select a fixture</div>
      <div style="font-size:14px;color:${C.t3};line-height:1.5;max-width:250px;">Choose any match to see win, draw and loss probabilities and the most likely score.</div>
    </div>`;
  }

  /* ---- Status (rendered inside the dark navigation bar) ------------------- */
  function setStatus(text, mode) {
    const el = $('status');
    if (!el) return;
    el.textContent = text;
    const colors = { live: '#30d158', sim: '#2997ff', idle: '#86868b' };
    const col = colors[mode] || '#86868b';
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
