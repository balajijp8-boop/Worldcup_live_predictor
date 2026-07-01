#!/usr/bin/env node
/* =============================================================================
 * mcp/server.js — World Cup 2026 Predictor as a Model Context Protocol server
 * -----------------------------------------------------------------------------
 * Wraps the existing browser prediction engine (js/engine.js + js/data.js +
 * js/livescore.js) and exposes it to Claude Desktop as callable TOOLS over
 * stdio. Zero dependencies: it speaks newline-delimited JSON-RPC 2.0 by hand,
 * exactly like the bundled CORS proxy stays dependency-free. Needs Node 18+
 * (for the global `fetch` used by the live-score feed).
 *
 *   node mcp/server.js          # Claude Desktop launches this for you
 *
 * The engine modules use bare globals (CONFIG, GROUP_LETTERS, …) because they
 * were written for the browser. We put those on globalThis BEFORE requiring
 * them, so their references resolve in Node with no edits to the originals.
 * ========================================================================== */
'use strict';

/* ---- Locate the prediction engine --------------------------------------
 * The engine itself lives in the main project (the `js/` folder of
 * github.com/balajijp8-boop/Worldcup_live_predictor). This repo holds only the
 * MCP server. Point WC_ENGINE_DIR at that `js/` folder; if unset we default to
 * `../js` (i.e. this server dropped into the main repo as `mcp/`). */
const path = require('path');
const ENGINE_DIR = path.resolve(process.env.WC_ENGINE_DIR || path.join(__dirname, '..', 'js'));
function engine(file) {
  try { return require(path.join(ENGINE_DIR, file)); }
  catch (e) {
    console.error(
      `[wc-mcp] Could not load the engine file "${file}" from:\n  ${ENGINE_DIR}\n\n` +
      `This MCP server needs the prediction engine from the main project:\n` +
      `  https://github.com/balajijp8-boop/Worldcup_live_predictor  (the js/ folder)\n\n` +
      `Clone it, then set WC_ENGINE_DIR to its js/ path, e.g.\n` +
      `  WC_ENGINE_DIR=C:\\path\\to\\Worldcup_live_predictor\\js\n`);
    throw e;
  }
}

/* ---- Wire the browser modules into Node --------------------------------- */
global.CONFIG        = engine('config.js').CONFIG;
const data           = engine('data.js');
global.BASE_TEAMS    = data.BASE_TEAMS;
global.GROUP_LETTERS = data.GROUP_LETTERS;
global.GROUP_FIXTURES = data.GROUP_FIXTURES;
global.KNOWN_RESULTS = data.KNOWN_RESULTS;
const { Engine }     = engine('engine.js');
const { LiveScore }  = engine('livescore.js');

// Let users dial the sim down for speed:  WC_MC_RUNS=4000 node mcp/server.js
if (process.env.WC_MC_RUNS) {
  const n = parseInt(process.env.WC_MC_RUNS, 10);
  if (n > 0) CONFIG.MONTE_CARLO_RUNS = n;
}

/* ---- Application state (mirrors js/app-pro.js, minus the DOM) ----------- */
const state = {
  teamsByName: {}, groupFixtures: [],
  champProb: {}, reach: {}, groupOdds: {}, predicted: null,
};

function buildTeams() {
  for (const t of BASE_TEAMS) {
    const c = { ...t };
    c.fifaElo = c.elo; c.baseElo = c.elo;
    state.teamsByName[t.name] = c;
  }
}

function buildFixtures() {
  let id = 1;
  const sorted = [...GROUP_FIXTURES].sort((a, b) => (a.ko < b.ko ? -1 : a.ko > b.ko ? 1 : 0));
  for (const m of sorted) {
    state.groupFixtures.push({
      id: id++, home: m.home, away: m.away, group: m.g,
      status: 'SCHEDULED', homeGoals: null, awayGoals: null,
      ko: m.ko, day: m.day, time: m.time, city: m.city,
    });
  }
}

