/* Quick self-test: drives the MCP tools end-to-end (engine + live fetch). */
const srv = require('./server.js');

(async () => {
  console.log('Tools registered:', srv.TOOLS.map(t => t.name).join(', '), '\n');

  const cases = [
    ['team_info',        { team: 'Brazil' }],
    ['predict_match',    { home: 'Spain', away: 'Argentina' }],
    ['tournament_odds',  { team: 'France' }],
    ['group_standings',  { group: 'C' }],
    ['live_scores',      {}],
  ];

  for (const [name, args] of cases) {
    console.log('────────', name, JSON.stringify(args), '────────');
    try { console.log(await srv.callTool(name, args)); }
    catch (e) { console.log('THREW:', e.message); }
    console.log();
  }
  process.exit(0);
})();
