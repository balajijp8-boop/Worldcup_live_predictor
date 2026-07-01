# World Cup 2026 Predictor — MCP server

A **zero-dependency [Model Context Protocol](https://modelcontextprotocol.io)
server** that exposes a World Cup 2026 prediction engine to **Claude Desktop**
as callable tools, so you can just chat with it:

> "What are Brazil's odds to win the World Cup?"
> "Predict Spain vs Argentina."
> "Show me Group D's predicted standings."

It speaks JSON-RPC 2.0 over stdio by hand — **no `npm install`**. Needs **Node 18+**.

---

## ⚠️ Requires the engine from the main project

This repo contains **only the MCP server**. The actual prediction engine
(FIFA ratings → Dixon-Coles bivariate-Poisson → Monte-Carlo, plus the live
ESPN score feed) lives in the main project:

👉 **https://github.com/balajijp8-boop/Worldcup_live_predictor** — the `js/` folder.

The server loads four files from there: `config.js`, `data.js`, `engine.js`,
`livescore.js`.

## Setup

1. **Install Node 18+** from <https://nodejs.org/>.

2. **Clone the main project** (for the engine):

   ```bash
   git clone https://github.com/balajijp8-boop/Worldcup_live_predictor.git
   ```

3. **Clone this repo** and tell the server where the engine is via the
   `WC_ENGINE_DIR` environment variable (the path to the main project's `js/`
   folder). For Claude Desktop, add this to `claude_desktop_config.json`
   (Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "worldcup-predictor": {
         "command": "node",
         "args": ["C:\\path\\to\\MCP_server_using_Claude\\server.js"],
         "env": { "WC_ENGINE_DIR": "C:\\path\\to\\Worldcup_live_predictor\\js" }
       }
     }
   }
   ```

   > Tip: if you instead drop `server.js` into the main project as `mcp/server.js`,
   > `WC_ENGINE_DIR` is optional — it defaults to `../js`.

4. **Fully quit and reopen Claude Desktop** (tray → Quit; closing the window
   isn't enough — the config is only re-read on a full restart). The
   `worldcup-predictor` connector then appears with an on/off toggle.

---

## Tools

| Tool | What it does |
|------|--------------|
| `predict_match` | W/D/L + xG + likely score for any two teams |
| `tournament_odds` | Championship & round-reach odds (one team, or all 48 ranked) |
| `group_standings` | Predicted final standings for a group (A–L) or all groups |
| `predicted_bracket` | Best-guess knockout bracket → predicted champion |
| `team_info` | Rank, ratings, squad index, form, group standing, headline odds |
| `live_scores` | Current real scores from ESPN (finished + live now) |
| `refresh` | Re-pull live scores and re-run the whole simulation |

You don't call these directly — just ask Claude in plain English.

## Test it without Claude

```bash
# point at your clone of the main project's js/ folder
WC_ENGINE_DIR=/path/to/Worldcup_live_predictor/js node selftest.js
```

## Tuning

- **Faster responses:** the sim is 12,000 runs by default. Lower it with an env
  var — add `"WC_MC_RUNS": "4000"` to the server's `env` block.
- **Offline:** if ESPN is unreachable the server logs a note to stderr and falls
  back to the bundled pre-tournament FIFA ratings — everything still works.
- Server logs go to **stderr** (stdout is reserved for the protocol).

## License

MIT