/* Rebuild every Elo from its FIFA prior + a replay of all FINISHED results. */
function recomputeRatings() {
  for (const n in state.teamsByName) {
    const t = state.teamsByName[n];
    t.elo = t.baseElo != null ? t.baseElo : t.elo;
  }
  for (const fx of state.groupFixtures) {
    if (fx.status !== 'FINISHED' || fx.homeGoals == null) continue;
    const a = state.teamsByName[fx.home], b = state.teamsByName[fx.away];
    if (!a || !b) continue;
    const u = Engine.updateElo(a.elo, b.elo, fx.homeGoals, fx.awayGoals);
    a.elo = u.eloA; b.elo = u.eloB;
  }
}

function recomputeForm() {
  for (const n in state.teamsByName) {
    const games = state.groupFixtures.filter(f => f.status === 'FINISHED' && (f.home === n || f.away === n));
    const recent = games.slice(-CONFIG.FORM_GAMES);
    if (!recent.length) { state.teamsByName[n].formElo = 0; continue; }
    let s = 0;
    for (const f of recent) {
      const me = f.home === n ? f.homeGoals : f.awayGoals;
      const op = f.home === n ? f.awayGoals : f.homeGoals;
      s += me > op ? 1 : me === op ? 0.5 : 0;
    }
    state.teamsByName[n].formElo = (s / recent.length - 0.5) * CONFIG.FORM_RANGE;
  }
}

/* The live feed is authoritative — same merge logic as the web app. */
function mergeLive(events) {
  let changed = 0;
  for (const m of events || []) {
    let fx = state.groupFixtures.find(f => f.home === m.home && f.away === m.away);
    let hg = m.homeGoals, ag = m.awayGoals;
    if (!fx) {
      fx = state.groupFixtures.find(f => f.home === m.away && f.away === m.home);
      if (fx) { hg = m.awayGoals; ag = m.homeGoals; }
    }
    if (!fx) continue;
    if (m.status === 'FINISHED' && hg != null) {
      if (fx.status !== 'FINISHED' || fx.homeGoals !== hg || fx.awayGoals !== ag) {
        fx.homeGoals = hg; fx.awayGoals = ag; fx.status = 'FINISHED'; changed++;
      }
    } else if (['LIVE', 'IN_PLAY', 'PAUSED'].includes(m.status)) {
      fx.status = 'LIVE';
      if (hg != null) { fx.homeGoals = hg; fx.awayGoals = ag; }
    } else if (m.status === 'SCHEDULED' && fx.status !== 'FINISHED') {
      fx.status = 'SCHEDULED'; fx.homeGoals = null; fx.awayGoals = null;
    }
  }
  return changed;
}

function recompute() {
  const { champProb, reach, groupOdds } = Engine.simulateTournament(state);
  state.champProb = champProb; state.reach = reach; state.groupOdds = groupOdds;
  state.predicted = Engine.predictBracket(state, groupOdds);
}

/* ---- Lazy init: build once, fetch live scores best-effort, simulate ----- */
let ready = false;
async function pullLive() {
  try {
    const events = await LiveScore.fetchEvents();
    mergeLive(events);
  } catch (e) {
    console.error('[wc-mcp] live feed unavailable, using bundled ratings:', e.message);
  }
  recomputeRatings(); recomputeForm(); recompute();
}
async function ensureReady() {
  if (ready) return;
  buildTeams(); buildFixtures();
  await pullLive();
  ready = true;
}

/* ---- Small helpers ------------------------------------------------------ */
const pct = x => (100 * (x || 0)).toFixed(1) + '%';

const ALIAS = {
  usa: 'United States', us: 'United States', america: 'United States',
  korea: 'South Korea', 'south korea': 'South Korea', holland: 'Netherlands',
  bosnia: 'Bosnia & Herzegovina', czech: 'Czechia', drc: 'DR Congo',
  congo: 'DR Congo', uk: 'England', britain: 'England',
};

function resolveTeam(q) {
  if (!q) throw new Error('a team name is required');
  const names = Object.keys(state.teamsByName);
  const ql = String(q).trim().toLowerCase();
  for (const n of names) if (n.toLowerCase() === ql) return n;
  if (ALIAS[ql] && state.teamsByName[ALIAS[ql]]) return ALIAS[ql];
  let m = names.filter(n => n.toLowerCase().startsWith(ql));
  if (m.length === 1) return m[0];
  m = names.filter(n => n.toLowerCase().includes(ql));
  if (m.length === 1) return m[0];
  if (m.length > 1) throw new Error(`"${q}" is ambiguous — did you mean: ${m.join(', ')}?`);
  throw new Error(`No team matching "${q}". Valid teams: ${names.sort().join(', ')}`);
}

function topFavourite() {
  let best = null, p = -1;
  for (const n in state.champProb) if (state.champProb[n] > p) { p = state.champProb[n]; best = n; }
  return `${best} (${pct(p)})`;
}

function groupTable(letter) {
  const teams = Object.values(state.teamsByName).filter(t => t.group === letter);
  const rows = teams.map(t => {
    let pts = 0, gf = 0, ga = 0, played = 0;
    for (const f of state.groupFixtures) {
      if (f.group !== letter || f.status !== 'FINISHED') continue;
      if (f.home !== t.name && f.away !== t.name) continue;
      const me = f.home === t.name ? f.homeGoals : f.awayGoals;
      const op = f.home === t.name ? f.awayGoals : f.homeGoals;
      played++; gf += me; ga += op; pts += me > op ? 3 : me === op ? 1 : 0;
    }
    return { name: t.name, pts, gf, ga, gd: gf - ga, played };
  });
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return rows;
}

/* ---- Tool implementations ----------------------------------------------- */
function tPredictMatch({ home, away }) {
  const a = state.teamsByName[resolveTeam(home)];
  const b = state.teamsByName[resolveTeam(away)];
  if (a.name === b.name) throw new Error('pick two different teams');
  const p = Engine.matchProbabilities(a, b);
  return [
    `${a.name} vs ${b.name}`,
    `  ${a.name} win: ${pct(p.win)}   Draw: ${pct(p.draw)}   ${b.name} win: ${pct(p.loss)}`,
    `  Expected goals (xG): ${a.name} ${p.lambdaA.toFixed(2)} – ${p.lambdaB.toFixed(2)} ${b.name}`,
    `  Most likely scoreline: ${p.likelyScore}`,
    `  Model: ${p.model}`,
  ].join('\n');
}

function tTournamentOdds({ team }) {
  if (team) {
    const n = resolveTeam(team);
    const r = state.reach[n], g = state.groupOdds[n];
    return [
      `${n} — tournament outlook (${CONFIG.MONTE_CARLO_RUNS.toLocaleString()} Monte-Carlo sims)`,
      `  Win the World Cup : ${pct(r.champ)}`,
      `  Reach the Final   : ${pct(r.final)}`,
      `  Reach the Semis   : ${pct(r.sf)}`,
      `  Reach the QF      : ${pct(r.qf)}`,
      `  Reach the R16     : ${pct(r.r16)}`,
      `  Reach knockouts   : ${pct(r.r32)}`,
      `  Group finish — 1st ${pct(g.p1)} · 2nd ${pct(g.p2)} · 3rd ${pct(g.p3)} · 4th ${pct(g.p4)}`,
    ].join('\n');
  }
  const names = Object.keys(state.champProb).sort((x, y) => state.champProb[y] - state.champProb[x]);
  const lines = names.map((n, i) =>
    `${String(i + 1).padStart(2)}. ${n.padEnd(22)} win ${pct(state.reach[n].champ).padStart(6)}` +
    `  final ${pct(state.reach[n].final).padStart(6)}  SF ${pct(state.reach[n].sf).padStart(6)}`);
  return `Championship odds — all 48 teams (${CONFIG.MONTE_CARLO_RUNS.toLocaleString()} sims):\n` + lines.join('\n');
}

function renderGroup(letter) {
  const arr = state.predicted.standings[letter];
  let s = `Group ${letter} — predicted finish:\n`;
  arr.forEach((t, i) => {
    const tag = i < 2 ? ' [Q]' : i === 2 ? ' [3rd→?]' : '';
    s += `  ${i + 1}. ${t.name.padEnd(22)} win-group ${pct(t.p1).padStart(6)}` +
         `  top-2 ${pct(t.p1 + t.p2).padStart(6)}  advance ${pct(t.advance).padStart(6)}${tag}\n`;
  });
  return s;
}

function tGroupStandings({ group }) {
  if (group) {
    const L = String(group).trim().toUpperCase();
    if (!GROUP_LETTERS.includes(L)) throw new Error(`group must be one of ${GROUP_LETTERS.join(', ')}`);
    return renderGroup(L);
  }
  return GROUP_LETTERS.map(renderGroup).join('\n');
}

function tPredictedBracket() {
  let s = `Predicted knockout bracket — champion: ${state.predicted.champion}\n`;
  for (const round of state.predicted.bracket) {
    s += `\n${round.name}:\n`;
    for (const m of round.matches) s += `  ${m.home} vs ${m.away}  →  ${m.winner} (${m.likely})\n`;
  }
  return s;
}

function tLiveScores() {
  const fin = state.groupFixtures.filter(f => f.status === 'FINISHED');
  const live = state.groupFixtures.filter(f => f.status === 'LIVE');
  let s = `Live scores (source: ESPN). Finished: ${fin.length}/72 · Live now: ${live.length}\n`;
  if (live.length) { s += '\nLIVE:\n'; for (const f of live) s += `  ${f.home} ${f.homeGoals ?? 0}-${f.awayGoals ?? 0} ${f.away}  (Group ${f.group})\n`; }
  if (fin.length) { s += '\nFinished:\n'; for (const f of fin) s += `  ${f.home} ${f.homeGoals}-${f.awayGoals} ${f.away}  (Group ${f.group})\n`; }
  else s += '\nNo games finished yet — predictions use the bundled pre-tournament FIFA ratings.';
  return s;
}

function tTeamInfo({ team }) {
  const n = resolveTeam(team);
  const t = state.teamsByName[n], r = state.reach[n], g = state.groupOdds[n];
  const table = groupTable(t.group);
  const pos = table.findIndex(x => x.name === n) + 1;
  const row = table[pos - 1];
  return [
    `${n}  (Group ${t.group})`,
    `  FIFA rank: ${t.rank}   FIFA rating: ${Math.round(t.fifaElo)}   live rating: ${Math.round(t.elo)}`,
    `  Squad-talent index: ${t.squad}/100   form swing: ${(t.formElo || 0) >= 0 ? '+' : ''}${Math.round(t.formElo || 0)}`,
    `  Group so far: ${row.played} played, ${row.pts} pts, GD ${row.gd >= 0 ? '+' : ''}${row.gd} (currently ${pos}${['st','nd','rd','th'][Math.min(pos - 1, 3)]})`,
    `  Win WC ${pct(r.champ)} · reach Final ${pct(r.final)} · reach R16 ${pct(r.r16)} · advance ${pct(g.advance)}`,
  ].join('\n');
}

async function tRefresh() {
  const before = state.groupFixtures.filter(f => f.status === 'FINISHED').length;
  await pullLive();
  const after = state.groupFixtures.filter(f => f.status === 'FINISHED').length;
  return `Re-pulled live data and re-ran ${CONFIG.MONTE_CARLO_RUNS.toLocaleString()} simulations. ` +
         `Finished games: ${after} (was ${before}). Current favourite: ${topFavourite()}.`;
}

/* ---- Tool registry (name → schema + handler) ---------------------------- */
const TOOLS = [
  {
    name: 'predict_match',
    description: 'Predict a single match between two World Cup 2026 teams: win/draw/loss probabilities, expected goals (xG) for each side, and the most likely scoreline. Uses the Dixon-Coles bivariate-Poisson model.',
    inputSchema: {
      type: 'object',
      properties: {
        home: { type: 'string', description: 'First team (e.g. "Brazil", "USA", "Spain")' },
        away: { type: 'string', description: 'Second team (e.g. "Argentina", "France")' },
      },
      required: ['home', 'away'],
    },
    handler: tPredictMatch,
  },
  {
    name: 'tournament_odds',
    description: 'Championship and round-reach probabilities from a full Monte-Carlo tournament simulation. With a team name, shows that team\'s full outlook; with no team, shows the championship ranking of all 48 teams.',
    inputSchema: {
      type: 'object',
      properties: { team: { type: 'string', description: 'Optional team name. Omit for the full 48-team ranking.' } },
    },
    handler: tTournamentOdds,
  },
  {
    name: 'group_standings',
    description: 'Predicted final group standings (most-likely 1st–4th, with qualification markers). With a group letter (A–L) shows that group; with none, shows all 12 groups.',
    inputSchema: {
      type: 'object',
      properties: { group: { type: 'string', description: 'Optional group letter A–L. Omit for all groups.' } },
    },
    handler: tGroupStandings,
  },
  {
    name: 'predicted_bracket',
    description: 'The model\'s single best-guess knockout bracket from Round of 32 through to the predicted champion, using FIFA\'s official 2026 R32 slotting.',
    inputSchema: { type: 'object', properties: {} },
    handler: tPredictedBracket,
  },
  {
    name: 'team_info',
    description: 'Profile for one team: FIFA rank/rating, live rating, squad-talent index, current form, current group standing, and headline tournament odds.',
    inputSchema: {
      type: 'object',
      properties: { team: { type: 'string', description: 'Team name (e.g. "England", "Korea")' } },
      required: ['team'],
    },
    handler: tTeamInfo,
  },
  {
    name: 'live_scores',
    description: 'Current real World Cup 2026 scores pulled from ESPN: finished results and any matches live right now.',
    inputSchema: { type: 'object', properties: {} },
    handler: tLiveScores,
  },
  {
    name: 'refresh',
    description: 'Re-pull the latest live scores from ESPN and re-run the whole simulation, so all odds reflect the newest real results.',
    inputSchema: { type: 'object', properties: {} },
    handler: tRefresh,
  },
];
const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]));

async function callTool(name, args) {
  const tool = TOOL_MAP[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  await ensureReady();
  return await tool.handler(args || {});
}

/* ---- JSON-RPC 2.0 over stdio (newline-delimited) ------------------------ */
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function ok(id, result) { send({ jsonrpc: '2.0', id, result }); }
function fail(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function dispatch(msg) {
  const { id, method, params } = msg;
  if (method === undefined) return;                       // a response, not a request — ignore
  try {
    switch (method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: (params && params.protocolVersion) || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'worldcup-predictor', version: '1.0.0' },
        });
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;                                           // notifications: no reply
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case 'tools/call': {
        try {
          const text = await callTool(params && params.name, params && params.arguments);
          return ok(id, { content: [{ type: 'text', text }] });
        } catch (e) {
          return ok(id, { content: [{ type: 'text', text: 'Error: ' + (e && e.message || String(e)) }], isError: true });
        }
      }
      default:
        if (id !== undefined) return fail(id, -32601, 'Method not found: ' + method);
    }
  } catch (e) {
    if (id !== undefined) fail(id, -32603, 'Internal error: ' + (e && e.message || String(e)));
  }
}

function startStdio() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      dispatch(msg);
    }
  });
  process.stdin.on('end', () => process.exit(0));
  console.error('[wc-mcp] World Cup 2026 Predictor MCP server ready on stdio.');
}

// Run the stdio server only when launched directly; allow `require()` for tests.
if (require.main === module) startStdio();

module.exports = { callTool, ensureReady, TOOLS, state };
